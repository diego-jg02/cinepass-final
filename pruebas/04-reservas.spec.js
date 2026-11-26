// Módulo: Mis reservas (consulta, edición de asientos y cancelación)
const { test, expect } = require('@playwright/test');
const { captura, abrir, registrarse, comprar } = require('./utilidades');

test.describe('Gestión de reservas', () => {
  test('CP-18 La reserva aparece en "Mis reservas" y se puede buscar por código', async ({ page }, info) => {
    await registrarse(page);
    const { codigo } = await comprar(page);
    await abrir(page, 'reservas');
    await expect(page.locator('.li')).toHaveCount(1);
    await expect(page.locator('.li')).toContainText(codigo);
    await expect(page.locator('.li .badge')).toHaveText('Confirmada');
    await captura(page, info, 'mis-reservas');
    await page.fill('#qc', codigo.slice(0, 5));
    await expect(page.locator('.li')).toHaveCount(1);
    await page.fill('#qc', 'CP-NOEXISTE');
    await expect(page.locator('main .msg')).toContainText('No encontramos reservas con ese código');
    await captura(page, info, 'busqueda-sin-resultado');
  });

  test('CP-19 El cliente puede cambiar los asientos de una reserva confirmada', async ({ page }, info) => {
    await registrarse(page);
    const { codigo, asientos } = await comprar(page);
    await abrir(page, `reserva/${codigo}`);
    await captura(page, info, 'detalle-antes');
    await page.click('#ed');
    await page.getByRole('button', { name: 'Sí, cambiar asientos' }).click();
    await expect(page.locator('main .msg.ok').first()).toContainText(`Modificando reserva ${codigo}`);
    for (const s of asientos) await page.locator(`[data-s="${s}"]`).click();      // quita los actuales
    const nuevos = [];
    const libres = page.locator('.seat:not(.occ):not(.sel)');
    for (let i = 0; nuevos.length < 2; i++) {
      const id = await libres.nth(i).getAttribute('data-s');
      if (asientos.includes(id)) continue;
      nuevos.push(id);
      await libres.nth(i).click();
    }
    await captura(page, info, 'nuevos-asientos');
    await page.getByRole('button', { name: 'Guardar nuevos asientos' }).click();
    await expect(page.locator('dialog')).toContainText(`Reserva ${codigo} actualizada`);
    await page.getByRole('button', { name: 'Ver mi reserva' }).click();
    await expect(page.locator('.ticket')).toContainText(nuevos.join(', '));
    await expect(page.locator('main ul.small')).toContainText('Asientos modificados');
    await captura(page, info, 'detalle-actualizado');
  });

  test('CP-20 El cliente puede cancelar una reserva y queda registrada como cancelada', async ({ page }, info) => {
    await registrarse(page);
    const { codigo } = await comprar(page);
    await abrir(page, `reserva/${codigo}`);
    await page.click('#cx');
    await expect(page.locator('dialog')).toContainText(`¿Cancelar la reserva ${codigo}?`);
    await captura(page, info, 'confirmar-cancelacion');
    await page.getByRole('button', { name: 'Sí, cancelar reserva' }).click();
    await expect(page.locator('h1 .badge')).toHaveText('Cancelada');
    await expect(page.locator('main .msg.ok')).toContainText('reembolso total');
    await expect(page.locator('#cx')).toBeDisabled();
    await captura(page, info, 'reserva-cancelada');
    await abrir(page, 'reservas');
    await page.getByRole('tab', { name: 'Canceladas' }).click();
    await expect(page.locator('.li')).toContainText(codigo);
  });

  test('CP-21 Un usuario no puede ver la reserva de otra cuenta', async ({ browser }, info) => {
    const ctxA = await browser.newContext();
    const a = await ctxA.newPage();
    await registrarse(a, 'Usuario Uno');
    const { codigo } = await comprar(a);
    const reservasGuardadas = await a.evaluate(() => localStorage.getItem('cp_r'));
    const usuarios = await a.evaluate(() => localStorage.getItem('cp_u'));
    await ctxA.close();

    // Mismo navegador (mismos datos guardados), pero con otra cuenta
    const ctxB = await browser.newContext();
    const b = await ctxB.newPage();
    await abrir(b);
    await b.evaluate(([r, u]) => { localStorage.setItem('cp_r', r); localStorage.setItem('cp_u', u); }, [reservasGuardadas, usuarios]);
    await registrarse(b, 'Usuario Dos');
    await abrir(b, `reserva/${codigo}`);
    await expect(b.getByRole('heading', { name: 'No tienes acceso a este recurso' })).toBeVisible();
    await captura(b, info, 'acceso-denegado');
    await ctxB.close();
  });
});
