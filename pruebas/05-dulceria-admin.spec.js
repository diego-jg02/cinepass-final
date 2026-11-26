// Módulos: Alimentos y bebidas, y Panel de Administración
const { test, expect } = require('@playwright/test');
const { captura, abrir, iniciarSesion, registrarse, comprar, ADMIN } = require('./utilidades');

test.describe('Alimentos y bebidas', () => {
  test('CP-22 El carrito calcula el total y el pedido se confirma', async ({ page }, info) => {
    await registrarse(page);
    await abrir(page, 'alimentos');
    await page.getByRole('button', { name: 'Agregar Combo pareja' }).click();      // $14.00
    await page.getByRole('button', { name: 'Agregar Refresco 22 oz' }).click();    // $3.00
    await page.getByRole('button', { name: 'Agregar Refresco 22 oz' }).click();    // $3.00
    await expect(page.locator('#cart-aside .total')).toHaveText('$20.00');
    await captura(page, info, 'carrito');
    await page.click('#ok');
    await expect(page.locator('dialog')).toContainText('confirmado');
    await expect(page.locator('dialog')).toContainText('$20.00');
    await captura(page, info, 'pedido-confirmado');
    await page.getByRole('button', { name: 'Entendido' }).click();
    await expect(page.locator('#my-orders .li')).toHaveCount(1);
    await expect(page.locator('#my-orders')).toContainText('Recibido');
  });
});

test.describe('Panel de administración', () => {
  test('CP-23 Un cliente no puede entrar al panel de administración', async ({ page }, info) => {
    await registrarse(page);
    await abrir(page, 'admin');
    await expect(page.locator('main')).toContainText('uso exclusivo para administradores');
    await expect(page.locator('#nav')).not.toContainText('Panel Admin');
    await captura(page, info, 'acceso-restringido');
  });

  test('CP-24 El administrador ve métricas y las reservas de los clientes', async ({ page }, info) => {
    await registrarse(page, 'Cliente Admin Test');
    const { codigo } = await comprar(page);
    await page.click('#out');

    await iniciarSesion(page, ADMIN);
    await expect(page.locator('#nav')).toContainText('Panel Admin');
    await abrir(page, 'admin');
    await expect(page.getByRole('heading', { name: 'Panel de Control CinePass' })).toBeVisible();
    await expect(page.locator('.stat-card').nth(2).locator('.val')).toHaveText('1');   // reservas confirmadas
    await captura(page, info, 'resumen-general');
    await page.getByRole('tab', { name: /Todas las Reservas/ }).click();
    await expect(page.locator('#adm-tbl-res tbody')).toContainText(codigo);
    await page.fill('#adm-q-res', codigo);
    await expect(page.locator('#adm-tbl-res tbody tr:visible')).toHaveCount(1);
    await captura(page, info, 'tabla-reservas');
  });
});
