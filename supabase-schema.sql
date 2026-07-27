-- =============================================================================
-- NIDOS · Esquema de base para la landing de validación de PMF
-- =============================================================================
-- Cómo usarlo:
--   1. Entrá a tu proyecto de Supabase → SQL Editor → New query
--   2. Pegá TODO este archivo y ejecutá (Run)
--   3. Copiá Project URL y anon key desde Settings → API a assets/config.js
--
-- Diseño: TODO ES APPEND-ONLY (solo INSERT, nunca UPDATE ni DELETE).
-- Esto permite que la clave anónima pública del navegador solo pueda agregar
-- filas: nadie puede leer los emails capturados ni sobrescribir respuestas
-- ajenas. El estado del funnel se reconstruye con las vistas del final.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. LEADS · un registro por email capturado en el hero
-- -----------------------------------------------------------------------------
create table if not exists public.leads (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  session_id   text not null,
  nombre       text,
  email        text not null,
  puerta       text,           -- 'busco' | 'tengo_lugar'
  variant      text,           -- 'A' (compañero) | 'B' (acceso)
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  referrer     text,
  user_agent   text
);

create index if not exists leads_session_idx on public.leads (session_id);
create index if not exists leads_created_idx on public.leads (created_at desc);
create index if not exists leads_email_idx   on public.leads (lower(email));

-- -----------------------------------------------------------------------------
-- 2. RESPUESTAS · un registro por pregunta respondida en el onboarding
-- -----------------------------------------------------------------------------
create table if not exists public.respuestas (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text not null,
  paso       int  not null,
  clave      text not null,   -- 'situacion' | 'zona' | 'barrera' | 'wtp_garantia' | ...
  valor      text,
  valor_num  numeric          -- para presupuesto y otros numéricos
);

create index if not exists respuestas_session_idx on public.respuestas (session_id);
create index if not exists respuestas_clave_idx   on public.respuestas (clave);

-- -----------------------------------------------------------------------------
-- 3. EVENTOS · telemetría del funnel (vistas de paso, abandonos, clicks)
-- -----------------------------------------------------------------------------
create table if not exists public.eventos (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text not null,
  variant    text,
  nombre     text not null,   -- 'page_view' | 'hero_submit' | 'step_view' | ...
  props      jsonb
);

create index if not exists eventos_session_idx on public.eventos (session_id);
create index if not exists eventos_nombre_idx  on public.eventos (nombre);

-- =============================================================================
-- SEGURIDAD (RLS): el navegador solo puede INSERTAR
-- =============================================================================
alter table public.leads      enable row level security;
alter table public.respuestas enable row level security;
alter table public.eventos    enable row level security;

drop policy if exists "anon puede insertar leads"      on public.leads;
drop policy if exists "anon puede insertar respuestas" on public.respuestas;
drop policy if exists "anon puede insertar eventos"    on public.eventos;

create policy "anon puede insertar leads"
  on public.leads for insert to anon with check (true);

create policy "anon puede insertar respuestas"
  on public.respuestas for insert to anon with check (true);

create policy "anon puede insertar eventos"
  on public.eventos for insert to anon with check (true);

-- Sin políticas de SELECT/UPDATE/DELETE para anon: la clave pública no puede
-- leer, modificar ni borrar nada. Vos sí, desde el dashboard de Supabase.

-- =============================================================================
-- VISTAS DE ANÁLISIS · usalas desde Supabase → Table Editor o SQL Editor
-- =============================================================================

-- Un lead por fila con todas sus respuestas pivoteadas: la tabla que querés
-- exportar a CSV para el entregable.
create or replace view public.v_leads as
select
  l.created_at,
  l.email,
  -- el nombre se pide (opcional) al final del onboarding; en leads viejos venía en la tabla
  coalesce(l.nombre, max(case when r.clave = 'nombre' then r.valor end)) as nombre,
  l.puerta,
  l.variant,
  max(case when r.clave = 'situacion'       then r.valor end) as situacion,
  max(case when r.clave = 'zona_ciudad'     then r.valor end) as ciudad,
  max(case when r.clave = 'zona'            then r.valor end) as zona,
  max(case when r.clave = 'presupuesto'     then r.valor_num end) as presupuesto_ars,
  max(case when r.clave = 'urgencia'        then r.valor end) as urgencia,
  max(case when r.clave = 'barrera'         then r.valor end) as barrera_principal,
  max(case when r.clave = 'wtp_suscripcion' then r.valor end) as wtp_suscripcion,
  max(case when r.clave = 'wtp_garantia'    then r.valor end) as wtp_garantia,
  max(case when r.clave = 'wtp_contrato'    then r.valor end) as wtp_contrato,
  max(case when r.clave = 'comentario'      then r.valor end) as comentario,
  max(case when r.clave = 'whatsapp'        then r.valor end) as whatsapp,
  coalesce(max(r.paso), 0) as paso_maximo,
  coalesce(max(r.paso), 0) >= 5 as completo,
  l.utm_source,
  l.utm_campaign,
  l.session_id
from public.leads l
left join public.respuestas r on r.session_id = l.session_id
group by l.id, l.created_at, l.email, l.nombre, l.puerta, l.variant,
         l.utm_source, l.utm_campaign, l.session_id
order by l.created_at desc;

-- Conversión del A/B test: la métrica que decide qué mensaje funciona.
create or replace view public.v_ab_test as
with visitas as (
  select variant, count(distinct session_id) as visitantes
  from public.eventos
  where nombre = 'page_view' and variant is not null
  group by variant
),
capturas as (
  select variant, count(*) as leads
  from public.leads
  where variant is not null
  group by variant
),
terminados as (
  select l.variant, count(*) as onboarding_completo
  from public.leads l
  where exists (
    select 1 from public.respuestas r
    where r.session_id = l.session_id and r.paso >= 5
  )
  group by l.variant
)
select
  coalesce(v.variant, c.variant) as variant,
  case coalesce(v.variant, c.variant)
    when 'A' then 'Encontrá tu compañero ideal (eje compañía)'
    when 'B' then 'El mercado te dejó afuera (eje acceso)'
  end as hipotesis,
  coalesce(v.visitantes, 0)          as visitantes,
  coalesce(c.leads, 0)               as leads,
  coalesce(t.onboarding_completo, 0) as onboarding_completo,
  round(100.0 * coalesce(c.leads, 0) / nullif(v.visitantes, 0), 1) as conv_lead_pct,
  round(100.0 * coalesce(t.onboarding_completo, 0) / nullif(c.leads, 0), 1) as conv_onboarding_pct
from visitas v
full outer join capturas c   on c.variant = v.variant
full outer join terminados t on t.variant = coalesce(v.variant, c.variant);

-- Dónde se cae la gente, paso por paso.
create or replace view public.v_dropoff as
select
  (props->>'paso')::int as paso,
  props->>'titulo'      as titulo,
  count(distinct session_id) as llegaron
from public.eventos
where nombre = 'step_view' and props ? 'paso'
group by 1, 2
order by 1;

-- Ranking de barreras declaradas: valida (o refuta) la tesis del Módulo 3 de
-- que la barrera es la exclusión estructural y no el precio.
create or replace view public.v_barreras as
select valor as barrera, count(*) as menciones,
       round(100.0 * count(*) / sum(count(*)) over (), 1) as pct
from public.respuestas
where clave = 'barrera'
group by valor
order by menciones desc;

-- Disposición a pagar por cada flujo de monetización del Doc #3.
create or replace view public.v_wtp as
select clave as flujo, valor as respuesta, count(*) as n,
       round(100.0 * count(*) / sum(count(*)) over (partition by clave), 1) as pct
from public.respuestas
where clave like 'wtp_%'
group by clave, valor
order by clave, n desc;

-- Demanda por ciudad: valida en qué orden abrir las zonas. La ciudad se captura
-- en el hero (paso 0), así que queda registrada aunque abandonen el onboarding.
create or replace view public.v_demanda_geo as
select
  coalesce(r.valor, '(sin dato)') as ciudad,
  count(*)                                        as leads,
  count(*) filter (where l.puerta = 'busco')       as buscan,
  count(*) filter (where l.puerta = 'tengo_lugar') as ofrecen,
  round(100.0 * count(*) / sum(count(*)) over (), 1) as pct
from public.leads l
left join public.respuestas r
  on r.session_id = l.session_id and r.clave = 'zona_ciudad'
group by coalesce(r.valor, '(sin dato)')
order by leads desc;

-- Loop de referidos: quién invitó a quién. El código de invitación es el tramo
-- aleatorio del session_id de quien comparte (viaja en eventos.props->>'ref'),
-- así que los pares se reconstruyen sin columnas nuevas en leads.
create or replace view public.v_referidos as
with capturas_referidas as (
  select session_id, props->>'ref' as codigo, min(created_at) as capturado_at
  from public.eventos
  where nombre = 'lead_capturado' and props->>'ref' is not null
  group by session_id, props->>'ref'
)
select
  invitado.email      as invitado_email,
  invitado.puerta     as invitado_puerta,
  anfitrion.email     as invito_email,
  anfitrion.puerta    as invito_puerta,
  r.codigo,
  r.capturado_at
from capturas_referidas r
join public.leads invitado on invitado.session_id = r.session_id
left join public.leads anfitrion
  on split_part(anfitrion.session_id, '_', 3) = r.codigo
order by r.capturado_at desc;
