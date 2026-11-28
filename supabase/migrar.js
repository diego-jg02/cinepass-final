// Migra a Supabase los usuarios, reservas y pedidos que CinePass guardaba en localStorage.
//
// 1. En el navegador donde están los datos, entra como administrador → Panel Admin → "Base de Datos" y
//    descarga el JSON ("Descargar Copia de Seguridad" en modo local, o "Descargar datos antiguos de este
//    navegador" si la app ya está conectada a Supabase).
// 2. En tu PC, con SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY y SUPABASE_SECRET_KEY en .env (nunca en GitHub):
//      npm run bd:migrar -- respaldo.json                 → SIMULACIÓN: muestra lo que haría, no escribe nada
//      npm run bd:migrar -- respaldo.json --aplicar       → migra
//    Opciones: --con-roles         conserva el rol de administrador de las cuentas que lo tenían
//              --enviar-correos    envía a cada usuario migrado el correo para crear su contraseña
//              --url-app <url>     dirección de la app a la que lleva ese correo (p. ej. la de GitHub Pages)
//
// Seguridad:
//   · Las contraseñas antiguas (texto plano) NO se migran ni se leen: cada cuenta se crea con una contraseña
//     aleatoria que nadie conoce, y el usuario define la suya con "¿Olvidaste tu contraseña?" o con el correo.
//   · El script no borra nada del navegador. Borra localStorage solo cuando hayas verificado la migración.
//   · Es idempotente: lo que ya existe (correo, código de reserva o de pedido) se omite.
process.env.TZ = 'America/Panama';
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const args = process.argv.slice(2);
const archivo = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--url-app');
const APLICAR = args.includes('--aplicar'), CON_ROLES = args.includes('--con-roles'), CORREOS = args.includes('--enviar-correos');
const URL_APP = args.includes('--url-app') ? args[args.indexOf('--url-app') + 1] : undefined;

// .env de la raíz
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) for (const l of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY } = process.env;
if (!archivo || !fs.existsSync(archivo)) { console.error('Uso: npm run bd:migrar -- <respaldo.json> [--aplicar] [--con-roles] [--enviar-correos] [--url-app <url>]'); process.exit(2); }
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) { console.error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY en .env (la clave secreta solo se usa en tu PC).'); process.exit(2); }

const { createClient } = require('@supabase/supabase-js');
const srv = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const pub = SUPABASE_PUBLISHABLE_KEY ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } }) : null;

const datos = JSON.parse(fs.readFileSync(archivo, 'utf8'));
const usuarios = datos.users || [], reservas = datos.reservas || [], pedidos = datos.orders || [];
const METODOS = ['Tarjeta', 'Yappy', 'PayPal', 'Pago en Taquilla'];
const informe = { usuarios: { creados: [], existentes: [], admins: [] }, reservas: { migradas: 0, omitidas: [], conflictos: [] }, pedidos: { migrados: 0, omitidos: [] } };
const claveAleatoria = () => crypto.randomBytes(24).toString('base64url') + 'aA1!';
const correoValido = e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e || '');

async function idPorCorreo(correo) {
  const { data, error } = await srv.from('perfiles').select('id').eq('correo', correo).maybeSingle();
  if (error) throw error;
  return data && data.id;
}

(async () => {
  console.log(`\nMigración de CinePass a Supabase · ${APLICAR ? 'APLICANDO CAMBIOS' : 'SIMULACIÓN (agrega --aplicar para migrar)'}`);
  console.log(`Archivo: ${archivo} · ${usuarios.length} usuarios, ${reservas.length} reservas, ${pedidos.length} pedidos\n`);

  // ---------- 1. Usuarios ----------
  // Cuentas que aparecen en reservas o pedidos pero no en la lista de usuarios también se crean.
  const porCorreo = new Map();
  usuarios.forEach(u => u.e && porCorreo.set(u.e.toLowerCase(), u));
  [...reservas, ...pedidos].forEach(x => x.u && !porCorreo.has(x.u.toLowerCase()) && porCorreo.set(x.u.toLowerCase(), { e: x.u, n: x.u.split('@')[0] }));
  const ids = new Map();
  for (const [correo, u] of porCorreo) {
    if (!correoValido(correo)) { console.log(`  ! correo no válido, se omite: ${correo}`); continue; }
    let id = await idPorCorreo(correo);
    if (id) informe.usuarios.existentes.push(correo);
    else if (APLICAR) {
      const { data, error } = await srv.auth.admin.createUser({
        email: correo, password: claveAleatoria(), email_confirm: true,
        user_metadata: { nombre: (u.n || correo.split('@')[0]).slice(0, 80), telefono: (u.t || '').slice(0, 20) },
      });
      if (error) { console.log(`  ! no se pudo crear ${correo}: ${error.message}`); continue; }
      id = data.user.id;
      informe.usuarios.creados.push(correo);
      if (CORREOS && pub) {
        const r = await pub.auth.resetPasswordForEmail(correo, URL_APP ? { redirectTo: URL_APP } : {});
        if (r.error) console.log(`  ! no se pudo enviar el correo a ${correo}: ${r.error.message}`);
      }
    } else informe.usuarios.creados.push(correo);
    if (u.role === 'admin') {
      informe.usuarios.admins.push(correo);
      if (CON_ROLES && APLICAR && id) await srv.from('perfiles').update({ rol: 'admin' }).eq('id', id);
    }
    if (id) ids.set(correo, id);
  }

  // ---------- 2. Reservas ----------
  const simulados = new Set(); // asientos que la simulación ya "migró" (función/asiento)
  for (const r of reservas) {
    const correo = (r.u || '').toLowerCase(), f = r.f || {};
    if (!/^CP-[A-Z0-9]{6}$/.test(r.cod || '')) { informe.reservas.omitidas.push(`${r.cod}: código no válido`); continue; }
    const ya = await srv.from('reservas').select('id').eq('codigo', r.cod).maybeSingle();
    if (ya.data) { informe.reservas.omitidas.push(`${r.cod}: ya existe`); continue; }
    if (!APLICAR) {
      // En simulación también se detectan los asientos que chocarían (en la BD o dentro del mismo respaldo).
      if (r.estado !== 'Cancelada') {
        const { data: ocup } = await srv.from('reserva_asientos').select('asiento').eq('funcion_id', r.fn).eq('activo', true).in('asiento', r.seats || []);
        const enRespaldo = (r.seats || []).filter(a => simulados.has(r.fn + '/' + a));
        const choque = [...new Set([...(ocup || []).map(x => x.asiento), ...enRespaldo])];
        if (choque.length) { informe.reservas.conflictos.push(`${r.cod} (${correo}, ${r.fn}, ${choque.join(' ')}): asiento ya reservado por otra reserva`); continue; }
        (r.seats || []).forEach(a => simulados.add(r.fn + '/' + a));
      }
      informe.reservas.migradas++;
      continue;
    }
    const uid = ids.get(correo);
    if (!uid) { informe.reservas.omitidas.push(`${r.cod}: usuario ${correo} no disponible`); continue; }

    const fn = {
      id: r.fn, pelicula_id: f.p, pelicula_titulo: (r.pt || 'Película').slice(0, 200), inicio: new Date(f.ini).toISOString(),
      sala: f.sala, formato: f.fmt === '3D' ? '3D' : '2D', idioma: f.idi === 'Subtitulada' ? 'Subtitulada' : 'Español',
    };
    const ef = await srv.from('funciones').upsert(fn, { onConflict: 'id', ignoreDuplicates: true });
    if (ef.error) { informe.reservas.omitidas.push(`${r.cod}: función ${r.fn} no válida (${ef.error.message})`); continue; }

    const tix = r.tix || {}, hist = r.hist || [];
    const ins = await srv.from('reservas').insert({
      codigo: r.cod, usuario_id: uid, funcion_id: r.fn,
      boletos_general: tix.G || 0, boletos_nino: tix.N || 0, boletos_mayor: tix.A || 0,
      total: r.tot || 0, metodo_pago: METODOS.includes(r.metodo) ? r.metodo : 'Tarjeta',
      referencia_pago: String(r.l4 || '').slice(0, 10), estado: r.estado === 'Cancelada' ? 'Cancelada' : 'Confirmada',
      creada_en: hist[0] ? new Date(hist[0][2]).toISOString() : new Date().toISOString(),
    }).select('id').single();
    if (ins.error) { informe.reservas.omitidas.push(`${r.cod}: ${ins.error.message}`); continue; }
    const rid = ins.data.id;

    const asientos = (r.seats || []).map(a => ({ reserva_id: rid, funcion_id: r.fn, asiento: a, activo: r.estado !== 'Cancelada' }));
    const ea = await srv.from('reserva_asientos').insert(asientos);
    if (ea.error) {
      // Otro navegador había reservado el mismo asiento: se deshace esta reserva y se informa (no se pisan datos).
      await srv.from('reservas').delete().eq('id', rid);
      informe.reservas.conflictos.push(`${r.cod} (${correo}, ${r.fn}, ${(r.seats || []).join(' ')}): ${/duplicate|unique/i.test(ea.error.message) ? 'asiento ya reservado por otra reserva' : ea.error.message}`);
      continue;
    }
    const eh = hist.length ? await srv.from('reserva_historial').insert(hist.map(h => ({ reserva_id: rid, evento: String(h[0]), actor: String(h[1]), fecha: new Date(h[2]).toISOString() }))) : {};
    if (eh.error) console.log(`  ! ${r.cod}: historial no migrado (${eh.error.message})`);
    informe.reservas.migradas++;
  }

  // ---------- 3. Pedidos ----------
  const productos = (await srv.from('productos').select('id,nombre,precio')).data || [];
  for (const o of pedidos) {
    const correo = (o.u || '').toLowerCase();
    if (!/^PD-[A-Z0-9]{5}$/.test(o.cod || '')) { informe.pedidos.omitidos.push(`${o.cod}: código no válido`); continue; }
    const ya = await srv.from('pedidos').select('id').eq('codigo', o.cod).maybeSingle();
    if (ya.data) { informe.pedidos.omitidos.push(`${o.cod}: ya existe`); continue; }
    const items = (o.items || []).map(([nombre, n]) => ({ p: productos.find(p => p.nombre === nombre), n }));
    if (!items.length || items.some(i => !i.p || !(i.n > 0))) { informe.pedidos.omitidos.push(`${o.cod}: productos desconocidos`); continue; }
    if (!APLICAR) { informe.pedidos.migrados++; continue; }
    const uid = ids.get(correo);
    if (!uid) { informe.pedidos.omitidos.push(`${o.cod}: usuario ${correo} no disponible`); continue; }
    let reservaId = null;
    if (o.res) reservaId = ((await srv.from('reservas').select('id').eq('codigo', o.res).maybeSingle()).data || {}).id || null;
    const ins = await srv.from('pedidos').insert({
      codigo: o.cod, usuario_id: uid, reserva_id: reservaId, total: o.tot || 0,
      estado: ['Recibido', 'Entregado', 'Cancelado'].includes(o.estado) ? o.estado : 'Recibido',
    }).select('id').single();
    if (ins.error) { informe.pedidos.omitidos.push(`${o.cod}: ${ins.error.message}`); continue; }
    const ei = await srv.from('pedido_items').insert(items.map(i => ({ pedido_id: ins.data.id, producto_id: i.p.id, cantidad: i.n, precio_unitario: i.p.precio })));
    if (ei.error) { await srv.from('pedidos').delete().eq('id', ins.data.id); informe.pedidos.omitidos.push(`${o.cod}: ${ei.error.message}`); continue; }
    informe.pedidos.migrados++;
  }

  // ---------- Informe ----------
  const v = APLICAR ? '' : ' (se crearían)';
  console.log(`Usuarios: ${informe.usuarios.creados.length} nuevos${v}, ${informe.usuarios.existentes.length} ya existían`);
  if (informe.usuarios.admins.length) console.log(`  Administradores en el respaldo: ${informe.usuarios.admins.join(', ')}${CON_ROLES ? '' : ' → quedan como clientes (usa --con-roles o cámbialo en el SQL Editor)'}`);
  console.log(`Reservas: ${informe.reservas.migradas} migradas${v}, ${informe.reservas.omitidas.length} omitidas, ${informe.reservas.conflictos.length} con conflicto de asiento`);
  informe.reservas.omitidas.forEach(x => console.log('  - ' + x));
  informe.reservas.conflictos.forEach(x => console.log('  ⚠ ' + x));
  console.log(`Pedidos: ${informe.pedidos.migrados} migrados${v}, ${informe.pedidos.omitidos.length} omitidos`);
  informe.pedidos.omitidos.forEach(x => console.log('  - ' + x));
  if (APLICAR && informe.usuarios.creados.length) {
    console.log(`\nLos ${informe.usuarios.creados.length} usuarios nuevos NO tienen una contraseña conocida.`);
    console.log(CORREOS ? 'Se les envió el correo para crearla.' : 'Cada uno debe usar "¿Olvidaste tu contraseña?" en Iniciar sesión (o vuelve a correr con --enviar-correos).');
  }
  console.log('\nNo se borró nada del navegador. Cuando verifiques la migración puedes limpiar localStorage (cp_u, cp_r, cp_o).');
})().catch(e => { console.error('Error inesperado:', e.message || e); process.exit(1); });
