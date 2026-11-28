// Módulo: Cartelera, búsqueda, filtros y detalle de película
const { test, expect } = require('@playwright/test');
const { captura, abrir } = require('./utilidades');

test.describe('Cartelera y búsqueda', () => {
  test('CP-01 La página de inicio carga la cartelera con las películas disponibles', async ({ page }, info) => {
    await abrir(page);
    await expect(page.locator('#hero')).toBeVisible();
    await captura(page, info, 'inicio', 'Página de inicio con la película destacada');
    await page.locator('#cartelera').scrollIntoViewIfNeeded();
    await expect(page.locator('#res .film')).toHaveCount(8);
    await expect(page.locator('#cnt')).toHaveText('8 películas disponibles');
    await captura(page, info, 'cartelera', 'La sección Cartelera muestra las 8 películas disponibles');
  });

  test('CP-02 La búsqueda filtra en tiempo real por género mientras se escribe', async ({ page }, info) => {
    await abrir(page, 'cartelera');
    await page.locator('.fdet summary').click();
    await page.fill('#q', 'terror');
    await expect(page.locator('#res .film')).toHaveCount(1);
    await expect(page.locator('#res .film h3')).toHaveText('Casa sin ventanas');
    await expect(page.locator('#cnt')).toHaveText('1 resultado para "terror"');
    await page.locator('#res .film').scrollIntoViewIfNeeded();
    await captura(page, info, 'busqueda-terror', 'Al escribir "terror" solo queda "Casa sin ventanas"');
  });

  test('CP-03 Una búsqueda sin coincidencias muestra un mensaje y permite limpiar', async ({ page }, info) => {
    await abrir(page, 'cartelera');
    await page.locator('.fdet summary').click();
    await page.fill('#q', 'zzzz pelicula inexistente');
    await expect(page.locator('#res .msg')).toContainText('No encontramos películas');
    await page.locator('#res .msg').scrollIntoViewIfNeeded();
    await captura(page, info, 'sin-resultados', 'Mensaje "No encontramos películas" para una búsqueda sin coincidencias');
    await page.locator('#clr2').click();
    await expect(page.locator('#res .film')).toHaveCount(8);
  });

  test('CP-04 El filtro por género muestra solo las películas de ese género', async ({ page }, info) => {
    await abrir(page, 'cartelera');
    await page.locator('.fdet summary').click();
    await page.locator('.chip', { hasText: 'Animación' }).click();
    await expect(page.locator('#res .film')).toHaveCount(1);
    await expect(page.locator('#res .film h3')).toHaveText('El jardín de Ana');
    await expect(page.locator('#tags')).toContainText('Animación');
    await page.locator('#res .film').scrollIntoViewIfNeeded();
    await captura(page, info, 'filtro-animacion', 'Filtro de género Animación: solo aparece "El jardín de Ana"');
  });

  test('CP-05 El detalle de una película muestra ficha técnica y funciones disponibles', async ({ page }, info) => {
    await abrir(page, 'p/2');
    await expect(page.getByRole('heading', { level: 1, name: 'Nocturno en Colón' })).toBeVisible();
    await expect(page.locator('.facts')).toContainText('Suspenso');
    await expect(page.locator('.facts')).toContainText('104 min');
    await captura(page, info, 'detalle', 'Ficha técnica de "Nocturno en Colón": Suspenso, 104 min');
    await page.locator('.days [data-d="1"]').click();
    await expect(page.locator('.fn')).toHaveCount(3);
    await page.locator('.fn').first().scrollIntoViewIfNeeded();
    await captura(page, info, 'funciones', 'Las 3 funciones de mañana de la película');
  });

  test('CP-06 Una dirección inexistente muestra la página de error 404', async ({ page }, info) => {
    await abrir(page, 'esta-ruta-no-existe');
    await expect(page.getByRole('heading', { name: 'Esta sala no existe' })).toBeVisible();
    await captura(page, info, 'error-404', 'Página de error 404 "Esta sala no existe"');
  });
});
