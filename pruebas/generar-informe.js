// Genera pruebas/informe-pruebas.docx (informe de evidencias para la universidad) a partir de:
//   - pruebas/resultados/resultados.json  → resultados reales de la última corrida (reporter json de Playwright)
//   - pruebas/evidencias/*.png            → capturas de cada paso clave (las toma captura() en utilidades.js)
//   - pruebas/casos.js                    → objetivo, pasos y resultado esperado de cada caso, en lenguaje natural
//   - pruebas/informe-datos.json          → integrantes para la portada
// Uso: npm run informe   (corre las pruebas y luego este script)
//      node pruebas/generar-informe.js   (solo regenera el Word con la última corrida)
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, Header, Footer,
  AlignmentType, HeadingLevel, LevelFormat, WidthType, ShadingType, BorderStyle, PageNumber, PageBreak, Tab, TabStopType,
} = require('docx');

const RAIZ = path.join(__dirname, '..');
const RESULTADOS = path.join(__dirname, 'resultados', 'resultados.json');
const EVIDENCIAS = path.join(__dirname, 'evidencias');
const SALIDA = path.join(__dirname, 'informe-pruebas.docx');
const CASOS = require('./casos');
const DATOS = JSON.parse(fs.readFileSync(path.join(__dirname, 'informe-datos.json'), 'utf8'));

// Capturas ilustrativas con TMDB en vivo (npm run capturas-reales). Si no existen, el informe sale sin el Anexo A.
const CARPETA_REALES = path.join(__dirname, 'capturas-reales');
const REALES = (() => {
  const archivo = path.join(CARPETA_REALES, 'capturas.json');
  if (!fs.existsSync(archivo)) return null;
  const d = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  d.capturas = (d.capturas || []).map((k) => ({ ...k, ruta: path.join(CARPETA_REALES, k.archivo) })).filter((k) => fs.existsSync(k.ruta));
  if (!d.capturas.length) return null;
  const dias = (Date.now() - new Date(d.fecha).getTime()) / 864e5;
  if (dias > 7) console.warn(`Aviso: las capturas con TMDB en vivo tienen ${Math.floor(dias)} días; la cartelera pudo cambiar (npm run capturas-reales).`);
  return d;
})();

if (!fs.existsSync(RESULTADOS)) {
  console.error('No existe pruebas/resultados/resultados.json. Corre primero las pruebas: npx playwright test');
  process.exit(1);
}
const reporte = JSON.parse(fs.readFileSync(RESULTADOS, 'utf8'));

// ---------- Utilidades de formato ----------
const FUENTE = 'Calibri';
const AZUL = '1F3864';
const ANCHO_UTIL = 9360; // carta (12240) menos márgenes de 1" (1440 × 2), en DXA
const TZ = 'America/Panama';

const seg = (ms) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
const duracionLarga = (ms) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
};
const fechaLarga = (d) => d.toLocaleDateString('es-PA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
const horaCorta = (d) => d.toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const sinAnsi = (t) => String(t || '').replace(/\u001b\[[0-9;]*m/g, '');

const texto = (t, opc = {}) => new TextRun({ text: t, font: FUENTE, ...opc });
const parrafo = (hijos, opc = {}) =>
  new Paragraph({ children: (Array.isArray(hijos) ? hijos : [hijos]).map((h) => (typeof h === 'string' ? texto(h) : h)), spacing: { after: 120, line: 276 }, ...opc });
const etiqueta = (nombre, valor) => parrafo([texto(`${nombre}: `, { bold: true }), texto(valor)]);
const subtitulo = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [texto(t)] });

/** Ancho y alto en píxeles de un PNG (leídos de la cabecera IHDR). */
function tamanoPng(archivo) {
  const b = fs.readFileSync(archivo);
  return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20), datos: b };
}

/** Busca el archivo de una captura: la ruta del JSON o, si se generó en otra PC (p. ej. GitHub Actions), en pruebas/evidencias/. */
function rutaCaptura(adj) {
  if (adj.path && fs.existsSync(adj.path)) return adj.path;
  const local = path.join(EVIDENCIAS, path.basename(adj.path || ''));
  return fs.existsSync(local) ? local : null;
}

/**
 * Las capturas PNG a resolución completa harían un Word de más de 20 MB. Para el documento se
 * recomprimen a JPEG (calidad 85) con el Chromium de Playwright; los PNG de pruebas/evidencias/ no se tocan.
 * Con --png se insertan los PNG originales.
 */
async function prepararImagenes(rutas) {
  const mapa = new Map();
  const comoPng = () => { for (const r of rutas) mapa.set(r, { ...tamanoPng(r), tipo: 'png' }); return mapa; };
  if (process.argv.includes('--png')) return comoPng();
  let navegador;
  try {
    navegador = await require('@playwright/test').chromium.launch();
    const page = await navegador.newPage();
    for (const r of rutas) {
      const { ancho, alto, datos } = tamanoPng(r);
      const b64 = await page.evaluate(async ([src, calidad]) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const lienzo = document.createElement('canvas');
        lienzo.width = img.naturalWidth;
        lienzo.height = img.naturalHeight;
        lienzo.getContext('2d').drawImage(img, 0, 0);
        return lienzo.toDataURL('image/jpeg', calidad).split(',')[1];
      }, ['data:image/png;base64,' + datos.toString('base64'), 0.85]);
      mapa.set(r, { ancho, alto, datos: Buffer.from(b64, 'base64'), tipo: 'jpg' });
    }
    return mapa;
  } catch (e) {
    console.warn(`Aviso: no se pudieron comprimir las capturas (${e.message.split(/\r?\n/)[0]}); se usan los PNG originales.`);
    mapa.clear();
    return comoPng();
  } finally {
    if (navegador) await navegador.close();
  }
}

/**
 * Capturas de un caso, en orden: las evidencias que registró captura() (anotación "evidencia" con el
 * nombre del archivo de pruebas/evidencias/) y, si la prueba falló, la captura automática de Playwright.
 */
function capturasDe(t, r) {
  const anot = [...(r.annotations || []), ...(t.annotations || [])].filter((a) => a.type === 'evidencia');
  const vistas = new Set();
  const lista = [];
  for (const a of anot) {
    const [archivo, ...resto] = String(a.description).split(' | ');
    if (vistas.has(archivo)) continue;
    vistas.add(archivo);
    const ruta = path.join(EVIDENCIAS, archivo);
    lista.push({ pie: resto.join(' | ') || archivo, ruta: fs.existsSync(ruta) ? ruta : null, archivo });
  }
  if (!lista.length) { // resultados de una versión anterior de las pruebas, sin anotaciones
    for (const a of r.attachments || []) {
      if (a.contentType === 'image/png' && a.path && a.name !== 'screenshot') lista.push({ pie: a.name, ruta: rutaCaptura(a), archivo: path.basename(a.path) });
    }
  }
  for (const a of r.attachments || []) {
    if (a.name === 'screenshot' && a.contentType === 'image/png') lista.push({ pie: 'Captura automática en el momento del fallo', ruta: rutaCaptura(a), archivo: path.basename(a.path || '') });
  }
  return lista;
}

// ---------- Leer resultados del JSON de Playwright ----------
function recorrer(suite, archivo, salida) {
  const arch = suite.file || archivo;
  for (const spec of suite.specs || []) {
    for (const t of spec.tests || []) {
      if (t.status === 'skipped') continue; // p. ej. CP-27 a CP-32 cuando no se corren contra Supabase
      const r = t.results[t.results.length - 1] || { status: 'skipped', duration: 0, attachments: [], errors: [] };
      const id = (spec.title.match(/^CP-\d+/) || [''])[0];
      salida.push({
        id,
        nombre: spec.title.replace(/^CP-\d+\s*/, ''),
        archivo: path.basename(spec.file || arch),
        linea: spec.line,
        aprobada: t.status === 'expected' || t.status === 'flaky',
        estado: t.status,
        duracion: r.duration || 0,
        intentos: t.results.length,
        errores: (r.errors || []).map((e) => sinAnsi(e.message).split('\n').filter(Boolean).slice(0, 4).join(' ')),
        capturas: capturasDe(t, r),
      });
    }
  }
  for (const s of suite.suites || []) recorrer(s, arch, salida);
}
const casos = [];
for (const s of reporte.suites || []) recorrer(s, s.file, casos);
casos.sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true }));

const stats = reporte.stats || {};
const inicio = new Date(stats.startTime || Date.now());
const aprobadas = casos.filter((c) => c.aprobada).length;
const fallidas = casos.length - aprobadas;
const meta = (reporte.config && reporte.config.metadata) || {};
const proyecto = ((reporte.config && reporte.config.projects) || [])[0] || {};
const versionPw = (reporte.config && reporte.config.version) || '';

async function main() {
const IMAGENES = await prepararImagenes([...new Set([
  ...casos.flatMap((c) => c.capturas.map((k) => k.ruta).filter(Boolean)),
  ...(REALES ? REALES.capturas.map((k) => k.ruta) : []),
])]);

// ---------- Portada ----------
const logo = tamanoPng(path.join(RAIZ, 'img', 'logo.png'));
const anchoLogo = 300;
const integrantes = (DATOS.integrantes || []).filter(Boolean);
if (!integrantes.length) console.warn('Aviso: faltan los integrantes en pruebas/informe-datos.json; la portada mostrará un recordatorio.');

const portada = [
  new Paragraph({ spacing: { before: 1800, after: 600 }, alignment: AlignmentType.CENTER, children: [
    new ImageRun({ type: 'png', data: logo.datos, transformation: { width: anchoLogo, height: Math.round(anchoLogo * logo.alto / logo.ancho) }, altText: { title: 'Logo de CinePass', description: 'Logo de CinePass', name: 'logo' } }),
  ] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [texto('CinePass', { bold: true, size: 56, color: AZUL })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [texto('Pruebas E2E con Playwright', { size: 36, color: AZUL })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 1400 }, children: [texto('Informe de evidencias de las pruebas automatizadas', { size: 24, italics: true, color: '595959' })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [texto('Integrantes', { bold: true, size: 26 })] }),
  ...(integrantes.length
    ? integrantes.map((n) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [texto(n, { size: 24 })] }))
    : [new Paragraph({ alignment: AlignmentType.CENTER, children: [texto('(completar en pruebas/informe-datos.json)', { size: 24, color: 'C00000' })] })]),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1000 }, children: [texto(fechaLarga(inicio), { size: 24 })] }),
  new Paragraph({ children: [new PageBreak()] }),
];

// ---------- Introducción ----------
const introduccion = [
  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [texto('1. Introducción')] }),
  parrafo(`Este informe reúne las evidencias de las ${casos.length} pruebas de extremo a extremo (E2E) de CinePass, una aplicación web para reservar entradas de cine. Las pruebas recorren la aplicación como lo haría un usuario real: cartelera y búsqueda, cuentas, compra de entradas, reservas, alimentos, panel de administración y conexión con TMDB. Cada caso incluye su objetivo, los pasos que realiza, el resultado esperado, el resultado obtenido y las capturas de pantalla de los pasos clave.`),
  etiqueta('Herramienta', `Playwright Test${versionPw ? ' ' + versionPw : ''}, que automatiza un navegador real y comprueba lo que aparece en pantalla.`),
  etiqueta('Navegador', `Chromium (proyecto "${proyecto.name || 'Escritorio (Chrome)'}"), con ventana de 1366 × 820 píxeles, idioma es-PA y zona horaria America/Panama.`),
  etiqueta('Entorno', `${meta.sistema || 'sin dato'}, Node.js ${meta.node || 'sin dato'}. La aplicación se sirve en http://localhost:4173 con un servidor local (pruebas/servidor.js). Las pruebas se ejecutan una por una y cada una empieza con el navegador limpio, sin datos guardados.`),
  etiqueta('Ejecución', `${fechaLarga(inicio)} a las ${horaCorta(inicio)}, con una duración total de ${duracionLarga(stats.duration || 0)}.`),
  parrafo([texto('Cómo se simula TMDB: ', { bold: true }), texto('la aplicación obtiene la cartelera de TMDB (The Movie Database) a través de un proxy en Cloudflare. Para que los resultados no dependan de qué películas estén en cines esa semana, las pruebas CP-01 a CP-24 bloquean TMDB y la aplicación usa sus 8 películas locales. El flujo con TMDB se prueba aparte en CP-25 y CP-26: con page.route() de Playwright se intercepta el proxy y se responde con datos fijos del archivo pruebas/datos/tmdb-simulado.json (películas ficticias) o con un error 500. Ninguna prueba usa la red real ni el token de TMDB.')]),
];

// ---------- Tabla resumen ----------
const COLS = [900, 4560, 2100, 1000, 800];
const borde = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };
const bordes = { top: borde, bottom: borde, left: borde, right: borde };
const celda = (contenido, ancho, { cabecera = false, centrado = false, emoji = false } = {}) =>
  new TableCell({
    width: { size: ancho, type: WidthType.DXA },
    borders: bordes,
    shading: cabecera ? { fill: AZUL, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ alignment: centrado ? AlignmentType.CENTER : AlignmentType.LEFT, children: [
      texto(contenido, { size: 18, bold: cabecera, color: cabecera ? 'FFFFFF' : undefined, ...(emoji ? { font: 'Segoe UI Emoji' } : {}) }),
    ] })],
  });
const tabla = new Table({
  width: { size: ANCHO_UTIL, type: WidthType.DXA },
  columnWidths: COLS,
  rows: [
    new TableRow({ tableHeader: true, children: ['ID', 'Nombre', 'Archivo', 'Resultado', 'Duración'].map((t, i) => celda(t, COLS[i], { cabecera: true, centrado: i !== 1 })) }),
    ...casos.map((c) => new TableRow({ cantSplit: true, children: [
      celda(c.id, COLS[0], { centrado: true }),
      celda(c.nombre, COLS[1]),
      celda(c.archivo, COLS[2]),
      celda(c.aprobada ? '✅' : '❌', COLS[3], { centrado: true, emoji: true }),
      celda(seg(c.duracion), COLS[4], { centrado: true }),
    ] })),
  ],
});
const resumen = [
  new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [texto('2. Resumen de resultados')] }),
  parrafo(`Se ejecutaron ${casos.length} casos: ${aprobadas} aprobados (✅) y ${fallidas} fallidos (❌).`),
  tabla,
];

// ---------- Una sección por caso ----------
let figura = 0;
const ANCHO_IMG = 576; // 6 pulgadas a 96 ppp
const secciones = [new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [texto('3. Casos de prueba')] })];
casos.forEach((c, i) => {
  const d = CASOS[c.id];
  if (!d) console.warn(`Aviso: ${c.id} no tiene descripción en pruebas/casos.js`);
  secciones.push(new Paragraph({ heading: HeadingLevel.HEADING_2, pageBreakBefore: i > 0, children: [texto(`${c.id} · ${c.nombre}`)] }));
  secciones.push(parrafo([texto('Archivo: ', { bold: true }), texto(`pruebas/${c.archivo} (línea ${c.linea})`, { font: 'Consolas', size: 20 })]));
  secciones.push(subtitulo('Objetivo'), parrafo(d ? d.objetivo : 'Sin descripción.'));
  secciones.push(subtitulo('Pasos'));
  for (const p of d ? d.pasos : []) {
    secciones.push(new Paragraph({ numbering: { reference: 'pasos', level: 0, instance: i + 1 }, spacing: { after: 60, line: 276 }, children: [texto(p)] }));
  }
  secciones.push(subtitulo('Resultado esperado'), parrafo(d ? d.esperado : 'Sin descripción.'));
  secciones.push(subtitulo('Resultado obtenido'));
  if (c.aprobada) {
    secciones.push(parrafo([
      texto('✅ ', { font: 'Segoe UI Emoji' }),
      texto('Aprobada', { bold: true, color: '2E7D32' }),
      texto(` en ${seg(c.duracion)}. Se cumplieron todas las verificaciones de la prueba${c.estado === 'flaky' ? ' (pasó al reintentarla)' : ''}.`),
    ]));
  } else {
    secciones.push(parrafo([texto('❌ ', { font: 'Segoe UI Emoji' }), texto(c.estado === 'skipped' ? 'No ejecutada' : 'Fallida', { bold: true, color: 'C00000' }), texto(` después de ${seg(c.duracion)}.`)]));
    for (const e of c.errores) secciones.push(parrafo([texto('Error: ', { bold: true }), texto(e, { font: 'Consolas', size: 18 })]));
  }
  secciones.push(subtitulo('Evidencias'));
  const caps = c.capturas.filter((k) => k.ruta);
  if (!caps.length) secciones.push(parrafo(texto('No se encontraron capturas para este caso.', { italics: true, color: 'C00000' })));
  for (const k of caps) {
    const img = IMAGENES.get(k.ruta);
    figura += 1;
    secciones.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 60 }, children: [
      new ImageRun({ type: img.tipo, data: img.datos, transformation: { width: ANCHO_IMG, height: Math.round(ANCHO_IMG * img.alto / img.ancho) },
        altText: { title: k.pie, description: k.pie, name: k.archivo } }),
    ] }));
    secciones.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [
      texto(`Figura ${figura}. `, { bold: true, size: 18, color: '404040' }),
      texto(`${c.id}: ${k.pie}`, { italics: true, size: 18, color: '404040' }),
      texto(`  (${k.archivo})`, { size: 16, color: '808080' }),
    ] }));
  }
});

// ---------- Observaciones y limitaciones ----------
const vineta = (t) => new Paragraph({ numbering: { reference: 'vinetas', level: 0 }, spacing: { after: 80, line: 276 }, children: [texto(t)] });
const observaciones = [
  new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [texto('4. Observaciones y limitaciones')] }),
  vineta(REALES
    ? 'Las pruebas automatizadas usan las películas locales y TMDB simulado para dar siempre el mismo resultado; las capturas con la cartelera real del Anexo A son solo ilustrativas y dependen de las películas en cines esa semana.'
    : 'Las pruebas automatizadas usan las películas locales y TMDB simulado para dar siempre el mismo resultado; la cartelera real de TMDB cambia cada semana y por eso no se usa en las pruebas.'),
  vineta('Las pruebas se ejecutan solo en Chromium de escritorio (ventana de 1366 × 820); no se probaron otros navegadores ni pantallas de celular.'),
  vineta('CinePass no tiene servidor propio: usuarios, reservas y pedidos se guardan en el almacenamiento local del navegador, y los pagos se validan en pantalla sin conectarse a un banco ni a una pasarela de pago.'),
  vineta('Los horarios, las salas y los asientos son datos locales de demostración; TMDB solo aporta la información de las películas.'),
];

// ---------- Conclusión ----------
const conclusion = [
  new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [texto('5. Conclusión')] }),
  parrafo(`De los ${casos.length} casos ejecutados, ${aprobadas} fueron aprobados y ${fallidas} fallaron. El tiempo total de la ejecución fue de ${duracionLarga(stats.duration || 0)} y se tomaron ${figura} capturas de evidencia.`),
  fallidas
    ? parrafo(`Los casos que fallaron fueron: ${casos.filter((c) => !c.aprobada).map((c) => c.id).join(', ')}. El detalle del error de cada uno aparece en su sección y en el reporte HTML de Playwright (pruebas/reporte), que guarda la traza para revisarla paso a paso.`)
    : parrafo('Todos los casos se cumplieron: la aplicación responde como se espera en la cartelera y la búsqueda, el registro y el inicio de sesión, la compra con sus validaciones de pago, la gestión de reservas, el carrito de alimentos, el control de acceso al panel de administración y la carga de películas desde TMDB, incluido el respaldo con películas locales cuando TMDB no responde.'),
  parrafo('Las pruebas se pueden repetir en cualquier momento con el comando npm run informe, que vuelve a ejecutar los casos y genera este documento con los resultados y capturas de esa corrida. En GitHub Actions se ejecutan en cada push y pull request, y el informe, las capturas y los resultados quedan disponibles para descargar.'),
];

// ---------- Anexo A: la aplicación con TMDB en vivo (solo si se corrió pruebas/capturas-reales.js) ----------
const anexo = [];
if (REALES) {
  const tomadas = new Date(REALES.fecha);
  anexo.push(
    new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [texto('Anexo A. La aplicación con TMDB en vivo')] }),
    parrafo(`Estas capturas muestran CinePass con la cartelera real de TMDB. Se tomaron el ${fechaLarga(tomadas)} a las ${horaCorta(tomadas)} con el script pruebas/capturas-reales.js, que abre la aplicación sin bloquear TMDB y espera a que carguen los pósters antes de cada captura.`),
    parrafo([texto('Importante: ', { bold: true }), texto('las capturas son ilustrativas. Dependen de las películas que estaban en cines esa semana, así que cambian de una semana a otra. Por eso no forman parte de las pruebas automatizadas, que usan las películas locales y TMDB simulado para dar siempre el mismo resultado.')]),
    parrafo(`Películas que devolvió TMDB ese día: ${REALES.peliculas.join(', ')}.`),
  );
  REALES.capturas.forEach((k, n) => {
    const img = IMAGENES.get(k.ruta);
    anexo.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 160, after: 60 }, children: [
      new ImageRun({ type: img.tipo, data: img.datos, transformation: { width: ANCHO_IMG, height: Math.round(ANCHO_IMG * img.alto / img.ancho) },
        altText: { title: k.pie, description: k.pie, name: k.archivo } }),
    ] }));
    anexo.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [
      texto(`Figura A.${n + 1}. `, { bold: true, size: 18, color: '404040' }),
      texto(k.pie, { italics: true, size: 18, color: '404040' }),
      texto(`  (${k.archivo})`, { size: 16, color: '808080' }),
    ] }));
  });
}

// ---------- Documento ----------
const encabezado = new Header({ children: [new Paragraph({
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF', space: 4 } },
  tabStops: [{ type: TabStopType.RIGHT, position: ANCHO_UTIL }],
  children: [texto('CinePass · Pruebas E2E con Playwright', { size: 16, color: '808080' }), new TextRun({ children: [new Tab(), fechaLarga(inicio)], font: FUENTE, size: 16, color: '808080' })],
})] });
const pie = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
  texto('Página ', { size: 16, color: '808080' }), new TextRun({ children: [PageNumber.CURRENT], font: FUENTE, size: 16, color: '808080' }),
  texto(' de ', { size: 16, color: '808080' }), new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FUENTE, size: 16, color: '808080' }),
] })] });

const doc = new Document({
  creator: 'CinePass',
  title: 'CinePass · Informe de pruebas E2E con Playwright',
  description: 'Evidencias de las pruebas automatizadas de CinePass',
  styles: {
    default: { document: { run: { font: FUENTE, size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FUENTE, size: 32, bold: true, color: AZUL }, paragraph: { spacing: { before: 240, after: 200 }, keepNext: true, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FUENTE, size: 28, bold: true, color: AZUL }, paragraph: { spacing: { before: 120, after: 160 }, keepNext: true, outlineLevel: 1,
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: AZUL, space: 4 } } } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FUENTE, size: 23, bold: true, color: '2F5496' }, paragraph: { spacing: { before: 160, after: 60 }, keepNext: true, outlineLevel: 2 } },
    ],
  },
  numbering: { config: [
    { reference: 'pasos', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
    { reference: 'vinetas', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
  ] },
  sections: [
    { properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }, children: portada },
    { properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      headers: { default: encabezado }, footers: { default: pie },
      children: [...introduccion, ...resumen, ...secciones, ...observaciones, ...conclusion, ...anexo] },
  ],
});

const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(SALIDA, buf);
  const sinCapturas = casos.filter((c) => !c.capturas.some((k) => k.ruta)).map((c) => c.id);
  console.log(`Informe generado: ${path.relative(RAIZ, SALIDA)}`);
  console.log(`  ${casos.length} casos · ${aprobadas} aprobados · ${fallidas} fallidos · ${figura} capturas · ${duracionLarga(stats.duration || 0)}`);
  if (sinCapturas.length) console.warn(`  Casos sin capturas: ${sinCapturas.join(', ')}`);
  console.log(REALES ? `  Anexo A con ${REALES.capturas.length} capturas de TMDB en vivo (${fechaLarga(new Date(REALES.fecha))})` : '  Sin Anexo A (no hay capturas de TMDB en vivo; se toman con npm run capturas-reales)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
