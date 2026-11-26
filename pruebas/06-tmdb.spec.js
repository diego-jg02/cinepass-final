// Módulo: Conexión con TMDB (simulada con page.route() y un JSON fijo en pruebas/datos/tmdb-simulado.json)
const { test, expect } = require('@playwright/test');
const { captura, abrir, simularTmdb } = require('./utilidades');

test.describe('Películas desde TMDB (simulado)', () => {
  test('CP-25 Con TMDB disponible, la cartelera y el detalle muestran las películas de la API', async ({ page }, info) => {
    const llamadas = await simularTmdb(page);
    await abrir(page);

    // Cartelera: las 4 películas con póster del JSON (la que no tiene póster se descarta) y ninguna local
    await page.locator('#cartelera').scrollIntoViewIfNeeded();
    await expect(page.locator('#res .film')).toHaveCount(4);
    await expect(page.locator('#cnt')).toHaveText('4 películas disponibles');
    await expect(page.locator('#res .film h3')).toHaveText(['El faro del Pacífico', 'Ciudad de lluvia', 'Pequeños gigantes', 'Medianoche en el canal']);
    await expect(page.getByText('Película sin póster')).toHaveCount(0);
    await expect(page.getByText('Nocturno en Colón')).toHaveCount(0);
    await captura(page, info, 'cartelera-desde-tmdb');

    // La app llama al proxy sin credenciales: 1 listado + 4 detalles, en español
    expect(llamadas.map((l) => l.ruta)).toEqual(['/movie/now_playing', '/movie/9001', '/movie/9002', '/movie/9003', '/movie/9004']);
    for (const l of llamadas) {
      expect(l.params.language).toBe('es-MX');
      expect(l.params.api_key).toBeUndefined();
      expect(l.cabeceras.authorization).toBeUndefined();
    }
    expect(llamadas[1].params.append_to_response).toBe('videos,release_dates,credits');

    // Detalle: datos mapeados desde TMDB (clasificación PG-13 → +12, director, valoración, reparto de 4)
    await abrir(page, 'p/9001');
    await expect(page.getByRole('heading', { level: 1, name: 'El faro del Pacífico' })).toBeVisible();
    await expect(page.locator('.detail .eyebrow')).toHaveText('Drama · +12 · 121 min · Estreno 2026-11-20');
    await expect(page.locator('.facts')).toContainText('Ana Castillo');
    await expect(page.locator('.facts')).toContainText('7.8');
    await expect(page.getByText('Reparto: Sofía Ramos, Diego Herrera, Lucía Méndez, Tomás Vega')).toBeVisible();
    await captura(page, info, 'detalle-desde-tmdb');

    // Los horarios siguen siendo locales: 3 funciones al día también para películas de TMDB
    await page.locator('.days [data-d="1"]').click();
    await expect(page.locator('.fn')).toHaveCount(3);

    // Clasificación R → +16 y la sinopsis larga se resume a 300 caracteres o menos sin cortar frases
    await abrir(page, 'p/9002');
    await expect(page.locator('.detail .eyebrow')).toContainText('Suspenso · +16 · 109 min');
    const sinopsis = (await page.locator('.detail h1 + p').textContent()).trim();
    expect(sinopsis.length).toBeLessThanOrEqual(300);
    expect(sinopsis.startsWith('En una ciudad donde no ha dejado de llover')).toBe(true);
    expect(sinopsis).toMatch(/[.!?]$/);
  });

  test('CP-26 Si TMDB falla, la app muestra las películas locales de respaldo', async ({ page }, info) => {
    const llamadas = await simularTmdb(page, { estado: 500 });
    await abrir(page);
    await page.locator('#cartelera').scrollIntoViewIfNeeded();
    await expect(page.locator('#res .film')).toHaveCount(8);
    await expect(page.locator('#cnt')).toHaveText('8 películas disponibles');
    await expect(page.locator('#res .film h3', { hasText: 'Nocturno en Colón' })).toBeVisible();
    await expect(page.getByText('El faro del Pacífico')).toHaveCount(0);
    expect(llamadas.length).toBeGreaterThan(0); // sí intentó conectarse con TMDB
    await captura(page, info, 'respaldo-local');
  });
});
