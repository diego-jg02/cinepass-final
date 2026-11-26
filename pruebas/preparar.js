// globalSetup de Playwright: corre UNA vez antes de todas las pruebas.
// Vacía pruebas/evidencias/ para que el informe solo tenga capturas de esta corrida.
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  const carpeta = path.join(__dirname, 'evidencias');
  fs.rmSync(carpeta, { recursive: true, force: true });
  fs.mkdirSync(carpeta, { recursive: true });
};
