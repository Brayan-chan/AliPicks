
UPDATE public.picks SET
  factors = jsonb_build_array(
    jsonb_build_object('title','Lo que está en juego','color','#d8b45a','text','Contexto de tabla y objetivos del torneo para ambos equipos en esta jornada.'),
    jsonb_build_object('title','Fuerza del equipo','color','#4ea88a','text','Comparativa de rendimiento ofensivo y defensivo en los últimos 10 encuentros.'),
    jsonb_build_object('title','Lesiones y bajas','color','#d96a5a','text','Ausencias confirmadas y su impacto estimado en el once o alineación titular.'),
    jsonb_build_object('title','Choque de estilos','color','#6c9ad2','text','Cómo se enfrentan los planteamientos de ambos equipos y quién domina el ritmo.'),
    jsonb_build_object('title','Cuotas y líneas','color','#b98cd6','text','Movimiento del mercado y diferencias respecto a la probabilidad del modelo.'),
    jsonb_build_object('title','Forma local / visitante','color','#e0995a','text','Rendimiento reciente como local y como visitante de cada equipo.')
  ),
  extra_tabs = jsonb_build_array(
    jsonb_build_object('label','Resumen', 'text','Vista general del enfrentamiento y los datos que sustentan la proyección.'),
    jsonb_build_object('label','Forma reciente','rows', jsonb_build_array(
      jsonb_build_object('Equipo','Local','Últimos 5','3G 1E 1P','Anotados','8','Recibidos','4'),
      jsonb_build_object('Equipo','Visitante','Últimos 5','2G 2E 1P','Anotados','6','Recibidos','5'))),
    jsonb_build_object('label','Historial','rows', jsonb_build_array(
      jsonb_build_object('Duelo','Último','Resultado','2-1'),
      jsonb_build_object('Duelo','Penúltimo','Resultado','1-1'))),
    jsonb_build_object('label','Mercado','rows', jsonb_build_array(
      jsonb_build_object('Línea','Apertura','Valor','1.95'),
      jsonb_build_object('Línea','Actual','Valor','1.82')))
  )
WHERE factors = '[]'::jsonb;

UPDATE public.picks SET
  score_primary = '2-1',
  score_primary_confidence = 18,
  score_secondary = '1-1',
  score_secondary_confidence = 13
WHERE score_primary IS NULL AND sport = 'soccer';

UPDATE public.picks SET
  score_primary = '5-3',
  score_primary_confidence = 12,
  score_secondary = '4-2',
  score_secondary_confidence = 10
WHERE score_primary IS NULL AND sport = 'mlb';

UPDATE public.picks SET
  secondary_selection = 'Total de goles Over 2.5',
  secondary_pick_type = 'over_under',
  secondary_risk = 'medio',
  secondary_confidence = 62,
  secondary_odds = 1.85
WHERE secondary_selection IS NULL AND sport = 'soccer';

UPDATE public.picks SET
  secondary_selection = 'Total de carreras Over 8.5',
  secondary_pick_type = 'over_under',
  secondary_risk = 'medio',
  secondary_confidence = 58,
  secondary_odds = 1.9
WHERE secondary_selection IS NULL AND sport = 'mlb';

UPDATE public.picks SET event_state = CASE
  WHEN status IN ('won','lost') THEN 'finished'
  WHEN status = 'void' THEN 'cancelled'
  ELSE 'upcoming' END;

UPDATE public.picks SET recommended = true
WHERE visibility = 'premium' AND status = 'pending' AND confidence >= 70;
