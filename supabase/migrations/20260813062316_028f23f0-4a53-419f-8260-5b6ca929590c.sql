-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin','user');
CREATE TYPE public.sport AS ENUM ('soccer','mlb');
CREATE TYPE public.pick_type AS ENUM ('1x2','over_under','handicap','marcador_exacto','parlay','prop');
CREATE TYPE public.risk_level AS ENUM ('bajo','medio','alto');
CREATE TYPE public.pick_status AS ENUM ('pending','won','lost','void');
CREATE TYPE public.visibility AS ENUM ('free','premium');

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  is_adult boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "roles_select" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

-- PLANS
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  interval text NOT NULL DEFAULT 'month',
  tier integer NOT NULL DEFAULT 1,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_public_read" ON public.plans FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "plans_admin_write" ON public.plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- PICKS
CREATE TABLE public.picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport public.sport NOT NULL,
  league text NOT NULL,
  teams text NOT NULL,
  event_at timestamptz NOT NULL,
  pick_type public.pick_type NOT NULL,
  selection text NOT NULL,
  risk public.risk_level NOT NULL DEFAULT 'medio',
  prob_home integer,
  prob_draw integer,
  prob_away integer,
  confidence integer NOT NULL DEFAULT 60,
  short_description text NOT NULL,
  basic_analysis text,
  status public.pick_status NOT NULL DEFAULT 'pending',
  visibility public.visibility NOT NULL DEFAULT 'free',
  price_cents integer NOT NULL DEFAULT 199,
  min_plan_tier integer NOT NULL DEFAULT 0,
  tags text[] NOT NULL DEFAULT '{}',
  featured boolean NOT NULL DEFAULT false,
  is_published boolean NOT NULL DEFAULT true,
  odds numeric(6,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.picks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.picks TO authenticated;
GRANT ALL ON public.picks TO service_role;
ALTER TABLE public.picks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "picks_public_read" ON public.picks FOR SELECT TO anon, authenticated USING (is_published = true OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "picks_admin_write" ON public.picks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- SUBSCRIPTIONS
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  sport_scope public.sport,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  provider_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX subscriptions_active_user ON public.subscriptions(user_id) WHERE status = 'active';
GRANT SELECT, INSERT, UPDATE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subs_select" ON public.subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "subs_update_own" ON public.subscriptions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- PURCHASES
CREATE TABLE public.pick_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pick_id uuid NOT NULL REFERENCES public.picks(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'paid',
  provider_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, pick_id)
);
GRANT SELECT ON public.pick_purchases TO authenticated;
GRANT ALL ON public.pick_purchases TO service_role;
ALTER TABLE public.pick_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchases_select" ON public.pick_purchases FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

-- ACCESS FUNCTION
CREATE OR REPLACE FUNCTION public.has_pick_access(_user_id uuid, _pick_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    CASE WHEN _user_id IS NULL THEN false
    ELSE (
      public.has_role(_user_id,'admin')
      OR EXISTS (SELECT 1 FROM public.picks p WHERE p.id = _pick_id AND p.visibility = 'free')
      OR EXISTS (SELECT 1 FROM public.pick_purchases pp WHERE pp.pick_id = _pick_id AND pp.user_id = _user_id AND pp.status = 'paid')
      OR EXISTS (
        SELECT 1 FROM public.subscriptions s
        JOIN public.plans pl ON pl.id = s.plan_id
        JOIN public.picks p ON p.id = _pick_id
        WHERE s.user_id = _user_id AND s.status = 'active'
          AND pl.tier >= GREATEST(p.min_plan_tier, 1)
          AND (s.sport_scope IS NULL OR s.sport_scope = p.sport)
      )
    ) END
$$;

-- PREMIUM CONTENT
CREATE TABLE public.pick_premium (
  pick_id uuid PRIMARY KEY REFERENCES public.picks(id) ON DELETE CASCADE,
  advanced_analysis text NOT NULL,
  key_factors text[] NOT NULL DEFAULT '{}',
  recommended_odds text,
  alternatives text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pick_premium TO authenticated;
GRANT ALL ON public.pick_premium TO service_role;
ALTER TABLE public.pick_premium ENABLE ROW LEVEL SECURITY;
CREATE POLICY "premium_read_with_access" ON public.pick_premium FOR SELECT TO authenticated
  USING (public.has_pick_access(auth.uid(), pick_id));
CREATE POLICY "premium_admin_write" ON public.pick_premium FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- NEW USER TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, is_adult)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name',''), COALESCE((NEW.raw_user_meta_data->>'is_adult')::boolean, true))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SEED PLANS
INSERT INTO public.plans (slug,name,description,price_cents,tier,features) VALUES
('starter','Starter','Acceso a los picks exclusivos de un solo deporte.',999,1,'["Picks exclusivos de soccer o MLB (eliges uno)","Análisis avanzado de esos picks","Historial completo","Sin marcadores exactos ni parlays complejos"]'::jsonb),
('pro','Pro','Acceso total a soccer y MLB, parlays y marcadores exactos.',1999,2,'["Todos los picks exclusivos de soccer y MLB","Análisis avanzado completo","Marcadores exactos y parlay del día","Alertas de nuevos picks","Menos de $0.70 al día"]'::jsonb),
('vip','VIP','Todo lo del plan Pro más selección VIP y soporte prioritario.',3999,3,'["Todo lo del plan Pro","Picks VIP de alto valor","Reporte semanal de rendimiento","Soporte prioritario","Acceso anticipado a los picks del día"]'::jsonb);

-- SEED PICKS (free)
INSERT INTO public.picks (sport,league,teams,event_at,pick_type,selection,risk,prob_home,prob_draw,prob_away,confidence,short_description,basic_analysis,status,visibility,price_cents,min_plan_tier,tags,featured,odds) VALUES
('soccer','UEFA Champions League','Craiova vs KuPS', now() + interval '1 day' + interval '3 hours','1x2','Gana Craiova (1)','bajo',63,23,14,63,'Craiova llega con cuatro victorias seguidas en casa y KuPS viaja sin su central titular.','Craiova promedia 1.9 goles por partido como local y solo ha perdido una vez en sus últimos diez encuentros en casa. KuPS viene de una pretemporada corta y sufre en salida de balón bajo presión alta.','pending','free',199,0,'{Destacado}',true,1.72),
('mlb','MLB Regular Season','New York Yankees vs Boston Red Sox', now() + interval '1 day' + interval '6 hours','over_under','Over 8.5 carreras','medio',null,null,null,58,'Bullpen visitante desgastado tras tres juegos seguidos y viento a favor en el Bronx.','Los Yankees promedian 5.1 carreras en casa este mes y Boston llega con dos relevistas indisponibles. El viento sopla hacia el jardín derecho, un factor histórico de más cuadrangulares en ese parque.','pending','free',199,0,'{}',true,1.90),
('soccer','LaLiga','Real Sociedad vs Getafe', now() + interval '2 days','over_under','Under 2.5 goles','bajo',48,29,23,66,'Getafe es el equipo con menos goles totales de la liga y Real Sociedad rota por Europa.','Siete de los últimos ocho partidos de Getafe terminaron con menos de 2.5 goles. Real Sociedad juega entre semana y suele reservar piezas ofensivas.','pending','free',199,0,'{}',false,1.65),
('mlb','MLB Regular Season','Los Angeles Dodgers vs San Diego Padres', now() + interval '2 days' + interval '4 hours','1x2','Gana Dodgers','medio',61,null,39,61,'Duelo de abridores muy desigual: as de los Dodgers frente al quinto de la rotación rival.','El abridor local acumula 2.71 de efectividad en casa. San Diego batea .218 frente a lanzadores zurdos en los últimos 30 días.','pending','free',199,0,'{}',false,1.68),
('soccer','Premier League','Brighton vs Everton', now() + interval '3 days','1x2','Doble oportunidad 1X','bajo',54,27,19,71,'Brighton domina la posesión en casa y Everton solo ha ganado dos veces como visitante.','Brighton genera 1.8 xG por partido en casa. Everton concede muchas ocasiones tras pérdida en zona media y no marca fuera desde hace cuatro jornadas.','pending','free',199,0,'{}',false,1.35),
('mlb','MLB Regular Season','Houston Astros vs Seattle Mariners', now() + interval '3 days' + interval '5 hours','over_under','Under 7.5 carreras','medio',null,null,null,57,'Dos de las mejores rotaciones de la Liga Americana frente a frente.','Ambos abridores están por debajo de 3.20 de efectividad. Seattle es el equipo con menos carreras anotadas como visitante en el último mes.','pending','free',199,0,'{}',false,1.85),
('soccer','Serie A','Inter vs Torino', now() + interval '4 days','handicap','Inter -1','medio',68,20,12,60,'Inter no encaja en casa desde hace cinco partidos y Torino apuesta por un bloque bajo.','Inter promedia 2.4 goles por partido en San Siro. Torino ha perdido por dos o más goles en tres de sus últimas cuatro visitas a equipos grandes.','pending','free',199,0,'{}',false,1.80),
('mlb','MLB Regular Season','Atlanta Braves vs New York Mets', now() + interval '4 days' + interval '2 hours','prop','Jugador estrella de Atlanta: 1+ hit','bajo',null,null,null,72,'Racha de bateo activa de nueve juegos frente a un abridor derecho al que castiga históricamente.','Su promedio ante lanzadores derechos es .318 esta temporada, con contacto duro por encima del 48%.','pending','free',199,0,'{}',false,1.55);

-- SEED PICKS (premium, pending)
INSERT INTO public.picks (sport,league,teams,event_at,pick_type,selection,risk,prob_home,prob_draw,prob_away,confidence,short_description,basic_analysis,status,visibility,price_cents,min_plan_tier,tags,featured,odds) VALUES
('soccer','UEFA Champions League','Bayern München vs PSV', now() + interval '1 day' + interval '2 hours','marcador_exacto','3-1 Bayern','alto',66,20,14,38,'Modelo de marcador con valor claro en el 3-1.','','pending','premium',299,2,'{"Alto valor","Solo Pro/VIP"}',true,8.50),
('mlb','MLB Regular Season','Parlay del día MLB (3 legs)', now() + interval '1 day' + interval '7 hours','parlay','Yankees ML + Over 8.5 + Astros ML','alto',null,null,null,45,'Combinada de tres selecciones con cuota total superior a 6.00.','','pending','premium',399,2,'{"Parlay del día"}',true,6.40),
('soccer','LaLiga','Real Madrid vs Villarreal', now() + interval '2 days' + interval '1 hour','over_under','Over 3.5 goles','medio',64,22,14,55,'Partido con ritmo alto esperado y defensas adelantadas.','','pending','premium',249,1,'{Exclusivo}',false,2.30),
('mlb','MLB Regular Season','Philadelphia Phillies vs Miami Marlins', now() + interval '2 days' + interval '3 hours','handicap','Phillies -1.5','medio',null,null,null,54,'Handicap de carreras con valor tras la lesión del abridor visitante.','','pending','premium',249,1,'{Exclusivo}',false,2.05),
('soccer','Premier League','Arsenal vs Manchester City', now() + interval '3 days' + interval '2 hours','1x2','Empate','alto',36,30,34,34,'Los grandes duelos entre estos dos terminan empatados con más frecuencia de lo que paga el mercado.','','pending','premium',299,1,'{"Alto valor"}',true,3.60),
('mlb','MLB Regular Season','Chicago Cubs vs St. Louis Cardinals', now() + interval '3 days' + interval '6 hours','prop','Ponches del abridor local: Over 6.5','medio',null,null,null,59,'Prop de ponches contra una alineación con alto índice de swing y fallo.','','pending','premium',199,1,'{Exclusivo}',false,1.95),
('soccer','Serie A','Napoli vs Roma', now() + interval '4 days' + interval '1 hour','marcador_exacto','2-1 Napoli','alto',52,26,22,31,'Marcador exacto respaldado por el modelo de goles esperados.','','pending','premium',299,2,'{"Solo Pro/VIP"}',false,7.50),
('soccer','Bundesliga','Parlay del día Soccer (4 legs)', now() + interval '4 days' + interval '3 hours','parlay','4 selecciones europeas de bajo riesgo','alto',null,null,null,42,'Combinada de cuatro legs con cuota cercana a 9.00.','','pending','premium',399,2,'{"Parlay del día"}',false,8.90),
('mlb','MLB Regular Season','Toronto Blue Jays vs Tampa Bay Rays', now() + interval '5 days','1x2','Gana Tampa Bay','medio',47,null,53,53,'Underdog con valor por matchup de abridores.','','pending','premium',249,1,'{Exclusivo}',false,2.10),
('soccer','Ligue 1','PSG vs Lyon', now() + interval '5 days' + interval '2 hours','handicap','PSG -2 asiático','alto',72,17,11,44,'Handicap agresivo para un PSG con plantilla completa.','','pending','premium',299,2,'{"Alto valor"}',false,2.60),
('mlb','MLB Regular Season','Pick VIP: San Francisco Giants vs Colorado Rockies', now() + interval '5 days' + interval '5 hours','over_under','Over 10.5 carreras','medio',null,null,null,61,'Selección VIP en Coors Field con condiciones ideales de bateo.','','pending','premium',499,3,'{VIP,"Alto valor"}',true,1.88),
('soccer','UEFA Champions League','Pick VIP: Barcelona vs Benfica', now() + interval '6 days','1x2','Gana Barcelona y ambos marcan','alto',65,21,14,48,'Selección VIP combinada de resultado y ambos equipos marcan.','','pending','premium',499,3,'{VIP}',false,2.75),
('soccer','Eredivisie','Ajax vs Feyenoord', now() + interval '6 days' + interval '2 hours','over_under','Over 2.5 goles','bajo',45,26,29,68,'El Klassieker histórico supera los 2.5 goles en 7 de los últimos 10.','','pending','premium',199,1,'{Exclusivo}',false,1.70);

-- SEED RESOLVED PICKS
INSERT INTO public.picks (sport,league,teams,event_at,pick_type,selection,risk,prob_home,prob_draw,prob_away,confidence,short_description,basic_analysis,status,visibility,price_cents,min_plan_tier,tags,featured,odds) VALUES
('soccer','LaLiga','Atlético de Madrid vs Sevilla', now() - interval '3 days','1x2','Gana Atlético','bajo',67,21,12,67,'Atlético invicto en casa y Sevilla sin dos centrales.','El Atlético cerró el partido con doble pivote y controló el juego desde el minuto 20.','won','free',199,0,'{}',false,1.60),
('mlb','MLB Regular Season','Yankees vs Orioles', now() - interval '4 days','over_under','Over 9.5 carreras','medio',null,null,null,55,'Duelo ofensivo esperado entre dos de las mejores alineaciones del Este.','El juego terminó 7-6, superando el total con comodidad en la octava entrada.','won','premium',249,1,'{}',false,1.92),
('soccer','Premier League','Chelsea vs Newcastle', now() - interval '5 days','over_under','Under 2.5 goles','medio',44,28,28,58,'Dos equipos que bajaron el ritmo tras la fecha FIFA.','El partido terminó 2-1: el gol del descuento en el minuto 88 tumbó el pick.','lost','free',199,0,'{}',false,1.75),
('mlb','MLB Regular Season','Dodgers vs Giants', now() - interval '6 days','handicap','Dodgers -1.5','medio',null,null,null,52,'Handicap por diferencia clara en la rotación.','Victoria 6-2 de los Dodgers, cubriendo el handicap sin problemas.','won','premium',249,1,'{}',false,2.00),
('soccer','Serie A','Juventus vs Lazio', now() - interval '7 days','marcador_exacto','2-0 Juventus','alto',58,25,17,30,'Marcador exacto de alto valor.','Terminó 1-0. El modelo acertó el ganador pero no el marcador.','lost','premium',299,2,'{}',false,7.00),
('mlb','MLB Regular Season','Parlay del día (2 legs)', now() - interval '8 days','parlay','Astros ML + Over 8.5','alto',null,null,null,47,'Combinada de dos legs resuelta el fin de semana pasado.','Ambas selecciones entraron: cuota total de 3.85.','won','premium',399,2,'{}',false,3.85);

-- PREMIUM CONTENT for premium picks
INSERT INTO public.pick_premium (pick_id, advanced_analysis, key_factors, recommended_odds, alternatives)
SELECT p.id,
  'Análisis avanzado de ' || p.teams || ' (' || p.league || '). El modelo cruza forma reciente de los últimos 10 encuentros, goles/carreras esperadas ajustadas por rival, disponibilidad de plantilla y movimiento de línea desde la apertura del mercado. La selección "' || p.selection || '" aparece con un valor esperado positivo frente a la cuota actual: nuestra probabilidad implícita es de ' || p.confidence || '%, mientras que el mercado la sitiúa por debajo. El volumen de dinero se ha movido en la dirección contraria en las últimas 12 horas, lo que suele señalar precio inflado en el lado popular. Recomendamos entrar con 1.5 unidades y no perseguir la línea si se mueve más de 10 centésimas en contra.',
  ARRAY['Forma reciente y descanso entre partidos','Bajas confirmadas y rotaciones previstas','Movimiento de línea desde la apertura','Rendimiento ajustado por calidad de rival','Condiciones de juego y factor localía'],
  'Cuota mínima recomendada: ' || COALESCE(p.odds::text,'1.80') || ' — stake sugerido 1.5u',
  'Alternativas con menor riesgo: reducir el handicap o tomar la doble oportunidad. Para perfiles agresivos, considerar la versión combinada con el total de goles/carreras.'
FROM public.picks p WHERE p.visibility = 'premium';

INSERT INTO public.pick_premium (pick_id, advanced_analysis, key_factors, recommended_odds, alternatives)
SELECT p.id,
  'Desglose completo de ' || p.teams || ': ' || COALESCE(NULLIF(p.basic_analysis,''),'sin notas adicionales') || ' El modelo mantiene una lectura estable de este mercado y sugiere seguirlo en próximas jornadas.',
  ARRAY['Estadística avanzada del enfrentamiento','Rendimiento histórico del tipo de pick','Contexto de calendario'],
  'Cuota de referencia: ' || COALESCE(p.odds::text,'1.80'),
  'Sin alternativas destacadas.'
FROM public.picks p WHERE p.visibility = 'free';