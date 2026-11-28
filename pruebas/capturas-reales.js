// Capturas ILUSTRATIVAS de CinePass con la cartelera real de TMDB (sin bloquear ni simular nada).
// Son para el anexo "La aplicación con TMDB en vivo" del informe Word. NO es una prueba:
//   - no lo ejecuta `playwright test` (no termina en .spec.js) ni el workflow de GitHub Actions;
//   - depende de la red y de las películas que estén en cines esa semana.
// Uso: npm run capturas-reales   (luego npm run solo-informe para regenerar el Word con el anexo)
// Salida: pruebas/capturas-reales/*.png y capturas.json (títulos, fecha y pies de foto).
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('@playwright/test');

const PUERTO = Number(process.env.PORT) || 4173;
const BASE = `http://localhost:${PUERTO}/index.html`;
const CARPETA = path.join(__dirname, 'capturas-reales');

const responde = () => new Promise((ok) => {
  http.get(BASE, (r) => { r.resume(); ok(r.statusCode === 200); }).on('error', () => ok(false));
});

/** Espera a que carguen las imágenes visibles en pantalla: <img> (pósters) y fondos CSS (película destacada). */
async function esperarImagenes(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  const resultado = await page.evaluate(async () => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    };
    const urls = new Set();
    for (const img of document.images) if (visible(img) && img.currentSrc) urls.add(img.currentSrc);
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el)) continue;
      for (const m of getComputedStyle(el).backgroundImage.matchAll(/url\("?([^")]+)"?\)/g)) urls.add(m[1]);
    }
    const cargar = (src) => new Promise((ok) => {
      const i = new Image();
      const t = setTimeout(() => ok({ src, ok: false }), 20000);
      i.onload = () => { clearTimeout(t); ok({ src, ok: true }); };
      i.onerror = () => { clearTimeout(t); ok({ src, ok: false }); };
      i.src = src;
    });
    const r = await Promise.all([...urls].map(cargar));
    return { total: r.length, fallidas: r.filter((x) => !x.ok).map((x) => x.src) };
  });
  await page.waitForTimeout(600); // deja terminar transiciones y el pintado de las imágenes
  if (resultado.fallidas.length) console.warn(`  Aviso: ${resultado.fallidas.length} de ${resultado.total} imágenes no cargaron.`);
  return resultado;
}

async function main() {
  let servidor = null;
  if (!(await responde())) servidor = require('./servidor'); // levanta el servidor local si no está corriendo
  for (let i = 0; i < 20 && !(await responde()); i++) await new Promise((r) => setTimeout(r, 250));

  fs.rmSync(CARPETA, { recursive: true, force: true });
  fs.mkdirSync(CARPETA, { recursive: true });
  const navegador = await chromium.launch();
  const capturas = [];
  try {
    const page = await navegador.newPage({ viewport: { width: 1366, height: 820 }, locale: 'es-PA', timezoneId: 'America/Panama' });
    const tomar = async (archivo, pie) => {
      await esperarImagenes(page);
      await page.screenshot({ path: path.join(CARPETA, archivo) });
      capturas.push({ archivo, pie });
      console.log(`  ✓ ${archivo}`);
    };

    // 1. Inicio: la app carga TMDB a través del proxy (sin bloquear nada)
    await page.goto(`${BASE}#/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.SRC === 'tmdb' || window.SRC === 'error', null, { timeout: 45000 });
    if (await page.evaluate(() => window.SRC) !== 'tmdb') throw new Error('TMDB no respondió (la app mostró las películas locales). Revisa la conexión o el proxy y vuelve a intentarlo.');
    const peliculas = await page.evaluate(() => PELIS.map((p) => ({ id: p.id, titulo: p.t })));
    const destacada = (await page.locator('#hero h1').first().textContent()).trim();
    await tomar('real_1_inicio.png', `Página de inicio con la película destacada de TMDB ("${destacada}")`);

    // 2. Cartelera
    await page.locator('#cartelera').scrollIntoViewIfNeeded();
    await page.evaluate(() => document.querySelector('#cartelera').scrollIntoView({ block: 'start' }));
    await tomar('real_2_cartelera.png', `Cartelera con las ${peliculas.length} películas en cines que devolvió TMDB`);

    // 3. Detalle de la primera película de la cartelera
    const p = peliculas[0];
    await page.goto(`${BASE}#/p/${p.id}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { level: 1, name: p.titulo }).waitFor();
    await tomar('real_3_detalle.png', `Detalle de "${p.titulo}" con sinopsis, ficha técnica y reparto de TMDB`);

    // 4. Selección de asientos (función de mañana, 1 boleto, primer asiento libre)
    await page.locator('.days [data-d="1"]').click();
    await page.locator('.fn button[data-f]').first().click();
    await page.getByRole('heading', { name: '¿Cuántos boletos?' }).waitFor();
    await page.click('#nx');
    await page.locator('.seat:not(.occ)').first().click();
    await page.locator('#seat-msg').waitFor();
    await page.evaluate(() => window.scrollTo(0, 0)); // que se vea el título y el mapa de la sala completo
    await tomar('real_4_asientos.png', `Selección de asientos para una función de mañana de "${p.titulo}"`);

    const datos = { fecha: new Date().toISOString(), peliculas: peliculas.map((x) => x.titulo), capturas };
    fs.writeFileSync(path.join(CARPETA, 'capturas.json'), JSON.stringify(datos, null, 2));
    console.log(`Listo: ${capturas.length} capturas en pruebas/capturas-reales/. Ahora corre: npm run solo-informe`);
  } finally {
    await navegador.close();
    if (servidor) process.exit(process.exitCode || 0); // cierra el servidor local que levantó este script
  }
}

main().catch((e) => {
  console.error('No se pudieron tomar las capturas reales:', e.message);
  process.exit(1);
});
