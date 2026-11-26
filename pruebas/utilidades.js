// Funciones compartidas por las pruebas de CinePass.
const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');

const CARPETA_CAPTURAS = path.join(__dirname, 'capturas');
fs.mkdirSync(CARPETA_CAPTURAS, { recursive: true });

// Cuentas sembradas por la app en js/app.js (se pueden sobrescribir con variables de entorno).
const DEMO = { e: 'demo@cinepass.test', p: process.env.CP_DEMO_PASS || 'Demo1234!' };
const ADMIN = { e: 'admin@cinepass.com', p: process.env.CP_ADMIN_PASS || 'Admin1234!' };

// Tarjeta de prueba estándar (pasa el algoritmo de Luhn). No es una tarjeta real.
const TARJETA = { nombre: 'Maria Gonzalez', numero: '4111111111111111', venc: '12/30', cvv: '123' };

/** Toma una captura con nombre fijo (para el informe) y la adjunta al reporte HTML. */
async function captura(page, testInfo, nombre) {
  const id = (testInfo.title.match(/^CP-\d+/) || ['CP'])[0];
  const n = String((testInfo._capturas = (testInfo._capturas || 0) + 1)).padStart(2, '0');
  const archivo = path.join(CARPETA_CAPTURAS, `${id}-${n}-${nombre}.png`);
  await page.waitForTimeout(250); // deja terminar transiciones CSS
  await page.screenshot({ path: archivo, fullPage: false });
  await testInfo.attach(`${n} · ${nombre}`, { path: archivo, contentType: 'image/png' });
}

async function abrir(page, ruta = '') {
  // Las pruebas usan las 8 películas locales de js/data.js (ids 1-8, "Nocturno en Colón", etc.).
  // Se bloquea TMDB (proxy de Cloudflare e imágenes) para que la cartelera sea siempre la misma
  // y no cambie con lo que esté en cines esa semana. La app cae sola a los datos locales.
  if (!page._sinTmdb) {
    page._sinTmdb = true;
    await page.route(/workers\.dev|themoviedb\.org/, (r) => r.abort());
  }
  await page.goto(`/index.html#/${ruta}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#nav')).not.toBeEmpty();
}

async function iniciarSesion(page, cuenta = DEMO) {
  await abrir(page, 'login');
  await page.fill('#e', cuenta.e);
  await page.fill('#p', cuenta.p);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('#out')).toBeVisible();
}

/** Registra un usuario nuevo (correo único) y deja la sesión iniciada. */
async function registrarse(page, nombre = 'Usuario Prueba') {
  const correo = `prueba${Date.now()}@cinepass.test`;
  await abrir(page, 'registro');
  await page.fill('#n', nombre);
  await page.fill('#e', correo);
  await page.fill('#t', '6123-4567');
  await page.fill('#p', 'Clave#2026');
  await page.fill('#p2', 'Clave#2026');
  await page.check('#tc');
  await page.click('#rg');
  await expect(page.locator('#out')).toBeVisible();
  return correo;
}

/** Abre la película 1, elige la primera función de mañana y avanza hasta el paso de asientos. */
async function elegirFuncion(page, idPelicula = 1) {
  await abrir(page, `p/${idPelicula}`);
  await page.locator('.days [data-d="1"]').click();               // mañana: siempre a más de 2 h
  await page.locator('.fn button[data-f]').first().click();
  await expect(page.getByRole('heading', { name: '¿Cuántos boletos?' })).toBeVisible();
}

/** Selecciona los primeros N asientos libres. Devuelve sus códigos (ej. ["A2","A3"]). */
async function elegirAsientos(page, n) {
  const libres = page.locator('.seat:not(.occ)');
  const elegidos = [];
  for (let i = 0; i < n; i++) {
    const s = libres.nth(i);
    elegidos.push(await s.getAttribute('data-s'));
    await s.click();
  }
  return elegidos;
}

async function pagarConTarjeta(page, t = TARJETA) {
  await page.fill('#nm', t.nombre);
  await page.fill('#num', t.numero);
  await page.fill('#ex', t.venc);
  await page.fill('#cv', t.cvv);
}

/** Flujo completo: función → 2 boletos → asientos → resumen → pago con tarjeta. Devuelve el código de reserva. */
async function comprar(page) {
  await elegirFuncion(page);
  await page.getByRole('button', { name: 'Agregar General' }).click();
  await page.click('#nx');
  const asientos = await elegirAsientos(page, 2);
  await page.click('#nx');
  await page.getByRole('button', { name: 'Continuar al pago' }).click();
  await pagarConTarjeta(page);
  await page.locator('#go').click();
  await expect(page.getByRole('heading', { name: 'Tu reserva está confirmada' })).toBeVisible();
  const codigo = (await page.locator('.ticket .code').textContent()).trim();
  return { codigo, asientos };
}

module.exports = { DEMO, ADMIN, TARJETA, captura, abrir, iniciarSesion, registrarse, elegirFuncion, elegirAsientos, pagarConTarjeta, comprar };
