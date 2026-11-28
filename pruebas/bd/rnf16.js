// Prueba de concurrencia RNF-16:
//   "El sistema debe atender 100 usuarios navegando y 20 reservas simultáneas sobre funciones distintas,
//    sin superar en más de un 50 % los tiempos de respuesta definidos en los RNF-01 al RNF-04."
//
// Fases:
//   1. Preparación: crea/inicia sesión de 20 usuarios de reserva y elige 20 funciones distintas.
//   2. Referencia sin carga: mide cada operación de forma secuencial.
//   3. Carga: 100 usuarios navegando (cargan la app y consultan asientos con pausas de 1 a 3 s)
//      y, mientras tanto, OLEADAS de 20 reservas lanzadas a la vez, cada una en una función distinta.
//   4. Verificación: todas las reservas confirmadas, sin asientos duplicados; informe en pruebas/bd/resultados/.
//   5. Limpieza: cancela las reservas de la prueba (salvo con --conservar).
//
// Uso:  npm run bd:rnf16  [-- --navegantes 100 --reservas 20 --oleadas 3 --duracion 45 --app http://localhost:4173]
// Los límites de RNF-01 a RNF-04 se configuran en pruebas/bd/umbrales-rnf.json.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const {
  RAIZ, URL_SB, clienteAnonimo, usuarioPrueba, funcionesFuturas, asientosLibres, reservar, ms, percentil,
} = require('./comun');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const NAVEGANTES = +arg('navegantes', 100), RESERVAS = +arg('reservas', 20), OLEADAS = +arg('oleadas', 3);
const DURACION = +arg('duracion', 45) * 1000, APP = arg('app', 'http://localhost:4173').replace(/\/+$/, '');
const CONSERVAR = process.argv.includes('--conservar');
const UMBRALES = JSON.parse(fs.readFileSync(path.join(__dirname, 'umbrales-rnf.json'), 'utf8'));
const RECURSOS = ['/index.html', '/css/styles.css', '/css/theme.css', '/js/config.js', '/js/data.js', '/js/tmdb.js', '/js/db.js', '/js/app.js', '/js/vendor/supabase-2.119.2.js', '/img/logo.png'];
const pausa = t => new Promise(r => setTimeout(r, t));

// ---------- Registro de mediciones ----------
const med = { base: {}, carga: {} };
const errores = { base: {}, carga: {} };
async function medir(fase, op, fn) {
  const t0 = ms();
  try {
    const r = await fn();
    if (r && r.error) throw r.error;
    (med[fase][op] = med[fase][op] || []).push(ms() - t0);
    return r;
  } catch (e) {
    (errores[fase][op] = errores[fase][op] || []).push((e && e.message) || String(e));
    return { error: e };
  }
}

// ---------- Operaciones ----------
async function cargarPagina() {
  // Como el navegador: primero el HTML y luego sus recursos en paralelo.
  const r = await fetch(APP + RECURSOS[0]);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  await r.arrayBuffer();
  await Promise.all(RECURSOS.slice(1).map(async u => { const x = await fetch(APP + u); if (!x.ok) throw new Error(u + ' HTTP ' + x.status); await x.arrayBuffer(); }));
}
const consultarAsientos = (c, fids) => c.rpc('asientos_ocupados', { p_funciones: fids });
const consultarHistorial = c => c.from('reservas')
  .select('codigo,funcion_id,total,metodo_pago,estado,perfiles(correo),funciones(id,pelicula_titulo,inicio,sala,formato,idioma),reserva_asientos(asiento,activo),reserva_historial(evento,actor,fecha)')
  .order('creada_en');

// ---------- Servidor estático de la app (si no hay uno corriendo) ----------
async function asegurarServidor() {
  try { const r = await fetch(APP + '/index.html'); if (r.ok) return null; } catch (e) { /* no hay servidor */ }
  if (!/localhost|127\.0\.0\.1/.test(APP)) throw new Error('No responde ' + APP);
  const p = spawn(process.execPath, [path.join(RAIZ, 'pruebas', 'servidor.js')], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { await pausa(100); try { if ((await fetch(APP + '/index.html')).ok) return p; } catch (e) { /* aún no */ } }
  throw new Error('No se pudo iniciar el servidor de la app');
}

const resumen = xs => xs && xs.length ? { n: xs.length, p50: percentil(xs, 50), p95: percentil(xs, 95), max: Math.max(...xs), media: xs.reduce((a, b) => a + b, 0) / xs.length } : { n: 0 };
const f0 = x => (x == null ? '—' : Math.round(x) + ' ms');

(async () => {
  console.log(`\nRNF-16 · ${NAVEGANTES} usuarios navegando + ${OLEADAS} oleadas de ${RESERVAS} reservas simultáneas en funciones distintas`);
  console.log(`Supabase: ${URL_SB}   App: ${APP}\n`);
  const servidor = await asegurarServidor();
  const anon = clienteAnonimo();

  // 1. Preparación
  console.log('1. Preparando usuarios y funciones…');
  const usuarios = [];
  for (let i = 0; i < RESERVAS; i++) usuarios.push(await usuarioPrueba(`carga-${String(i + 1).padStart(2, '0')}@cinepass.test`, { nombre: `Usuario Carga ${i + 1}` }));
  const funciones = funcionesFuturas(RESERVAS, { margenHoras: 3 });
  if (funciones.length < RESERVAS) throw new Error(`Solo hay ${funciones.length} funciones futuras disponibles`);
  // Para cada función, asientos libres suficientes para todas las oleadas (2 por reserva) + la referencia.
  const libres = await Promise.all(funciones.map(f => asientosLibres(anon, f.id)));
  libres.forEach((l, i) => { if (l.length < 2 * (OLEADAS + 1)) throw new Error(`La función ${funciones[i].id} no tiene asientos suficientes`); });
  const codigos = [];

  // 2. Referencia sin carga
  console.log('2. Midiendo tiempos de referencia sin carga…');
  const u0 = usuarios[0];
  for (let i = 0; i < 10; i++) await medir('base', 'pagina', cargarPagina);
  for (let i = 0; i < 10; i++) await medir('base', 'asientos', () => consultarAsientos(anon, [funciones[i % RESERVAS].id]));
  for (let i = 0; i < 5; i++) {
    const r = await medir('base', 'reserva', () => reservar(u0.c, funciones[i], libres[i].slice(-2)));
    if (r.data) codigos.push([u0, r.data.codigo]);
  }
  for (let i = 0; i < 10; i++) await medir('base', 'historial', () => consultarHistorial(u0.c));
  for (let i = 0; i < 3; i++) await medir('base', 'login', () => clienteAnonimo().auth.signInWithPassword({ email: u0.correo, password: process.env.CP_CLAVE_PRUEBAS || 'Prueba#2026x' }));

  // 3. Carga
  console.log(`3. Carga: ${NAVEGANTES} navegantes durante ${DURACION / 1000} s con ${OLEADAS} oleadas de ${RESERVAS} reservas…`);
  const fin = Date.now() + DURACION;
  let iteraciones = 0;
  const navegante = async (k) => {
    const c = clienteAnonimo();
    await pausa(Math.random() * 2000); // llegadas escalonadas
    while (Date.now() < fin) {
      await medir('carga', 'pagina', cargarPagina);
      const f = funciones[(k + iteraciones) % RESERVAS];
      await medir('carga', 'asientos', () => consultarAsientos(c, [f.id]));
      iteraciones++;
      await pausa(1000 + Math.random() * 2000); // tiempo de lectura del usuario
    }
  };
  const oleadas = [];
  const lanzarOleadas = async () => {
    for (let o = 0; o < OLEADAS; o++) {
      await pausa(o === 0 ? 8000 : Math.max(5000, (DURACION - 16000) / OLEADAS));
      const t0 = ms();
      // Las 20 reservas salen a la vez (sin await entre ellas), cada usuario en su propia función.
      const res = await Promise.all(usuarios.map((u, i) => medir('carga', 'reserva', () => reservar(u.c, funciones[i], libres[i].slice(2 * o, 2 * o + 2)))));
      const ok = res.filter(r => r.data);
      ok.forEach((r, i) => codigos.push([usuarios[res.indexOf(r)], r.data.codigo]));
      oleadas.push({ oleada: o + 1, confirmadas: ok.length, fallidas: res.length - ok.length, duracion_ms: ms() - t0, errores: res.filter(r => r.error).map(r => r.error.message) });
      console.log(`   Oleada ${o + 1}: ${ok.length}/${RESERVAS} reservas confirmadas en ${Math.round(ms() - t0)} ms`);
      await Promise.all(usuarios.map(u => medir('carga', 'historial', () => consultarHistorial(u.c))));
    }
  };
  await Promise.all([...Array(NAVEGANTES)].map((_, k) => navegante(k)).concat(lanzarOleadas()));

  // 4. Verificación de integridad
  console.log('4. Verificando integridad…');
  const occ = await anon.rpc('asientos_ocupados', { p_funciones: funciones.map(f => f.id) });
  const claves = occ.data.map(x => x.funcion_id + '/' + x.asiento);
  const duplicados = claves.length - new Set(claves).size;
  const esperadas = OLEADAS * RESERVAS;
  const confirmadas = oleadas.reduce((a, o) => a + o.confirmadas, 0);

  // 5. Informe
  const pct = UMBRALES.percentil || 95;
  const filas = Object.entries(UMBRALES.operaciones).map(([op, u]) => {
    const b = resumen(med.base[op]), c = resumen(med.carga[op]);
    const valorCarga = c.n ? percentil(med.carga[op], pct) : null;
    const limite = u.limite_ms != null ? u.limite_ms * 1.5 : null;
    return {
      operacion: op, rnf: u.rnf || '', descripcion: u.descripcion, base: b, carga: c,
      errores_carga: (errores.carga[op] || []).length,
      limite_rnf_ms: u.limite_ms, limite_rnf16_ms: limite,
      cumple_rnf16: limite == null ? null : (valorCarga != null && valorCarga <= limite && !(errores.carga[op] || []).length),
      // Solo informativo: cuánto creció el tiempo con carga respecto de la medición sin carga.
      factor_vs_sin_carga: b.n && valorCarga != null ? +(valorCarga / b.p50).toFixed(2) : null,
    };
  });
  const informe = {
    fecha: new Date().toISOString(), supabase: URL_SB, app: APP,
    parametros: { navegantes: NAVEGANTES, reservas_por_oleada: RESERVAS, oleadas: OLEADAS, duracion_s: DURACION / 1000, percentil: pct },
    integridad: { reservas_esperadas: esperadas, reservas_confirmadas: confirmadas, asientos_duplicados: duplicados, funciones_distintas: new Set(funciones.map(f => f.id)).size },
    oleadas, operaciones: filas,
    errores_ejemplo: Object.fromEntries(Object.entries(errores.carga).map(([k, v]) => [k, [...new Set(v)].slice(0, 5)])),
  };

  console.log(`\nResultados (p${pct} con carga vs. referencia sin carga):`);
  for (const f of filas) {
    const veredicto = f.cumple_rnf16 == null ? 'sin límite RNF definido en umbrales-rnf.json' : f.cumple_rnf16 ? `CUMPLE (límite ${f0(f.limite_rnf16_ms)})` : `NO CUMPLE (límite ${f0(f.limite_rnf16_ms)})`;
    console.log(`  ${f.operacion.padEnd(9)} base p50 ${f0(f.base.p50).padStart(7)} | carga p50 ${f0(f.carga.p50).padStart(7)} p${pct} ${f0(f.carga.n ? percentil(med.carga[f.operacion], pct) : null).padStart(7)} máx ${f0(f.carga.max).padStart(7)} n=${String(f.carga.n || 0).padStart(4)} err=${f.errores_carga} → ${veredicto}`);
  }
  console.log(`\nIntegridad: ${confirmadas}/${esperadas} reservas confirmadas · ${duplicados} asientos duplicados · ${informe.integridad.funciones_distintas} funciones distintas`);

  const dir = path.join(__dirname, 'resultados');
  fs.mkdirSync(dir, { recursive: true });
  const nombre = 'rnf16-' + informe.fecha.replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(dir, nombre + '.json'), JSON.stringify(informe, null, 2));
  console.log(`Informe: pruebas/bd/resultados/${nombre}.json`);

  // 6. Limpieza
  if (!CONSERVAR) {
    for (const [u, cod] of codigos) await u.c.rpc('cancelar_reserva', { p_codigo: cod });
    console.log(`Limpieza: ${codigos.length} reservas de prueba canceladas.`);
  }
  if (servidor) servidor.kill();
  const integro = confirmadas === esperadas && duplicados === 0;
  const algunNoCumple = filas.some(f => f.cumple_rnf16 === false);
  process.exit(integro && !algunNoCumple ? 0 : 1);
})().catch(e => { console.error('Error inesperado:', e); process.exit(1); });
