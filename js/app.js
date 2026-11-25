// CinePass · SPA moderna y completa con persistencia en Base de Datos local.
const $ = s => document.querySelector(s), main = $('#main');
const norm = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $$ = n => '$' + Number(n || 0).toFixed(2), HOLD = 8 * 60000, CLOSE = 15 * 60000, EDIT = 2 * 3600000;

const ld = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
const sv = (k, v) => localStorage.setItem(k, JSON.stringify(v));

let S = JSON.parse(sessionStorage.getItem('cp_s') || '{"sel":null,"hold":0,"user":null,"res":null,"pm":"card","editingRes":null}');
const save = () => sessionStorage.setItem('cp_s', JSON.stringify(S));

// Capa de Base de Datos (Usuarios: Cliente y Administrador)
const users = () => {
  const u = ld('cp_u', []);
  if (!u.length) {
    u.push({ n: 'Cliente Demo', e: 'demo@cinepass.test', p: 'Demo1234!', t: '6000-0000', role: 'user' });
    u.push({ n: 'Administrador CinePass', e: 'admin@cinepass.com', p: 'Admin1234!', t: '6999-9999', role: 'admin' });
    sv('cp_u', u);
  } else if (!u.some(x => x.e === 'admin@cinepass.com')) {
    u.push({ n: 'Administrador CinePass', e: 'admin@cinepass.com', p: 'Admin1234!', t: '6999-9999', role: 'admin' });
    sv('cp_u', u);
  }
  return u;
};

const reservas = () => ld('cp_r', []).filter(r => fn(r.fn));
const fmtDia = t => new Date(t).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtHora = t => new Date(t).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
const fn = id => FN.find(f => f.id === id), peli = id => PELIS.find(p => p.id == id);
const vendible = f => f.ini - Date.now() > CLOSE;
const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const ROWS = 'ABCDEFGH'.split('');

function ocupados(f) {
  const o = new Set();
  ROWS.forEach((r, i) => { for (let c = 1; c <= 10; c++) if ((hash(f.id) + i * 7 + c * 13) % 100 < 22) o.add(r + c); });
  // Si estamos editando una reserva, sus asientos actuales quedan libres para re-seleccionar
  const curEdit = S.editingRes || null;
  reservas().filter(r => r.fn === f.id && r.estado === 'Confirmada' && r.cod !== curEdit).forEach(r => r.seats.forEach(s => o.add(s)));
  return o;
}
const libres = f => 80 - ocupados(f).size;
const precio = (f, t) => PRECIO[t] + (f.fmt === '3D' ? 2 : 0);
const extra = x => 'GH'.includes(x[0]) ? 2 : 0, acc = x => x === 'A1' || x === 'A10';
const nTix = () => S.sel ? Object.values(S.sel.tix).reduce((a, b) => a + b, 0) : 0;
const total = () => S.sel ? Object.entries(S.sel.tix).reduce((a, [t, n]) => a + n * precio(fn(S.sel.fn), t), 0) + (S.sel.seats || []).reduce((a, x) => a + extra(x), 0) : 0;
const badge = p => `<span class="bdg">${p.r ? '<img class="ic" src="img/icons/star.png" alt="" aria-hidden="true"> ' + (+p.r).toFixed(1) : CLAS[p.c]}</span>`;
const poster = p => p.img ? `<div class="poster has" style="--h:${p.h}"><img src="${p.img}" alt="Póster de ${esc(p.t)}" loading="lazy"></div>` : `<div class="poster" style="--h:${p.h}" role="img" aria-label="Póster de ${esc(p.t)}"><span>${esc(p.t)}</span></div>`;

/* ---------- Modales (M-xx) ---------- */
function modal(h, btns) {
  const d = document.createElement('dialog');
  d.innerHTML = `<div>${h}</div><div class="acts">${btns.map((b, i) => `<button class="${b.c || ''}" data-i="${i}">${b.l}</button>`).join('')}</div>`;
  d.addEventListener('click', e => { const i = e.target.dataset.i; if (i != null) { d.close(); d.remove(); btns[i].f && btns[i].f(); } });
  d.addEventListener('cancel', () => d.remove());
  document.body.append(d);
  d.showModal();
}
const go = h => { location.hash = h; };
const release = () => { S.hold = 0; S.sel = null; S.editingRes = null; save(); };

/* ---------- Encabezado con buscador en tiempo real ---------- */
function nav() {
  const u = S.user;
  const isAdmin = u && u.role === 'admin';
  $('#nav').innerHTML = `
    <a href="#/" data-leave>Inicio</a>
    <a href="#/cartelera" data-leave>Cartelera</a>
    <a href="#/alimentos" data-leave>Alimentos y bebidas</a>
    <a href="#/reservas" data-leave>Mis reservas</a>
    ${isAdmin ? '<a href="#/admin" class="admin-badge" data-leave>Panel Admin</a>' : ''}
    <form class="hs" id="hs" role="search">
      <input type="search" aria-label="Buscar películas" placeholder="Buscar películas, géneros..." value="${esc(F.q)}">
    </form>
    ${u ? `<span class="mut small">${esc(u.n.split(' ')[0])}${isAdmin ? ' (Admin)' : ''}</span><button id="out">Salir</button>` : `<a href="#/login" data-leave>Iniciar sesión</a><a href="#/registro" data-leave>Crear cuenta</a>`}
  `;

  // Búsqueda en tiempo real desde el encabezado
  const hsInput = $('#hs input');
  if (hsInput) {
    hsInput.oninput = e => {
      F.q = e.target.value;
      HM = 99;
      if (location.hash !== '#/' && location.hash !== '#/cartelera' && location.hash !== '') {
        go('#/cartelera');
      } else {
        const qCart = $('#q');
        if (qCart) qCart.value = F.q;
        draw();
      }
    };
  }

  $('#hs').onsubmit = e => {
    e.preventDefault();
    const v = $('#hs input').value;
    const ir = () => {
      F.q = v;
      HM = 99;
      if (location.hash === '#/cartelera') {
        const qCart = $('#q');
        if (qCart) qCart.value = F.q;
        draw();
      } else {
        go('#/cartelera');
      }
    };
    S.hold ? abandonar(ir) : ir();
  };

  const o = $('#out');
  if (o) o.onclick = () => {
    const x = () => { S.user = null; release(); nav(); go('#/'); };
    S.hold ? abandonar(x) : x();
  };
}

function abandonar(ok) {
  modal('<h2>¿Abandonar la reserva?</h2><p>Se liberarán los asientos retenidos y perderás la selección actual.</p>', [{ l: 'Salir', c: 'pri', f: () => { release(); ok(); } }, { l: 'Continuar aquí' }]);
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-leave]');
  if (a && S.hold) {
    e.preventDefault();
    abandonar(() => go(a.getAttribute('href')));
  }
});

/* ---------- Temporizador y pasos ---------- */
let tick;
const timerHTML = () => S.hold ? `<span class="timer" data-t role="timer" aria-label="Tiempo restante de la retención"></span>` : '';
function pasos(n) {
  return `<ol class="steps">${['Boletos', 'Asientos', 'Resumen', 'Pago'].map((s, i) => `<li class="${i + 1 === n ? 'on' : ''}" ${i + 1 === n ? 'aria-current="step"' : ''}>${i + 1} · ${s}</li>`).join('')}${timerHTML()}</ol>`;
}
function runTimer() {
  clearInterval(tick);
  const upd = () => {
    const el = document.querySelector('[data-t]');
    if (!S.hold) return;
    const ms = S.hold - Date.now();
    if (ms <= 0) {
      clearInterval(tick);
      release();
      modal('<h2>Retención expirada</h2><p>El tiempo terminó. Los asientos fueron liberados.</p>', [{ l: 'Volver a elegir asientos', c: 'pri', f: () => go('#/boletos') }, { l: 'Cambiar de función', f: () => go('#/') }]);
      return;
    }
    if (el) {
      const s = Math.ceil(ms / 1000);
      el.textContent = `Retención ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      el.classList.toggle('low', s < 60);
    }
  };
  upd();
  tick = setInterval(upd, 1000);
}

/* ---------- Router ---------- */
const R = { '': home, cartelera: () => { home(); setTimeout(() => $('#cartelera')?.scrollIntoView({ behavior: 'smooth' }), 60); }, alimentos, p: detalle, boletos, asientos, resumen, pago, resultado, login, registro, reservas: reservasView, reserva, admin: adminView };

function route() {
  const [a, b] = location.hash.slice(2).split('/');
  if (S.sel && !fn(S.sel.fn)) { S.sel = null; S.hold = 0; }
  nav();
  main.className = a === '' || a === 'cartelera' ? 'home' : '';
  document.body.classList.toggle('booking', ['boletos', 'asientos', 'resumen', 'pago', 'resultado', 'reservas', 'reserva', 'admin'].includes(a));
  (R[a] || nofound)(b);
  runTimer();
  main.focus();
  scrollTo(0, 0);
}
addEventListener('hashchange', route);
addEventListener('hashchange', () => document.querySelectorAll('dialog').forEach(d => d.remove()));
const nofound = () => main.innerHTML = `<section class="errp"><div><p class="eyebrow">Error 404</p><h1>Esta sala no existe</h1><p class="mut">La dirección no corresponde a ninguna pantalla.</p><a class="btn pri" href="#/">Volver al inicio</a></div></section>`;
const needSel = () => { if (!S.sel) { go('#/'); return true; } };

/* ---------- P-01 Inicio + cartelera con búsqueda avanzada ---------- */
let F = { q: '', g: [], c: [], i: [], f: [], d: '' }, QS = { d: 0, t: null }, HF = 0, HM = 99, heroT;
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
const dKey = t => new Date(t).toDateString(), dayN = i => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d; };
const cur = () => PELIS[HF % PELIS.length];

function iniciar(fid) {
  const g = () => { S.sel = { fn: fid, tix: { G: 1, N: 0, A: 0 }, seats: [] }; S.hold = 0; S.editingRes = null; save(); go('#/boletos'); };
  S.hold && S.sel && S.sel.fn !== fid ? abandonar(g) : g();
}

function slide(p, m) {
  const bg = p.bd ? ` style="background-image:linear-gradient(90deg,#050507ee,#050507aa 40%,#0000),url('${p.bd}')"` : '';
  return `<div class="sl" style="--h:${p.h}"><div class="sbg" data-t="${esc(p.t)}"${bg}></div>${m && p.img ? `<img class="sp" src="${p.img}" alt="Póster de ${esc(p.t)}">` : ''}<div class="sc"><p class="tag">${p.g} · ${p.d} min · ${CLAS[p.c]}</p>${m ? '<h1>' : '<h2>'}${esc(p.t)}${m ? '</h1>' : '</h2>'}${m ? `<p class="lead">${esc(p.s)}</p><div class="acts"><button class="pri" id="tr"><img class="ic" src="img/icons/play-dark.png" alt="" aria-hidden="true"> Ver tráiler</button><a class="btn" href="#/p/${p.id}" data-leave>Ver detalles</a></div>` : ''}</div>${m ? `<div class="ctrl"><span class="small mut">${HF % PELIS.length + 1} / ${PELIS.length}</span><button class="cir" data-step="-1" aria-label="Película anterior"><img class="ic" src="img/icons/prev.png" alt="" aria-hidden="true"></button><button class="cir" data-step="1" aria-label="Película siguiente"><img class="ic" src="img/icons/next.png" alt="" aria-hidden="true"></button></div>` : ''}</div>`;
}

function heroHTML() {
  const n = PELIS.length, i = HF % n;
  return `<section class="car" id="hero" aria-label="Películas destacadas"><div class="side l" data-step="-1" aria-hidden="true">${slide(PELIS[(i + n - 1) % n])}</div>${slide(PELIS[i], 1)}<div class="side r" data-step="1" aria-hidden="true">${slide(PELIS[(i + 1) % n])}</div></section>`;
}

function selector() {
  const p = cur(), dk = dKey(dayN(QS.d)), ts = FN.filter(f => f.p === p.id && dKey(f.ini) === dk && vendible(f));
  return `<div><h2 class="sm">Elige fecha</h2><div class="days" role="group" aria-label="Fecha">${[...Array(7)].map((_, i) => `<button data-qd="${i}" aria-pressed="${i === QS.d}">${dayN(i).toLocaleDateString('es', { weekday: 'short', day: 'numeric' })}</button>`).join('')}</div></div><div><h2 class="sm">Elige horario · ${esc(p.t)}</h2><div class="days" role="group" aria-label="Horario">${ts.map(f => `<button data-qt="${f.id}" aria-pressed="${QS.t === f.id}">${fmtHora(f.ini)}</button>`).join('') || '<span class="mut small">Sin funciones disponibles este día</span>'}</div></div><button class="pri" id="buy" ${QS.t ? '' : 'disabled'}>Comprar entradas</button>`;
}

function bindTop() {
  const p = cur();
  $('#tr').onclick = () => modal(p.yt ? `<h2>Tráiler · ${esc(p.t)}</h2><div style="aspect-ratio:16/9"><iframe src="https://www.youtube-nocookie.com/embed/${p.yt}" title="Tráiler de ${esc(p.t)}" style="width:100%;height:100%;border:0" allow="encrypted-media;picture-in-picture" allowfullscreen></iframe></div><p class="small"><a href="https://www.youtube.com/watch?v=${p.yt}" target="_blank" rel="noopener">Abrir en YouTube</a></p>` : `<h2>Tráiler · ${esc(p.t)}</h2><div class="poster" style="--h:${p.h};aspect-ratio:16/9" role="img" aria-label="Tráiler"><span><img class="ic" src="img/icons/play-dark.png" alt="" aria-hidden="true"> Tráiler</span></div>`, [{ l: 'Cerrar' }, { l: 'Reservar', c: 'pri', f: () => go('#/p/' + p.id) }]);
  main.querySelectorAll('[data-step]').forEach(b => b.onclick = () => {
    const n = PELIS.length, st = +b.dataset.step;
    HF = (HF % n + st + n) % n;
    QS.t = null;
    top_();
    const c = main.querySelector(`.ctrl [data-step="${st}"]`);
    if (c && b.classList.contains('cir')) c.focus();
  });
  main.querySelectorAll('[data-qd]').forEach(b => b.onclick = () => { QS.d = +b.dataset.qd; QS.t = null; top_(); });
  main.querySelectorAll('[data-qt]').forEach(b => b.onclick = () => { QS.t = b.dataset.qt; top_(); });
  $('#buy').onclick = () => iniciar(QS.t);
}

function top_() {
  $('#hero').outerHTML = heroHTML();
  $('#qs').innerHTML = selector();
  bindTop();
}

function promos() {
  const cb = MENU.filter(m => m.c === 'Combos');
  return `<section class="wrap promo" aria-label="Tarifas"><div class="rowh"><div><p class="eyebrow">Tarifas</p><h2>Elige tu entrada</h2></div></div><div class="rates">${Object.keys(TIPOS).map((t, i) => `<a class="rate r${i}" href="#/cartelera" data-leave><span class="small">${TIPOS[t]}</span><b>${$$(PRECIO[t])}</b><span class="small mut">${t === 'G' ? 'Acceso estándar' : 'Tarifa reducida en sala'}</span></a>`).join('')}<div class="rate r3"><span class="small">Extras</span><b>+${$$(2)}</b><span class="small mut">Formato 3D y asientos preferentes</span></div></div></section><section class="wrap"><div class="munch"><div class="mc"><p class="eyebrow">Alimentos y bebidas</p><h2>Palomitas y combos antes de la función</h2><p class="lead">${cb.map(m => `${m.n} ${$$(m.p)}`).join(' · ')}</p><a class="btn pri" href="#/alimentos" data-leave>Pedir ahora</a></div><div class="pop" aria-hidden="true"></div></div></section>`;
}

function home() {
  clearInterval(heroT);
  const op = (k, arr) => arr.map(v => `<label class="chip"><input type="checkbox" data-k="${k}" value="${esc(v)}" ${F[k].includes(v) ? 'checked' : ''}><span>${esc(k === 'c' ? CLAS[v] : v)}</span></label>`).join('');
  const uniq = f => [...new Set(PELIS.flatMap(f))], iso = d => d.toLocaleDateString('sv');

  main.innerHTML = heroHTML() + `
    <section class="wrap qs" id="qs"></section>
    <section class="wrap" id="cartelera">
      <div class="rowh">
        <div><p class="eyebrow">En cartelera</p><h2>Cartelera</h2></div>
        <button type="button" class="pill" id="all">Ver todo</button>
      </div>
      <details class="fdet" ${(F.q || F.d || F.g.length || F.c.length || F.i.length || F.f.length) ? 'open' : ''}>
        <summary>Filtros y búsqueda</summary>
        <form class="filters" role="search" onsubmit="return false">
          <div>
            <label for="q">Buscar película por título, género o sinopsis</label>
            <input type="search" id="q" value="${esc(F.q)}" placeholder="Escribe para buscar al instante..." autocomplete="off">
            <div class="err" id="qe"></div>
          </div>
          <div class="chips"><span class="l">Género</span>${op('g', uniq(p => [p.g]))}</div>
          <div class="chips"><span class="l">Clasificación</span>${op('c', ['A', 'B', 'C'])}</div>
          <div class="chips"><span class="l">Idioma</span>${op('i', uniq(p => p.i))}</div>
          <div class="chips"><span class="l">Formato</span>${op('f', uniq(p => p.fm))}</div>
          <div><label for="d">Fecha de función</label><input type="date" id="d" min="${iso(dayN(0))}" max="${iso(dayN(14))}" value="${F.d}"></div>
        </form>
      </details>
      <div class="tags" id="tags" aria-live="polite"></div>
      <p class="mut small" id="cnt"></p>
      <div id="res"></div>
    </section>` + promos();

  $('#qs').innerHTML = selector();
  bindTop();
  $('#all').onclick = () => { HM = 99; draw(); };

  $('#q').oninput = e => {
    F.q = e.target.value;
    HM = 99;
    const hi = $('#hs input');
    if (hi) hi.value = F.q;
    draw();
  };

  $('#d').onchange = e => { F.d = e.target.value; draw(); };
  main.querySelectorAll('.chip input').forEach(i => i.onchange = () => {
    const a = F[i.dataset.k];
    i.checked ? a.push(i.value) : a.splice(a.indexOf(i.value), 1);
    draw();
  });

  draw();
  if (!reduce) heroT = setInterval(() => {
    const h = $('#hero');
    if (!h) { clearInterval(heroT); return; }
    if (h.matches(':hover,:focus-within') || document.querySelector('dialog')) return;
    HF++; QS.t = null; top_();
  }, 9000);
}

function draw() {
  const q = norm(F.q.trim());
  const act = q;
  const list = PELIS.filter(p => {
    const fs = FN.filter(f => f.p === p.id && vendible(f));
    if (!fs.length) return false;
    if (act) {
      const matchTitle = norm(p.t).includes(act);
      const matchGenre = norm(p.g).includes(act);
      const matchSynopsis = norm(p.s).includes(act);
      const matchCast = p.cast && p.cast.some(c => norm(c).includes(act));
      const matchDir = p.dir && norm(p.dir).includes(act);
      const matchClas = CLAS[p.c] && norm(CLAS[p.c]).includes(act);
      const matchFmt = p.fm && p.fm.some(f => norm(f).includes(act));
      if (!matchTitle && !matchGenre && !matchSynopsis && !matchCast && !matchDir && !matchClas && !matchFmt) return false;
    }
    if (F.g.length && !F.g.includes(p.g)) return false;
    if (F.c.length && !F.c.includes(p.c)) return false;
    if (F.i.length && !fs.some(f => F.i.includes(f.idi))) return false;
    if (F.f.length && !fs.some(f => F.f.includes(f.fmt))) return false;
    if (F.d && !fs.some(f => new Date(f.ini).toLocaleDateString('sv') === F.d)) return false;
    return true;
  });

  const tags = [...F.g, ...F.c.map(c => CLAS[c]), ...F.i, ...F.f, ...(F.d ? [F.d] : [])];
  $('#tags').innerHTML = tags.length ? tags.map(t => `<button type="button" data-rm="${esc(t)}" aria-label="Quitar filtro ${esc(t)}">${esc(t)} <img class="ic" src="img/icons/close.png" alt="" aria-hidden="true"></button>`).join('') + '<button type="button" class="link" id="clr">Limpiar filtros</button>' : '';
  const clr = () => { F = { q: '', g: [], c: [], i: [], f: [], d: '' }; const hi = $('#hs input'); if (hi) hi.value = ''; home(); };
  if ($('#clr')) $('#clr').onclick = clr;
  $('#tags').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
    const t = b.dataset.rm;
    for (const k of ['g', 'i', 'f']) F[k] = F[k].filter(x => x !== t);
    F.c = F.c.filter(c => CLAS[c] !== t);
    if (F.d === t) F.d = '';
    home();
  });

  const resultMsg = F.q.trim() ? `${list.length} resultado${list.length === 1 ? '' : 's'} para "${esc(F.q.trim())}"` : `${list.length} película${list.length === 1 ? '' : 's'} disponible${list.length === 1 ? '' : 's'}`;
  $('#cnt').textContent = resultMsg;
  const shown = list.slice(0, HM);
  $('#res').innerHTML = list.length ? `<div class="grid">${shown.map(p => {
    const fs = FN.filter(f => f.p === p.id && vendible(f) && (!F.d || new Date(f.ini).toLocaleDateString('sv') === F.d)), k = fs[0] ? dKey(fs[0].ini) : '';
    return `<article class="film"><a href="#/p/${p.id}" data-leave aria-label="Detalles de ${esc(p.t)}">${poster(p)}${badge(p)}</a><h3>${esc(p.t)}</h3><p>${p.g} · ${p.d} min · ${CLAS[p.c]}</p><div class="tms" aria-label="Horarios ${fmtDia(fs[0].ini)}">${fs.filter(f => dKey(f.ini) === k).map(f => `<button class="tm" data-f="${f.id}" aria-label="Reservar ${esc(p.t)} ${fmtDia(f.ini)} ${fmtHora(f.ini)}">${fmtHora(f.ini)}</button>`).join('')}<span class="mut small">${fmtDia(fs[0].ini)}</span></div><a class="link small" href="#/p/${p.id}" data-leave>Ver detalles</a></article>`;
  }).join('')}</div>${list.length > HM ? '<div class="acts" style="justify-content:center;margin-top:34px"><button class="pri" id="more">Mostrar más</button></div>' : ''}`
  : `<div class="msg">No encontramos películas con los criterios seleccionados. <button type="button" class="link" id="clr2">Ver toda la cartelera</button></div>`;

  main.querySelectorAll('.tm').forEach(b => b.onclick = () => iniciar(b.dataset.f));
  if ($('#more')) $('#more').onclick = () => { HM += 8; draw(); };
  if ($('#clr2')) $('#clr2').onclick = clr;
}

/* ---------- P-02 Detalle y funciones ---------- */
let dia = 0;
const related = p => {
  const o = PELIS.filter(x => x.id !== p.id).slice(0, 6);
  return o.length ? `<section class="rel"><h2>Más en cartelera</h2><div class="rg">${o.map(x => `<a class="rm" href="#/p/${x.id}" data-leave aria-label="Detalles de ${esc(x.t)}">${poster(x)}${badge(x)}<b>${esc(x.t)}</b><span class="small mut">${x.g} · ${x.d} min</span></a>`).join('')}</div></section>` : '';
};

function detalle(id) {
  const p = peli(id);
  if (!p) return nofound();
  const fs = FN.filter(f => f.p === p.id);
  const dias = [...new Set(fs.map(f => new Date(f.ini).toDateString()))];
  const sel = dias[dia] || dias[0];
  const lista = fs.filter(f => new Date(f.ini).toDateString() === sel);
  main.innerHTML = `
    <a href="#/" class="link" data-leave><img class="ic" src="img/icons/arrow-left.png" alt="" aria-hidden="true"> Cartelera</a>
    <div class="dhero" style="--h:${p.h}${p.bd ? `;background-image:linear-gradient(0deg,#06060a,#0000 65%),url('${p.bd}')` : ''}"></div>
    <div class="detail">${poster(p)}<div>
      <p class="eyebrow">${p.g} · ${CLAS[p.c]} · ${p.d} min${p.fecha ? ' · Estreno ' + p.fecha : ''}</p>
      <h1>${esc(p.t)}</h1>
      <p style="max-width:52ch">${esc(p.s)}</p>
      <div class="facts">
        <span><i>Clasificación</i>${CLAS[p.c]}</span>
        <span><i>Duración</i>${p.d} min</span>
        <span><i>Género</i>${p.g}</span>
        ${p.r ? `<span><i>Valoración</i><img class="ic" src="img/icons/star.png" alt="" aria-hidden="true"> ${(+p.r).toFixed(1)}</span>` : ''}
        ${p.dir ? `<span><i>Dirección</i>${esc(p.dir)}</span>` : ''}
      </div>
      ${p.cast && p.cast.length ? `<p class="small mut">Reparto: ${p.cast.map(esc).join(', ')}</p>` : ''}
      <h2 class="sm" style="margin-top:28px">Tráiler</h2>
      <button type="button" class="trl" id="tr2" aria-label="Ver tráiler de ${esc(p.t)}" style="background-image:${p.bd ? `linear-gradient(0deg,#06060aee,#0000 62%),url('${p.bd}')` : `linear-gradient(0deg,#06060aee,#0000 62%),linear-gradient(120deg,hsl(${p.h} 60% 32%),hsl(${(+p.h) + 60} 55% 14%))`}">
        <span class="play" aria-hidden="true"><img class="ic big" src="img/icons/play.png" alt="" aria-hidden="true"></span>
        <span class="tl"><i>Tráiler</i>${esc(p.t)}</span>
      </button>
      <h2 style="margin-top:34px">Funciones disponibles</h2>
      <div class="days" role="group" aria-label="Fecha">${dias.map((d, i) => `<button aria-pressed="${d === sel}" data-d="${i}">${fmtDia(new Date(d))}</button>`).join('')}</div>
      ${lista.map(f => {
        const l = libres(f), v = vendible(f), ok = v && l > 0;
        return `<div class="fn"><time>${fmtHora(f.ini)}</time><span class="small mut">Sala ${f.sala} · ${f.fmt} · ${f.idi}<br>Desde ${$$(precio(f, 'N'))} · ${!v ? 'Venta cerrada' : l ? l + ' asientos disponibles' : 'Agotada'}</span>${ok ? `<button class="pri" data-f="${f.id}">Reservar</button>` : `<button disabled>${v ? 'Agotada' : 'Cerrada'}</button>`}</div>`;
      }).join('') || '<div class="msg">Sin funciones disponibles para esta fecha.</div>'}
    </div></div>${related(p)}`;

  const t2 = $('#tr2');
  if (t2) t2.onclick = () => modal(p.yt ? `<h2>Tráiler · ${esc(p.t)}</h2><div style="aspect-ratio:16/9"><iframe src="https://www.youtube-nocookie.com/embed/${p.yt}" title="Tráiler de ${esc(p.t)}" style="width:100%;height:100%;border:0" allow="encrypted-media;picture-in-picture" allowfullscreen></iframe></div><p class="small"><a href="https://www.youtube.com/watch?v=${p.yt}" target="_blank" rel="noopener">Abrir en YouTube</a></p>` : `<h2>Tráiler · ${esc(p.t)}</h2><div class="poster" style="--h:${p.h};aspect-ratio:16/9;max-width:none" role="img" aria-label="Tráiler"><span><img class="ic" src="img/icons/play-dark.png" alt="" aria-hidden="true"> Tráiler oficial</span></div>`, [{ l: 'Cerrar', c: 'pri' }]);

  main.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { dia = +b.dataset.d; detalle(id); });
  main.querySelectorAll('[data-f]').forEach(b => b.onclick = () => iniciar(b.dataset.f));
}

/* ---------- Panel resumen (C-06) ---------- */
function panel() {
  const f = fn(S.sel.fn), p = peli(f.p);
  return `<aside class="sum" aria-label="Resumen"><h3>${esc(p.t)}</h3><dl><dt>Cine</dt><dd>CinePass · Sala ${f.sala}</dd><dt>Función</dt><dd>${fmtDia(f.ini)}, ${fmtHora(f.ini)}</dd><dt>Formato</dt><dd>${f.fmt} · ${f.idi}</dd><dt>Boletos</dt><dd>${Object.entries(S.sel.tix).filter(e => e[1]).map(([t, n]) => `${n} ${TIPOS[t]}`).join(', ') || '—'}</dd><dt>Asientos</dt><dd>${S.sel.seats.join(', ') || '—'}</dd></dl><div class="total" aria-live="polite">${$$(total())}</div></aside>`;
}

/* ---------- P-03 Boletos (Selección fluida sin recargas) ---------- */
function boletos() {
  if (needSel()) return;
  const f = fn(S.sel.fn), max = Math.min(8, libres(f));

  main.innerHTML = pasos(1) + `
    <div class="cols">
      <div>
        <h1>¿Cuántos boletos?</h1>
        <div id="tk-list">
          ${Object.keys(TIPOS).map(t => `
            <div class="tk" data-tk-row="${t}">
              <div>${TIPOS[t]}<br><span class="mut small">${$$(precio(f, t))} c/u</span></div>
              <div class="q">
                <button data-m="${t}" aria-label="Quitar ${TIPOS[t]}" ${S.sel.tix[t] ? '' : 'disabled'}>−</button>
                <b aria-live="polite" data-q-val="${t}">${S.sel.tix[t]}</b>
                <button data-a="${t}" aria-label="Agregar ${TIPOS[t]}" ${nTix() >= max ? 'disabled' : ''}>+</button>
              </div>
            </div>
          `).join('')}
        </div>
        <div id="tk-alert"></div>
        <p class="mut small">La elegibilidad de tarifas reducidas se verifica en el acceso a la sala.</p>
        <div class="acts">
          <button id="bk">Volver</button>
          <button class="pri" id="nx" ${nTix() < 1 ? 'disabled' : ''}>Elegir asientos</button>
        </div>
      </div>
      <div id="sum-panel">${panel()}</div>
    </div>`;

  const refreshTix = () => {
    const n = nTix();
    Object.keys(TIPOS).forEach(t => {
      const qEl = main.querySelector(`[data-q-val="${t}"]`);
      if (qEl) qEl.textContent = S.sel.tix[t];
      const mBtn = main.querySelector(`[data-m="${t}"]`);
      if (mBtn) mBtn.disabled = S.sel.tix[t] <= 0;
      const aBtn = main.querySelector(`[data-a="${t}"]`);
      if (aBtn) aBtn.disabled = n >= max;
    });

    const alertEl = $('#tk-alert');
    if (alertEl) {
      if (n >= max) alertEl.innerHTML = `<div class="msg">${max < 8 ? `Solo quedan ${max} asientos disponibles.` : 'Máximo 8 boletos por reserva.'}</div>`;
      else if (n < 1) alertEl.innerHTML = '<div class="msg bad">Elige al menos 1 boleto para continuar.</div>';
      else alertEl.innerHTML = '';
    }

    const nx = $('#nx');
    if (nx) nx.disabled = n < 1;

    const sp = $('#sum-panel');
    if (sp) sp.innerHTML = panel();
  };

  main.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
    if (nTix() >= max) return;
    S.sel.tix[b.dataset.a]++;
    S.sel.seats = [];
    save();
    refreshTix();
  });

  main.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
    if (S.sel.tix[b.dataset.m] <= 0) return;
    S.sel.tix[b.dataset.m]--;
    S.sel.seats = [];
    save();
    refreshTix();
  });

  refreshTix();
  $('#bk').onclick = () => history.back();
  $('#nx').onclick = () => go('#/asientos');
}

/* ---------- P-04 Asientos (Selección instantánea + Edición) ---------- */
function asientos() {
  if (needSel()) return;
  const f = fn(S.sel.fn), n = nTix(), oc = ocupados(f);
  if (n < 1) return go('#/boletos');
  S.sel.seats = S.sel.seats.filter(s => !oc.has(s));

  const isEditing = !!S.editingRes;
  const draw4 = () => {
    const sl = S.sel.seats, falta = n - sl.length;
    main.innerHTML = pasos(2) + `
      <div class="cols">
        <div>
          ${isEditing ? `<div class="msg ok"><b>Modificando reserva ${S.editingRes}:</b> elige tus ${n} nuevos asientos.</div>` : ''}
          <h1>Elige tus asientos</h1>
          <div class="screen" aria-hidden="true">PANTALLA</div>
          <div class="map" role="group" aria-label="Mapa de la sala">
            ${ROWS.map(r => `
              <div class="row">
                <i>${r}</i>
                ${[...Array(10)].map((_, c) => {
                  const id = r + (c + 1), o = oc.has(id), s = sl.includes(id), a = acc(id), pf = extra(id) > 0;
                  return `<button class="seat ${o ? 'occ' : ''} ${s ? 'sel' : ''} ${c === 4 ? 'gap' : ''} ${pf ? 'pref' : ''} ${a ? 'ada' : ''}" data-s="${id}" ${o ? 'disabled' : ''} aria-pressed="${s}" aria-label="Fila ${r}, asiento ${c + 1}, ${a ? 'accesible, ' : ''}${pf ? 'preferente, ' : ''}${o ? 'ocupado' : s ? 'seleccionado' : 'disponible'}"><span>${o ? '<img class="ic" src="img/icons/x-busy.png" alt="">' : a ? '<img class="ic" src="img/icons/wheelchair.png" alt="">' : c + 1}</span></button>`;
                }).join('')}
                <i>${r}</i>
              </div>
            `).join('')}
          </div>
          <div class="legend">
            <span><img class="ic" src="img/icons/seat-std.png" alt="" aria-hidden="true"> Estándar</span>
            <span class="lp"><img class="ic" src="img/icons/seat-pref.png" alt="" aria-hidden="true"> Preferente (+$2.00)</span>
            <span><img class="ic" src="img/icons/wheelchair.png" alt="" aria-hidden="true"> Accesible</span>
            <span><img class="ic" src="img/icons/seat-sel.png" alt="" aria-hidden="true"> Seleccionado</span>
            <span><img class="ic" src="img/icons/seat-busy.png" alt="" aria-hidden="true"> Ocupado</span>
          </div>
          <div class="msg ${falta ? '' : 'ok'}" id="seat-msg" aria-live="polite">${falta ? `Selecciona ${n} asiento${n > 1 ? 's' : ''} (faltan ${falta}).` : 'Selección completa.'}</div>
          <div class="acts">
            <button id="bk">Volver</button>
            <button class="pri" id="nx" ${falta ? 'disabled' : ''}>${isEditing ? 'Guardar nuevos asientos' : 'Continuar'}</button>
          </div>
        </div>
        <div id="sum-panel">${panel()}</div>
      </div>`;

    const upd = () => {
      const falta2 = n - sl.length, m = $('#seat-msg');
      if (m) {
        m.classList.toggle('ok', !falta2);
        m.textContent = falta2 ? `Selecciona ${n} asiento${n > 1 ? 's' : ''} (faltan ${falta2}).` : 'Selección completa.';
      }
      const nxBtn = $('#nx');
      if (nxBtn) nxBtn.disabled = !!falta2;
      const sp = $('#sum-panel');
      if (sp) sp.innerHTML = panel();
    };

    main.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
      const id = b.dataset.s, i = sl.indexOf(id);
      if (i >= 0) sl.splice(i, 1);
      else if (sl.length < n) sl.push(id);
      else {
        const m = $('#seat-msg');
        if (m) { m.classList.remove('ok'); m.textContent = `Ya elegiste ${n}. Quita uno si deseas cambiarlo.`; }
        return;
      }
      const s = sl.includes(id), c = +id.slice(1), a = acc(id), pf = extra(id) > 0;
      b.classList.toggle('sel', s);
      b.setAttribute('aria-pressed', s);
      b.setAttribute('aria-label', `Fila ${id[0]}, asiento ${c}, ${a ? 'accesible, ' : ''}${pf ? 'preferente, ' : ''}${s ? 'seleccionado' : 'disponible'}`);
      save();
      upd();
    });

    $('#bk').onclick = () => history.back();
    $('#nx').onclick = () => {
      const oc2 = ocupados(f);
      const bad = S.sel.seats.filter(s => oc2.has(s));
      if (bad.length) {
        modal('<h2>Asientos no disponibles</h2><p>Uno o más asientos fueron tomados por otro usuario. Por favor elige otros.</p>', [{ l: 'Elegir otros asientos', c: 'pri', f: () => { S.sel.seats = []; draw4(); } }]);
        return;
      }

      // Si venimos de editar reserva existente
      if (isEditing) {
        const cod = S.editingRes;
        const allR = reservas();
        const resObj = allR.find(x => x.cod === cod);
        if (resObj) {
          resObj.seats = [...S.sel.seats];
          resObj.tot = total();
          resObj.hist.push(['Asientos modificados', 'Cliente', Date.now()]);
          sv('cp_r', allR);
        }
        S.editingRes = null;
        release();
        modal(`<h2>¡Reserva ${cod} actualizada!</h2><p>Tus nuevos asientos son: <b>${resObj.seats.join(', ')}</b>.</p>`, [{ l: 'Ver mi reserva', c: 'pri', f: () => go('#/reserva/' + cod) }]);
        return;
      }

      S.hold = Date.now() + HOLD;
      save();
      go('#/resumen');
    };
  };
  draw4();
}

/* ---------- P-05 Resumen ---------- */
function resumen() {
  if (needSel()) return;
  if (S.sel.seats.length !== nTix() || !S.hold) return go('#/asientos');
  const f = fn(S.sel.fn);
  main.innerHTML = pasos(3) + `
    <div class="cols">
      <div>
        <h1>Revisa tu reserva</h1>
        ${S.user ? '' : '<div class="msg">Puedes revisar tu selección, pero para completar la compra debes iniciar sesión o crear cuenta. Tus asientos se conservan.</div>'}
        <ul>${Object.entries(S.sel.tix).filter(e => e[1]).map(([t, n]) => `<li>${n} × ${TIPOS[t]} — ${$$(n * precio(f, t))}</li>`).join('')}</ul>
        <p class="mut small">Políticas: puedes cancelar hasta 2 horas antes de la función con reembolso del 100 %. Precios con impuestos incluidos.</p>
        <div class="acts">
          <button id="ch">Cambiar asientos</button>
          <button class="pri" id="nx">${S.user ? 'Continuar al pago' : 'Iniciar sesión para pagar'}</button>
        </div>
      </div>
      ${panel()}
    </div>`;

  $('#ch').onclick = () => { S.hold = 0; save(); go('#/asientos'); };
  $('#nx').onclick = () => {
    if (S.user) go('#/pago');
    else { S.next = '#/resumen'; save(); go('#/login'); }
  };
}

/* ---------- P-06 Pago seguro con Múltiples Opciones y Validación Luhn ---------- */
function luhnCheck(num) {
  const clean = String(num).replace(/\D/g, '');
  if (clean.length < 13 || clean.length > 19) return false;
  let sum = 0, isEven = false;
  for (let i = clean.length - 1; i >= 0; i--) {
    let digit = parseInt(clean.charAt(i), 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }
  return (sum % 10) === 0;
}

function detectCardBrand(num) {
  const n = String(num).replace(/\D/g, '');
  if (/^4/.test(n)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'Mastercard';
  if (/^3[47]/.test(n)) return 'Amex';
  if (/^6/.test(n)) return 'Clave';
  return '';
}

function pago() {
  if (needSel()) return;
  if (!S.user) { S.next = '#/resumen'; save(); return go('#/login'); }
  if (!S.hold) return go('#/asientos');

  S.pm = S.pm || 'card';

  const renderForm = () => {
    let fieldsHTML = '';
    if (S.pm === 'card') {
      fieldsHTML = `
        <label for="nm">Nombre del titular</label>
        <input id="nm" type="text" placeholder="Como figura en la tarjeta" autocomplete="cc-name">
        <div class="err" data-e="nm"></div>

        <label for="num">Número de tarjeta</label>
        <div class="card-num-wrap">
          <input id="num" type="text" inputmode="numeric" placeholder="4000 1234 5678 9010" maxlength="19" autocomplete="cc-number">
          <span class="card-brand-badge" id="card-brand" style="display:none"></span>
        </div>
        <div class="err" data-e="num"></div>

        <div class="two">
          <div>
            <label for="ex">Vencimiento (MM/AA)</label>
            <input id="ex" type="text" placeholder="MM/AA" maxlength="5" autocomplete="cc-exp">
            <div class="err" data-e="ex"></div>
          </div>
          <div>
            <label for="cv">CVV / Código</label>
            <input id="cv" type="password" inputmode="numeric" placeholder="123" maxlength="4" autocomplete="cc-csc">
            <div class="err" data-e="cv"></div>
          </div>
        </div>
      `;
    } else if (S.pm === 'yappy') {
      fieldsHTML = `
        <div class="msg ok">
          <b>Pago con Yappy:</b> Ingresa tu número de celular registrado. Recibirás una notificación instantánea en tu aplicación para autorizar la compra.
        </div>
        <label for="yp-tel">Número de celular Yappy</label>
        <input id="yp-tel" type="tel" placeholder="6000-0000" maxlength="9">
        <div class="err" data-e="yp-tel"></div>
      `;
    } else if (S.pm === 'paypal') {
      fieldsHTML = `
        <div class="msg">
          <b>Pago con PayPal:</b> Conexión segura a tu cuenta PayPal para confirmar el cobro.
        </div>
        <label for="pp-email">Correo de tu cuenta PayPal</label>
        <input id="pp-email" type="email" placeholder="usuario@correo.com" value="${esc(S.user.e)}">
        <div class="err" data-e="pp-email"></div>
      `;
    } else if (S.pm === 'cash') {
      fieldsHTML = `
        <div class="msg ok">
          <b>Pago en Taquilla:</b> Tus asientos quedarán reservados inmediatamente. Podrás pagar en efectivo o tarjeta en ventanilla hasta 30 minutos antes de la función.
        </div>
      `;
    }

    const payButtonLabel = S.pm === 'card' ? `Pagar ${$$(total())}` : S.pm === 'yappy' ? `Enviar solicitud a Yappy (${$$(total())})` : S.pm === 'paypal' ? `Pagar con PayPal (${$$(total())})` : `Confirmar reserva en taquilla`;

    main.innerHTML = pasos(4) + `
      <div class="cols">
        <form id="pf" novalidate>
          <h1>Finalizar compra</h1>
          <label>Selecciona tu método de pago</label>
          <div class="pm-tabs">
            <button type="button" class="pm-btn ${S.pm === 'card' ? 'active' : ''}" data-pm-set="card">
              <span class="pm-icon">💳</span> Tarjeta
            </button>
            <button type="button" class="pm-btn ${S.pm === 'yappy' ? 'active' : ''}" data-pm-set="yappy">
              <span class="pm-icon">📱</span> Yappy
            </button>
            <button type="button" class="pm-btn ${S.pm === 'paypal' ? 'active' : ''}" data-pm-set="paypal">
              <span class="pm-icon">🅿️</span> PayPal
            </button>
            <button type="button" class="pm-btn ${S.pm === 'cash' ? 'active' : ''}" data-pm-set="cash">
              <span class="pm-icon">💵</span> Taquilla
            </button>
          </div>
          <div id="pm-fields">${fieldsHTML}</div>
          <div class="acts">
            <button type="button" id="cn">Cancelar</button>
            <button class="pri" id="go">${payButtonLabel}</button>
          </div>
        </form>
        ${panel()}
      </div>`;

    main.querySelectorAll('[data-pm-set]').forEach(b => b.onclick = () => {
      S.pm = b.dataset.pmSet;
      save();
      renderForm();
    });

    const v = id => { const el = $('#' + id); return el ? el.value.trim() : ''; };
    const er = (k, m) => {
      const el = document.querySelector(`[data-e="${k}"]`);
      if (el) el.textContent = m || '';
      return !!m;
    };

    if (S.pm === 'card') {
      const numInput = $('#num');
      const brandBadge = $('#card-brand');
      if (numInput) {
        numInput.oninput = e => {
          let val = e.target.value.replace(/\D/g, '').slice(0, 16);
          let formatted = val.match(/.{1,4}/g)?.join(' ') || val;
          e.target.value = formatted;
          const brand = detectCardBrand(val);
          if (brandBadge) {
            if (brand) {
              brandBadge.textContent = brand;
              brandBadge.style.display = 'inline-block';
            } else {
              brandBadge.style.display = 'none';
            }
          }
          if (val.length === 16) er('num', luhnCheck(val) ? '' : 'Número de tarjeta no válido.');
          else er('num', '');
        };
      }

      const exInput = $('#ex');
      if (exInput) {
        exInput.oninput = e => {
          let val = e.target.value.replace(/\D/g, '').slice(0, 4);
          if (val.length >= 2) val = val.slice(0, 2) + '/' + val.slice(2);
          e.target.value = val;
          er('ex', '');
        };
      }

      const cvInput = $('#cv');
      if (cvInput) {
        cvInput.oninput = e => {
          e.target.value = e.target.value.replace(/\D/g, '');
          er('cv', '');
        };
      }

      const nmInput = $('#nm');
      if (nmInput) {
        nmInput.oninput = () => er('nm', '');
      }
    }

    $('#cn').onclick = () => { S.res = { e: 'can' }; save(); go('#/resultado'); };

    $('#pf').onsubmit = e => {
      e.preventDefault();
      let hasError = false;

      if (S.pm === 'card') {
        const rawNum = v('num').replace(/\s/g, '');
        const nameVal = v('nm');
        const expMatch = v('ex').match(/^(\d{2})\/(\d{2})$/);
        const cvvVal = v('cv');

        if (!nameVal || nameVal.length < 3) {
          hasError = er('nm', 'Escribe el nombre completo del titular.') || hasError;
        } else if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/.test(nameVal)) {
          hasError = er('nm', 'El nombre solo debe contener letras.') || hasError;
        } else er('nm', '');

        if (!rawNum) {
          hasError = er('num', 'El número de tarjeta es obligatorio.') || hasError;
        } else if (rawNum.length < 15 || rawNum.length > 16) {
          hasError = er('num', 'El número debe tener 16 dígitos.') || hasError;
        } else if (!luhnCheck(rawNum)) {
          hasError = er('num', 'Número de tarjeta inválido. Verifica los dígitos.') || hasError;
        } else er('num', '');

        if (!expMatch) {
          hasError = er('ex', 'Usa el formato MM/AA.') || hasError;
        } else {
          const month = parseInt(expMatch[1], 10);
          const year = 2000 + parseInt(expMatch[2], 10);
          const now = new Date();
          const expDate = new Date(year, month, 1);
          if (month < 1 || month > 12) {
            hasError = er('ex', 'Mes inválido (01 al 12).') || hasError;
          } else if (expDate <= now) {
            hasError = er('ex', 'La tarjeta está vencida.') || hasError;
          } else er('ex', '');
        }

        if (!/^\d{3,4}$/.test(cvvVal)) {
          hasError = er('cv', 'Código de seguridad inválido (3 dígitos).') || hasError;
        } else er('cv', '');

        if (hasError) return;

        const b = $('#go');
        b.disabled = true;
        b.textContent = 'Procesando pago seguro…';
        setTimeout(() => {
          if (!S.hold) return route();
          confirmar(rawNum.slice(-4), 'Tarjeta');
        }, 800);

      } else if (S.pm === 'yappy') {
        const tel = v('yp-tel').replace(/\D/g, '');
        if (tel.length < 7) {
          hasError = er('yp-tel', 'Ingresa un número de celular válido para Yappy.') || hasError;
          return;
        }
        const b = $('#go');
        b.disabled = true;
        b.textContent = 'Esperando confirmación de Yappy…';
        setTimeout(() => {
          if (!S.hold) return route();
          confirmar(tel.slice(-4), 'Yappy');
        }, 1000);

      } else if (S.pm === 'paypal') {
        const email = v('pp-email');
        if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
          hasError = er('pp-email', 'Ingresa un correo de PayPal válido.') || hasError;
          return;
        }
        const b = $('#go');
        b.disabled = true;
        b.textContent = 'Conectando con PayPal…';
        setTimeout(() => {
          if (!S.hold) return route();
          confirmar('PAYPAL', 'PayPal');
        }, 900);

      } else if (S.pm === 'cash') {
        const b = $('#go');
        b.disabled = true;
        b.textContent = 'Confirmando reserva…';
        setTimeout(() => {
          if (!S.hold) return route();
          confirmar('EFECTIVO', 'Pago en Taquilla');
        }, 600);
      }
    };
  };

  renderForm();
}

function confirmar(l4, metodo = 'Tarjeta') {
  const f = fn(S.sel.fn);
  const cod = 'CP-' + [...Array(6)].map(() => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.random() * 31 | 0]).join('');
  const r = {
    cod,
    u: S.user.e,
    fn: f.id,
    tix: S.sel.tix,
    seats: S.sel.seats,
    tot: total(),
    l4,
    metodo,
    estado: 'Confirmada',
    hist: [['Confirmada', 'Sistema (' + metodo + ')', Date.now()]]
  };
  const a = reservas();
  a.push(r);
  sv('cp_r', a);
  S.hold = 0; S.sel = null; S.res = { e: 'ok', cod };
  save();
  go('#/resultado');
}

/* ---------- P-07 Resultado de compra ---------- */
function qr(c) {
  let h = hash(c), o = '';
  for (let i = 0; i < 49; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    o += `<b class="${h >> 16 & 1 ? '' : 'o'}"></b>`;
  }
  return `<div class="qr" aria-hidden="true">${o}</div>`;
}

function comprobante(r) {
  const f = fn(r.fn), p = peli(f.p);
  return `
    <div class="ticket">
      <div>
        <p class="eyebrow">Comprobante de Entrada</p>
        <div class="code">${r.cod}</div>
        <h3 style="margin-top:12px">${esc(p.t)}</h3>
        <p class="small">
          ${fmtDia(f.ini)}, ${fmtHora(f.ini)} · Sala ${f.sala} · ${f.fmt}<br>
          Asientos: <b>${r.seats.join(', ')}</b><br>
          Total: <b>${$$(r.tot)}</b> · Método: ${r.metodo || 'Tarjeta'}${r.l4 && r.l4 !== 'EFECTIVO' && r.l4 !== 'PAYPAL' ? ' ····' + r.l4 : ''}
        </p>
      </div>
      ${qr(r.cod)}
    </div>`;
}

function resultado() {
  const r = S.res;
  if (!r) return go('#/');
  const e = r.e;
  if (e === 'ok') {
    const x = reservas().find(k => k.cod === r.cod);
    main.innerHTML = `
      <p class="eyebrow">Pago confirmado</p>
      <h1>Tu reserva está confirmada</h1>
      ${comprobante(x)}
      <div class="acts">
        <a class="btn pri" href="#/reserva/${x.cod}">Ver detalle de reserva</a>
        <a class="btn" href="#/">Volver al inicio</a>
      </div>`;
    return;
  }
  const T = {
    rej: ['Pago no procesado', 'No pudimos procesar la tarjeta ingresada. Por favor verifica tus datos o intenta con otro método de pago.'],
    can: ['Operación cancelada', 'No se realizó ningún cobro a tu cuenta.'],
    exp: ['Tiempo expirado', 'El tiempo de retención de los asientos ha expirado. Por favor selecciona nuevamente tus asientos.']
  }[e] || ['Resultado', ''];

  main.innerHTML = `
    <p class="eyebrow">Resultado de la operación</p>
    <h1>${T[0]}</h1>
    <div class="msg bad">${T[1]}</div>
    <div class="acts">
      ${e === 'exp' ? '' : '<a class="btn pri" href="#/pago">Reintentar</a><a class="btn" href="#/asientos">Cambiar asientos</a>'}
      <a class="btn" href="#/" data-leave>Volver al inicio</a>
    </div>`;
}

/* ---------- P-10 Login y P-11 Registro con validación rigurosa ---------- */
function login() {
  const ctx = S.next ? '<div class="msg">Inicia sesión para continuar con tu reserva.</div>' : '';
  main.innerHTML = `
    <div class="auth">
      <div class="auth-img" aria-hidden="true">
        <p class="eyebrow">CinePass</p>
        <p class="auth-q">Tu butaca te espera.</p>
      </div>
      <div class="auth-f">
        <h1>Iniciar sesión</h1>
        ${ctx}
        <form id="lf" novalidate>
          <label for="e">Correo electrónico</label>
          <input id="e" type="email" placeholder="usuario@correo.com" autocomplete="username">
          <div class="err" id="ee"></div>

          <label for="p">Contraseña</label>
          <input id="p" type="password" placeholder="Tu contraseña" autocomplete="current-password">
          <div class="err" id="pe"></div>

          <div class="acts">
            <button class="pri">Entrar</button>
          </div>
          <p class="small mut" style="margin-top:14px">¿No tienes cuenta? <a href="#/registro">Crear cuenta</a></p>
        </form>
      </div>
    </div>`;

  $('#e').oninput = () => $('#ee').textContent = '';
  $('#p').oninput = () => $('#pe').textContent = '';

  $('#lf').onsubmit = e => {
    e.preventDefault();
    const em = $('#e').value.trim().toLowerCase(), pw = $('#p').value;
    $('#ee').textContent = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(em) ? '' : 'Escribe un correo electrónico válido.';
    $('#pe').textContent = pw ? '' : 'Escribe tu contraseña.';
    if ($('#ee').textContent || $('#pe').textContent) return;

    const lk = ld('cp_lk', { n: 0, t: 0 });
    if (lk.t > Date.now()) {
      $('#pe').textContent = 'Cuenta bloqueada temporalmente por intentos fallidos. Espera unos minutos.';
      return;
    }

    const u = users().find(x => x.e === em && x.p === pw);
    if (!u) {
      lk.n++;
      if (lk.n >= 5) { lk.t = Date.now() + 15 * 60000; lk.n = 0; }
      sv('cp_lk', lk);
      $('#pe').textContent = 'Correo o contraseña incorrectos.';
      return;
    }

    sv('cp_lk', { n: 0, t: 0 });
    S.user = { n: u.n, e: u.e, role: u.role || 'user' };
    const nx = S.next || '#/';
    S.next = null;
    save();
    go(nx);
    nav();
  };
}

function registro() {
  main.innerHTML = `
    <div class="auth">
      <div class="auth-img reg" aria-hidden="true">
        <p class="eyebrow">CinePass</p>
        <p class="auth-q">Más que películas, historias que merecen ser vividas.</p>
      </div>
      <div class="auth-f">
        <h1>Crear cuenta</h1>
        <form id="rf" novalidate>
          <label for="n">Nombre completo</label>
          <input id="n" type="text" maxlength="80" placeholder="Ej. Juan Pérez">
          <div class="err" data-e="n"></div>

          <label for="e">Correo electrónico</label>
          <input id="e" type="email" placeholder="usuario@correo.com">
          <div class="err" data-e="e"></div>

          <label for="t">Teléfono (opcional)</label>
          <input id="t" type="tel" placeholder="Ej. 6000-0000">
          <div class="err" data-e="t"></div>

          <label for="p">Contraseña</label>
          <input id="p" type="password" placeholder="Mínimo 8 caracteres">
          <div class="pw-hints">
            <span class="pw-item" id="pw-len">Mínimo 8 caracteres</span>
            <span class="pw-item" id="pw-upper">Al menos una mayúscula (A-Z)</span>
            <span class="pw-item" id="pw-lower">Al menos una minúscula (a-z)</span>
            <span class="pw-item" id="pw-num">Al menos un número (0-9)</span>
            <span class="pw-item" id="pw-spec">Al menos un carácter especial (!@#$%...)</span>
          </div>
          <div class="err" data-e="p"></div>

          <label for="p2">Confirmar contraseña</label>
          <input id="p2" type="password" placeholder="Repite tu contraseña">
          <div class="err" data-e="p2"></div>

          <label style="display:flex;gap:8px;align-items:center;color:var(--ink);margin:14px 0">
            <input type="checkbox" id="tc"> Acepto los <button type="button" class="link" id="tm">términos y condiciones</button>
          </label>
          <div class="acts">
            <button class="pri" id="rg" disabled>Registrarme</button>
          </div>
          <p class="small" style="margin-top:14px"><a href="#/login">Ya tengo una cuenta · Iniciar sesión</a></p>
        </form>
      </div>
    </div>`;

  const v = i => $('#' + i).value.trim();
  const er = (k, m) => {
    const el = document.querySelector(`[data-e="${k}"]`);
    if (el) el.textContent = m || '';
    return !m ? false : true;
  };

  const pInput = $('#p');
  if (pInput) {
    pInput.oninput = () => {
      const val = pInput.value;
      $('#pw-len').classList.toggle('ok', val.length >= 8);
      $('#pw-upper').classList.toggle('ok', /[A-Z]/.test(val));
      $('#pw-lower').classList.toggle('ok', /[a-z]/.test(val));
      $('#pw-num').classList.toggle('ok', /\d/.test(val));
      $('#pw-spec').classList.toggle('ok', /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(val));
      er('p', '');
    };
  }

  $('#n').oninput = () => er('n', '');
  $('#e').oninput = () => er('e', '');
  $('#p2').oninput = () => er('p2', '');

  $('#tc').onchange = e => $('#rg').disabled = !e.target.checked;
  $('#tm').onclick = () => modal('<h2>Términos y Privacidad</h2><p class="small">CinePass protege tu privacidad y tus datos. Tu información de cuenta se utiliza exclusivamente para gestionar tus reservas de boletos y pedidos de dulcería.</p>', [{ l: 'Aceptar', c: 'pri', f: () => { $('#tc').checked = true; $('#rg').disabled = false; } }, { l: 'Cerrar' }]);

  $('#rf').onsubmit = e => {
    e.preventDefault();
    const em = v('e').toLowerCase(), p = $('#p').value, p2 = $('#p2').value, name = v('n');
    let b = false;

    if (!name || name.length < 3) b = er('n', 'El nombre completo es obligatorio (mínimo 3 letras).') || b;
    else if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/.test(name)) b = er('n', 'El nombre solo debe contener letras.') || b;

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(em)) {
      b = er('e', 'Por favor ingresa un correo electrónico válido (ejemplo: usuario@correo.com).') || b;
    } else if (users().some(u => u.e === em)) {
      b = er('e', 'Este correo ya está registrado. Por favor inicia sesión.') || b;
    }

    if (v('t') && !/^\d{7,15}$/.test(v('t').replace(/\D/g, ''))) {
      b = er('t', 'El teléfono debe tener entre 7 y 15 dígitos numéricos.') || b;
    }

    const hasUpper = /[A-Z]/.test(p);
    const hasLower = /[a-z]/.test(p);
    const hasNum = /\d/.test(p);
    const hasSpec = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(p);

    if (p.length < 8) b = er('p', 'La contraseña debe tener al menos 8 caracteres.') || b;
    else if (!hasUpper) b = er('p', 'La contraseña debe incluir al menos una letra mayúscula.') || b;
    else if (!hasLower) b = er('p', 'La contraseña debe incluir al menos una letra minúscula.') || b;
    else if (!hasNum) b = er('p', 'La contraseña debe incluir al menos un número.') || b;
    else if (!hasSpec) b = er('p', 'La contraseña debe incluir al menos un símbolo especial (!@#$...).') || b;

    if (p !== p2) b = er('p2', 'Las contraseñas no coinciden.') || b;

    if (b) return;

    const u = users();
    u.push({ n: name, e: em, p, t: v('t') || '', role: 'user' });
    sv('cp_u', u);
    S.user = { n: name, e: em, role: 'user' };
    const nx = S.next || '#/';
    S.next = null;
    save();
    go(nx);
    nav();
  };
}

/* ---------- P-13 Mis reservas ---------- */
let tab = 'Próximas', qc = '';
const mias = () => reservas().filter(r => r.u === S.user.e);
const estado = r => r.estado === 'Confirmada' && fn(r.fn).ini < Date.now() ? 'Finalizada' : r.estado;

function reservasView() {
  if (!S.user) { S.next = '#/reservas'; save(); return go('#/login'); }
  const L = mias().filter(r => {
    const s = estado(r);
    return (tab === 'Próximas' ? s === 'Confirmada' : tab === 'Pasadas' ? s === 'Finalizada' : s.startsWith('Cancelada')) && (!qc || r.cod.includes(qc));
  });

  main.innerHTML = `
    <h1>Mis reservas</h1>
    <div class="tabs" role="tablist">${['Próximas', 'Pasadas', 'Canceladas'].map(t => `<button role="tab" aria-selected="${t === tab}" data-t="${t}">${t}</button>`).join('')}</div>
    <label for="qc">Buscar por código de reserva</label>
    <input id="qc" type="search" value="${esc(qc)}" style="max-width:260px" placeholder="CP-…">
    <div style="margin-top:20px">
      ${L.map(r => {
        const f = fn(r.fn);
        return `
          <a class="li" href="#/reserva/${r.cod}">
            <span>
              <b>${r.cod}</b> · ${esc(peli(f.p).t)}<br>
              <span class="mut small">${fmtDia(f.ini)}, ${fmtHora(f.ini)} · Sala ${f.sala} · ${r.seats.length} boletos</span>
            </span>
            <span class="badge b-${estado(r)}">${estado(r)}</span>
          </a>`;
      }).join('') || `<div class="msg">${mias().length ? 'No encontramos reservas con ese código en tu cuenta.' : 'Aún no tienes reservas realizadas.'} <a href="#/">Ver cartelera</a></div>`}
    </div>`;

  main.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; reservasView(); });
  $('#qc').oninput = e => {
    qc = e.target.value.toUpperCase().trim();
    const p = e.target.selectionStart;
    reservasView();
    $('#qc').focus();
    $('#qc').setSelectionRange(p, p);
  };
}

/* ---------- P-14 Detalle y edición de reserva ---------- */
function reserva(cod) {
  if (!S.user) { S.next = '#/reserva/' + cod; save(); return go('#/login'); }
  const r = (S.user.role === 'admin' ? reservas() : mias()).find(x => x.cod === cod);
  if (!r) return main.innerHTML = `<section class="errp"><div><p class="eyebrow">Acceso denegado</p><h1>No tienes acceso a este recurso</h1><p class="mut">Esta reserva pertenece a otra cuenta.</p><a class="btn pri" href="#/">Volver al inicio</a></div></section>`;

  const f = fn(r.fn), s = estado(r), puede = s === 'Confirmada' && f.ini - Date.now() > EDIT;
  main.innerHTML = `
    <a class="link" href="#/reservas"><img class="ic" src="img/icons/arrow-left.png" alt="" aria-hidden="true"> Volver a mis reservas</a>
    <h1 style="margin-top:16px">Detalle de reserva <span class="badge b-${s}">${s}</span></h1>
    ${comprobante(r)}
    <h3 style="margin-top:28px">Historial de la reserva</h3>
    <ul class="small">${r.hist.map(h => `<li><b>${h[0]}</b> · ${h[1]} · ${new Date(h[2]).toLocaleString('es')}</li>`).join('')}</ul>
    ${s === 'Cancelada' ? `<div class="msg ok">Cancelación registrada con reembolso total de ${$$(r.tot)}.</div>` : ''}
    <div class="acts">
      <button id="ed" ${puede ? '' : 'disabled'}>Editar asientos</button>
      <button class="pri" id="cx" ${puede ? '' : 'disabled'}>Cancelar reserva</button>
      <button id="pr">Imprimir comprobante</button>
    </div>
    ${puede || s !== 'Confirmada' ? '' : '<p class="small mut">Ya no se puede modificar ni cancelar: faltan menos de 2 horas para la función.</p>'}`;

  $('#pr').onclick = () => print();

  const edBtn = $('#ed');
  if (edBtn) {
    edBtn.onclick = () => {
      modal(`<h2>¿Cambiar asientos de la reserva ${r.cod}?</h2><p>Podrás seleccionar nuevos asientos para tu función de <b>${esc(peli(f.p).t)}</b>.</p>`, [
        {
          l: 'Sí, cambiar asientos',
          c: 'pri',
          f: () => {
            S.editingRes = r.cod;
            S.sel = { fn: r.fn, tix: { ...r.tix }, seats: [...r.seats] };
            S.hold = Date.now() + HOLD;
            save();
            go('#/asientos');
          }
        },
        { l: 'Volver' }
      ]);
    };
  }

  $('#cx').onclick = () => modal(`<h2>¿Cancelar la reserva ${r.cod}?</h2><p>Se liberarán los asientos <b>${r.seats.join(', ')}</b> y se registrará un reembolso de <b>${$$(r.tot)}</b>.</p>`, [
    {
      l: 'Sí, cancelar reserva',
      c: 'pri',
      f: () => {
        if (f.ini - Date.now() <= EDIT) return modal('<p>El plazo venció; ya no es posible cancelar.</p>', [{ l: 'Entendido', f: () => reserva(cod) }]);
        const a = reservas();
        const x = a.find(k => k.cod === cod);
        x.estado = 'Cancelada';
        x.hist.push(['Cancelada', S.user.role === 'admin' ? 'Administrador' : 'Cliente', Date.now()]);
        sv('cp_r', a);
        reserva(cod);
      }
    },
    { l: 'Conservar reserva' }
  ]);
}

/* ---------- Alimentos y bebidas: Carrito fluido sin parpadeos ---------- */
const EM = { c1: 'c1', c2: 'c2', s1: 's1', s2: 's2', s3: 's3', b1: 'b1', b2: 'b2', b3: 'b3' };
let cat = 'Todos';
const orders = () => ld('cp_o', []);

function alimentos() {
  S.cart = S.cart || {};
  const cs = ['Todos', ...new Set(MENU.map(m => m.c))];
  const tot = () => MENU.reduce((a, m) => a + (S.cart[m.id] || 0) * m.p, 0);
  const pending = o => o.estado === 'Recibido';

  const d = () => {
    const mine = S.user ? reservas().filter(r => r.u === S.user.e && estado(r) === 'Confirmada') : [];
    const os = S.user ? orders().filter(o => o.u === S.user.e) : [];

    main.innerHTML = `
      <p class="eyebrow">Alimentos y bebidas</p>
      <h1>Antes de la función</h1>
      <div class="tabs" role="tablist">${cs.map(c => `<button role="tab" aria-selected="${c === cat}" data-c="${c}">${c}</button>`).join('')}</div>
      <div class="cols">
        <div class="menu" id="food-catalog">
          ${MENU.filter(m => cat === 'Todos' || m.c === cat).map(m => `
            <div class="tk" data-fid="${m.id}">
              <span class="fi" aria-hidden="true"><img src="img/food/${EM[m.id] || 'c1'}.jpg" alt="" loading="lazy" onerror="this.onerror=null;this.parentNode.classList.add('ill');this.src='img/food/${EM[m.id] || 'c1'}.png'"></span>
              <div>${m.n}<br><span class="mut small">${m.c} · ${$$(m.p)}</span></div>
              <div class="q">
                <button data-m="${m.id}" aria-label="Quitar ${m.n}" ${S.cart[m.id] ? '' : 'disabled'}>−</button>
                <b data-fq="${m.id}">${S.cart[m.id] || 0}</b>
                <button data-a="${m.id}" aria-label="Agregar ${m.n}">+</button>
              </div>
            </div>
          `).join('')}
        </div>
        <aside class="sum" id="cart-aside" aria-label="Carrito"></aside>
      </div>
      <h2 style="margin-top:44px">Mis pedidos</h2>
      <div id="my-orders">
        ${os.map(o => `
          <div class="li">
            <span>
              <b>${o.cod}</b> <span class="badge b-${o.estado === 'Recibido' ? 'Confirmada' : 'Cancelada'}">${o.estado}</span><br>
              <span class="mut small">${o.items.map(i => i[1] + ' × ' + i[0]).join(', ')} · ${$$(o.tot)}${o.res ? ' · Reserva ' + o.res : ''}</span>
            </span>
            ${pending(o) ? `<span><button data-ed="${o.cod}">Editar</button> <button data-cx="${o.cod}">Cancelar</button></span>` : ''}
          </div>
        `).join('') || `<div class="msg">${S.user ? 'Aún no tienes pedidos registrados.' : 'Inicia sesión para ver y confirmar tus pedidos.'}</div>`}
      </div>`;

    const refreshCart = () => {
      const items = MENU.filter(m => S.cart[m.id]);
      const cartAside = $('#cart-aside');
      if (!cartAside) return;
      cartAside.innerHTML = `
        <h3>${S.edit ? 'Editando ' + S.edit : 'Tu carrito'}</h3>
        ${items.length ? `<dl>${items.map(m => `<dt>${S.cart[m.id]} × ${m.n}</dt><dd>${$$(S.cart[m.id] * m.p)}</dd>`).join('')}</dl>` : '<p class="mut small">El carrito está vacío.</p>'}
        <div class="total" aria-live="polite">${$$(tot())}</div>
        ${mine.length ? `
          <label for="lk">Asociar a una reserva (opcional)</label>
          <select id="lk">
            <option value="">Sin reserva</option>
            ${mine.map(r => `<option value="${r.cod}" ${S.link === r.cod ? 'selected' : ''}>${r.cod} · ${esc(peli(fn(r.fn).p).t)}</option>`).join('')}
          </select>
        ` : ''}
        <div class="acts">
          <button class="pri" id="ok" ${items.length ? '' : 'disabled'}>${S.edit ? 'Guardar cambios' : 'Confirmar pedido'}</button>
        </div>
      `;

      if ($('#lk')) $('#lk').onchange = e => { S.link = e.target.value; save(); };
      if ($('#ok')) $('#ok').onclick = () => {
        if (!S.user) { S.next = '#/alimentos'; save(); return go('#/login'); }
        const a = orders(), o = { cod: S.edit || 'PD-' + Math.random().toString(36).slice(2, 7).toUpperCase(), u: S.user.e, items: items.map(m => [m.n, S.cart[m.id]]), tot: tot(), res: S.link || '', estado: 'Recibido' };
        const i = a.findIndex(x => x.cod === o.cod);
        i >= 0 ? a[i] = o : a.push(o);
        sv('cp_o', a);
        S.cart = {}; S.edit = null; S.link = ''; save();
        d();
        modal(`<h2>¡Pedido ${o.cod} confirmado!</h2><p>Total: <b>${$$(o.tot)}</b>. Tu orden estará lista en la dulcería para tu función.</p>`, [{ l: 'Entendido', c: 'pri' }]);
      };
    };

    refreshCart();

    main.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { cat = b.dataset.c; d(); });

    main.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const fid = b.dataset.a;
      S.cart[fid] = (S.cart[fid] || 0) + 1;
      save();
      const qEl = main.querySelector(`[data-fq="${fid}"]`);
      if (qEl) qEl.textContent = S.cart[fid];
      const mBtn = main.querySelector(`[data-m="${fid}"]`);
      if (mBtn) mBtn.disabled = false;
      refreshCart();
    });

    main.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
      const fid = b.dataset.m;
      if (!S.cart[fid]) return;
      S.cart[fid]--;
      if (S.cart[fid] <= 0) {
        delete S.cart[fid];
        b.disabled = true;
      }
      save();
      const qEl = main.querySelector(`[data-fq="${fid}"]`);
      if (qEl) qEl.textContent = S.cart[fid] || 0;
      refreshCart();
    });

    main.querySelectorAll('[data-cx]').forEach(b => b.onclick = () => modal(`<h2>¿Cancelar el pedido ${b.dataset.cx}?</h2>`, [{ l: 'Sí, cancelar', c: 'pri', f: () => { const a = orders(); const it = a.find(o => o.cod === b.dataset.cx); if (it) it.estado = 'Cancelado'; sv('cp_o', a); d(); } }, { l: 'Conservar' }]));
    main.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => { const o = orders().find(x => x.cod === b.dataset.ed); S.cart = {}; o.items.forEach(i => { const item = MENU.find(m => m.n === i[0]); if (item) S.cart[item.id] = i[1]; }); S.edit = o.cod; S.link = o.res || ''; save(); d(); scrollTo(0, 0); });
  };
  d();
}

/* ---------- Módulo de Administración (P-19 a P-23) ---------- */
function adminView() {
  if (!S.user) { S.next = '#/admin'; save(); return go('#/login'); }
  if (S.user.role !== 'admin') {
    return main.innerHTML = `
      <section class="errp">
        <div>
          <p class="eyebrow">Acceso Restringido</p>
          <h1>Panel de Administración</h1>
          <p class="mut">Esta sección es de uso exclusivo para administradores de CinePass.</p>
          <a class="btn pri" href="#/">Volver al inicio</a>
        </div>
      </section>`;
  }

  const allRes = ld('cp_r', []).filter(r => fn(r.fn));
  const allOrders = ld('cp_o', []);
  const allUsers = users();

  const totalIngresos = allRes.filter(r => r.estado === 'Confirmada').reduce((sum, r) => sum + (r.tot || 0), 0) + allOrders.filter(o => o.estado !== 'Cancelado').reduce((sum, o) => sum + (o.tot || 0), 0);
  const boletosVendidos = allRes.filter(r => r.estado === 'Confirmada').reduce((sum, r) => sum + r.seats.length, 0);
  const reservasActivas = allRes.filter(r => r.estado === 'Confirmada').length;

  let admTab = window._admTab || 'resumen';

  main.innerHTML = `
    <p class="eyebrow">Administración</p>
    <h1>Panel de Control CinePass</h1>
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected="${admTab === 'resumen'}" data-at="resumen">Resumen General</button>
      <button role="tab" aria-selected="${admTab === 'reservas'}" data-at="reservas">Todas las Reservas (${allRes.length})</button>
      <button role="tab" aria-selected="${admTab === 'pedidos'}" data-at="pedidos">Dulcería (${allOrders.length})</button>
      <button role="tab" aria-selected="${admTab === 'usuarios'}" data-at="usuarios">Usuarios (${allUsers.length})</button>
      <button role="tab" aria-selected="${admTab === 'db'}" data-at="db">Base de Datos</button>
    </div>
    <div id="adm-content"></div>
  `;

  main.querySelectorAll('[data-at]').forEach(b => b.onclick = () => {
    window._admTab = b.dataset.at;
    adminView();
  });

  const c = $('#adm-content');
  if (admTab === 'resumen') {
    c.innerHTML = `
      <div class="admin-stats">
        <div class="stat-card">
          <p class="eyebrow">Ingresos Totales</p>
          <div class="val">${$$(totalIngresos)}</div>
          <div class="sub">Taquilla + Dulcería</div>
        </div>
        <div class="stat-card">
          <p class="eyebrow">Boletos Vendidos</p>
          <div class="val">${boletosVendidos}</div>
          <div class="sub">En reservas activas</div>
        </div>
        <div class="stat-card">
          <p class="eyebrow">Reservas Confirmadas</p>
          <div class="val">${reservasActivas}</div>
          <div class="sub">${allRes.filter(r => r.estado === 'Cancelada').length} canceladas</div>
        </div>
        <div class="stat-card">
          <p class="eyebrow">Pedidos Dulcería</p>
          <div class="val">${allOrders.length}</div>
          <div class="sub">${$$(allOrders.reduce((sum, o) => sum + (o.tot || 0), 0))} recaudados</div>
        </div>
        <div class="stat-card">
          <p class="eyebrow">Usuarios en BD</p>
          <div class="val">${allUsers.length}</div>
          <div class="sub">Clientes y administradores</div>
        </div>
      </div>
    `;
  } else if (admTab === 'reservas') {
    c.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <h2>Registro de Reservas</h2>
        <input type="search" id="adm-q-res" placeholder="Buscar por código, cliente o película..." style="max-width:320px">
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table" id="adm-tbl-res">
          <thead>
            <tr>
              <th>Código</th>
              <th>Cliente</th>
              <th>Película</th>
              <th>Función</th>
              <th>Asientos</th>
              <th>Total</th>
              <th>Método</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${allRes.map(r => {
              const f = fn(r.fn), p = f ? peli(f.p) : null;
              return `
                <tr>
                  <td><b>${r.cod}</b></td>
                  <td>${esc(r.u)}</td>
                  <td>${p ? esc(p.t) : '—'}</td>
                  <td>${f ? fmtDia(f.ini) + ' ' + fmtHora(f.ini) : '—'}</td>
                  <td>${r.seats.join(', ')}</td>
                  <td><b>${$$(r.tot)}</b></td>
                  <td>${r.metodo || 'Tarjeta'}</td>
                  <td><span class="badge b-${r.estado}">${r.estado}</span></td>
                  <td>
                    <div class="acts-sm">
                      <a class="btn" href="#/reserva/${r.cod}">Ver</a>
                      ${r.estado === 'Confirmada' ? `<button data-cx-adm="${r.cod}">Cancelar</button>` : ''}
                    </div>
                  </td>
                </tr>
              `;
            }).join('') || '<tr><td colspan="9" style="text-align:center">No hay reservas registradas.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    main.querySelectorAll('[data-cx-adm]').forEach(b => b.onclick = () => {
      const cod = b.dataset.cxAdm;
      modal(`<h2>¿Cancelar reserva ${cod} como Administrador?</h2>`, [
        {
          l: 'Sí, cancelar',
          c: 'pri',
          f: () => {
            const arr = reservas();
            const r = arr.find(x => x.cod === cod);
            if (r) {
              r.estado = 'Cancelada';
              r.hist.push(['Cancelada', 'Administrador', Date.now()]);
              sv('cp_r', arr);
              adminView();
            }
          }
        },
        { l: 'Volver' }
      ]);
    });

    const searchInput = $('#adm-q-res');
    if (searchInput) {
      searchInput.oninput = e => {
        const val = norm(e.target.value);
        document.querySelectorAll('#adm-tbl-res tbody tr').forEach(tr => {
          tr.style.display = norm(tr.textContent).includes(val) ? '' : 'none';
        });
      };
    }
  } else if (admTab === 'pedidos') {
    c.innerHTML = `
      <h2>Pedidos de Dulcería</h2>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Cliente</th>
              <th>Reserva</th>
              <th>Items</th>
              <th>Total</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${allOrders.map(o => `
              <tr>
                <td><b>${o.cod}</b></td>
                <td>${esc(o.u)}</td>
                <td>${o.res || '—'}</td>
                <td>${o.items.map(i => i[1] + '× ' + i[0]).join(', ')}</td>
                <td><b>${$$(o.tot)}</b></td>
                <td><span class="badge b-${o.estado === 'Recibido' ? 'Confirmada' : 'Cancelada'}">${o.estado}</span></td>
                <td>
                  <div class="acts-sm">
                    ${o.estado === 'Recibido' ? `<button class="pri" data-deliv="${o.cod}">Entregar</button><button data-cx-ord="${o.cod}">Cancelar</button>` : '—'}
                  </div>
                </td>
              </tr>
            `).join('') || '<tr><td colspan="7" style="text-align:center">No hay pedidos de dulcería.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    main.querySelectorAll('[data-deliv]').forEach(b => b.onclick = () => {
      const arr = allOrders;
      const it = arr.find(x => x.cod === b.dataset.deliv);
      if (it) { it.estado = 'Entregado'; sv('cp_o', arr); adminView(); }
    });
    main.querySelectorAll('[data-cx-ord]').forEach(b => b.onclick = () => {
      const arr = allOrders;
      const it = arr.find(x => x.cod === b.dataset.cxOrd);
      if (it) { it.estado = 'Cancelado'; sv('cp_o', arr); adminView(); }
    });
  } else if (admTab === 'usuarios') {
    c.innerHTML = `
      <h2>Usuarios Registrados</h2>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Teléfono</th>
              <th>Rol</th>
            </tr>
          </thead>
          <tbody>
            ${allUsers.map(u => `
              <tr>
                <td><b>${esc(u.n)}</b></td>
                <td>${esc(u.e)}</td>
                <td>${esc(u.t || '—')}</td>
                <td><span class="admin-badge">${u.role === 'admin' ? 'Administrador' : 'Cliente'}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else if (admTab === 'db') {
    c.innerHTML = `
      <h2>Administración de Base de Datos</h2>
      <p class="mut small">La base de datos de CinePass almacena usuarios, reservas y pedidos de forma persistente. Puedes descargar copias de seguridad en formato JSON o restaurarlas.</p>
      <div class="acts" style="margin-top:20px">
        <button class="pri" id="db-export">📥 Descargar Copia de Seguridad (JSON)</button>
        <button id="db-import-btn">📤 Restaurar Copia (JSON)</button>
        <button id="db-reset">🔄 Restablecer Datos de Demostración</button>
      </div>
      <input type="file" id="db-file" accept=".json" style="display:none">
    `;

    $('#db-export').onclick = () => {
      const data = {
        users: ld('cp_u', []),
        reservas: ld('cp_r', []),
        orders: ld('cp_o', []),
        exportedAt: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `cinepass_backup_${Date.now()}.json`;
      a.click();
    };

    $('#db-import-btn').onclick = () => $('#db-file').click();
    $('#db-file').onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const json = JSON.parse(ev.target.result);
          if (json.users) sv('cp_u', json.users);
          if (json.reservas) sv('cp_r', json.reservas);
          if (json.orders) sv('cp_o', json.orders);
          modal('<h2>¡Base de datos restaurada!</h2><p>Se importaron los datos correctamente.</p>', [{ l: 'Aceptar', c: 'pri', f: adminView }]);
        } catch (err) {
          modal('<h2>Error</h2><p>El archivo JSON no tiene un formato válido.</p>', [{ l: 'Cerrar' }]);
        }
      };
      reader.readAsText(file);
    };

    $('#db-reset').onclick = () => {
      modal('<h2>¿Restablecer datos?</h2><p>Se reiniciarán usuarios, reservas y pedidos a sus valores iniciales.</p>', [
        {
          l: 'Sí, reiniciar',
          c: 'pri',
          f: () => {
            localStorage.removeItem('cp_u');
            localStorage.removeItem('cp_r');
            localStorage.removeItem('cp_o');
            users();
            adminView();
          }
        },
        { l: 'Cancelar' }
      ]);
    };
  }
}

/* ---------- Configuración de TMDB y atajos ---------- */
document.addEventListener('click', e => {
  if (e.target.id !== 'cfg') return;
  window._tk = undefined;
  modal(`<h2>API de películas (TMDB)</h2><p class="small">Pega tu <b>API Read Access Token</b> de themoviedb.org. Se guarda de forma local en tu navegador.</p><label for="tk">Credencial</label><input id="tk" type="password" autocomplete="off" oninput="window._tk=this.value" value="${esc(localStorage.getItem('cp_tmdb') || '')}">`, [
    {
      l: 'Guardar y recargar',
      c: 'pri',
      f: () => {
        const v = (window._tk === undefined ? localStorage.getItem('cp_tmdb') || '' : window._tk).trim();
        v ? localStorage.setItem('cp_tmdb', v) : localStorage.removeItem('cp_tmdb');
        localStorage.removeItem('cp_tmdb_cache');
        location.reload();
      }
    },
    { l: 'Cancelar' }
  ]);
});

addEventListener('keydown', e => {
  if (!$('#hero') || document.querySelector('dialog') || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  const s = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
  if (s) {
    const b = main.querySelector(`.ctrl [data-step="${s}"]`);
    b && b.click();
  }
});

let tx = null;
addEventListener('touchstart', e => { tx = e.target.closest && e.target.closest('#hero') ? e.touches[0].clientX : null; }, { passive: true });
addEventListener('touchend', e => {
  if (tx === null) return;
  const d = e.changedTouches[0].clientX - tx;
  tx = null;
  if (Math.abs(d) > 50) {
    const b = main.querySelector(`.ctrl [data-step="${d < 0 ? 1 : -1}"]`);
    b && b.click();
  }
}, { passive: true });

(typeof loadMovies === 'function' ? loadMovies() : Promise.resolve()).finally(route);
