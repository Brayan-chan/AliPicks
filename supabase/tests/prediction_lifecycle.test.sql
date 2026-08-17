begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

-- Minimal canonical sports fixture. These writes intentionally bypass the app/RPC
-- layer so this suite proves the database itself protects prediction history.
insert into public.leagues (id, sport, name, slug, is_active)
values (
  '10000000-0000-0000-0000-000000000001',
  'soccer',
  'Lifecycle Test League',
  'lifecycle-test-league',
  true
);

insert into public.teams (id, sport, name, slug, is_active)
values
  (
    '20000000-0000-0000-0000-000000000001',
    'soccer',
    'Lifecycle Home',
    'lifecycle-home',
    true
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'soccer',
    'Lifecycle Away',
    'lifecycle-away',
    true
  );

insert into public.league_teams (league_id, team_id, is_active)
values
  (
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    true
  ),
  (
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    true
  );

insert into public.picks (
  id,
  sport,
  league,
  teams,
  league_id,
  home_team_id,
  away_team_id,
  event_at,
  event_state,
  pick_type,
  selection,
  risk,
  confidence,
  odds,
  short_description,
  prob_home,
  prob_draw,
  prob_away,
  secondary_selection,
  secondary_pick_type,
  secondary_risk,
  secondary_confidence,
  secondary_odds,
  score_primary,
  score_primary_confidence,
  score_secondary,
  score_secondary_confidence,
  status
)
values (
  '30000000-0000-0000-0000-000000000001',
  'soccer',
  'Lifecycle Test League',
  'Lifecycle Home vs Lifecycle Away',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  now() + interval '1 day',
  'upcoming',
  '1x2',
  'Lifecycle Home gana',
  'bajo',
  72,
  1.80,
  'Fixture used only by the database lifecycle test.',
  55,
  25,
  20,
  'Más de 1.5 goles',
  'over_under',
  'medio',
  64,
  1.45,
  '2-1',
  31,
  '1-1',
  22,
  'pending'
);

insert into public.pick_predictions (
  pick_id,
  kind,
  market_type,
  selection,
  confidence,
  risk,
  odds,
  result
)
values
  (
    '30000000-0000-0000-0000-000000000001',
    'primary',
    '1x2',
    'Lifecycle Home gana',
    72,
    'bajo',
    1.80,
    'pending'
  ),
  (
    '30000000-0000-0000-0000-000000000001',
    'secondary',
    'over_under',
    'Más de 1.5 goles',
    64,
    'medio',
    1.45,
    'pending'
  );

insert into public.pick_predictions (
  pick_id,
  kind,
  predicted_home_score,
  predicted_away_score,
  confidence,
  risk,
  odds,
  result
)
values
  (
    '30000000-0000-0000-0000-000000000001',
    'primary_score',
    2,
    1,
    31,
    null,
    null,
    'pending'
  ),
  (
    '30000000-0000-0000-0000-000000000001',
    'alt_score',
    1,
    1,
    22,
    null,
    null,
    'pending'
  );

select ok(
  (select predictions_locked_at is null
   from public.picks
   where id = '30000000-0000-0000-0000-000000000001'),
  'upcoming pick starts with unlocked predictions'
);

select lives_ok(
  $$
    update public.picks
    set event_state = 'live'
    where id = '30000000-0000-0000-0000-000000000001'
  $$,
  'upcoming match may transition to live'
);

select ok(
  (select predictions_locked_at is not null
   from public.picks
   where id = '30000000-0000-0000-0000-000000000001'),
  'entering live sets predictions_locked_at'
);

create temp table _prediction_lock_snapshot on commit drop as
select predictions_locked_at
from public.picks
where id = '30000000-0000-0000-0000-000000000001';

select throws_ok(
  $$
    update public.pick_predictions
    set selection = 'Retroactive edit'
    where pick_id = '30000000-0000-0000-0000-000000000001'
      and kind = 'primary'
  $$,
  'P0001',
  'prediction definition is locked after match start',
  'structured prediction definition cannot change after kickoff'
);

select throws_ok(
  $$
    delete from public.pick_predictions
    where pick_id = '30000000-0000-0000-0000-000000000001'
      and kind = 'secondary'
  $$,
  'P0001',
  'locked match predictions cannot be deleted',
  'locked structured prediction cannot be deleted'
);

select throws_ok(
  $$
    update public.picks
    set selection = 'Retroactive legacy edit'
    where id = '30000000-0000-0000-0000-000000000001'
  $$,
  'P0001',
  'legacy prediction definition is locked after match start',
  'legacy prediction mirror cannot change after kickoff'
);

select throws_ok(
  $$
    update public.pick_predictions
    set result = 'won'
    where pick_id = '30000000-0000-0000-0000-000000000001'
      and kind = 'primary'
  $$,
  'P0001',
  'live match predictions must remain pending',
  'live prediction cannot be settled before terminal state'
);

select lives_ok(
  $$
    update public.picks
    set event_state = 'postponed',
        home_score = null,
        away_score = null,
        final_result = null,
        postponement_reason = 'Suspended during lifecycle test',
        postponed_at = now(),
        rescheduled_for = now() + interval '7 days'
    where id = '30000000-0000-0000-0000-000000000001'
  $$,
  'live match may be suspended and represented as postponed'
);

select is(
  (select predictions_locked_at::text
   from public.picks
   where id = '30000000-0000-0000-0000-000000000001'),
  (select predictions_locked_at::text from _prediction_lock_snapshot),
  'postponement preserves the original prediction lock timestamp'
);

select lives_ok(
  $$
    update public.picks
    set event_state = 'upcoming',
        event_at = rescheduled_for,
        postponement_reason = null,
        postponed_at = null,
        rescheduled_for = null
    where id = '30000000-0000-0000-0000-000000000001'
  $$,
  'persisted postponed match may be reprogrammed as upcoming'
);

select is(
  (select predictions_locked_at::text
   from public.picks
   where id = '30000000-0000-0000-0000-000000000001'),
  (select predictions_locked_at::text from _prediction_lock_snapshot),
  'reprogramming never clears the prediction lock'
);

select throws_ok(
  $$
    update public.pick_predictions
    set confidence = 99
    where pick_id = '30000000-0000-0000-0000-000000000001'
      and kind = 'primary'
  $$,
  'P0001',
  'prediction definition is locked after match start',
  'reprogrammed match still rejects retroactive model edits'
);

select lives_ok(
  $$
    update public.picks
    set event_state = 'cancelled',
        home_score = null,
        away_score = null,
        final_result = null
    where id = '30000000-0000-0000-0000-000000000001'
  $$,
  'reprogrammed upcoming match may later be cancelled'
);

select lives_ok(
  $$
    update public.pick_predictions
    set result = 'void'
    where pick_id = '30000000-0000-0000-0000-000000000001'
  $$,
  'cancelled match may void prediction results without changing definitions'
);

select throws_ok(
  $$
    update public.picks
    set event_state = 'upcoming'
    where id = '30000000-0000-0000-0000-000000000001'
  $$,
  'P0001',
  'cancelled match cannot transition to another state',
  'cancelled match cannot be reopened'
);

select * from finish();
rollback;
