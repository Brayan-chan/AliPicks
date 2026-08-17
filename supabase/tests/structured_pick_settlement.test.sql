begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

-- Minimal canonical fixture for exercising the dedicated settlement RPC.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values (
  '90000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'settlement-admin@example.test',
  '',
  now(),
  now(),
  now()
)
on conflict (id) do nothing;

insert into public.user_roles (user_id, role)
values ('90000000-0000-0000-0000-000000000001', 'admin')
on conflict do nothing;

insert into public.leagues (id, sport, name, slug, is_active)
values (
  '91000000-0000-0000-0000-000000000001',
  'soccer',
  'Settlement Test League',
  'settlement-test-league',
  true
);

insert into public.teams (id, sport, name, slug, is_active)
values
  ('92000000-0000-0000-0000-000000000001','soccer','Settlement Home','settlement-home',true),
  ('92000000-0000-0000-0000-000000000002','soccer','Settlement Away','settlement-away',true);

insert into public.league_teams (league_id, team_id, is_active)
values
  ('91000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001',true),
  ('91000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000002',true);

insert into public.picks (
  id, sport, league, teams, league_id, home_team_id, away_team_id,
  event_at, event_state, pick_type, selection, risk, confidence, odds,
  short_description, prob_home, prob_draw, prob_away,
  secondary_selection, secondary_pick_type, secondary_risk,
  secondary_confidence, secondary_odds,
  score_primary, score_primary_confidence,
  score_secondary, score_secondary_confidence,
  status, edit_log
)
values (
  '93000000-0000-0000-0000-000000000001',
  'soccer','Settlement Test League','Settlement Home vs Settlement Away',
  '91000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000002',
  now() - interval '5 minutes','live','1x2','Settlement Home gana','bajo',75,1.80,
  'Settlement fixture',58,24,18,
  'Más de 1.5 goles','over_under','medio',66,1.50,
  '2-1',34,'1-1',21,'pending','[]'::jsonb
);

insert into public.pick_predictions (
  pick_id, kind, market_type, selection, confidence, risk, odds, result
)
values
  ('93000000-0000-0000-0000-000000000001','primary','1x2','Settlement Home gana',75,'bajo',1.80,'pending'),
  ('93000000-0000-0000-0000-000000000001','secondary','over_under','Más de 1.5 goles',66,'medio',1.50,'pending');

insert into public.pick_predictions (
  pick_id, kind, predicted_home_score, predicted_away_score, confidence, result
)
values
  ('93000000-0000-0000-0000-000000000001','primary_score',2,1,34,'pending'),
  ('93000000-0000-0000-0000-000000000001','alt_score',1,1,21,'pending');

select ok(
  (select predictions_locked_at is not null from public.picks where id = '93000000-0000-0000-0000-000000000001'),
  'live fixture is prediction-locked before settlement'
);

create temp table _definition_before on commit drop as
select kind, market_type, selection, predicted_home_score, predicted_away_score, confidence, risk, odds
from public.pick_predictions
where pick_id = '93000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    select public.settle_structured_pick(
      '93000000-0000-0000-0000-000000000001',
      'finished',
      2,
      1,
      'won',
      'won'
    )
  $$,
  'admin can settle a locked live pick through dedicated RPC'
);

select is(
  (select event_state from public.picks where id = '93000000-0000-0000-0000-000000000001'),
  'finished',
  'settlement moves event to finished'
);

select is(
  (select final_result from public.picks where id = '93000000-0000-0000-0000-000000000001'),
  '2-1',
  'settlement writes final_result'
);

select is(
  (select status::text from public.picks where id = '93000000-0000-0000-0000-000000000001'),
  'won',
  'legacy primary status mirrors primary settlement'
);

select is(
  (select result::text from public.pick_predictions where pick_id = '93000000-0000-0000-0000-000000000001' and kind = 'primary'),
  'won',
  'primary result is resolved'
);

select is(
  (select result::text from public.pick_predictions where pick_id = '93000000-0000-0000-0000-000000000001' and kind = 'secondary'),
  'won',
  'secondary result is resolved'
);

select is(
  (select result::text from public.pick_predictions where pick_id = '93000000-0000-0000-0000-000000000001' and kind = 'primary_score'),
  'won',
  'primary exact score is calculated automatically'
);

select is(
  (select result::text from public.pick_predictions where pick_id = '93000000-0000-0000-0000-000000000001' and kind = 'alt_score'),
  'lost',
  'alternate exact score is calculated automatically'
);

select is(
  (select count(*)::integer
   from public.pick_predictions p
   join _definition_before b using (kind)
   where p.pick_id = '93000000-0000-0000-0000-000000000001'
     and p.market_type is not distinct from b.market_type
     and p.selection is not distinct from b.selection
     and p.predicted_home_score is not distinct from b.predicted_home_score
     and p.predicted_away_score is not distinct from b.predicted_away_score
     and p.confidence is not distinct from b.confidence
     and p.risk is not distinct from b.risk
     and p.odds is not distinct from b.odds),
  4,
  'settlement preserves all four prediction definitions'
);

select ok(
  (select predictions_locked_at is not null from public.picks where id = '93000000-0000-0000-0000-000000000001'),
  'settlement preserves prediction lock'
);

select ok(
  (select jsonb_array_length(edit_log) = 1 from public.picks where id = '93000000-0000-0000-0000-000000000001'),
  'settlement appends one audit entry'
);

select is(
  (select edit_log->0->>'type' from public.picks where id = '93000000-0000-0000-0000-000000000001'),
  'settlement',
  'audit entry is tagged as settlement'
);

select is(
  (select edit_log->0->>'primary_score_result' from public.picks where id = '93000000-0000-0000-0000-000000000001'),
  'won',
  'audit log records computed score resolution'
);

select throws_ok(
  $$
    update public.pick_predictions
    set confidence = 99
    where pick_id = '93000000-0000-0000-0000-000000000001' and kind = 'primary'
  $$,
  'P0001',
  'prediction definition is locked after match start',
  'definition remains protected after settlement'
);

select * from finish();
rollback;
