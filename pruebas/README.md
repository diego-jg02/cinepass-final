# Pruebas automatizadas de CinePass (Playwright)

24 pruebas de extremo a extremo (E2E) que recorren la app como lo haría un usuario real: cartelera, búsqueda, cuentas, compra, reservas, dulcería y panel de administración.

## Correrlas en Windows (para presentar)

**Requisito:** tener [Node.js](https://nodejs.org) instalado (versión LTS).

1. Doble clic en **`pruebas.bat`** (en la raíz del proyecto).
2. La primera vez instala Playwright y Chromium (unos minutos).
3. Se abre Chrome y se ve cada prueba ejecutándose en pantalla, un poco más lento para poder seguirla.
4. Al terminar se abre el **reporte HTML** con el resultado de cada caso y sus capturas.

## Por línea de comandos

```cmd
npm install
npx playwright install chromium
npm test              :: corre todo sin abrir ventanas (rápido)
npm run test:ver      :: corre todo viendo el navegador
npm run test:ui       :: modo interactivo: elegir y repetir pruebas una a una
npm run reporte       :: abre el último reporte
```

Para correr un solo caso: `npx playwright test -g "CP-13" --headed`

## En GitHub

Cada `push` corre las pruebas automáticamente (pestaña **Actions → Pruebas E2E**). El reporte y las capturas quedan descargables como *artifact* `reporte-pruebas-cinepass`. También se puede lanzar a mano con **Run workflow**.

## Estructura

| Archivo | Qué prueba |
|---|---|
| `01-cartelera.spec.js` | CP-01 a CP-06 · cartelera, búsqueda, filtros, detalle y 404 |
| `02-cuentas.spec.js` | CP-07 a CP-12 · registro, validaciones, login y bloqueo |
| `03-compra.spec.js` | CP-13 a CP-17 · flujo de compra, pagos y límites |
| `04-reservas.spec.js` | CP-18 a CP-21 · mis reservas, edición, cancelación y privacidad |
| `05-dulceria-admin.spec.js` | CP-22 a CP-24 · carrito de dulcería y panel de administración |
| `utilidades.js` | pasos reutilizables (iniciar sesión, comprar, capturas) |
| `servidor.js` | servidor local que Playwright levanta solo (puerto 4173) |
| `capturas/` | capturas de cada paso, regeneradas en cada ejecución |

Cada prueba arranca con el navegador limpio (sin datos guardados), así que se pueden correr en cualquier orden y repetir las veces que haga falta.
