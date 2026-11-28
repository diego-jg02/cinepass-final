// Configuración de Playwright para CinePass.
const os = require('os');
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './pruebas',
  outputDir: './pruebas/resultados/artefactos',   // trazas y capturas automáticas cuando una prueba falla
  globalSetup: './pruebas/preparar.js',           // vacía pruebas/evidencias/ antes de cada corrida
  fullyParallel: false,
  workers: 1,                       // en orden, para que se vea claro al presentar
  retries: 0,
  timeout: 60_000,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'pruebas/reporte', open: 'never' }],
    ['json', { outputFile: 'pruebas/resultados/resultados.json' }],   // lo lee pruebas/generar-informe.js
  ],
  // Datos del entorno que quedan en resultados.json y se muestran en el informe Word
  metadata: {
    sistema: process.platform === 'win32' ? `${os.version()} (${os.release()}, ${os.arch()})` : `${os.type()} ${os.release()} (${os.arch()})`,
    node: process.version,
  },
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'es-PA',
    timezoneId: 'America/Panama',
    viewport: { width: 1366, height: 820 },
    screenshot: 'only-on-failure',   // las evidencias de cada paso las toma captura() en utilidades.js
    trace: 'retain-on-failure',
    launchOptions: {
      // LENTO=400 ralentiza cada acción (ms) para que la clase pueda seguir los pasos en pantalla
      ...(process.env.LENTO ? { slowMo: Number(process.env.LENTO) } : {}),
      // Solo si no se pueden descargar navegadores: CHROME_PATH=/ruta/a/chrome
      ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    },
  },
  projects: [
    { name: 'Escritorio (Chrome)', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 820 } } },
  ],
  webServer: {
    command: 'node pruebas/servidor.js',
    url: 'http://localhost:4173/index.html',
    reuseExistingServer: true,
    timeout: 20_000,
  },
});
