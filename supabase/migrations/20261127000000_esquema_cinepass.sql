-- =====================================================================
-- CinePass · Esquema de base de datos para Supabase (PostgreSQL)
-- ---------------------------------------------------------------------
-- Tablas, relaciones, restricciones, funciones RPC atómicas y políticas
-- de Row Level Security (RLS).
--
-- Cómo aplicarlo:
--   · Proyecto en la nube: pega este archivo completo en Supabase → SQL Editor → Run.
--   · Entorno local:       npx supabase start   (lo aplica solo) o npx supabase db reset.
--
-- Principios:
--   · El navegador solo usa la clave pública (publishable/anon). Toda escritura
--     pasa por funciones RPC que validan en el servidor; las tablas no aceptan
--     INSERT/UPDATE/DELETE directos desde el cliente.
--   · La doble reserva de un asiento es imposible: además de la comprobación
--     dentro de la transacción, un índice único parcial (funcion_id, asiento)
--     sobre los asientos activos lo garantiza a nivel de PostgreSQL.
--   · Las reservas de funciones distintas no se bloquean entre sí: el candado
--     (pg_advisory_xact_lock) es por función.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Perfiles de usuario (las credenciales viven en auth.users, cifradas por Supabase Auth)
-- ---------------------------------------------------------------------
create table public.perfiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nombre     text not null check (char_length(nombre) between 1 and 80),
  correo     text not null unique,
  telefono   text not null default '' check (char_length(telefono) <= 20),
  rol        text not null default 'cliente' check (rol in ('cliente', 'admin')),
  creado_en  timestamptz not null default now()
);
comment on table public.perfiles is 'Datos públicos de cada cuenta. El rol solo lo cambia un administrador o el SQL Editor.';

-- Crea el perfil al registrarse. El rol SIEMPRE empieza como cliente
-- (no se toma de los metadatos, que el usuario controla).
create function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, nombre, correo, telefono)
  values (
    new.id,
    coalesce(nullif(left(trim(new.raw_user_meta_data ->> 'nombre'), 80), ''), split_part(new.email, '@', 1)),
    lower(new.email),
    coalesce(left(new.raw_user_meta_data ->> 'telefono', 20), '')
  );
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();

create function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin');
$$;

-- ---------------------------------------------------------------------
-- 2. Funciones cinematográficas
--    La cartelera (películas) sigue viniendo de TMDB o de js/data.js; aquí se
--    guarda la función con una copia del título para el historial.
--    El id es el mismo que genera buildFN() en js/data.js:
--      "{idPelícula}-{AAAA-MM-DD}-{k}", k = 0 (15:00), 1 (18:00), 2 (21:15)
-- ---------------------------------------------------------------------
create table public.funciones (
  id               text primary key check (id ~ '^[0-9]{1,10}-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-2]$'),
  pelicula_id      bigint not null,
  pelicula_titulo  text not null check (char_length(pelicula_titulo) between 1 and 200),
  inicio           timestamptz not null,
  sala             smallint not null check (sala between 1 and 3),
  formato          text not null check (formato in ('2D', '3D')),
  idioma           text not null check (idioma in ('Español', 'Subtitulada')),
  creada_en        timestamptz not null default now()
);

-- Hora de inicio y sala se calculan en el servidor a partir del id
-- (mismas reglas que buildFN). Hora local del cine: America/Panama.
create function public.datos_funcion(p_id text, out inicio timestamptz, out sala smallint, out pelicula_id bigint)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_partes text[];
  v_k int;
begin
  if p_id is null or p_id !~ '^[0-9]{1,10}-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-2]$' then
    raise exception 'FUNCION_INVALIDA: identificador de función no válido' using errcode = 'P0001';
  end if;
  v_partes := regexp_match(p_id, '^([0-9]+)-([0-9]{4}-[0-9]{2}-[0-9]{2})-([0-2])$');
  pelicula_id := v_partes[1]::bigint;
  v_k := v_partes[3]::int;
  inicio := ((v_partes[2] || ' ' || (array['15:00', '18:00', '21:15'])[v_k + 1])::timestamp) at time zone 'America/Panama';
  sala := (1 + (pelicula_id + v_k) % 3)::smallint;
end;
$$;

-- Asientos que la app muestra como "ocupados" de forma simulada
-- (réplica exacta de hash() y ocupados() en js/app.js). Se rechazan también en el servidor
-- para que el mapa sea el mismo para todos los usuarios.
create function public.asientos_simulados(p_funcion_id text)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_h bigint := 7;
  v_i int;
  v_c int;
  v_res text[] := '{}';
begin
  for v_i in 1 .. char_length(p_funcion_id) loop
    v_h := (v_h * 31 + ascii(substr(p_funcion_id, v_i, 1))) % 4294967296;
  end loop;
  for v_i in 0 .. 7 loop
    for v_c in 1 .. 10 loop
      if (v_h + v_i * 7 + v_c * 13) % 100 < 22 then
        v_res := v_res || (substr('ABCDEFGH', v_i + 1, 1) || v_c::text);
      end if;
    end loop;
  end loop;
  return v_res;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Reservas, sus asientos (detalle) y su historial
-- ---------------------------------------------------------------------
create table public.reservas (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null unique check (codigo ~ '^CP-[A-Z0-9]{6}$'),
  usuario_id        uuid not null references public.perfiles (id) on delete restrict,
  funcion_id        text not null references public.funciones (id) on delete restrict,
  boletos_general   smallint not null default 0 check (boletos_general between 0 and 8),
  boletos_nino      smallint not null default 0 check (boletos_nino between 0 and 8),
  boletos_mayor     smallint not null default 0 check (boletos_mayor between 0 and 8),
  total             numeric(10, 2) not null check (total >= 0),
  metodo_pago       text not null check (metodo_pago in ('Tarjeta', 'Yappy', 'PayPal', 'Pago en Taquilla')),
  referencia_pago   text not null default '' check (char_length(referencia_pago) <= 10),
  estado            text not null default 'Confirmada' check (estado in ('Confirmada', 'Cancelada')),
  creada_en         timestamptz not null default now(),
  actualizada_en    timestamptz not null default now(),
  check (boletos_general + boletos_nino + boletos_mayor between 1 and 8)
);
create index reservas_usuario_idx on public.reservas (usuario_id);
create index reservas_funcion_idx on public.reservas (funcion_id);

create table public.reserva_asientos (
  reserva_id  uuid not null references public.reservas (id) on delete cascade,
  funcion_id  text not null references public.funciones (id) on delete restrict,
  asiento     text not null check (asiento ~ '^[A-H]([1-9]|10)$'),
  activo      boolean not null default true,
  primary key (reserva_id, asiento)
);
-- Garantía final contra la doble reserva: un asiento activo por función.
create unique index reserva_asientos_unico_activo
  on public.reserva_asientos (funcion_id, asiento) where activo;

create table public.reserva_historial (
  id          bigint generated always as identity primary key,
  reserva_id  uuid not null references public.reservas (id) on delete cascade,
  evento      text not null,
  actor       text not null,
  fecha       timestamptz not null default now()
);
create index reserva_historial_reserva_idx on public.reserva_historial (reserva_id);

-- ---------------------------------------------------------------------
-- 4. Dulcería: productos, pedidos y sus líneas
-- ---------------------------------------------------------------------
create table public.productos (
  id         text primary key,
  nombre     text not null unique,
  categoria  text not null,
  precio     numeric(10, 2) not null check (precio >= 0),
  activo     boolean not null default true
);
-- Mismo menú que MENU en js/data.js
insert into public.productos (id, nombre, categoria, precio) values
  ('c1', 'Palomitas grandes', 'Combos', 6),
  ('c2', 'Combo pareja', 'Combos', 14),
  ('s1', 'Nachos con queso', 'Snacks', 5),
  ('s2', 'Hot dog', 'Snacks', 4),
  ('s3', 'Chocolates', 'Snacks', 2.5),
  ('b1', 'Refresco 22 oz', 'Bebidas', 3),
  ('b2', 'Agua', 'Bebidas', 1.5),
  ('b3', 'Café', 'Bebidas', 2.5);

create table public.pedidos (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null unique check (codigo ~ '^PD-[A-Z0-9]{5}$'),
  usuario_id  uuid not null references public.perfiles (id) on delete restrict,
  reserva_id  uuid references public.reservas (id) on delete set null,
  total       numeric(10, 2) not null check (total >= 0),
  estado      text not null default 'Recibido' check (estado in ('Recibido', 'Entregado', 'Cancelado')),
  creado_en   timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index pedidos_usuario_idx on public.pedidos (usuario_id);

create table public.pedido_items (
  pedido_id        uuid not null references public.pedidos (id) on delete cascade,
  producto_id      text not null references public.productos (id),
  cantidad         smallint not null check (cantidad between 1 and 50),
  precio_unitario  numeric(10, 2) not null check (precio_unitario >= 0),
  primary key (pedido_id, producto_id)
);

-- ---------------------------------------------------------------------
-- 5. Utilidades internas
-- ---------------------------------------------------------------------
create function public.codigo_aleatorio(p_largo int)
returns text
language sql
volatile
set search_path = ''
as $$
  -- Mismo alfabeto que la app (sin 0, O, 1, I, L para evitar confusiones)
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, p_largo);
$$;

-- Precio: igual que precio() y extra() en js/app.js y PRECIO en js/data.js.
create function public.calcular_total(p_formato text, p_general int, p_nino int, p_mayor int, p_asientos text[])
returns numeric
language sql
immutable
set search_path = ''
as $$
  select (p_general * 8 + p_nino * 5 + p_mayor * 5)
       + (case when p_formato = '3D' then 2 else 0 end) * (p_general + p_nino + p_mayor)
       + 2 * (select count(*) from unnest(p_asientos) a where left(a, 1) in ('G', 'H'));
$$;

-- Valida la lista de asientos pedida (formato, cantidad y duplicados).
create function public.validar_asientos(p_asientos text[], p_cantidad int)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_asientos is null or cardinality(p_asientos) = 0 then
    raise exception 'DATOS_INVALIDOS: no se eligieron asientos' using errcode = 'P0001';
  end if;
  if cardinality(p_asientos) <> p_cantidad then
    raise exception 'DATOS_INVALIDOS: la cantidad de asientos no coincide con la de boletos' using errcode = 'P0001';
  end if;
  if (select count(distinct a) from unnest(p_asientos) a) <> cardinality(p_asientos) then
    raise exception 'DATOS_INVALIDOS: hay asientos repetidos' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(p_asientos) a where a !~ '^[A-H]([1-9]|10)$') then
    raise exception 'DATOS_INVALIDOS: código de asiento no válido' using errcode = 'P0001';
  end if;
end;
$$;

-- Devuelve la reserva en el mismo formato que usa la app.
create function public.reserva_json(p_reserva_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'codigo', r.codigo,
    'total', r.total,
    'estado', r.estado,
    'asientos', (select coalesce(jsonb_agg(a.asiento order by a.asiento), '[]'::jsonb)
                 from public.reserva_asientos a where a.reserva_id = r.id and (a.activo or r.estado = 'Cancelada'))
  )
  from public.reservas r where r.id = p_reserva_id;
$$;

-- ---------------------------------------------------------------------
-- 6. RPC: asientos ocupados (solo códigos de asiento, nunca de quién son)
-- ---------------------------------------------------------------------
create function public.asientos_ocupados(p_funciones text[])
returns table (funcion_id text, asiento text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.funcion_id, a.asiento
  from public.reserva_asientos a
  where a.activo and a.funcion_id = any (p_funciones[1:200]);
$$;

-- ---------------------------------------------------------------------
-- 7. RPC: confirmar reserva (operación atómica)
-- ---------------------------------------------------------------------
create function public.confirmar_reserva(
  p_funcion     jsonb,    -- {"id","titulo","formato","idioma"} de la función elegida
  p_boletos     jsonb,    -- {"G":1,"N":0,"A":0}
  p_asientos    text[],   -- {"E5","E6"}
  p_metodo      text,     -- 'Tarjeta' | 'Yappy' | 'PayPal' | 'Pago en Taquilla'
  p_referencia  text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_fid       text := p_funcion ->> 'id';
  v_datos     record;
  v_formato   text;
  v_g int := coalesce((p_boletos ->> 'G')::int, 0);
  v_n int := coalesce((p_boletos ->> 'N')::int, 0);
  v_a int := coalesce((p_boletos ->> 'A')::int, 0);
  v_tomados   text[];
  v_codigo    text;
  v_total     numeric;
  v_reserva   uuid;
begin
  if v_uid is null then
    raise exception 'NO_AUTENTICADO: inicia sesión para reservar' using errcode = 'P0001';
  end if;
  if v_g < 0 or v_n < 0 or v_a < 0 or v_g + v_n + v_a not between 1 and 8 then
    raise exception 'DATOS_INVALIDOS: elige entre 1 y 8 boletos' using errcode = 'P0001';
  end if;
  if p_metodo not in ('Tarjeta', 'Yappy', 'PayPal', 'Pago en Taquilla') then
    raise exception 'DATOS_INVALIDOS: método de pago no válido' using errcode = 'P0001';
  end if;

  select * into v_datos from public.datos_funcion(v_fid);
  if v_datos.inicio - now() <= interval '15 minutes' then
    raise exception 'VENTA_CERRADA: la venta para esta función ya cerró' using errcode = 'P0001';
  end if;
  if v_datos.inicio > now() + interval '8 days' then
    raise exception 'FUNCION_INVALIDA: la función no está en cartelera' using errcode = 'P0001';
  end if;

  perform public.validar_asientos(p_asientos, v_g + v_n + v_a);

  -- La primera reserva de una función la registra; las siguientes reutilizan esos datos.
  insert into public.funciones (id, pelicula_id, pelicula_titulo, inicio, sala, formato, idioma)
  values (v_fid, v_datos.pelicula_id, coalesce(nullif(left(p_funcion ->> 'titulo', 200), ''), 'Película'),
          v_datos.inicio, v_datos.sala, coalesce(p_funcion ->> 'formato', '2D'), coalesce(p_funcion ->> 'idioma', 'Español'))
  on conflict (id) do nothing;
  select formato into v_formato from public.funciones where id = v_fid;

  -- Candado por función: serializa solo las reservas de ESTA función.
  perform pg_advisory_xact_lock(hashtextextended('cinepass:' || v_fid, 0));

  select array_agg(x order by x) into v_tomados
  from (
    select a.asiento as x from public.reserva_asientos a
    where a.funcion_id = v_fid and a.activo and a.asiento = any (p_asientos)
    union
    select s from unnest(public.asientos_simulados(v_fid)) s where s = any (p_asientos)
  ) t;
  if v_tomados is not null then
    raise exception 'ASIENTO_OCUPADO: %', array_to_string(v_tomados, ', ')
      using errcode = 'P0001', hint = 'Elige otros asientos';
  end if;

  v_total := public.calcular_total(v_formato, v_g, v_n, v_a, p_asientos);

  loop
    v_codigo := 'CP-' || public.codigo_aleatorio(6);
    exit when not exists (select 1 from public.reservas where codigo = v_codigo);
  end loop;

  insert into public.reservas (codigo, usuario_id, funcion_id, boletos_general, boletos_nino, boletos_mayor,
                               total, metodo_pago, referencia_pago)
  values (v_codigo, v_uid, v_fid, v_g, v_n, v_a, v_total, p_metodo, left(coalesce(p_referencia, ''), 10))
  returning id into v_reserva;

  begin
    insert into public.reserva_asientos (reserva_id, funcion_id, asiento)
    select v_reserva, v_fid, unnest(p_asientos);
  exception when unique_violation then
    -- Respaldo: si aun así otro usuario ganó el asiento, se revierte toda la reserva.
    raise exception 'ASIENTO_OCUPADO: uno o más asientos acaban de ser reservados' using errcode = 'P0001';
  end;

  insert into public.reserva_historial (reserva_id, evento, actor)
  values (v_reserva, 'Confirmada', 'Sistema (' || p_metodo || ')');

  return public.reserva_json(v_reserva);
end;
$$;

-- ---------------------------------------------------------------------
-- 8. RPC: cambiar asientos de una reserva confirmada
-- ---------------------------------------------------------------------
create function public.cambiar_asientos(p_codigo text, p_asientos text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_admin   boolean := public.es_admin();
  v_r       public.reservas%rowtype;
  v_f       public.funciones%rowtype;
  v_tomados text[];
begin
  if v_uid is null then
    raise exception 'NO_AUTENTICADO: inicia sesión' using errcode = 'P0001';
  end if;
  select * into v_r from public.reservas where codigo = p_codigo for update;
  if not found or (v_r.usuario_id <> v_uid and not v_admin) then
    raise exception 'NO_ENCONTRADA: la reserva no existe o no te pertenece' using errcode = 'P0001';
  end if;
  if v_r.estado <> 'Confirmada' then
    raise exception 'NO_PERMITIDO: la reserva no está confirmada' using errcode = 'P0001';
  end if;
  select * into v_f from public.funciones where id = v_r.funcion_id;
  if v_f.inicio - now() <= interval '2 hours' then
    raise exception 'PLAZO_VENCIDO: faltan menos de 2 horas para la función' using errcode = 'P0001';
  end if;

  perform public.validar_asientos(p_asientos, v_r.boletos_general + v_r.boletos_nino + v_r.boletos_mayor);
  perform pg_advisory_xact_lock(hashtextextended('cinepass:' || v_r.funcion_id, 0));

  select array_agg(x order by x) into v_tomados
  from (
    select a.asiento as x from public.reserva_asientos a
    where a.funcion_id = v_r.funcion_id and a.activo and a.reserva_id <> v_r.id and a.asiento = any (p_asientos)
    union
    select s from unnest(public.asientos_simulados(v_r.funcion_id)) s where s = any (p_asientos)
  ) t;
  if v_tomados is not null then
    raise exception 'ASIENTO_OCUPADO: %', array_to_string(v_tomados, ', ')
      using errcode = 'P0001', hint = 'Elige otros asientos';
  end if;

  delete from public.reserva_asientos where reserva_id = v_r.id;
  insert into public.reserva_asientos (reserva_id, funcion_id, asiento)
  select v_r.id, v_r.funcion_id, unnest(p_asientos);

  update public.reservas
     set total = public.calcular_total(v_f.formato, boletos_general, boletos_nino, boletos_mayor, p_asientos),
         actualizada_en = now()
   where id = v_r.id;

  insert into public.reserva_historial (reserva_id, evento, actor)
  values (v_r.id, 'Asientos modificados', case when v_r.usuario_id = v_uid then 'Cliente' else 'Administrador' end);

  return public.reserva_json(v_r.id);
end;
$$;

-- ---------------------------------------------------------------------
-- 9. RPC: cancelar reserva (cliente: hasta 2 h antes; administrador: siempre)
-- ---------------------------------------------------------------------
create function public.cancelar_reserva(p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_admin  boolean := public.es_admin();
  v_r      public.reservas%rowtype;
  v_inicio timestamptz;
begin
  if v_uid is null then
    raise exception 'NO_AUTENTICADO: inicia sesión' using errcode = 'P0001';
  end if;
  select * into v_r from public.reservas where codigo = p_codigo for update;
  if not found or (v_r.usuario_id <> v_uid and not v_admin) then
    raise exception 'NO_ENCONTRADA: la reserva no existe o no te pertenece' using errcode = 'P0001';
  end if;
  if v_r.estado <> 'Confirmada' then
    raise exception 'NO_PERMITIDO: la reserva ya estaba cancelada' using errcode = 'P0001';
  end if;
  select inicio into v_inicio from public.funciones where id = v_r.funcion_id;
  if not v_admin and v_inicio - now() <= interval '2 hours' then
    raise exception 'PLAZO_VENCIDO: el plazo venció; ya no es posible cancelar' using errcode = 'P0001';
  end if;

  update public.reservas set estado = 'Cancelada', actualizada_en = now() where id = v_r.id;
  update public.reserva_asientos set activo = false where reserva_id = v_r.id;
  insert into public.reserva_historial (reserva_id, evento, actor)
  values (v_r.id, 'Cancelada', case when v_admin then 'Administrador' else 'Cliente' end);

  return public.reserva_json(v_r.id);
end;
$$;

-- ---------------------------------------------------------------------
-- 10. RPC: pedidos de dulcería
-- ---------------------------------------------------------------------
-- Crea o edita (si p_codigo viene y sigue "Recibido") un pedido. El total se calcula con los precios de la tabla productos.
create function public.guardar_pedido(p_items jsonb, p_reserva_codigo text default null, p_codigo text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_pedido   public.pedidos%rowtype;
  v_reserva  uuid;
  v_total    numeric;
  v_codigo   text;
begin
  if v_uid is null then
    raise exception 'NO_AUTENTICADO: inicia sesión para pedir' using errcode = 'P0001';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'object' or p_items = '{}'::jsonb then
    raise exception 'DATOS_INVALIDOS: el carrito está vacío' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_each_text(p_items) i
             left join public.productos p on p.id = i.key and p.activo
             where p.id is null or i.value !~ '^[0-9]+$' or i.value::int not between 1 and 50) then
    raise exception 'DATOS_INVALIDOS: producto o cantidad no válidos' using errcode = 'P0001';
  end if;

  if nullif(p_reserva_codigo, '') is not null then
    select id into v_reserva from public.reservas
     where codigo = p_reserva_codigo and usuario_id = v_uid and estado = 'Confirmada';
    if v_reserva is null then
      raise exception 'DATOS_INVALIDOS: la reserva asociada no es válida' using errcode = 'P0001';
    end if;
  end if;

  select sum(p.precio * i.value::int) into v_total
  from jsonb_each_text(p_items) i join public.productos p on p.id = i.key;

  if nullif(p_codigo, '') is not null then
    select * into v_pedido from public.pedidos where codigo = p_codigo for update;
    if not found or v_pedido.usuario_id <> v_uid then
      raise exception 'NO_ENCONTRADO: el pedido no existe o no te pertenece' using errcode = 'P0001';
    end if;
    if v_pedido.estado <> 'Recibido' then
      raise exception 'NO_PERMITIDO: el pedido ya no se puede editar' using errcode = 'P0001';
    end if;
    update public.pedidos set total = v_total, reserva_id = v_reserva, actualizado_en = now() where id = v_pedido.id;
    delete from public.pedido_items where pedido_id = v_pedido.id;
  else
    loop
      v_codigo := 'PD-' || public.codigo_aleatorio(5);
      exit when not exists (select 1 from public.pedidos where codigo = v_codigo);
    end loop;
    insert into public.pedidos (codigo, usuario_id, reserva_id, total)
    values (v_codigo, v_uid, v_reserva, v_total)
    returning * into v_pedido;
  end if;

  insert into public.pedido_items (pedido_id, producto_id, cantidad, precio_unitario)
  select v_pedido.id, p.id, i.value::int, p.precio
  from jsonb_each_text(p_items) i join public.productos p on p.id = i.key;

  return jsonb_build_object('codigo', v_pedido.codigo, 'total', v_total, 'estado', 'Recibido');
end;
$$;

-- Cliente: puede cancelar su pedido "Recibido". Administrador: Entregado o Cancelado.
create function public.cambiar_estado_pedido(p_codigo text, p_estado text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_admin  boolean := public.es_admin();
  v_p      public.pedidos%rowtype;
begin
  if v_uid is null then
    raise exception 'NO_AUTENTICADO: inicia sesión' using errcode = 'P0001';
  end if;
  if p_estado not in ('Entregado', 'Cancelado') then
    raise exception 'DATOS_INVALIDOS: estado no válido' using errcode = 'P0001';
  end if;
  select * into v_p from public.pedidos where codigo = p_codigo for update;
  if not found or (v_p.usuario_id <> v_uid and not v_admin) then
    raise exception 'NO_ENCONTRADO: el pedido no existe o no te pertenece' using errcode = 'P0001';
  end if;
  if v_p.estado <> 'Recibido' then
    raise exception 'NO_PERMITIDO: el pedido ya fue %', lower(v_p.estado) using errcode = 'P0001';
  end if;
  if p_estado = 'Entregado' and not v_admin then
    raise exception 'NO_PERMITIDO: solo un administrador puede marcar pedidos como entregados' using errcode = 'P0001';
  end if;
  update public.pedidos set estado = p_estado, actualizado_en = now() where id = v_p.id;
  return jsonb_build_object('codigo', v_p.codigo, 'estado', p_estado);
end;
$$;

-- ---------------------------------------------------------------------
-- 11. Row Level Security
--     Lectura: cada usuario lo suyo; el administrador todo.
--     Escritura directa: ninguna (no hay políticas de INSERT/UPDATE/DELETE);
--     solo las funciones RPC anteriores (SECURITY DEFINER) modifican datos.
-- ---------------------------------------------------------------------
alter table public.perfiles          enable row level security;
alter table public.funciones         enable row level security;
alter table public.reservas          enable row level security;
alter table public.reserva_asientos  enable row level security;
alter table public.reserva_historial enable row level security;
alter table public.productos         enable row level security;
alter table public.pedidos           enable row level security;
alter table public.pedido_items      enable row level security;

create policy "perfil propio o admin" on public.perfiles
  for select to authenticated using (id = (select auth.uid()) or (select public.es_admin()));

create policy "funciones visibles para todos" on public.funciones
  for select to anon, authenticated using (true);

create policy "productos visibles para todos" on public.productos
  for select to anon, authenticated using (true);

create policy "reservas propias o admin" on public.reservas
  for select to authenticated using (usuario_id = (select auth.uid()) or (select public.es_admin()));

create policy "asientos de reservas propias o admin" on public.reserva_asientos
  for select to authenticated using (
    exists (select 1 from public.reservas r where r.id = reserva_id
            and (r.usuario_id = (select auth.uid()) or (select public.es_admin()))));

create policy "historial de reservas propias o admin" on public.reserva_historial
  for select to authenticated using (
    exists (select 1 from public.reservas r where r.id = reserva_id
            and (r.usuario_id = (select auth.uid()) or (select public.es_admin()))));

create policy "pedidos propios o admin" on public.pedidos
  for select to authenticated using (usuario_id = (select auth.uid()) or (select public.es_admin()));

create policy "items de pedidos propios o admin" on public.pedido_items
  for select to authenticated using (
    exists (select 1 from public.pedidos p where p.id = pedido_id
            and (p.usuario_id = (select auth.uid()) or (select public.es_admin()))));

-- Sin escritura directa desde la API pública, ni siquiera por error en una política futura.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;

-- ---------------------------------------------------------------------
-- 12. Permisos de ejecución de las funciones
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.asientos_ocupados(text[])                        to anon, authenticated;
grant execute on function public.confirmar_reserva(jsonb, jsonb, text[], text, text) to authenticated;
grant execute on function public.cambiar_asientos(text, text[])                   to authenticated;
grant execute on function public.cancelar_reserva(text)                           to authenticated;
grant execute on function public.guardar_pedido(jsonb, text, text)                to authenticated;
grant execute on function public.cambiar_estado_pedido(text, text)                to authenticated;
grant execute on function public.es_admin()                                       to authenticated;
