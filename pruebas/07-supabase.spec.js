// Módulo: CinePass con base de datos centralizada (Supabase).
// Estas pruebas usan un Supabase real (local con `npx supabase start` o un proyecto en la nube).
// Solo corren con `npm run test:supabase` (variable CP_E2E_SUPABASE=1) y un .env válido; con `npm test` se omiten,
// así el CI y las pruebas CP-01 a CP-26 siguen sin depender de la red.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { captura, abrir, elegirAsientos, pagarConTarjeta } = require('./utilidades');

const activo = process.env.CP_E2E_SUPABASE === '1' && fs.existsSync(path.join(__dirname, '..', '.env'));
const bd = activo ? require('./bd/comun') : null;
const CFG = activo ? { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_PUBLISHABLE_KEY } : null;

test.describe('Base de datos centralizada (Supabase)', () => {
  test.skip(!activo, 'Requiere npm run test:supabase y un .env (ver supabase/README.md)');
  test.describe.configure({ mode: 'serial' });

  const codigos = [];
  let admin;
  const sufijo = Date.now().toString(36);

  /** Página nueva en su propio contexto (= otra sesión de navegador) conectada a Supabase. */
  async function sesion(browser) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page._supabase = CFG;
    return page;
  }
  async function entrar(page, correo, clave = bd.CLAVE) {
    await abrir(page, 'login');
    await page.fill('#e', correo);
    await page.fill('#p', clave);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.locator('#out')).toBeVisible();
  }
  // Película 2, mañana, primera función: todas las pruebas de esta sección usan la misma función.
  async function irAAsientos(page, boletos = 1) {
    await abrir(page, 'p/2');
    await page.locator('.days [data-d="1"]').click();
    await page.locator('.fn button[data-f]').first().click();
    for (let i = 1; i < boletos; i++) await page.getByRole('button', { name: 'Agregar General' }).click();
    await page.click('#nx');
    await expect(page.getByRole('heading', { name: 'Elige tus asientos' })).toBeVisible();
  }
  async function hastaPago(page) {
    await page.click('#nx');
    await page.getByRole('button', { name: 'Continuar al pago' }).click();
    await pagarConTarjeta(page);
  }
  const reservaEnBd = cod => bd.clienteServicio().from('reservas')
    .select('codigo,estado,metodo_pago,total,perfiles(correo),reserva_asientos(asiento,activo),funciones(id)').eq('codigo', cod).single();

  test.beforeAll(async () => {
    admin = await bd.usuarioPrueba(`e2e-admin-${sufijo}@cinepass.test`, { admin: true, nombre: 'Admin Prueba' });
  });
  test.afterAll(async () => {
    // Libera los asientos usados para que la prueba se pueda repetir.
    for (const cod of codigos) await admin.c.rpc('cancelar_reserva', { p_codigo: cod });
  });

  test('CP-27 Registro e inicio de sesión con Supabase Auth (sin contraseñas en el navegador)', async ({ browser }, info) => {
    const page = await sesion(browser);
    const correo = `e2e-${sufijo}@cinepass.test`;
    await abrir(page, 'registro');
    await page.fill('#n', 'Lucía Prueba');
    await page.fill('#e', correo);
    await page.fill('#t', '6123-4567');
    await page.fill('#p', bd.CLAVE);
    await page.fill('#p2', bd.CLAVE);
    await page.check('#tc');
    await page.click('#rg');
    await expect(page.locator('#nav')).toContainText('Lucía');
    await captura(page, info, 'registro', 'Cuenta creada en Supabase Auth y sesión iniciada');

    const perfil = await bd.clienteServicio().from('perfiles').select('nombre,rol').eq('correo', correo).single();
    expect(perfil.data).toEqual({ nombre: 'Lucía Prueba', rol: 'cliente' });
    const guardado = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    expect(guardado).not.toContain(bd.CLAVE);                      // la contraseña no queda en el navegador

    await page.click('#out');
    await abrir(page, 'login');
    await page.fill('#e', correo);
    await page.fill('#p', 'Incorrecta#1');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.locator('#pe')).toHaveText('Correo o contraseña incorrectos.');
    await entrar(page, correo);
    await expect(page.locator('#nav')).toContainText('Lucía');
    await captura(page, info, 'login', 'Inicio de sesión correcto después de un intento fallido');
  });

  test('CP-28 Una reserva con tarjeta queda guardada en Supabase y aparece en "Mis reservas"', async ({ browser }, info) => {
    const page = await sesion(browser);
    const u = await bd.usuarioPrueba(`e2e-r-${sufijo}@cinepass.test`, { nombre: 'Rita Prueba' });
    await entrar(page, u.correo);
    await irAAsientos(page, 2);
    const asientos = await elegirAsientos(page, 2);
    await hastaPago(page);
    await page.locator('#go').click();
    await expect(page.getByRole('heading', { name: 'Tu reserva está confirmada' })).toBeVisible();
    const cod = (await page.locator('.ticket .code').textContent()).trim();
    codigos.push(cod);
    await captura(page, info, 'comprobante', `Reserva ${cod} confirmada por la RPC atómica`);

    const { data } = await reservaEnBd(cod);
    expect(data.estado).toBe('Confirmada');
    expect(data.metodo_pago).toBe('Tarjeta');
    expect(data.perfiles.correo).toBe(u.correo);
    expect(data.reserva_asientos.filter(a => a.activo).map(a => a.asiento).sort()).toEqual([...asientos].sort());

    await abrir(page, 'reservas');
    await expect(page.locator('.li', { hasText: cod })).toBeVisible();
    await captura(page, info, 'historial', 'La reserva aparece en "Mis reservas" (leída desde Supabase)');
  });

  test('CP-29 Dos sesiones distintas ven la disponibilidad actualizada', async ({ browser }, info) => {
    const a = await sesion(browser), b = await sesion(browser);
    const ua = await bd.usuarioPrueba(`e2e-a-${sufijo}@cinepass.test`, { nombre: 'Ana Prueba' });
    const ub = await bd.usuarioPrueba(`e2e-b-${sufijo}@cinepass.test`, { nombre: 'Beto Prueba' });
    await entrar(a, ua.correo);
    await entrar(b, ub.correo);
    await irAAsientos(a);
    await irAAsientos(b);
    const [asiento] = await elegirAsientos(a, 1);
    await expect(b.locator(`[data-s="${asiento}"]`)).not.toHaveClass(/occ/);
    await hastaPago(a);
    await a.locator('#go').click();
    await expect(a.getByRole('heading', { name: 'Tu reserva está confirmada' })).toBeVisible();
    codigos.push((await a.locator('.ticket .code').textContent()).trim());

    // B no recarga: el mapa se actualiza solo (consulta cada 5 s) y marca el asiento como ocupado.
    await expect(b.locator(`[data-s="${asiento}"]`)).toHaveClass(/occ/, { timeout: 12_000 });
    await expect(b.locator(`[data-s="${asiento}"]`)).toBeDisabled();
    await captura(b, info, 'otra-sesion', `La otra sesión ve el asiento ${asiento} ocupado sin recargar`);
  });

  test('CP-30 Dos usuarios pagan el MISMO asiento a la vez: solo uno se confirma', async ({ browser }, info) => {
    const a = await sesion(browser), b = await sesion(browser);
    const ua = await bd.usuarioPrueba(`e2e-a-${sufijo}@cinepass.test`);
    const ub = await bd.usuarioPrueba(`e2e-b-${sufijo}@cinepass.test`);
    await entrar(a, ua.correo);
    await entrar(b, ub.correo);
    await irAAsientos(a);
    await irAAsientos(b);
    const [asiento] = await elegirAsientos(a, 1);
    await b.locator(`[data-s="${asiento}"]`).click();               // los dos eligen el mismo asiento
    await hastaPago(a);
    await hastaPago(b);
    await captura(b, info, 'ambos-en-pago', `Las dos sesiones llegan al pago con el asiento ${asiento}`);

    await Promise.all([a.locator('#go').click(), b.locator('#go').click()]);
    const resultado = async p => {
      const ok = p.getByRole('heading', { name: 'Tu reserva está confirmada' });
      const no = p.getByRole('heading', { name: 'Asientos no disponibles' });
      await expect(ok.or(no)).toBeVisible({ timeout: 15_000 });
      return (await ok.isVisible()) ? 'ok' : 'rechazado';
    };
    const ra = await resultado(a), rb = await resultado(b);
    expect([ra, rb].sort()).toEqual(['ok', 'rechazado']);
    const ganador = ra === 'ok' ? a : b, perdedor = ra === 'ok' ? b : a;
    const cod = (await ganador.locator('.ticket .code').textContent()).trim();
    codigos.push(cod);
    await expect(perdedor.locator('dialog')).toContainText(asiento);
    await captura(perdedor, info, 'rechazado', 'El segundo usuario recibe un mensaje claro: el asiento ya fue reservado');

    // En la base de datos el asiento quedó una sola vez.
    const fid = (await reservaEnBd(cod)).data.funciones.id;
    const occ = await bd.clienteAnonimo().rpc('asientos_ocupados', { p_funciones: [fid] });
    expect(occ.data.filter(x => x.asiento === asiento)).toHaveLength(1);
  });

  test('CP-31 Reservas simultáneas en funciones distintas se confirman las dos', async ({ browser }) => {
    const a = await sesion(browser), b = await sesion(browser);
    const ua = await bd.usuarioPrueba(`e2e-a-${sufijo}@cinepass.test`);
    const ub = await bd.usuarioPrueba(`e2e-b-${sufijo}@cinepass.test`);
    await entrar(a, ua.correo);
    await entrar(b, ub.correo);
    await irAAsientos(a);                                           // película 2
    await abrir(b, 'p/3');                                          // película 3
    await b.locator('.days [data-d="1"]').click();
    await b.locator('.fn button[data-f]').first().click();
    await b.click('#nx');
    await elegirAsientos(a, 1);
    await elegirAsientos(b, 1);
    await hastaPago(a);
    await hastaPago(b);
    await Promise.all([a.locator('#go').click(), b.locator('#go').click()]);
    for (const p of [a, b]) {
      await expect(p.getByRole('heading', { name: 'Tu reserva está confirmada' })).toBeVisible({ timeout: 15_000 });
      codigos.push((await p.locator('.ticket .code').textContent()).trim());
    }
  });

  test('CP-32 Cancelar libera el asiento; el historial y el panel de administración siguen funcionando', async ({ browser }, info) => {
    const page = await sesion(browser);
    const u = await bd.usuarioPrueba(`e2e-r-${sufijo}@cinepass.test`);
    await entrar(page, u.correo);
    const cod = codigos[0];                                         // la reserva de CP-28
    await abrir(page, 'reserva/' + cod);
    await page.click('#cx');
    await page.getByRole('button', { name: 'Sí, cancelar reserva' }).click();
    await expect(page.locator('h1 .badge')).toHaveText('Cancelada');
    expect((await reservaEnBd(cod)).data.reserva_asientos.every(x => !x.activo)).toBe(true);
    await captura(page, info, 'cancelada', 'Reserva cancelada y asientos liberados en el servidor');

    // Pedido de dulcería asociado a otra reserva
    await abrir(page, 'alimentos');
    await page.getByRole('button', { name: 'Agregar Palomitas grandes' }).click();
    await page.click('#ok');
    await expect(page.locator('dialog')).toContainText('confirmado');
    await page.getByRole('button', { name: 'Entendido' }).click();

    const adm = await sesion(browser);
    await entrar(adm, admin.correo);
    await abrir(adm, 'admin');
    await expect(adm.locator('.stat-card').first()).toBeVisible();
    await adm.locator('[data-at="reservas"]').click();
    await expect(adm.locator('#adm-tbl-res')).toContainText(cod);
    await expect(adm.locator('#adm-tbl-res')).toContainText(u.correo);
    await captura(adm, info, 'admin-reservas', 'El administrador ve las reservas de todos los clientes desde Supabase');
    await adm.locator('[data-at="pedidos"]').click();
    const fila = adm.locator('tr', { hasText: u.correo }).filter({ has: adm.locator('[data-deliv]') }).first();
    await fila.locator('[data-deliv]').click();
    await adm.locator('[data-at="pedidos"]').click();
    await expect(adm.locator('tr', { hasText: u.correo }).first()).toContainText('Entregado');
    await adm.locator('[data-at="usuarios"]').click();
    await expect(adm.locator('table')).toContainText(u.correo);
    await adm.locator('[data-at="db"]').click();
    await expect(adm.locator('#db-reset')).toHaveCount(0);           // con Supabase no se borra la BD desde el navegador
    await captura(adm, info, 'admin-bd', 'Pestaña Base de Datos en modo Supabase: solo descarga de copias');
  });
});
