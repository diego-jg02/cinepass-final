// Ejecuta las pruebas de navegador contra Supabase (pruebas/07-supabase.spec.js) con CP_E2E_SUPABASE=1.
// Uso: npm run test:supabase   (requiere .env; para el Supabase local: npx supabase start && npm run bd:env-local)
const { spawnSync } = require('child_process');
const r = spawnSync('npx', ['playwright', 'test', 'pruebas/07-supabase.spec.js', ...process.argv.slice(2)], {
  stdio: 'inherit', shell: true, env: { ...process.env, CP_E2E_SUPABASE: '1' },
});
process.exit(r.status == null ? 1 : r.status);
