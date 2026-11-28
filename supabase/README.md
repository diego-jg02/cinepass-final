# CinePass con Supabase

CinePass puede guardar usuarios, reservas y pedidos en una base de datos centralizada (Supabase + PostgreSQL)
en lugar de `localStorage`. Si `js/config.js` no trae datos de Supabase, la app funciona igual que antes
(modo local de demostración), así que nada se rompe mientras no se configure.

## Qué hay en esta carpeta

| Archivo | Para qué sirve |
|---|---|
| `migrations/20261127000000_esquema_cinepass.sql` | Tablas, relaciones, restricciones, funciones RPC y políticas RLS. Es el único script que hay que ejecutar. |
| `migrar.js` | Pasa a Supabase los usuarios, reservas y pedidos que estaban en `localStorage`. |
| `config.jsonc` | Configuración del Supabase **local** (CLI). No afecta al proyecto en la nube. |

## Cómo está protegida la base de datos

- **Contraseñas:** las maneja Supabase Auth (cifradas en `auth.users`). La app nunca las guarda.
- **Roles:** la tabla `perfiles` tiene `rol` = `cliente` o `admin`. Al registrarse, el rol siempre es
  `cliente`, aunque alguien intente enviar `admin` en los metadatos.
- **RLS activado en las 8 tablas:** cada cliente solo lee sus reservas, asientos, historial y pedidos.
  El administrador lee todo. Películas, funciones y productos son de lectura pública.
- **Sin escrituras directas:** `anon` y `authenticated` no tienen `INSERT/UPDATE/DELETE` sobre ninguna tabla.
  Todo pasa por funciones RPC (`confirmar_reserva`, `cambiar_asientos`, `cancelar_reserva`,
  `guardar_pedido`, `cambiar_estado_pedido`), que validan en el servidor y calculan el total con los
  precios de la base de datos, no con los que manda el navegador.
- **Doble reserva imposible:** `confirmar_reserva` corre en una sola transacción, toma un candado por función
  (`pg_advisory_xact_lock`) y comprueba la disponibilidad. Además, un índice único parcial sobre
  `(funcion_id, asiento)` de los asientos activos lo garantiza a nivel de PostgreSQL. Si el asiento ya está
  tomado, se devuelve `ASIENTO_OCUPADO: A5`, la app muestra un mensaje claro y no se guarda nada a medias.
  Las reservas de **funciones distintas** no se bloquean entre sí.

## Configurar un proyecto en la nube (supabase.com)

1. Crea un proyecto en <https://supabase.com/dashboard>.
2. **SQL Editor → New query:** pega el contenido completo de
   `migrations/20261127000000_esquema_cinepass.sql` y pulsa **Run**.
3. **Authentication → Sign In / Providers → Email:**
   - Para el proyecto académico se recomienda **desactivar "Confirm email"**, así las cuentas nuevas
     entran de inmediato. Si se deja activo, cada usuario debe confirmar su correo antes de iniciar sesión.
4. **Authentication → URL Configuration:**
   - *Site URL:* la dirección de GitHub Pages, p. ej. `https://diego-jg02.github.io/cinepass-final/`.
   - *Redirect URLs:* agrega esa misma URL y `http://localhost:4173/` (para probar en local).
     Se usa en los correos de "¿Olvidaste tu contraseña?".
5. **Project Settings → API Keys:** copia la *Project URL* y la clave **publishable** (`sb_publishable_…`).
   La clave `anon` (legacy) también sirve.
6. Edita `js/config.js`:
   ```js
   window.SUPABASE_CONFIG={url:'https://TU-PROYECTO.supabase.co',key:'sb_publishable_...'};
   ```
   Esta clave es pública y puede subirse a GitHub, porque la seguridad la dan RLS y las funciones RPC.
   **Nunca** pongas ahí la clave `secret` / `service_role`.
7. **Primer administrador:** regístrate en la app con tu correo y luego, en el SQL Editor, ejecuta:
   ```sql
   update public.perfiles set rol = 'admin' where correo = 'tu-correo@ejemplo.com';
   ```

### Sobre GitHub Pages y las variables de entorno

GitHub Pages solo sirve archivos estáticos: cualquier "variable de entorno" que se inyecte al publicar
termina visible en el JavaScript. Por eso el navegador usa **solo** la clave publishable (en `js/config.js`).
La clave secreta se usa únicamente en tu PC, en el archivo `.env` (incluido en `.gitignore`), para las
pruebas de base de datos y la migración.

## Variables de configuración

| Dónde | Variable | Valor | ¿Se sube a GitHub? |
|---|---|---|---|
| `js/config.js` | `SUPABASE_CONFIG.url` | Project URL | Sí |
| `js/config.js` | `SUPABASE_CONFIG.key` | Clave publishable / anon | Sí |
| `.env` (solo tu PC) | `SUPABASE_URL` | Project URL | **No** |
| `.env` (solo tu PC) | `SUPABASE_PUBLISHABLE_KEY` | Clave publishable | **No** |
| `.env` (solo tu PC) | `SUPABASE_SECRET_KEY` | Clave secreta (opcional: pruebas que crean usuarios, migración) | **Nunca** |

Copia `.env.ejemplo` como `.env` y complétalo.

## Entorno local (sin cuenta en la nube)

Requiere Docker Desktop encendido.

```bash
npx supabase start        # levanta Supabase en http://127.0.0.1:54321 y aplica la migración
npm run bd:env-local      # escribe .env con las claves locales de demostración
```

Para que la app use el Supabase local, pon en `js/config.js` la URL `http://127.0.0.1:54321` y la
publishable key que muestra `npx supabase status` (y no subas ese cambio). `npx supabase db reset` deja la
base de datos vacía otra vez; `npx supabase stop` la apaga.

## Pruebas

| Comando | Qué comprueba |
|---|---|
| `npm test` | Las 32 pruebas de navegador. Sin `CP_E2E_SUPABASE=1`, CP-27 a CP-32 se saltan y se prueba el modo local. |
| `npm run bd:verificar` | 20 verificaciones directas contra la base de datos: RLS, roles, reservas, sin reservas incompletas, 10 clientes que piden el mismo asiento a la vez, pedidos y administrador. |
| `npm run test:supabase` | CP-27 a CP-32 en el navegador contra Supabase: registro, reserva guardada, dos sesiones, mismo asiento a la vez, funciones distintas a la vez, cancelación, historial y panel admin. |
| `npm run bd:rnf16` | Prueba de carga RNF-16: 100 usuarios navegando y oleadas de 20 reservas simultáneas en 20 funciones distintas. Deja un informe JSON en `pruebas/bd/resultados/`. |

Los límites de RNF-01 a RNF-04 se escriben en `pruebas/bd/umbrales-rnf.json` (`limite_ms` y `rnf`).
Mientras estén en `null`, el informe del RNF-16 solo compara contra la medición sin carga y **no puede
decir si se cumple el requisito**.

Las pruebas de base de datos crean usuarios `bd-…@cinepass.test` y al final cancelan sus reservas.
Úsalas contra el Supabase local o un proyecto de pruebas, no contra uno con clientes reales.

## Migrar los datos que estaban en localStorage

1. En el navegador que tiene los datos, entra como administrador → **Panel Admin → Base de Datos** y
   descarga el JSON ("Descargar Copia de Seguridad" en modo local, o "Descargar datos antiguos de este
   navegador" si ya está conectado a Supabase).
2. En tu PC, con `.env` completo (incluida la clave secreta):
   ```bash
   npm run bd:migrar -- respaldo.json              # simulación: muestra lo que haría, no escribe nada
   npm run bd:migrar -- respaldo.json --aplicar    # migra de verdad
   ```
   Opciones: `--con-roles` (conserva los administradores), `--enviar-correos --url-app <url>` (envía a cada
   usuario el enlace para crear su contraseña).
3. Las contraseñas antiguas **no se migran**, porque estaban en texto plano. Cada cuenta se crea con una
   contraseña aleatoria y el usuario define la suya con "¿Olvidaste tu contraseña?".
4. El script es idempotente (omite correos y códigos que ya existen) y **no borra** nada del navegador.
   Borra `localStorage` solo después de comprobar que todo aparece en Supabase.

## Panel de administración en modo Supabase

- "Descargar Copia de Seguridad" exporta lo que el administrador ve en la base de datos.
- "Restaurar" y "Restablecer Datos de Demostración" **no** aparecen con Supabase conectado, para que un clic
  no borre las reservas de todos los usuarios. Esas operaciones se hacen desde el SQL Editor.
