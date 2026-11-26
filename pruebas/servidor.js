// Servidor estático mínimo para CinePass (sin dependencias). Lo usa Playwright para levantar la app.
const http = require('http');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const PUERTO = Number(process.env.PORT) || 4173;
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const archivo = path.join(RAIZ, ruta === '/' ? 'index.html' : ruta);
  if (!archivo.startsWith(RAIZ)) { res.writeHead(403); return res.end(); }
  fs.readFile(archivo, (err, datos) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream' });
    res.end(datos);
  });
}).listen(PUERTO, '127.0.0.1', () => console.log(`CinePass en http://localhost:${PUERTO}`));
