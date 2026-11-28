// Utilidades compartidas por las pruebas de base de datos (verificar-bd.js y rnf16.js).
// Variables (en el entorno o en el archivo .env de la raíz, que NO se sube a GitHub):
//   SUPABASE_URL               Project URL
//   SUPABASE_PUBLISHABLE_KEY   clave pública (la misma de js/config.js)
//   SUPABASE_SECRET_KEY        opcional: clave secreta/service_role, SOLO para crear usuarios de prueba
//                              y darles rol admin. Nunca se usa en el navegador.
//   CP_CLAVE_PRUEBAS           opcional: contraseña de los usuarios de prueba (por defecto una fija de pruebas)
process.env.TZ = 'America/Panama'; // misma zona horaria que el cine (datos_funcion en el SQL)

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createClient } = require('@supabase/supabase-js');

const RAIZ = path.join(__dirname, '..', '..');

function cargarEnv() {
  const archivo = path.join(RAIZ, '.env');
  if (!fs.existsSync(archivo)) return;
  for (const linea of fs.readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(linea);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
cargarEnv();

const URL_SB = process.env.SUPABASE_URL;
const PUBLICA = process.env.SUPABASE_PUBLISHABLE_KEY;
const SECRETA = process.env.SUPABASE_SECRET_KEY;
const CLAVE = process.env.CP_CLAVE_PRUEBAS || 'Prueba#2026x';

if (!URL_SB || !PUBLICA) {
  console.error('Faltan SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY (en el entorno o en .env). Ver supabase/README.md.');
  process.exit(2);
}

const opciones = { auth: { persistSession: false, autoRefreshToken: false } };
const clienteAnonimo = () => createClient(URL_SB, PUBLICA, opciones);
const clienteServicio = () => (SECRETA ? createClient(URL_SB, SECRETA, opciones) : null);

/** Crea (si hace falta) e inicia sesión con un usuario de prueba. Devuelve { c, id, correo }. */
async function usuarioPrueba(correo, { admin = false, nombre = 'Usuario de prueba' } = {}) {
  const srv = clienteServicio();
  if (srv) {
    const { error } = await srv.auth.admin.createUser({ email: correo, password: CLAVE, email_confirm: true, user_metadata: { nombre } });
    if (error && !/already|registered|exists/i.test(error.message)) throw error;
  } else {
    const { error } = await clienteAnonimo().auth.signUp({ email: correo, password: CLAVE, options: { data: { nombre } } });
    if (error && !/already|registered|exists/i.test(error.message)) throw error;
  }
  const c = clienteAnonimo();
  const { data, error } = await c.auth.signInWithPassword({ email: correo, password: CLAVE });
  if (error) throw new Error(`No se pudo iniciar sesión con ${correo}: ${error.message}`);
  if (admin) {
    if (!srv) throw new Error('Para crear un administrador de prueba hace falta SUPABASE_SECRET_KEY.');
    const r = await srv.from('perfiles').update({ rol: 'admin' }).eq('id', data.user.id);
    if (r.error) throw r.error;
  }
  return { c, id: data.user.id, correo };
}

/** Películas y funciones exactamente como las genera la app (js/data.js). */
function cargarCartelera() {
  const codigo = fs.readFileSync(path.join(RAIZ, 'js', 'data.js'), 'utf8');
  return vm.runInNewContext(codigo + ';({ PELIS, FN })', { Date });
}

const hash = s => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
function asientosSimulados(fid) {
  const o = new Set();
  'ABCDEFGH'.split('').forEach((r, i) => { for (let c = 1; c <= 10; c++) if ((hash(fid) + i * 7 + c * 13) % 100 < 22) o.add(r + c); });
  return o;
}

/** n funciones distintas que empiezan dentro de más de `margenHoras` horas, en formato de la RPC. */
function funcionesFuturas(n, { margenHoras = 3, saltar = 0 } = {}) {
  const { PELIS, FN } = cargarCartelera();
  const lim = Date.now() + margenHoras * 3600e3;
  return FN.filter(f => f.ini > lim).slice(saltar, saltar + n).map(f => ({
    id: f.id, titulo: PELIS.find(p => p.id === f.p).t, formato: f.fmt, idioma: f.idi, ini: f.ini,
  }));
}

/** Asientos libres de una función (sin los simulados ni los ya reservados en el servidor). */
async function asientosLibres(c, fid) {
  const { data, error } = await c.rpc('asientos_ocupados', { p_funciones: [fid] });
  if (error) throw error;
  const ocupados = new Set([...asientosSimulados(fid), ...data.map(x => x.asiento)]);
  const libres = [];
  'ABCDEFGH'.split('').forEach(r => { for (let n = 1; n <= 10; n++) if (!ocupados.has(r + n)) libres.push(r + n); });
  return libres;
}

/** Llama a confirmar_reserva con datos válidos. */
const reservar = (c, f, asientos, metodo = 'Pago en Taquilla') => c.rpc('confirmar_reserva', {
  p_funcion: { id: f.id, titulo: f.titulo, formato: f.formato, idioma: f.idioma },
  p_boletos: { G: asientos.length, N: 0, A: 0 },
  p_asientos: asientos,
  p_metodo: metodo,
  p_referencia: metodo === 'Pago en Taquilla' ? 'EFECTIVO' : '4242',
});

const ms = () => performance.now();
const percentil = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(p / 100 * s.length) - 1)]; };
const sufijo = () => Date.now().toString(36);

module.exports = {
  RAIZ, URL_SB, SECRETA, CLAVE, clienteAnonimo, clienteServicio, usuarioPrueba, cargarCartelera,
  asientosSimulados, funcionesFuturas, asientosLibres, reservar, ms, percentil, sufijo,
};
