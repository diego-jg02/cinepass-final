// CinePass · Capa de datos.
// Misma interfaz para dos modos:
//   · 'supabase': base de datos centralizada (PostgreSQL + Supabase Auth). Se activa si js/config.js
//     trae SUPABASE_CONFIG.url y SUPABASE_CONFIG.key (clave pública "publishable"/"anon", nunca service_role).
//   · 'local':    localStorage, como funcionaba antes (demo sin conexión y pruebas E2E existentes).
// Las vistas de js/app.js leen de forma síncrona (DB.reservas(), DB.pedidos(), DB.usuarios()); en modo
// Supabase esas lecturas salen de una caché que se refresca con DB.sincronizar() antes de dibujar.
// Toda escritura en Supabase pasa por funciones RPC que validan en el servidor (ver supabase/migrations).
(function () {
  const cfg = window.SUPABASE_CONFIG || {};
  const remoto = !!(cfg.url && cfg.key);

  const leer = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const guardar = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  class ErrorDB extends Error {
    constructor(codigo, mensaje, extra) { super(mensaje); this.codigo = codigo; Object.assign(this, extra || {}); }
  }

  // Convierte los errores de Supabase/PostgREST (p. ej. "ASIENTO_OCUPADO: A5, A6") en ErrorDB.
  function traducir(error) {
    if (error instanceof ErrorDB) return error;
    const texto = (error && error.message) || '';
    const m = /^([A-Z_]+):\s*([\s\S]*)$/.exec(texto);
    if (m) {
      const extra = {};
      if (m[1] === 'ASIENTO_OCUPADO' && /^[A-H]\d/.test(m[2])) extra.asientos = m[2].split(/,\s*/);
      return new ErrorDB(m[1], m[2], extra);
    }
    if (/JWT|PGRST30[0-3]/.test(texto + ((error && error.code) || ''))) return new ErrorDB('NO_AUTENTICADO', 'Tu sesión expiró. Inicia sesión de nuevo.');
    if (error instanceof TypeError || /fetch|network|Failed to/i.test(texto)) return new ErrorDB('RED', 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
    console.error('Error de base de datos:', error);
    return new ErrorDB('DESCONOCIDO', 'Ocurrió un error al procesar la operación. Inténtalo de nuevo.');
  }

  const codigo = (largo) => [...Array(largo)].map(() => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.random() * 31 | 0]).join('');

  /* ======================= MODO LOCAL (localStorage) ======================= */
  const local = {
    usuarios() {
      const u = leer('cp_u', []);
      if (!u.length) {
        u.push({ n: 'Cliente Demo', e: 'demo@cinepass.test', p: 'Demo1234!', t: '6000-0000', role: 'user' });
        u.push({ n: 'Administrador CinePass', e: 'admin@cinepass.com', p: 'Admin1234!', t: '6999-9999', role: 'admin' });
        guardar('cp_u', u);
      } else if (!u.some(x => x.e === 'admin@cinepass.com')) {
        u.push({ n: 'Administrador CinePass', e: 'admin@cinepass.com', p: 'Admin1234!', t: '6999-9999', role: 'admin' });
        guardar('cp_u', u);
      }
      return u;
    },
    reservas: () => leer('cp_r', []),
    pedidos: () => leer('cp_o', []),
    tomados(fid, excluir) {
      const s = new Set();
      local.reservas().filter(r => r.fn === fid && r.estado === 'Confirmada' && r.cod !== excluir).forEach(r => r.seats.forEach(x => s.add(x)));
      return s;
    },
    async login(e, p) {
      const u = local.usuarios().find(x => x.e === e && x.p === p);
      if (!u) throw new ErrorDB('CREDENCIALES', 'Correo o contraseña incorrectos.');
      return { n: u.n, e: u.e, role: u.role || 'user' };
    },
    async registrar({ n, e, t, p }) {
      const u = local.usuarios();
      if (u.some(x => x.e === e)) throw new ErrorDB('DUPLICADO', 'Este correo ya está registrado. Por favor inicia sesión.');
      u.push({ n, e, p, t: t || '', role: 'user' });
      guardar('cp_u', u);
      return { n, e, role: 'user' };
    },
    async confirmar({ f, pt, tix, seats, tot, l4, metodo, u }) {
      const a = local.reservas();
      const ocup = local.tomados(f.id);
      const malos = seats.filter(s => ocup.has(s));
      if (malos.length) throw new ErrorDB('ASIENTO_OCUPADO', malos.join(', '), { asientos: malos });
      const cod = 'CP-' + codigo(6);
      a.push({ cod, u, fn: f.id, tix, seats, tot, l4, metodo, estado: 'Confirmada', f: { ...f }, pt, hist: [['Confirmada', 'Sistema (' + metodo + ')', Date.now()]] });
      guardar('cp_r', a);
      return { cod };
    },
    async cambiarAsientos(cod, seats, tot) {
      const a = local.reservas(), r = a.find(x => x.cod === cod);
      if (!r) throw new ErrorDB('NO_ENCONTRADA', 'La reserva no existe.');
      r.seats = [...seats]; r.tot = tot; r.hist.push(['Asientos modificados', 'Cliente', Date.now()]);
      guardar('cp_r', a);
      return { cod, seats: r.seats };
    },
    async cancelar(cod, actor) {
      const a = local.reservas(), r = a.find(x => x.cod === cod);
      if (!r) throw new ErrorDB('NO_ENCONTRADA', 'La reserva no existe.');
      r.estado = 'Cancelada'; r.hist.push(['Cancelada', actor, Date.now()]);
      guardar('cp_r', a);
    },
    async guardarPedido({ cod, items, tot, res, u }) {
      const a = local.pedidos(), o = { cod: cod || 'PD-' + Math.random().toString(36).slice(2, 7).toUpperCase(), u, items, tot, res: res || '', estado: 'Recibido' };
      const i = a.findIndex(x => x.cod === o.cod);
      i >= 0 ? a[i] = o : a.push(o);
      guardar('cp_o', a);
      return { cod: o.cod, tot: o.tot };
    },
    async estadoPedido(cod, estado) {
      const a = local.pedidos(), it = a.find(o => o.cod === cod);
      if (it) { it.estado = estado; guardar('cp_o', a); }
    },
  };

  /* ======================= MODO SUPABASE ======================= */
  let sb = null, perfil = null;
  const cache = { r: [], o: [], u: [], occ: {} };
  const rolApp = r => (r === 'admin' ? 'admin' : 'user');
  const usuarioApp = p => ({ n: p.nombre, e: p.correo, role: rolApp(p.rol) });

  function cargarScript(src) {
    return new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar ' + src));
      document.head.append(s);
    });
  }

  async function cliente() {
    if (sb) return sb;
    if (!window.supabase) await cargarScript('js/vendor/supabase-2.119.2.js');
    sb = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true } });
    return sb;
  }

  async function rpc(nombre, args) {
    const c = await cliente();
    let res;
    try { res = await c.rpc(nombre, args); } catch (e) { throw traducir(e); }
    if (res.error) throw traducir(res.error);
    return res.data;
  }

  async function cargarPerfil(user) {
    const c = await cliente();
    const { data, error } = await c.from('perfiles').select('nombre,correo,telefono,rol').eq('id', user.id).maybeSingle();
    if (error) throw traducir(error);
    perfil = data || { nombre: (user.user_metadata && user.user_metadata.nombre) || user.email, correo: user.email, rol: 'cliente' };
    return usuarioApp(perfil);
  }

  const ms = t => new Date(t).getTime();
  function mapearReserva(x) {
    const f = x.funciones || {};
    const activos = (x.reserva_asientos || []).filter(a => a.activo || x.estado === 'Cancelada').map(a => a.asiento).sort();
    return {
      cod: x.codigo,
      u: (x.perfiles && x.perfiles.correo) || '',
      fn: x.funcion_id,
      tix: { G: x.boletos_general, N: x.boletos_nino, A: x.boletos_mayor },
      seats: activos,
      tot: +x.total,
      l4: x.referencia_pago,
      metodo: x.metodo_pago,
      estado: x.estado,
      f: { id: f.id, p: f.pelicula_id, ini: ms(f.inicio), sala: f.sala, fmt: f.formato, idi: f.idioma },
      pt: f.pelicula_titulo,
      hist: (x.reserva_historial || []).sort((a, b) => ms(a.fecha) - ms(b.fecha)).map(h => [h.evento, h.actor, ms(h.fecha)]),
    };
  }
  const mapearPedido = x => ({
    cod: x.codigo,
    u: (x.perfiles && x.perfiles.correo) || '',
    items: (x.pedido_items || []).map(i => [(i.productos && i.productos.nombre) || '?', i.cantidad]),
    tot: +x.total,
    res: (x.reservas && x.reservas.codigo) || '',
    estado: x.estado,
  });

  const supa = {
    async iniciar() {
      const c = await cliente();
      c.auth.onAuthStateChange((evento) => {
        if (evento === 'SIGNED_OUT') { perfil = null; cache.r = []; cache.o = []; cache.u = []; if (DB.alSalir) DB.alSalir(); }
        if (evento === 'PASSWORD_RECOVERY') DB.recuperando = true;
      });
      const { data } = await c.auth.getSession();   // también procesa los enlaces de correo (#access_token=…)
      if (!data.session) return null;
      try { return await cargarPerfil(data.session.user); }
      catch (e) { return { n: data.session.user.email, e: data.session.user.email, role: 'user' }; }
    },
    async login(e, p) {
      const c = await cliente();
      let res;
      try { res = await c.auth.signInWithPassword({ email: e, password: p }); } catch (x) { throw traducir(x); }
      if (res.error) {
        const m = res.error.message || '';
        if (/invalid login credentials/i.test(m)) throw new ErrorDB('CREDENCIALES', 'Correo o contraseña incorrectos.');
        if (/not confirmed/i.test(m)) throw new ErrorDB('SIN_CONFIRMAR', 'Debes confirmar tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.');
        if (/rate limit|too many/i.test(m)) throw new ErrorDB('LIMITE', 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.');
        throw traducir(res.error);
      }
      return cargarPerfil(res.data.user);
    },
    async registrar({ n, e, t, p }) {
      const c = await cliente();
      let res;
      try {
        res = await c.auth.signUp({ email: e, password: p, options: { data: { nombre: n, telefono: t || '' }, emailRedirectTo: location.origin + location.pathname } });
      } catch (x) { throw traducir(x); }
      if (res.error) {
        const m = res.error.message || '';
        if (/already registered|already exists/i.test(m)) throw new ErrorDB('DUPLICADO', 'Este correo ya está registrado. Por favor inicia sesión.');
        if (/password/i.test(m)) throw new ErrorDB('CLAVE_DEBIL', 'La contraseña no cumple los requisitos de seguridad.');
        if (/rate limit/i.test(m)) throw new ErrorDB('LIMITE', 'Demasiados registros seguidos. Espera unos minutos e inténtalo de nuevo.');
        throw traducir(res.error);
      }
      // Con "Confirm email" activo, Supabase no inicia sesión hasta confirmar (y no revela si el correo ya existía).
      if (!res.data.session) throw new ErrorDB('CONFIRMAR_CORREO', 'Te enviamos un correo para confirmar tu cuenta. Ábrelo y luego inicia sesión.');
      return cargarPerfil(res.data.user);
    },
    // Envía el enlace para definir una contraseña nueva (usuarios migrados u olvidos).
    async recuperarClave(e) {
      const c = await cliente();
      let res;
      try { res = await c.auth.resetPasswordForEmail(e, { redirectTo: location.origin + location.pathname }); } catch (x) { throw traducir(x); }
      if (res.error) {
        if (/rate limit|security purposes/i.test(res.error.message)) throw new ErrorDB('LIMITE', 'Ya enviamos un enlace hace poco. Espera unos minutos e inténtalo de nuevo.');
        throw traducir(res.error);
      }
    },
    async cambiarClave(p) {
      const c = await cliente();
      let res;
      try { res = await c.auth.updateUser({ password: p }); } catch (x) { throw traducir(x); }
      if (res.error) {
        if (/same|different/i.test(res.error.message)) throw new ErrorDB('CLAVE_IGUAL', 'La nueva contraseña debe ser distinta de la anterior.');
        if (/password/i.test(res.error.message)) throw new ErrorDB('CLAVE_DEBIL', 'La contraseña no cumple los requisitos de seguridad.');
        throw traducir(res.error);
      }
      return cargarPerfil(res.data.user);
    },
    async salir() {
      perfil = null; cache.r = []; cache.o = []; cache.u = [];
      const c = await cliente();
      await c.auth.signOut().catch(() => {});
    },
    async sincronizar() {
      const c = await cliente();
      const { data: s } = await c.auth.getSession();
      if (!s.session) { cache.r = []; cache.o = []; cache.u = []; return; }
      const admin = perfil && perfil.rol === 'admin';
      const [r, o, u] = await Promise.all([
        c.from('reservas').select('codigo,funcion_id,boletos_general,boletos_nino,boletos_mayor,total,metodo_pago,referencia_pago,estado,creada_en,' +
          'perfiles(correo),funciones(id,pelicula_id,pelicula_titulo,inicio,sala,formato,idioma),reserva_asientos(asiento,activo),reserva_historial(evento,actor,fecha)').order('creada_en'),
        c.from('pedidos').select('codigo,total,estado,creado_en,perfiles(correo),reservas(codigo),pedido_items(cantidad,productos(nombre))').order('creado_en'),
        admin ? c.from('perfiles').select('nombre,correo,telefono,rol').order('creado_en') : Promise.resolve({ data: [] }),
      ]);
      for (const x of [r, o, u]) if (x.error) throw traducir(x.error);
      cache.r = r.data.map(mapearReserva);
      cache.o = o.data.map(mapearPedido);
      cache.u = u.data.map(p => ({ n: p.nombre, e: p.correo, t: p.telefono, role: rolApp(p.rol) }));
    },
    async cargarOcupacion(fids) {
      if (!fids.length) return;
      const filas = await rpc('asientos_ocupados', { p_funciones: fids });
      fids.forEach(id => { cache.occ[id] = new Set(); });
      filas.forEach(x => cache.occ[x.funcion_id] && cache.occ[x.funcion_id].add(x.asiento));
    },
    tomados(fid, excluir) {
      const s = new Set(cache.occ[fid] || []);
      if (excluir) { const r = cache.r.find(x => x.cod === excluir); if (r) r.seats.forEach(x => s.delete(x)); }
      return s;
    },
    async confirmar({ f, pt, tix, seats, l4, metodo }) {
      const r = await rpc('confirmar_reserva', {
        p_funcion: { id: f.id, titulo: pt, formato: f.fmt, idioma: f.idi },
        p_boletos: tix, p_asientos: seats, p_metodo: metodo, p_referencia: String(l4 || ''),
      });
      return { cod: r.codigo, tot: +r.total };
    },
    async cambiarAsientos(cod, seats) {
      const r = await rpc('cambiar_asientos', { p_codigo: cod, p_asientos: seats });
      return { cod: r.codigo, seats: r.asientos };
    },
    cancelar: cod => rpc('cancelar_reserva', { p_codigo: cod }),
    async guardarPedido({ cod, cart, res }) {
      const items = {};
      Object.entries(cart).forEach(([id, n]) => { if (n > 0) items[id] = n; });
      const r = await rpc('guardar_pedido', { p_items: items, p_reserva_codigo: res || null, p_codigo: cod || null });
      return { cod: r.codigo, tot: +r.total };
    },
    estadoPedido: (cod, estado) => rpc('cambiar_estado_pedido', { p_codigo: cod, p_estado: estado }),
  };

  /* ======================= Interfaz pública ======================= */
  const DB = {
    remoto,
    modo: remoto ? 'supabase' : 'local',
    ErrorDB,
    alSalir: null,                      // app.js asigna qué hacer si la sesión se cierra en otra pestaña
    iniciar: () => (remoto ? supa.iniciar() : Promise.resolve(undefined)),
    sincronizar: () => (remoto ? supa.sincronizar() : Promise.resolve()),
    cargarOcupacion: fids => (remoto ? supa.cargarOcupacion(fids) : Promise.resolve()),
    reservas: () => (remoto ? cache.r : local.reservas()),
    pedidos: () => (remoto ? cache.o : local.pedidos()),
    usuarios: () => (remoto ? cache.u : local.usuarios()),
    tomados: (fid, excluir) => (remoto ? supa.tomados(fid, excluir) : local.tomados(fid, excluir)),
    login: (e, p) => (remoto ? supa : local).login(e, p),
    registrar: d => (remoto ? supa : local).registrar(d),
    salir: () => (remoto ? supa.salir() : Promise.resolve()),
    recuperando: false,                 // true si se abrió la app desde un enlace de "restablecer contraseña"
    recuperarClave: e => supa.recuperarClave(e),
    cambiarClave: p => supa.cambiarClave(p),
    confirmar: d => (remoto ? supa : local).confirmar(d),
    cambiarAsientos: (cod, seats, tot) => (remoto ? supa : local).cambiarAsientos(cod, seats, tot),
    cancelar: (cod, actor) => (remoto ? supa : local).cancelar(cod, actor),
    guardarPedido: d => (remoto ? supa : local).guardarPedido(d),
    estadoPedido: (cod, estado) => (remoto ? supa : local).estadoPedido(cod, estado),
    // Copia de seguridad: en modo Supabase exporta lo que el administrador puede ver (sin contraseñas).
    exportar: () => ({ origen: DB.modo, users: DB.usuarios(), reservas: DB.reservas(), orders: DB.pedidos(), exportedAt: new Date().toISOString() }),
    // Datos que quedaron en el localStorage de este navegador, para migrarlos con supabase/migrar.js.
    // Las contraseñas NO se exportan: los usuarios migrados definen una nueva.
    exportarLocalParaMigrar: () => ({
      origen: 'local', users: leer('cp_u', []).map(({ p, ...u }) => u), reservas: leer('cp_r', []), orders: leer('cp_o', []), exportedAt: new Date().toISOString(),
    }),
    restaurarLocal(json) {
      if (json.users) guardar('cp_u', json.users);
      if (json.reservas) guardar('cp_r', json.reservas);
      if (json.orders) guardar('cp_o', json.orders);
    },
    restablecerLocal() {
      ['cp_u', 'cp_r', 'cp_o'].forEach(k => localStorage.removeItem(k));
      local.usuarios();
    },
  };
  window.DB = DB;
})();
