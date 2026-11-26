// Módulo: Flujo de compra (boletos, asientos, resumen y pago)
const { test, expect } = require('@playwright/test');
const { captura, iniciarSesion, registrarse, elegirFuncion, elegirAsientos, pagarConTarjeta, TARJETA } = require('./utilidades');

test.describe('Compra de entradas', () => {
  test('CP-13 Compra completa con tarjeta: boletos, asientos, pago y comprobante', async ({ page }, info) => {
    await iniciarSesion(page);
    await elegirFuncion(page);
    await page.getByRole('button', { name: 'Agregar General' }).click();
    await expect(page.locator('[data-q-val="G"]')).toHaveText('2');
    await captura(page, info, 'paso1-boletos');

    await page.click('#nx');
    await expect(page.locator('#seat-msg')).toHaveText('Selecciona 2 asientos (faltan 2).');
    const asientos = await elegirAsientos(page, 2);
    await expect(page.locator('#seat-msg')).toHaveText('Selección completa.');
    await expect(page.locator('.sum')).toContainText(asientos.join(', '));
    await captura(page, info, 'paso2-asientos');

    await page.click('#nx');
    await expect(page.getByRole('heading', { name: 'Revisa tu reserva' })).toBeVisible();
    await expect(page.locator('.timer')).toContainText('Retención');
    await captura(page, info, 'paso3-resumen');

    await page.getByRole('button', { name: 'Continuar al pago' }).click();
    await pagarConTarjeta(page);
    await expect(page.locator('#num')).toHaveValue('4111 1111 1111 1111');   // formateo automático
    await expect(page.locator('#card-brand')).toHaveText('Visa');             // detección de marca
    await captura(page, info, 'paso4-pago');

    await page.locator('#go').click();
    await expect(page.getByRole('heading', { name: 'Tu reserva está confirmada' })).toBeVisible();
    await expect(page.locator('.ticket .code')).toHaveText(/^CP-[A-Z0-9]{6}$/);
    await expect(page.locator('.ticket')).toContainText(asientos.join(', '));
    await expect(page.locator('.ticket')).toContainText('····1111');
    await captura(page, info, 'comprobante');
  });

  test('CP-14 El pago rechaza una tarjeta inválida (Luhn), vencida y sin CVV', async ({ page }, info) => {
    await registrarse(page);
    await elegirFuncion(page);
    await page.click('#nx');
    await elegirAsientos(page, 1);
    await page.click('#nx');
    await page.getByRole('button', { name: 'Continuar al pago' }).click();
    await pagarConTarjeta(page, { ...TARJETA, numero: '4111111111111112', venc: '01/20', cvv: '' });
    await page.locator('#go').click();
    await expect(page.locator('[data-e="num"]')).toContainText('inválido');
    await expect(page.locator('[data-e="ex"]')).toHaveText('La tarjeta está vencida.');
    await expect(page.locator('[data-e="cv"]')).toContainText('Código de seguridad inválido');
    await expect(page.getByRole('heading', { name: 'Finalizar compra' })).toBeVisible(); // no avanzó
    await page.locator('#nm').scrollIntoViewIfNeeded();
    await captura(page, info, 'errores-de-tarjeta');
  });

  test('CP-15 Pago alternativo con Yappy confirma la reserva', async ({ page }, info) => {
    await registrarse(page);
    await elegirFuncion(page, 4);
    await page.click('#nx');
    await elegirAsientos(page, 1);
    await page.click('#nx');
    await page.getByRole('button', { name: 'Continuar al pago' }).click();
    await page.locator('[data-pm-set="yappy"]').click();
    await page.fill('#yp-tel', '6123-4567');
    await captura(page, info, 'pago-yappy');
    await page.locator('#go').click();
    await expect(page.getByRole('heading', { name: 'Tu reserva está confirmada' })).toBeVisible();
    await expect(page.locator('.ticket')).toContainText('Método: Yappy');
    await captura(page, info, 'comprobante-yappy');
  });

  test('CP-16 Un visitante sin sesión debe iniciar sesión para pagar y conserva sus asientos', async ({ page }, info) => {
    await elegirFuncion(page);
    await page.click('#nx');
    const [asiento] = await elegirAsientos(page, 1);
    await page.click('#nx');
    await expect(page.locator('main .msg').first()).toContainText('debes iniciar sesión');
    await captura(page, info, 'resumen-sin-sesion');
    await page.getByRole('button', { name: 'Iniciar sesión para pagar' }).click();
    await expect(page.locator('main .msg').first()).toHaveText('Inicia sesión para continuar con tu reserva.');
    await page.fill('#e', 'demo@cinepass.test');
    await page.fill('#p', require('./utilidades').DEMO.p);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('heading', { name: 'Revisa tu reserva' })).toBeVisible();
    await expect(page.locator('.sum')).toContainText(asiento);
    await captura(page, info, 'vuelve-al-resumen');
  });

  test('CP-17 No permite más de 8 boletos por reserva', async ({ page }, info) => {
    await elegirFuncion(page);
    const agregar = page.getByRole('button', { name: 'Agregar General' });
    for (let i = 0; i < 7; i++) await agregar.click();
    await expect(page.locator('[data-q-val="G"]')).toHaveText('8');
    await expect(agregar).toBeDisabled();
    await expect(page.locator('#tk-alert')).toContainText('Máximo 8 boletos');
    await captura(page, info, 'limite-8-boletos');
  });
});
