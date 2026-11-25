// Cloudflare Worker: proxy de solo lectura hacia TMDB.
// El token NO está en este archivo: se guarda como secreto TMDB_TOKEN en Cloudflare.
// Variable opcional ALLOWED_ORIGIN (ej. https://usuario.github.io) para que solo tu web pueda usarlo.
export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'accept',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'GET') return new Response('Método no permitido', { status: 405, headers: cors });

    const u = new URL(req.url);
    // Solo se permiten las rutas que usa CinePass (/movie/now_playing y /movie/:id)
    if (!/^\/movie\/(now_playing|\d+)$/.test(u.pathname)) return new Response('No encontrado', { status: 404, headers: cors });

    const destino = new URL('https://api.themoviedb.org/3' + u.pathname + u.search);
    destino.searchParams.delete('api_key');
    const r = await fetch(destino, {
      headers: { Authorization: 'Bearer ' + env.TMDB_TOKEN, accept: 'application/json' },
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    return new Response(r.body, {
      status: r.status,
      headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600' },
    });
  },
};
