// Escribe .env con los datos del Supabase LOCAL (npx supabase start) para correr las pruebas de base de datos.
// Las claves locales son las de demostración que trae la CLI de Supabase; no sirven fuera de tu PC.
// Para un proyecto en la nube, escribe .env a mano (ver .env.ejemplo) y nunca lo subas a GitHub.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const salida = execSync('npx supabase status -o json', { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const st = JSON.parse(salida.slice(salida.indexOf('{')));
const env = [
  '# Generado por pruebas/bd/env-local.js para el Supabase local. NO subir a GitHub.',
  `SUPABASE_URL=${st.API_URL}`,
  `SUPABASE_PUBLISHABLE_KEY=${st.PUBLISHABLE_KEY || st.ANON_KEY}`,
  `SUPABASE_SECRET_KEY=${st.SECRET_KEY || st.SERVICE_ROLE_KEY}`,
  '',
].join('\n');
fs.writeFileSync(path.join(__dirname, '..', '..', '.env'), env);
console.log(`.env listo para ${st.API_URL}`);
