// Configuración pública de CinePass. Aquí NO va ningún token secreto ni contraseña.
// proxy: URL de tu Cloudflare Worker (worker/tmdb-proxy.js), ej. 'https://cinepass-tmdb.tu-usuario.workers.dev'.
// Vacío = se muestran las películas locales de ejemplo.
window.TMDB_CONFIG={proxy:'https://cinepass-tmdb.cinepass-final.workers.dev'};

// Supabase (base de datos centralizada). Ver supabase/README.md.
//   url: Project URL (Supabase → Project Settings → API), ej. 'https://abcdefghijkl.supabase.co'
//   key: clave PÚBLICA "publishable" (sb_publishable_…) o "anon". Es segura en el navegador porque
//        las tablas están protegidas con RLS y las escrituras pasan por funciones del servidor.
//   NUNCA pongas aquí la clave service_role / secret: daría acceso total a la base de datos.
// Vacío = la app funciona como antes, con localStorage (modo demostración sin conexión).
window.SUPABASE_CONFIG={url:'',key:''};
