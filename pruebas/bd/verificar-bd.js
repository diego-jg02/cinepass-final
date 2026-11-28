// Verificación de la base de datos de CinePass en Supabase: seguridad (RLS), reglas de negocio
// y control de concurrencia (dos o más usuarios no pueden reservar el mismo asiento).
// Uso:  npm run bd:verificar        (requiere .env; ver supabase/README.md)
// Crea usuarios de prueba "bd-…@cinepass.test" y al final cancela las reservas que hizo.
const {
  SECRETA, clienteAnonimo, clienteServicio, usuarioPrueba, funcionesFuturas, asientosLibres, asientosSimulados, reservar, sufijo,
} = require('./comun');

const resultados = [];
const creadas = []; // códigos de reserva para limpiar al final
async function caso(nombre, fn) {
  try {
    await fn();
    resultados.push({ nombre, ok: true });
    console.log(`  ✔ ${nombre}`);
  } catch (e) {
    resultados.push({ nombre, ok: false, error: e.message });
    console.log(`  ✘ ${nombre}\n      → ${e.message}`);
  }
}
const afirmar = (cond, msg) => { if (!cond) throw new Error(msg); };
const codigoError = e => ((e && e.message) || '').split(':')[0];

(async () => {
  const s = sufijo();
  console.log('\nVerificación de la base de datos CinePass\n');
  const A = await usuarioPrueba(`bd-a-${s}@cinepass.test`, { nombre: 'Ana Prueba' });
  const B = await usuarioPrueba(`bd-b-${s}@cinepass.test`, { nombre: 'Beto Prueba' });
  const ADM = SECRETA ? await usuarioPrueba(`bd-admin-${s}@cinepass.test`, { admin: true, nombre: 'Admin Prueba' }) : null;
  const anon = clienteAnonimo();
  const [f1, f2, f3, fCarrera] = funcionesFuturas(4, { margenHoras: 3, saltar: 5 });

  console.log('Seguridad');
  await caso('El registro crea el perfil con rol "cliente" aunque los metadatos pidan "admin"', async () => {
    const c = clienteAnonimo();
    const correo = `bd-rol-${s}@cinepass.test`;
    const r = await c.auth.signUp({ email: correo, password: process.env.CP_CLAVE_PRUEBAS || 'Prueba#2026x', options: { data: { nombre: 'Intruso', rol: 'admin' } } });
    if (r.error && !SECRETA) throw r.error;
    const srv = clienteServicio();
    if (!srv) { const p = await c.from('perfiles').select('rol').single(); afirmar(p.data && p.data.rol === 'cliente', 'rol inesperado'); return; }
    const p = await srv.from('perfiles').select('rol').eq('correo', correo).single();
    afirmar(p.data && p.data.rol === 'cliente', `rol = ${p.data && p.data.rol}`);
  });
  await caso('Un visitante sin sesión no puede confirmar reservas', async () => {
    const libres = await asientosLibres(anon, f1.id);
    const r = await reservar(anon, f1, libres.slice(0, 1));
    afirmar(r.error, 'la reserva anónima fue aceptada');
  });
  await caso('Un cliente no puede insertar reservas directamente en la tabla (sin pasar por la RPC)', async () => {
    const r = await A.c.from('reservas').insert({ codigo: 'CP-HACK00', usuario_id: A.id, funcion_id: f1.id, boletos_general: 1, total: 0, metodo_pago: 'Tarjeta' });
    afirmar(r.error, 'el INSERT directo fue aceptado');
  });
  await caso('Un cliente no puede cambiarse el rol a administrador', async () => {
    await A.c.from('perfiles').update({ rol: 'admin' }).eq('id', A.id);
    const p = await A.c.from('perfiles').select('rol').eq('id', A.id).single();
    afirmar(p.data.rol === 'cliente', 'el rol cambió');
  });
  await caso('La consulta pública de asientos ocupados no expone datos de los clientes', async () => {
    const r = await anon.rpc('asientos_ocupados', { p_funciones: [f1.id] });
    afirmar(!r.error, r.error && r.error.message);
    afirmar(r.data.every(x => Object.keys(x).sort().join() === 'asiento,funcion_id'), 'devuelve columnas de más');
  });

  console.log('Reservas');
  let resA;
  await caso('Un cliente confirma una reserva y el servidor calcula el total y genera el código', async () => {
    const libres = await asientosLibres(A.c, f1.id);
    const asientos = libres.filter(x => !'GH'.includes(x[0])).slice(0, 2);
    const r = await reservar(A.c, f1, asientos, 'Tarjeta');
    afirmar(!r.error, r.error && r.error.message);
    resA = { ...r.data, f: f1 };
    creadas.push(r.data.codigo);
    const esperado = 2 * (8 + (f1.formato === '3D' ? 2 : 0));
    afirmar(/^CP-[A-Z0-9]{6}$/.test(r.data.codigo), 'código inválido');
    afirmar(+r.data.total === esperado, `total ${r.data.total}, esperado ${esperado}`);
  });
  await caso('La reserva queda guardada con usuario, función, asientos, total, método de pago, estado e historial', async () => {
    const r = await A.c.from('reservas').select('codigo,usuario_id,funcion_id,total,metodo_pago,estado,reserva_asientos(asiento),reserva_historial(evento)').eq('codigo', resA.codigo).single();
    afirmar(!r.error, r.error && r.error.message);
    const d = r.data;
    afirmar(d.usuario_id === A.id && d.funcion_id === f1.id && d.metodo_pago === 'Tarjeta' && d.estado === 'Confirmada', 'datos incompletos');
    afirmar(d.reserva_asientos.length === 2 && d.reserva_historial[0].evento === 'Confirmada', 'faltan asientos o historial');
  });
  await caso('Otro cliente no ve la reserva ajena ni puede cancelarla', async () => {
    const r = await B.c.from('reservas').select('codigo').eq('codigo', resA.codigo);
    afirmar(!r.error && r.data.length === 0, 'B puede ver la reserva de A');
    const x = await B.c.rpc('cancelar_reserva', { p_codigo: resA.codigo });
    afirmar(codigoError(x.error) === 'NO_ENCONTRADA', 'B pudo cancelar: ' + (x.error && x.error.message));
  });
  await caso('Reservar un asiento ya ocupado devuelve ASIENTO_OCUPADO con el asiento en conflicto', async () => {
    const r = await reservar(B.c, f1, [resA.asientos[0]]);
    afirmar(codigoError(r.error) === 'ASIENTO_OCUPADO' && r.error.message.includes(resA.asientos[0]), r.error ? r.error.message : 'se aceptó');
  });
  await caso('Si un asiento falla, no se guarda ninguno (sin reservas incompletas)', async () => {
    const libre = (await asientosLibres(B.c, f1.id))[0];
    const r = await reservar(B.c, f1, [libre, resA.asientos[0]]);
    afirmar(codigoError(r.error) === 'ASIENTO_OCUPADO', 'se aceptó');
    const ocup = await anon.rpc('asientos_ocupados', { p_funciones: [f1.id] });
    afirmar(!ocup.data.some(x => x.asiento === libre), `el asiento ${libre} quedó tomado a medias`);
  });
  await caso('Los asientos simulados del mapa también se rechazan en el servidor', async () => {
    const sim = [...asientosSimulados(f2.id)][0];
    const r = await reservar(B.c, f2, [sim]);
    afirmar(codigoError(r.error) === 'ASIENTO_OCUPADO', r.error ? r.error.message : 'se aceptó');
  });
  await caso('No se puede reservar una función que ya empezó (venta cerrada)', async () => {
    const ayer = new Date(Date.now() - 864e5).toLocaleDateString('sv');
    const r = await reservar(B.c, { id: `1-${ayer}-0`, titulo: 'X', formato: '2D', idioma: 'Español' }, ['A2']);
    afirmar(codigoError(r.error) === 'VENTA_CERRADA', r.error ? r.error.message : 'se aceptó');
  });
  await caso('Cambiar asientos: rechaza uno ocupado y acepta uno libre recalculando el total', async () => {
    const otra = await reservar(B.c, f1, [(await asientosLibres(B.c, f1.id))[0]]);
    afirmar(!otra.error, otra.error && otra.error.message);
    creadas.push(otra.data.codigo);
    const mal = await A.c.rpc('cambiar_asientos', { p_codigo: resA.codigo, p_asientos: [resA.asientos[0], otra.data.asientos[0]] });
    afirmar(codigoError(mal.error) === 'ASIENTO_OCUPADO', 'aceptó un asiento ocupado');
    const pref = (await asientosLibres(A.c, f1.id)).filter(x => 'GH'.includes(x[0])).slice(0, 2);
    const ok = await A.c.rpc('cambiar_asientos', { p_codigo: resA.codigo, p_asientos: pref });
    afirmar(!ok.error, ok.error && ok.error.message);
    const esperado = 2 * (8 + (f1.formato === '3D' ? 2 : 0)) + 4;
    afirmar(+ok.data.total === esperado, `total ${ok.data.total}, esperado ${esperado}`);
    resA.asientos = pref;
  });
  await caso('Cancelar libera los asientos y otro cliente puede reservarlos', async () => {
    const x = await A.c.rpc('cancelar_reserva', { p_codigo: resA.codigo });
    afirmar(!x.error && x.data.estado === 'Cancelada', x.error && x.error.message);
    const r = await reservar(B.c, f1, resA.asientos);
    afirmar(!r.error, 'no se liberaron: ' + (r.error && r.error.message));
    creadas.push(r.data.codigo);
  });

  console.log('Concurrencia');
  await caso('10 clientes intentan el MISMO asiento a la vez: solo 1 lo consigue', async () => {
    const clientes = [A, B];
    for (let i = 0; i < 8; i++) clientes.push(await usuarioPrueba(`bd-c${i}-${s}@cinepass.test`));
    const asiento = (await asientosLibres(anon, fCarrera.id))[0];
    const res = await Promise.all(clientes.map(u => reservar(u.c, fCarrera, [asiento])));
    const ok = res.filter(r => !r.error), ocupados = res.filter(r => codigoError(r.error) === 'ASIENTO_OCUPADO');
    ok.forEach(r => creadas.push(r.data.codigo));
    afirmar(ok.length === 1, `${ok.length} reservas confirmadas`);
    afirmar(ocupados.length === 9, `${ocupados.length} recibieron ASIENTO_OCUPADO; otros errores: ${res.filter(r => r.error && codigoError(r.error) !== 'ASIENTO_OCUPADO').map(r => r.error.message).join(' | ')}`);
    const filas = (await anon.rpc('asientos_ocupados', { p_funciones: [fCarrera.id] })).data.filter(x => x.asiento === asiento);
    afirmar(filas.length === 1, `el asiento aparece ${filas.length} veces`);
  });
  await caso('Reservas simultáneas en funciones distintas se confirman todas', async () => {
    const fs3 = [f1, f2, f3];
    const libres = await Promise.all(fs3.map(f => asientosLibres(anon, f.id)));
    const res = await Promise.all([A, B, A].map((u, i) => reservar(u.c, fs3[i], [libres[i][libres[i].length - 1]])));
    res.forEach(r => r.data && creadas.push(r.data.codigo));
    afirmar(res.every(r => !r.error), res.filter(r => r.error).map(r => r.error.message).join(' | '));
  });

  console.log('Dulcería');
  let ped;
  await caso('Un pedido calcula su total en el servidor con los precios de la tabla productos', async () => {
    const r = await A.c.rpc('guardar_pedido', { p_items: { c1: 2, b1: 1 }, p_reserva_codigo: null, p_codigo: null });
    afirmar(!r.error, r.error && r.error.message);
    ped = r.data;
    afirmar(+ped.total === 15, `total ${ped.total}, esperado 15`);
  });
  await caso('Otro cliente no puede editar ni cancelar ese pedido; el cliente no puede marcarlo entregado', async () => {
    const e1 = await B.c.rpc('guardar_pedido', { p_items: { c1: 1 }, p_reserva_codigo: null, p_codigo: ped.codigo });
    afirmar(codigoError(e1.error) === 'NO_ENCONTRADO', 'B editó el pedido');
    const e2 = await B.c.rpc('cambiar_estado_pedido', { p_codigo: ped.codigo, p_estado: 'Cancelado' });
    afirmar(codigoError(e2.error) === 'NO_ENCONTRADO', 'B canceló el pedido');
    const e3 = await A.c.rpc('cambiar_estado_pedido', { p_codigo: ped.codigo, p_estado: 'Entregado' });
    afirmar(codigoError(e3.error) === 'NO_PERMITIDO', 'el cliente lo marcó entregado');
  });

  if (ADM) {
    console.log('Administrador');
    await caso('El administrador ve las reservas y pedidos de todos los clientes', async () => {
      const r = await ADM.c.from('reservas').select('codigo').in('codigo', creadas);
      afirmar(!r.error && r.data.length === creadas.length, `ve ${r.data && r.data.length} de ${creadas.length}`);
      const p = await ADM.c.from('pedidos').select('codigo').eq('codigo', ped.codigo);
      afirmar(p.data.length === 1, 'no ve el pedido');
    });
    await caso('El administrador puede marcar un pedido como entregado', async () => {
      const r = await ADM.c.rpc('cambiar_estado_pedido', { p_codigo: ped.codigo, p_estado: 'Entregado' });
      afirmar(!r.error && r.data.estado === 'Entregado', r.error && r.error.message);
    });
  } else {
    console.log('Administrador: omitido (sin SUPABASE_SECRET_KEY no se puede crear un admin de prueba)');
  }

  // Limpieza: se cancelan las reservas de prueba para liberar los asientos.
  const limpiador = ADM ? ADM.c : null;
  for (const cod of creadas) {
    if (limpiador) await limpiador.rpc('cancelar_reserva', { p_codigo: cod });
    else for (const u of [A, B]) await u.c.rpc('cancelar_reserva', { p_codigo: cod });
  }

  const fallos = resultados.filter(r => !r.ok).length;
  console.log(`\n${resultados.length - fallos} de ${resultados.length} verificaciones correctas.`);
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error('Error inesperado:', e); process.exit(1); });
