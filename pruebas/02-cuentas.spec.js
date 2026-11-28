// Módulo: Registro e inicio de sesión
const { test, expect } = require('@playwright/test');
const { captura, abrir, DEMO } = require('./utilidades');

test.describe('Cuentas de usuario', () => {
  test('CP-07 El registro rechaza datos inválidos (correo, contraseña débil y confirmación)', async ({ page }, info) => {
    await abrir(page, 'registro');
    await page.fill('#n', 'Ana');
    await page.fill('#e', 'correo-sin-arroba');
    await page.fill('#p', 'abc');
    await page.fill('#p2', 'xyz');
    await page.check('#tc');
    await page.click('#rg');
    await expect(page.locator('[data-e="e"]')).toContainText('correo electrónico válido');
    await expect(page.locator('[data-e="p"]')).toContainText('al menos 8 caracteres');
    await expect(page.locator('[data-e="p2"]')).toHaveText('Las contraseñas no coinciden.');
    await captura(page, info, 'errores-validacion', 'Errores de correo inválido, contraseña corta y contraseñas que no coinciden');
  });

  test('CP-08 El indicador de contraseña marca cada requisito y el registro válido inicia sesión', async ({ page }, info) => {
    await abrir(page, 'registro');
    await expect(page.locator('#rg')).toBeDisabled();             // sin aceptar términos no se puede enviar
    await page.fill('#n', 'Carlos Pérez');
    await page.fill('#e', `carlos${Date.now()}@correo.com`);
    await page.fill('#t', '6123-4567');
    await page.fill('#p', 'Cine#2026');
    for (const req of ['#pw-len', '#pw-upper', '#pw-lower', '#pw-num', '#pw-spec']) {
      await expect(page.locator(req)).toHaveClass(/ok/);
    }
    await page.fill('#p2', 'Cine#2026');
    await page.check('#tc');
    await captura(page, info, 'formulario-valido', 'Formulario completo con los 5 requisitos de la contraseña cumplidos');
    await page.click('#rg');
    await expect(page.locator('#nav')).toContainText('Carlos');
    await expect(page.locator('#out')).toBeVisible();
    await captura(page, info, 'sesion-iniciada', 'Tras registrarse, la sesión queda iniciada con el nombre "Carlos"');
  });

  test('CP-09 No permite registrar un correo que ya existe', async ({ page }, info) => {
    await abrir(page, 'registro');
    await page.fill('#n', 'Otra Persona');
    await page.fill('#e', DEMO.e);
    await page.fill('#p', 'Valida#123');
    await page.fill('#p2', 'Valida#123');
    await page.check('#tc');
    await page.click('#rg');
    await expect(page.locator('[data-e="e"]')).toHaveText('Este correo ya está registrado. Por favor inicia sesión.');
    await captura(page, info, 'correo-duplicado', 'Aviso "Este correo ya está registrado"');
  });

  test('CP-10 El inicio de sesión con contraseña incorrecta muestra un error', async ({ page }, info) => {
    await abrir(page, 'login');
    await page.fill('#e', DEMO.e);
    await page.fill('#p', 'ClaveEquivocada1!');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.locator('#pe')).toHaveText('Correo o contraseña incorrectos.');
    await expect(page.locator('#out')).toHaveCount(0);
    await captura(page, info, 'credenciales-incorrectas', 'Error "Correo o contraseña incorrectos."');
  });

  test('CP-11 La cuenta se bloquea temporalmente tras 5 intentos fallidos', async ({ page }, info) => {
    await abrir(page, 'login');
    await page.fill('#e', DEMO.e);
    for (let i = 0; i < 5; i++) {
      await page.fill('#p', `Mala${i}!`);
      await page.getByRole('button', { name: 'Entrar' }).click();
    }
    await page.fill('#p', DEMO.p);                                 // ni con la clave correcta entra
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.locator('#pe')).toContainText('Cuenta bloqueada temporalmente');
    await captura(page, info, 'cuenta-bloqueada', 'Tras 5 intentos fallidos la cuenta queda bloqueada, incluso con la contraseña correcta');
  });

  test('CP-12 El inicio de sesión correcto muestra el nombre del usuario y permite salir', async ({ page }, info) => {
    await abrir(page, 'login');
    await page.fill('#e', DEMO.e);
    await page.fill('#p', DEMO.p);
    await captura(page, info, 'formulario-login', 'Formulario de inicio de sesión con la cuenta demo');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.locator('#nav')).toContainText('Cliente');
    await captura(page, info, 'sesion-iniciada', 'Sesión iniciada: el menú muestra "Cliente"');
    await page.click('#out');
    await expect(page.locator('#nav')).toContainText('Iniciar sesión');
  });
});
