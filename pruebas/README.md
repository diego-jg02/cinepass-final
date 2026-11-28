# Pruebas automatizadas de CinePass (Playwright)

26 pruebas de extremo a extremo (E2E) que recorren la app como lo haría un usuario real: cartelera, búsqueda, cuentas, compra, reservas, dulcería, panel de administración y conexión con TMDB.

**Sobre TMDB:** las pruebas CP-01 a CP-24 bloquean TMDB y usan siempre las 8 películas locales de `js/data.js`, para que el resultado no cambie según lo que esté en cines esa semana. El flujo con TMDB se prueba aparte (CP-25 y CP-26) simulando la API con `page.route()` y las respuestas fijas de `datos/tmdb-simulado.json`. Ninguna prueba usa la red real ni el token.

## Correrlas en Windows (para presentar)

**Requisito:** tener [Node.js](https://nodejs.org) instalado (versión LTS).

1. Doble clic en **`pruebas.bat`** (en la raíz del proyecto).
2. La primera vez instala Playwright y Chromium (unos minutos).
3. Se abre Chrome y se ve cada prueba ejecutándose en pantalla, un poco más lento para poder seguirla.
4. Al terminar genera el **informe Word** (`pruebas/informe-pruebas.docx`) y abre el **reporte HTML** con el resultado de cada caso y sus capturas.

## Por línea de comandos

```cmd
npm install
npx playwright install chromium
npm test              :: corre todo sin abrir ventanas (rápido)
npm run test:ver      :: corre todo viendo el navegador
npm run test:ui       :: modo interactivo: elegir y repetir pruebas una a una
npm run reporte       :: abre el último reporte
npm run informe       :: corre todo y genera el informe Word de evidencias
npm run solo-informe  :: regenera el Word con la última corrida, sin volver a correr las pruebas
npm run capturas-reales :: capturas ilustrativas con la cartelera real de TMDB (para el Anexo A)
```

## Informe de evidencias (Word)

`npm run informe` corre las pruebas y luego `pruebas/generar-informe.js`, que crea **`pruebas/informe-pruebas.docx`** con:

- Portada (integrantes desde `informe-datos.json`) e introducción (herramienta, navegador, entorno y cómo se simula TMDB).
- Tabla resumen: ID, nombre, archivo, resultado (✅/❌) y duración.
- Una sección por caso: objetivo, pasos y resultado esperado (de `casos.js`), resultado obtenido (de `resultados/resultados.json`) y sus capturas con pie de foto.
- Conclusión con el total de aprobadas/fallidas y el tiempo total.

Las capturas de cada paso clave las toma `captura()` en `utilidades.js` y se guardan como `evidencias/CP-01_1_inicio.png`, `CP-01_2_cartelera.png`, etc. También se adjuntan al reporte HTML. Si una prueba falla, Playwright guarda además una captura y la traza en `resultados/artefactos/`.

Si cambias lo que hace una prueba, actualiza su texto en `casos.js`.

### Anexo A: la aplicación con TMDB en vivo

`npm run capturas-reales` ejecuta `pruebas/capturas-reales.js`, que abre la app **sin bloquear TMDB**, espera a que carguen los pósters y toma 4 capturas (inicio, cartelera, detalle y selección de asientos) en `pruebas/capturas-reales/`. Después, `npm run solo-informe` agrega esas capturas al Word como **Anexo A**.

No es una prueba: no lo corre `playwright test` ni GitHub Actions, porque depende de la red y de la cartelera de esa semana. Las capturas son solo ilustrativas; las pruebas usan las películas locales y TMDB simulado para dar siempre el mismo resultado. Si no existen esas capturas, el informe sale sin el anexo.

`evidencias/`, `capturas-reales/`, `resultados/`, `reporte/` y el `.docx` no se suben al repositorio (están en `.gitignore`).

Para correr un solo caso: `npx playwright test -g "CP-13" --headed`

## En GitHub

Cada `push` y cada *pull request* corre las pruebas automáticamente (pestaña **Actions → Pruebas E2E**) y genera el informe Word. El informe, las evidencias, los resultados JSON y el reporte HTML quedan descargables como *artifact* `informe-pruebas-cinepass`. También se puede lanzar a mano con **Run workflow**.

## Estructura

| Archivo | Qué contiene |
|---|---|
| `01-cartelera.spec.js` | CP-01 a CP-06 · cartelera, búsqueda, filtros, detalle y 404 |
| `02-cuentas.spec.js` | CP-07 a CP-12 · registro, validaciones, login y bloqueo |
| `03-compra.spec.js` | CP-13 a CP-17 · flujo de compra, pagos y límites |
| `04-reservas.spec.js` | CP-18 a CP-21 · mis reservas, edición, cancelación y privacidad |
| `05-dulceria-admin.spec.js` | CP-22 a CP-24 · carrito de dulcería y panel de administración |
| `06-tmdb.spec.js` | CP-25 y CP-26 · cartelera y detalle desde TMDB (simulado) y respaldo local si TMDB falla |
| `datos/tmdb-simulado.json` | respuestas fijas que imitan al proxy de TMDB |
| `utilidades.js` | pasos reutilizables (iniciar sesión, comprar, capturas, simular TMDB) |
| `casos.js` | objetivo, pasos y resultado esperado de cada caso (para el informe) |
| `generar-informe.js` | genera `informe-pruebas.docx` desde los resultados y las capturas |
| `informe-datos.json` | integrantes que aparecen en la portada del informe |
| `preparar.js` | vacía `evidencias/` antes de cada corrida |
| `capturas-reales.js` | capturas ilustrativas con TMDB en vivo para el Anexo A (no es una prueba) |
| `servidor.js` | servidor local que Playwright levanta solo (puerto 4173) |
| `evidencias/` | capturas de cada paso clave, regeneradas en cada ejecución |
| `resultados/` | `resultados.json` (reporter json) y artefactos de pruebas fallidas |

Cada prueba arranca con el navegador limpio (sin datos guardados), así que se pueden correr en cualquier orden y repetir las veces que haga falta.
