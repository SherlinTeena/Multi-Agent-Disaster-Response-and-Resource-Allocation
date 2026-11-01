(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const storeKey = 'responseGridDemo';
  const A = window.Agents;
  const { CITIES, HUBS, fmtMin } = A, DATA_VERSION = 5;
  const city = n => CITIES.find(c => c.name === n), hub = n => HUBS.find(x => x.name === n);
  const at = n => ({ x: city(n).x, y: city(n).y, lat: city(n).lat, lon: city(n).lon });   // coordinates only (spreading the city would overwrite the incident name)
  const mkTeam = (id, name, x, y, status = 'available', assigned = null) => ({ id, name, x, y, status, assigned });
  const MEMBER_DEFS = [];   // no sample names: you type each member's name when assigning
  const mkMember = ([id, name, role, base]) => { const c = city(base); return { id, name, role, base, lat: c.lat, lon: c.lon, x: c.x, y: c.y, status: 'available', assigned: null }; };
  const seed = () => { const now = Date.now(), min = 60000; return {
    members: MEMBER_DEFS.map(mkMember), alerts: [],
    incidents:[], sim:{ on:true, speed:60, min:0, nextAt:10 },
    stock:{ water:{ total:1000, avail:720 }, medical:{ total:500, avail:215 }, shelter:{ total:500, avail:96 }, food:{ total:600, avail:430 }, generator:{ total:24, avail:18 } },
    teams:[ ...[1,2,3].map(n => mkTeam('a'+n,'Alpha-'+n,hub('Chennai Hub').x,hub('Chennai Hub').y)),
      ...[1,2,3].map(n => mkTeam('b'+n,'Bravo-'+n,hub('Tiruchirappalli Hub').x,hub('Tiruchirappalli Hub').y)),
      ...[1,2,3].map(n => mkTeam('c'+n,'Charlie-'+n,hub('Madurai Hub').x,hub('Madurai Hub').y)) ],
    approved:[],
    activity:[]
  }; };
  let data = { user:null, chat:[], notes:[], ...seed() };
  try { data = { ...data, ...(JSON.parse(localStorage.getItem(storeKey) || '{}')) }; } catch { /* Keep this session usable if browser storage is blocked. */ }
  data.chat ||= []; data.notes ||= [];
  for (const [k, v] of Object.entries(seed())) data[k] ??= v;   // older saves lack the new state
  if (data.v !== DATA_VERSION) Object.assign(data, seed(), { v: DATA_VERSION, chat: [], notes: [] });   // old saves used fictional places

  function persist() { try { localStorage.setItem(storeKey, JSON.stringify(data)); } catch { toast('Browser storage is unavailable; this change lasts for this session.'); } }
  function toast(message) {
    const node = $('#toast'); if (!node) return;
    node.textContent = message; node.style.display = 'block'; clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { node.style.display = 'none'; }, 2500);
  }
  function setPage(name) {
    $$('.page').forEach(page => page.classList.toggle('on', page.id === `page-${name}`));
    $$('.nav button').forEach(button => button.classList.toggle('on', button.dataset.page === name));
    const titles = { overview:'Overview', assistant:'AI coordination', resources:'Resource allocation', incidents:'Incident board', comms:'Operations mail', profile:'Profile & settings' };
    $('#crumb').textContent = titles[name] || 'Overview';
    window.scrollTo({ top:0, behavior:'smooth' });
    if (name === 'overview' && map) setTimeout(() => map.invalidateSize(), 60);
  }
  function renderChat() {
    const host = $('#messages'); if (!host) return;
    host.replaceChildren();
    const welcome = document.createElement('div'); welcome.className='msg';
    welcome.textContent='Hello. I’m your local response-coordination demo. Ask about the sample incidents, supplies, or a community update.'; host.append(welcome);
    data.chat.forEach(item => {
      const message = document.createElement('div'); message.className = `msg ${item.role === 'user' ? 'user' : ''}`;
      if (item.lines) item.lines.forEach(l => { const p = document.createElement('p'), b = document.createElement('b'); b.textContent = l.agent + ': '; p.append(b, l.text); message.append(p); });
      else message.textContent = item.text;
      host.append(message);
    });
    host.scrollTop=host.scrollHeight;
  }
  function showApp() {
    const signedIn = Boolean(data.user);
    $('#auth').classList.toggle('hidden', signedIn); $('#app').classList.toggle('hidden', !signedIn);
    if (!signedIn) return;
    const name=data.user.name||'Coordinator';
    $('#userName').textContent=name; $('#greeting').textContent=name.split(/\s+/)[0];
    $('#initial').textContent=name.trim().charAt(0).toUpperCase()||'C';
    $('#profileName').value=name; $('#profileEmail').value=data.user.email||''; renderChat(); greet(); renderGettingStarted(); initMap(); renderAll(); renderAlerts(); updateSimBar();
  }
  function signOut() { data.user=null; persist(); showApp(); }
  /* ---------- helpers ---------- */
  const SVGNS = 'http://www.w3.org/2000/svg';
  function h(tag, attrs, ...kids) {              // tiny DOM builder; '$tag' creates an SVG element. Text goes in via textContent only.
    const n = tag[0] === '$' ? document.createElementNS(SVGNS, tag.slice(1)) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') n.setAttribute('class', v);
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (n.namespaceURI === SVGNS || !(k in n)) n.setAttribute(k, v); else n[k] = v;
    }
    n.append(...kids.flat().filter(x => x != null && x !== false)); return n;
  }
  function renderGettingStarted() {
    const overview = $('#page-overview'), stats = $('.stats', overview);
    if (!$('#gettingStarted')) {
      const guide = h('section', { id: 'gettingStarted', class: 'getting-started' },
        h('div', {},
          h('h2', {}, 'How to use this demo'),
          h('p', {}, 'This is a learning demo with fictional incidents, teams, and supplies. It is not connected to emergency services.')),
        h('ol', {},
          h('li', {}, h('b', {}, 'Report: '), 'Use “Report a problem” to add an incident, or let the simulation create one.'),
          h('li', {}, h('b', {}, 'Review: '), 'Check incident priority and suggested supplies or team assignments.'),
          h('li', {}, h('b', {}, 'Coordinate: '), 'Open an incident to assign a member; approve a proposal to apply it to demo inventory.')),
        h('p', { class: 'simulation-help' }, 'Simulation: the clock can run faster than real time and automatically adds fictional incidents. Use Pause or change the speed above the map.'));
      stats.before(guide);
    }
    const mapHeading = $('#liveMap').parentElement.querySelector('h2');
    if (mapHeading) mapHeading.textContent = 'Simulated incident map';
    const mapDescription = $('#liveMap').parentElement.querySelector('.sub');
    if (mapDescription) mapDescription.textContent = 'Pins show reported or simulated incidents · select a pin to review it and assign members';
    const reportDescription = $('#incForm .sub');
    if (reportDescription) reportDescription.textContent = 'Pick the exact spot on the map, search for a place, or use GPS. This creates a demo incident and places a pin on the map.';
  }
  const pad = n => String(n).padStart(2, '0');
  const fmt = n => Number(n).toLocaleString('en-US');
  const cls = l => l === 'Critical' ? 'critical' : l === 'Elevated' ? 'elevated' : 'info';
  const rel = ts => { const m = Math.max(0, Math.round((Date.now() - ts) / 60000)); return m < 1 ? 'now' : m < 60 ? m + 'm' : m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd'; };
  const STATUSES = ['Needs assignment', 'Team assessing', 'Response en route', 'Supplies dispatched', 'Awaiting supplies', 'Resolved'];
  let plan = null, modalId = null;
  const openList = () => data.incidents.filter(i => i.status !== 'Resolved');
  const view = () => ({ incidents: data.incidents.map(i => ({ ...i, ageMin: i.simTs != null ? Math.round(data.sim.min - i.simTs) : Math.round((Date.now() - i.ts) / 60000) })), stock: data.stock, teams: data.teams, hubs: HUBS });
  function logActivity(icon, text) { data.activity.unshift({ ts: Date.now(), icon, text }); data.activity.length = Math.min(data.activity.length, 20); }
  function greet() { const hr = new Date().getHours(); $('#greetWord').textContent = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'; }
  const closeModals = () => { $('#modal').style.display = 'none'; $('#incModal').style.display = 'none'; };
  function shortLines(p) {
    const area = id => (data.incidents.find(i => i.id === id) || {}).area;
    return [...p.shortages.map(s => `${area(s.id)}: ${s.missing} ${s.kind === 'teams' ? 'team(s)' : A.RES[s.kind].toLowerCase()} short`),
      ...data.incidents.filter(i => i.settled && i.status !== 'Resolved').flatMap(i => Object.entries(i.unmet || {}).map(([k, v]) => `${i.area}: ${v} ${A.RES[k].toLowerCase()} still unmet`))];
  }

  /* ---------- rendering (everything derives from `data`; the plan is recomputed on every change) ---------- */
  function renderAll() {
    plan = A.plan(view());
    renderStats(); renderMap(plan); renderPriority(plan); renderSnapshot(); renderActivity(); renderAlloc(plan); renderInventory(); renderBoard(plan); renderMembers();
  }
  function renderStats() {
    const o = openList(), free = data.teams.filter(t => t.status === 'available').length, cats = Object.values(data.stock);
    const pct = Math.round(cats.reduce((s, c) => s + (c.total - c.avail) / c.total, 0) / cats.length * 100);
    $('#activeCount').textContent = pad(o.length);
    $('#activeSub').textContent = `${o.filter(i => i.severity >= 4).length} high priority · ${o.filter(i => i.status === 'Needs assignment').length} unassigned`;
    $('#navCount').textContent = o.length; $('#mapCount').textContent = `${o.length} open incident${o.length === 1 ? '' : 's'}`;
    $('#peopleCount').textContent = fmt(o.reduce((s, i) => s + i.affected, 0));
    $('#teamTotal').textContent = data.teams.length; $('#teamSub').textContent = `${free} available · ${data.teams.length - free} en route`;
    $('#deployPct').textContent = $('#deployPct2').textContent = pct + '%';
  }
  const tag = i => i.name.length > 28 ? i.name.slice(0, 27) + '…' : i.name;
  function renderMap(p) { if (map) return renderLeaflet(p); renderSvgMap(p); }
  function renderSvgMap(p) {
    const o = openList();
    $('#towns').replaceChildren(...CITIES.filter(c => !o.some(i => Math.hypot(i.x - c.x, i.y - c.y) < 36) && !HUBS.some(x => Math.hypot(x.x - c.x, x.y - c.y) < 12)).map(c => h('$g', {}, h('$circle', { cx: c.x, cy: c.y, r: 3, class: 'town-dot' }), !['Erode', 'Thanjavur'].includes(c.name) && h('$text', { x: c.x + 7, y: c.y + 4, class: 'district-label' }, c.name.toUpperCase()))));
    $('#depotLayer').replaceChildren(...HUBS.map(x => h('$g', {}, h('$rect', { x: x.x - 8, y: x.y - 8, width: 16, height: 16, rx: 4, class: 'depot-dot' }), h('$text', { x: x.x, y: x.y + 25, class: 'map-tag', 'text-anchor': 'middle' }, x.name))));
    const near = i => A.location([i], HUBS)[i.id].hub;
    $('#routes').replaceChildren(...o.map(i => {
      const assigned = data.teams.some(t => t.assigned === i.id), proposed = p.rows.some(r => r.id === i.id && r.teams.length), hb = near(i);
      return (assigned || proposed) && h('$line', { x1: hb.x, y1: hb.y, x2: i.x, y2: i.y, class: assigned ? 'route' : 'route-plan' });
    }).filter(Boolean));
    $('#markers').replaceChildren(...openList().map(i => {
      const l = A.label(i.severity), c = cls(l), left = i.x > (innerWidth <= 650 ? 470 : 640);   // on phones the sea side is too narrow, so labels go west
      return h('$g', { class: 'demo-marker', 'data-incident': i.id, role: 'button', tabindex: 0, 'aria-label': `${i.name}, ${l} priority` },
        h('$circle', { cx: i.x, cy: i.y, r: 24, class: `marker-halo ${c}-halo` }), h('$circle', { cx: i.x, cy: i.y, r: 15, class: `marker-dot ${c}-dot` }),
        h('$text', { x: i.x, y: i.y + 5, class: 'marker-glyph' }, i.type === 'supply' ? '+' : '!'),
        h('$text', { x: i.x + (left ? -21 : 21), y: i.y - 7, class: 'map-tag', 'text-anchor': left ? 'end' : 'start' }, tag(i)));
    }));
  }
  function renderPriority(p) {
    $('#priorityList').replaceChildren(...(p.ranked.length ? p.ranked.slice(0, 3).map(i => h('div', { class: 'inc', 'data-incident': i.id, role: 'button', tabindex: 0 },
      h('span', {}, h('b', {}, i.name), h('small', {}, `${i.area} · ${fmt(i.affected)} affected · score ${i.score}`)), h('span', { class: `tag ${cls(i.priority)}` }, i.priority.toUpperCase())))
      : [h('p', { class: 'sub' }, 'No open incidents.')]));
  }
  const bar = c => { const f = c.avail / c.total; return h('span', { class: 'bar' }, h('i', { style: `width:${Math.round(f * 100)}%;background:${f < .25 ? 'var(--red)' : f < .5 ? 'var(--amber)' : 'var(--teal)'}` })); };
  function renderSnapshot() { $('#snapshot').replaceChildren(...Object.entries(A.RES).map(([k, n]) => h('div', { class: 'row' }, h('b', {}, n), bar(data.stock[k]), `${fmt(data.stock[k].avail)} / ${fmt(data.stock[k].total)}`))); }
  function renderActivity() { $('#activity').replaceChildren(...data.activity.slice(0, 6).map(a => h('div', { class: 'row' }, h('span', {}, `${a.icon} ${a.text}`), h('small', {}, rel(a.ts))))); }
  function renderAlloc(p) {
    const items = obj => Object.entries(obj).filter(([, v]) => v > 0).map(([k, v]) => `${k[0].toUpperCase() + k.slice(1)} ${v}`).join(' · ') || '—';
    const crew = (n, eta) => n ? `${n} team${n === 1 ? '' : 's'}${eta ? ' · ' + fmtMin(eta) : ''}` : '—';
    const rows = p.rows.map(r => h('tr', {}, h('td', {}, h('b', {}, r.area), h('div', { class: 'sub' }, r.name)), h('td', {}, items(r.alloc)), h('td', {}, crew(r.teams.length, r.etaMin)),
      h('td', {}, h('span', { class: `tag ${cls(r.priority)}` }, r.priority.toUpperCase())), h('td', {}, h('button', { class: 'btn approve', onclick: () => approve(r) }, 'Approve'))));
    data.approved.forEach(a => rows.push(h('tr', { style: 'opacity:.55' }, h('td', {}, h('b', {}, a.area), h('div', { class: 'sub' }, a.name)), h('td', {}, items(a.alloc)), h('td', {}, crew(a.teams.length, a.etaMin)),
      h('td', {}, h('span', { class: `tag ${cls(a.priority)}` }, a.priority.toUpperCase())), h('td', {}, h('button', { class: 'btn approve', disabled: true }, 'Approved')))));
    if (!rows.length) rows.push(h('tr', {}, h('td', { colSpan: 5 }, 'No proposals. All current needs are covered.')));
    $('#allocBody').replaceChildren(...rows);
    $('#pending').textContent = pad(p.rows.length);
    const sh = shortLines(p);
    $('#shortBox').replaceChildren(...(sh.length ? [h('p', { class: 'notice', style: 'margin-top:12px' }, h('b', {}, 'Shortfalls to escalate: '), sh.slice(0, 8).join(' · '))] : []));
  }
  function renderInventory() {
    const free = data.teams.filter(t => t.status === 'available').length;
    $('#inventory').replaceChildren(...Object.entries(A.RES).map(([k, n]) => h('div', { class: 'row' }, h('b', {}, n), h('span', {}, `${fmt(data.stock[k].avail)} `, h('small', {}, `(${fmt(A.usable(data.stock[k]))} usable)`)))),
      h('div', { class: 'row' }, h('b', {}, 'Field teams'), h('span', {}, `${free} available`)));
  }
  function renderBoard(p) {
    const sc = Object.fromEntries(p.ranked.map(i => [i.id, i.score]));
    const rows = [...data.incidents].sort((a, b) => (a.status === 'Resolved') - (b.status === 'Resolved') || (sc[b.id] || 0) - (sc[a.id] || 0));
    $('#incTable tbody').replaceChildren(...rows.map(i => h('tr', { style: i.status === 'Resolved' ? 'opacity:.55' : '' }, h('td', {}, i.name), h('td', {}, i.area), h('td', {}, fmt(i.affected)),
      h('td', {}, h('span', { class: `tag ${cls(A.label(i.severity))}` }, A.label(i.severity).toUpperCase())), h('td', {}, i.status), h('td', {}, h('button', { class: 'link', 'data-incident': i.id }, 'Review →')))));
  }

  /* ---------- real map (Leaflet + OpenStreetMap); falls back to the offline SVG map if Leaflet can't load ---------- */
  let map = null, tileWarned = false, fitted = false; const layers = {};
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = n => n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const pinHtml = (crit, glyph, badge) => `<div class="rg-wrap"><i class="rg-ring${crit ? ' on' : ''}"></i><div class="rg-pin"><span>${glyph}</span></div>${badge ? `<b class="rg-badge">${badge}</b>` : ''}</div>`;
  const pinIcon = (crit, glyph, badge) => L.divIcon({ className: 'rg-pin-wrap', html: pinHtml(crit, glyph, badge), iconSize: [34, 44], iconAnchor: [17, 39] });
  const osmTiles = () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' });
  function initMap() {
    const host = $('#liveMap'); if (map || !host || !window.L) return;
    host.replaceChildren();
    map = L.map(host, { minZoom: 4, worldCopyJump: true }).setView([10.9, 78.4], 7);
    osmTiles().on('tileerror', () => { if (!tileWarned) { tileWarned = true; toast('Map tiles could not load. Check your internet connection.'); } }).addTo(map);
    for (const k of ['hubs', 'routes', 'members', 'inc']) layers[k] = L.layerGroup().addTo(map);
    $('#mapNote').textContent = 'Map tiles © OpenStreetMap · pins = reported or simulated incidents';
  }
  function renderLeaflet(p) {
    const o = openList();
    layers.hubs.clearLayers(); layers.routes.clearLayers(); layers.members.clearLayers(); layers.inc.clearLayers();
    HUBS.forEach(x => L.marker([x.lat, x.lon], { icon: L.divIcon({ className: 'rg-hub-wrap', html: '<div class="rg-hub"></div>', iconSize: [16, 16] }), keyboard: false, zIndexOffset: -900 }).bindTooltip(x.name, { direction: 'top', offset: [0, -8] }).addTo(layers.hubs));
    data.members.forEach(m => L.marker([m.lat, m.lon], { icon: L.divIcon({ className: 'rg-mem-wrap', html: `<div class="rg-mem${m.status === 'assigned' ? ' busy' : ''}">${esc(initials(m.name))}</div>`, iconSize: [24, 24] }), keyboard: false, zIndexOffset: -500 })
      .bindTooltip(esc(`${m.name} · ${m.role} · ${m.status}`), { direction: 'top', offset: [0, -10] }).addTo(layers.members));
    o.forEach(i => {
      const hb = A.location([i], HUBS)[i.id].hub, mine = data.members.filter(m => m.assigned === i.id);
      const assigned = data.teams.some(t => t.assigned === i.id), proposed = p.rows.some(r => r.id === i.id && r.teams.length);
      if (assigned || proposed) L.polyline([[hb.lat, hb.lon], [i.lat, i.lon]], { color: assigned ? '#358b73' : '#7a8b92', weight: 3, dashArray: assigned ? '8 6' : '2 8', opacity: .85 }).addTo(layers.routes);
      mine.forEach(m => L.polyline([[m.lat, m.lon], [i.lat, i.lon]], { color: '#2f6fb5', weight: 3, dashArray: '6 6', opacity: .9 }).addTo(layers.routes));
      const crit = i.severity >= 4;
      const mk = L.marker([i.lat, i.lon], { icon: pinIcon(crit, i.type === 'supply' ? '+' : '!', mine.length), title: i.name, riseOnHover: true, zIndexOffset: crit ? 1000 : 500 });
      mk.bindTooltip(h('div', {}, h('b', {}, i.name), h('br'), `${i.area} · ${fmt(i.affected)} affected · reported ${agoLabel(data.sim.min - (i.simTs ?? data.sim.min))}`, h('br'), i.status + (mine.length ? ` · ${mine.length} member(s)` : ' · click to assign')), { direction: 'top', offset: [0, -34] });
      mk.on('click', () => openIncident(i.id)); mk.addTo(layers.inc);
    });
  }
  function focusIncident(i, list) {
    setPage('overview');
    if (map && list && list.length > 1) { map.invalidateSize(); map.fitBounds(L.latLngBounds(list.map(x => [x.lat, x.lon])), { padding: [70, 70], maxZoom: 10 }); }
    else if (map && i.lat != null) { map.invalidateSize(); map.flyTo([i.lat, i.lon], Math.max(map.getZoom(), 11), { duration: 1.1 }); }
    $('#liveMap').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ---------- alerts: banner + sound + bell + optional desktop notification ---------- */
  function renderAlerts() {
    const unread = data.alerts.filter(a => !a.read).length, bc = $('#bellCount');
    bc.textContent = unread; bc.classList.toggle('hidden', !unread); $('#bell').classList.toggle('ring', unread > 0);
    const open = a => { a.read = true; persist(); renderAlerts(); $('#alertPanel').classList.add('hidden'); const i = data.incidents.find(x => x.id === a.inc); if (i) { focusIncident(i); openIncident(i.id); } };
    $('#alertList').replaceChildren(...(data.alerts.length ? data.alerts.slice(0, 15).map(a => h('div', { class: 'alertrow' + (a.read ? '' : ' unread'), role: 'button', tabindex: 0, onclick: () => open(a), onkeydown: e => { if (e.key === 'Enter') open(a); } }, h('b', {}, a.text), h('small', {}, a.simLabel || rel(a.ts) + ' ago')))
      : [h('p', { class: 'sub', style: 'padding:14px' }, 'No alerts yet. New reports appear here instantly.')]));
  }
  const clockLabel = m => { const t = 360 + Math.floor(m), d = Math.floor(t / 1440) + 1, mm = t % 1440; return `Day ${d} · ${pad(Math.floor(mm / 60))}:${pad(mm % 60)}`; };
  const agoLabel = m => m < 1 ? 'just now' : fmtMin(Math.round(m)) + ' ago';
  function showBanner(list) {
    const b = $('#alertBanner'), first = [...list].sort((x, y) => y.severity - x.severity)[0], many = list.length > 1; clearTimeout(showBanner.t);
    b.replaceChildren(h('span', { class: 'ab-icon' }, '🚨'),
      h('span', { class: 'ab-text' }, h('b', {}, many ? `${list.length} NEW ALERTS AT THE SAME TIME` : 'NEW ALERT · ' + first.name), h('small', {}, many ? list.map(i => i.area).join(' · ') : `${first.area} · ${fmt(first.affected)} affected · ${A.label(first.severity)}`)),
      h('button', { class: 'btn', onclick: () => { b.classList.add('hidden'); focusIncident(first, list); } }, 'View on map'),
      h('button', { class: 'btn orange', onclick: () => { b.classList.add('hidden'); focusIncident(first); openIncident(first.id); } }, many ? 'Assign (most severe)' : 'Assign members'),
      h('button', { class: 'ab-x', 'aria-label': 'Dismiss', onclick: () => b.classList.add('hidden') }, '×'));
    b.classList.remove('hidden'); showBanner.t = setTimeout(() => b.classList.add('hidden'), 20000);
  }
  function beep() {
    if (Date.now() - (beep.last || 0) < 2500) return; beep.last = Date.now();
    try { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; const ctx = new C();
      [880, 660, 880].forEach((f, n) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.value = .08; o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + n * .22); o.stop(ctx.currentTime + n * .22 + .16); });
      setTimeout(() => ctx.close(), 1200); } catch { /* sound is optional */ }
  }
  function raiseAlerts(list) {
    const lbl = clockLabel(data.sim.min);
    list.forEach(i => data.alerts.unshift({ id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ts: Date.now(), simLabel: lbl, inc: i.id, text: `${i.name} · ${i.area} (${A.label(i.severity)})`, read: false }));
    data.alerts.length = Math.min(data.alerts.length, 40); renderAlerts();
    if ($('#app').classList.contains('hidden') || !list.length) return;
    showBanner(list); beep();
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification(list.length > 1 ? `🚨 ${list.length} new alerts` : '🚨 ' + list[0].name, { body: list.map(i => i.area).join(', ') }); } catch { /* optional */ }
  }
  function createIncident(f) {
    const { x, y } = A.MAP.proj(f.lat, f.lon);
    const inc = { id: 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: f.name, area: f.area, type: f.type, severity: f.severity, affected: Math.max(1, f.affected || 1), lat: f.lat, lon: f.lon, x, y,
      status: 'Needs assignment', ts: Date.now(), simTs: f.simTs ?? data.sim.min, delivered: {}, note: '', desc: f.desc || '', source: f.source || 'Citizen report' };
    data.incidents.push(inc); logActivity('🚨', `New alert: ${inc.name} (${inc.area})`); return inc;
  }
  function addIncident(f) { const inc = createIncident(f); raiseAlerts([inc]); persist(); renderAll(); focusOnMapOnly(inc); return inc; }
  const focusOnMapOnly = i => { if (map) map.flyTo([i.lat, i.lon], Math.max(map.getZoom(), 10), { duration: 1 }); };

  /* ---------- live feed: problems arrive over (simulated) time across many places, sometimes several at once ---------- */
  const PLACES = [['Chennai',13.08,80.27,'cu'],['Tiruvallur',13.14,79.91,'ri'],['Chengalpattu',12.69,79.98,'ci'],['Kanchipuram',12.83,79.70,'ru'],['Ranipet',12.93,79.33,'i'],['Vellore',12.92,79.13,'ru'],['Tirupathur',12.50,78.57,'h'],
    ['Krishnagiri',12.52,78.21,'ri'],['Hosur',12.74,77.83,'i'],['Dharmapuri',12.13,78.16,'h'],['Tiruvannamalai',12.23,79.07,'hr'],['Viluppuram',11.94,79.49,'r'],['Puducherry',11.93,79.83,'cu'],['Kallakurichi',11.74,78.96,'r'],
    ['Cuddalore',11.75,79.77,'c'],['Salem',11.66,78.15,'iu'],['Namakkal',11.22,78.17,'i'],['Erode',11.34,77.72,'ri'],['Tiruppur',11.11,77.34,'i'],['Coimbatore',11.02,76.96,'iu'],['Mettupalayam',11.30,76.94,'h'],
    ['Nilgiris (Ooty)',11.41,76.70,'h'],['Karur',10.96,78.08,'ri'],['Perambalur',11.23,78.88,'r'],['Ariyalur',11.14,79.08,'r'],['Mayiladuthurai',11.10,79.65,'cr'],['Nagapattinam',10.77,79.84,'c'],['Tiruvarur',10.77,79.64,'cr'],
    ['Thanjavur',10.79,79.14,'r'],['Tiruchirappalli',10.79,78.70,'ru'],['Pudukkottai',10.38,78.82,'c'],['Dindigul',10.37,77.98,'h'],['Kodaikanal',10.24,77.49,'h'],['Theni',10.01,77.48,'h'],['Madurai',9.93,78.12,'ru'],
    ['Sivaganga',9.85,78.48,'r'],['Virudhunagar',9.59,77.96,'i'],['Sivakasi',9.45,77.80,'i'],['Ramanathapuram',9.37,78.83,'c'],['Rameswaram',9.29,79.31,'c'],['Thoothukudi',8.76,78.13,'ci'],['Tirunelveli',8.73,77.70,'r'],
    ['Tenkasi',8.96,77.31,'h'],['Nagercoil',8.18,77.43,'c'],['Kanyakumari',8.09,77.54,'c']];
  const TYPES_BY_TAG = { c: ['flood', 'cyclone', 'power', 'supply', 'shelter'], h: ['landslide', 'power', 'supply', 'flood'], i: ['fire', 'power', 'supply'], r: ['flood', 'supply', 'shelter', 'power'], u: ['fire', 'power', 'shelter', 'flood'] };
  const TPL = { flood: ['Street flooding', 'Low-lying colony flooded', 'Water entering houses'], power: ['Power outage', 'Transformer failure', 'Fallen power lines'], shelter: ['Relief camp overcrowded', 'Shelter short of space'],
    supply: ['Drinking water shortage', 'Food packets needed', 'Medicine supply request'], fire: ['Fire reported', 'Godown fire', 'Smoke from a factory'], quake: ['Buildings damaged after tremor'],
    cyclone: ['Cyclone damage in coastal hamlet', 'Huts and boats damaged'], landslide: ['Landslide on ghat road', 'Road blocked by landslide'] };
  const pickOf = a => a[Math.floor(Math.random() * a.length)], GAPS = [20, 35, 45, 60, 75, 90, 120, 150], MAX_OPEN = 14;
  function makeEvent([area, lat, lon, tags]) {
    const types = [...new Set([...tags].flatMap(t => TYPES_BY_TAG[t] || []))], type = Math.random() < .03 ? 'quake' : pickOf(types), r = Math.random();
    const severity = r < .1 ? 5 : r < .35 ? 4 : r < .7 ? 3 : r < .9 ? 2 : 1, affected = Math.round([20, 40, 90, 200, 450][severity - 1] * (.6 + Math.random() * 1.2)), j = () => (Math.random() - .5) * .1;
    return { name: pickOf(TPL[type]), area, type, severity, affected, lat: lat + j(), lon: lon + j(), desc: 'Generated by the demo simulation', source: 'Simulated feed' };
  }
  function spawnCluster() {   // 1 problem, or 2-3 at the same moment, in places that have no open incident yet
    const busy = new Set(openList().map(i => i.area)), pool = PLACES.filter(p => !busy.has(p[0])), n = 1 + (Math.random() < .35) + (Math.random() < .15), out = [];
    for (let k = 0; k < n && pool.length && openList().length + out.length < MAX_OPEN; k++) out.push(createIncident({ ...makeEvent(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]), simTs: data.sim.nextAt }));
    if (out.length) { raiseAlerts(out); persist(); renderAll(); }
  }
  function updateSimBar() {
    const s = data.sim; $('#simClock').textContent = clockLabel(s.min); $('#simSpeed').value = String(s.speed);
    $('#simState').textContent = s.on ? '● SIMULATION ON' : '❚❚ PAUSED'; $('#simState').classList.toggle('off', !s.on); $('#simToggle').textContent = s.on ? '❚❚ Pause' : '▶ Resume';
  }
  function advanceSim(dMin) {
    const s = data.sim; s.min += dMin;
    for (let g = 0; g < 4 && s.min >= s.nextAt; g++) { spawnCluster(); s.nextAt += pickOf(GAPS) * (.8 + Math.random() * .4); }
    if (s.nextAt < s.min) s.nextAt = s.min + 15;   // skip a backlog, e.g. after the tab slept
    let changed = false;
    data.members.forEach(m => { if (m.assigned && m.arriveAt != null && s.min >= m.arriveAt) { const i = data.incidents.find(x => x.id === m.assigned); m.arriveAt = null; changed = true;
      if (i && i.status === 'Response en route') i.status = 'Team assessing'; logActivity('✚', `${m.name} arrived at ${i ? i.area : 'the site'}`); if (i) toast(`${m.name} arrived at ${i.area}`); } });
    if (changed) { persist(); renderAll(); const i = data.incidents.find(x => x.id === modalId); if (i) refreshModal(i); }
    updateSimBar();
  }
  let lastTick = Date.now(), tickN = 0;
  setInterval(() => {
    const now = Date.now(), dt = Math.min(10, (now - lastTick) / 1000); lastTick = now;
    if (!data.sim.on || $('#app').classList.contains('hidden')) return;
    advanceSim(dt * data.sim.speed / 60); tickN++;
    if (tickN % 5 === 0) persist(); if (tickN % 15 === 0 && openList().length) renderAll();   // keeps ages and priority scores fresh
  }, 1000);
  $('#simSpeed').addEventListener('change', e => { data.sim.speed = +e.target.value; persist(); toast(e.target.selectedOptions[0].textContent + ': new problems will keep arriving.'); });
  $('#simToggle').addEventListener('click', () => { data.sim.on = !data.sim.on; lastTick = Date.now(); persist(); updateSimBar(); });
  window.ResponseGridDebug = { advance: advanceSim, spawn: spawnCluster, data: () => data };

  /* ---------- rescue members: assign / unassign ---------- */
  function renderMembers() {
    const host = $('#memberList'); if (!host) return;
    if (!data.members.length) return host.replaceChildren(h('p', { class: 'sub' }, 'No members yet. Type a name when you assign someone to an incident and they will be saved here.'));
    host.replaceChildren(...data.members.map(m => { const inc = data.incidents.find(i => i.id === m.assigned);
      return h('div', { class: 'row' }, h('span', {}, h('b', {}, m.name), h('div', { class: 'sub' }, `${m.role} · from ${m.base}`)),
        h('span', {}, h('span', { class: 'tag ' + (m.status === 'assigned' ? 'elevated' : 'ok') }, m.status === 'assigned' ? 'ON ' + (inc ? inc.area : 'TASK').toUpperCase() : 'AVAILABLE'),
          m.status === 'assigned' ? null : h('button', { class: 'link', type: 'button', title: 'Remove member', onclick: () => removeMember(m.id) }, ' Remove'))); }));
  }
  function removeMember(mid) { const m = data.members.find(x => x.id === mid); if (!m || m.status === 'assigned') return; data.members = data.members.filter(x => x.id !== mid); logActivity('✚', `${m.name} removed from the member list`); persist(); renderAll(); }
  function renderAssign(i) {
    const box = $('#assignBox'); if (!box) return;
    const mine = data.members.filter(m => m.assigned === i.id);
    const free = data.members.filter(m => m.status === 'available').map(m => ({ m, km: A.dist(m, i) })).sort((a, b) => a.km - b.km);
    const add = () => { const nm = $('#assignName').value.trim(); if (!nm) return toast('Type the member’s name first.'); assignNew(nm, $('#assignRole').value.trim(), i); };
    box.replaceChildren(h('label', { class: 'lbl' }, 'Rescue members assigned'),
      mine.length ? h('div', { class: 'chips' }, ...mine.map(m => h('span', { class: 'chip' }, m.role ? `${m.name} · ${m.role}` : m.name, h('button', { type: 'button', title: 'Unassign', onclick: () => unassignMember(m.id) }, '×')))) : h('p', { class: 'sub' }, 'No one assigned yet.'),
      h('label', { class: 'lbl' }, 'Assign a person: type a name'),
      h('div', { class: 'inline' }, h('input', { id: 'assignName', maxlength: 40, placeholder: 'Member name', onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); add(); } } }),
        h('input', { id: 'assignRole', maxlength: 30, placeholder: 'Role (optional)', onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); add(); } } }),
        h('button', { type: 'button', class: 'btn orange', onclick: add }, 'Assign')),
      free.length ? h('div', null, h('label', { class: 'lbl', style: 'margin-top:10px' }, 'Or pick someone you added before'),
        h('div', { class: 'inline' }, h('select', { id: 'assignSel' }, ...free.map(({ m, km }) => h('option', { value: m.id }, `${m.name}${m.role ? ' · ' + m.role : ''} · ${Math.round(km)} km · ~${fmtMin(A.eta(km))}`))),
          h('button', { type: 'button', class: 'btn', onclick: () => assignMember($('#assignSel').value, i.id) }, 'Assign'))) : null);
  }
  function assignNew(name, role, i) {   // a typed name becomes a saved member who sets off from the nearest hub
    const hb = A.location([i], HUBS)[i.id].hub, m = { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), name, role, base: hb.name, lat: hb.lat, lon: hb.lon, x: hb.x, y: hb.y, status: 'available', assigned: null };
    data.members.push(m); assignMember(m.id, i.id);
  }
  function assignMember(mid, iid) {
    const m = data.members.find(x => x.id === mid), i = data.incidents.find(x => x.id === iid); if (!m || !i || m.status !== 'available') return;
    const etaMin = A.eta(A.dist(m, i)), eta = fmtMin(etaMin);
    Object.assign(m, { status: 'assigned', assigned: iid, arriveAt: data.sim.min + etaMin }); if (i.status === 'Needs assignment') i.status = 'Response en route';
    logActivity('✚', `${m.name} assigned to ${i.name} · ETA ${eta}`); persist(); renderAll(); refreshModal(i); toast(`${m.name} assigned · ETA ${eta}`);
  }
  function unassignMember(mid) {
    const m = data.members.find(x => x.id === mid); if (!m) return; const i = data.incidents.find(x => x.id === m.assigned);
    Object.assign(m, { status: 'available', assigned: null, arriveAt: null }); logActivity('✚', `${m.name} unassigned${i ? ' from ' + i.name : ''}`); persist(); renderAll(); if (i) refreshModal(i);
  }
  function refreshModal(i) { if (modalId !== i.id) return; updateBody(i); renderAssign(i); $('#modalStatus').value = i.status; }

  /* ---------- incident modal ---------- */
  function updateBody(i) {
    const r = plan.ranked.findIndex(x => x.id === i.id), sc = plan.ranked[r];
    const need = Object.entries(A.need(i)).map(([k, v]) => `${v} ${k}`).join(', ') || (i.settled ? 'allocation approved' : 'covered');
    const crew = data.teams.filter(t => t.assigned === i.id).map(t => t.name).join(', ') || 'none yet';
    $('#modalBody').textContent = [`${i.area} · ${A.label(i.severity)} · ${fmt(i.affected)} affected`, i.simTs != null ? `Reported: ${clockLabel(i.simTs)} (${agoLabel(data.sim.min - i.simTs)})` : '', i.desc ? `Details: ${i.desc}` : '', i.lat != null ? `Location: ${i.lat.toFixed(4)}, ${i.lon.toFixed(4)}` : '',
      sc ? `Priority score ${sc.score} (rank ${r + 1} of ${plan.ranked.length})` : '', `Outstanding need: ${need}`, `Teams: ${crew}`, 'Sample scenario only. Verify with authorized local responders.'].filter(Boolean).join('\n');
  }
  function openIncident(id) {
    const i = data.incidents.find(x => x.id === id); if (!i) return;
    modalId = id; $('#modalTitle').textContent = i.name; updateBody(i); renderAssign(i);
    $('#modalStatus').replaceChildren(...STATUSES.map(s => h('option', { value: s, selected: s === i.status }, s)));
    $('#modalNote').value = i.note || ''; $('#modalEdit').classList.remove('hidden'); $('#modal').style.display = 'grid';
  }
  function approve(r) {
    const i = data.incidents.find(x => x.id === r.id), live = plan.rows.find(x => x.id === r.id);
    if (!i || !live) { renderAll(); return toast('That proposal changed; the plan was refreshed.'); }
    i.delivered ||= {};
    for (const [k, v] of Object.entries(live.alloc)) { const q = Math.min(v, A.usable(data.stock[k])); data.stock[k].avail -= q; i.delivered[k] = (i.delivered[k] || 0) + q; live.alloc[k] = q; }
    const crew = data.teams.filter(t => live.teams.includes(t.id)); crew.forEach(t => Object.assign(t, { status: 'enroute', assigned: i.id }));
    i.unmet = A.need(i); i.settled = true;
    i.status = (crew.length || data.teams.some(t => t.assigned === i.id)) ? 'Response en route' : 'Supplies dispatched';
    data.approved.unshift({ id: i.id, name: i.name, area: i.area, priority: A.label(i.severity), alloc: { ...live.alloc }, teams: crew.map(t => t.name), etaMin: live.etaMin, ts: Date.now() });
    data.approved = data.approved.slice(0, 8);
    logActivity('✓', `Approved ${Object.values(live.alloc).reduce((s, v) => s + v, 0)} supply units for ${i.area}${crew.length ? ` and ${crew.length} team(s)` : ''}`);
    persist(); renderAll(); toast('Allocation approved: stock and teams updated.');
  }

  $$('.nav button').forEach(button=>button.addEventListener('click',()=>setPage(button.dataset.page)));
  $$('[data-go]').forEach(button=>button.addEventListener('click',()=>setPage(button.dataset.go)));
  $('#openProfile').addEventListener('click',()=>setPage('profile'));
  $('#openComms').addEventListener('click',()=>setPage('comms'));
  $('#signOut').addEventListener('click',signOut); $('#signOut2').addEventListener('click',signOut);
  $('#switchBtn').addEventListener('click',()=>{
    const signup=$('#nameWrap').classList.toggle('hidden');
    $('#authTitle').textContent=signup?'Create your coordinator profile':'Sign in to your workspace';
    $('#authSubmit').textContent=signup?'Create profile →':'Open response dashboard →';
    $('#switchLabel').textContent=signup?'Already have a profile?':'New to this demo?';
    $('#switchBtn').textContent=signup?'Sign in':'Create a profile';
  });
  $('#authForm').addEventListener('submit',event=>{
    event.preventDefault(); const email=$('#authEmail').value.trim();
    const name=$('#nameWrap').classList.contains('hidden')?email.split('@')[0].replace(/[._-]/g,' ').replace(/\b\w/g,c=>c.toUpperCase()):$('#authName').value.trim();
    if(!name)return toast('Enter your name to continue.');
    data.user={name,email};persist();showApp();toast(`Welcome, ${name.split(/\s+/)[0]}.`);
  });
  $('#profileForm').addEventListener('submit',event=>{event.preventDefault();data.user.name=$('#profileName').value.trim()||'Coordinator';data.user.email=$('#profileEmail').value.trim();persist();showApp();toast('Profile saved in this browser.');});

  document.addEventListener('click', e => { const n = e.target.closest('[data-incident]'); if (n) openIncident(n.dataset.incident); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') return closeModals();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-incident]:not(button)')) { e.preventDefault(); openIncident(e.target.dataset.incident); }
  });
  $('#closeModal').addEventListener('click', closeModals);
  $('#modal').addEventListener('click', event => { if (event.target.id === 'modal') closeModals(); });
  $('#saveModal').addEventListener('click', () => {
    const i = data.incidents.find(x => x.id === modalId); if (!i) return closeModals();
    const status = $('#modalStatus').value; i.note = $('#modalNote').value.trim();
    if (status !== i.status) {
      i.status = status; logActivity('⚑', `${i.name} marked "${status}"`);
      if (status === 'Resolved') { data.teams.forEach(t => { if (t.assigned === i.id) Object.assign(t, { status: 'available', assigned: null, x: i.x, y: i.y }); });
        data.members.forEach(m => { if (m.assigned === i.id) Object.assign(m, { status: 'available', assigned: null, lat: i.lat ?? m.lat, lon: i.lon ?? m.lon, x: i.x, y: i.y }); }); }
    }
    persist(); renderAll(); closeModals(); toast('Incident updated.');
  });
  $('#suggest').addEventListener('click', () => {
    $('#traceBody').replaceChildren(...plan.trace.map(l => h('div', { class: 'row', style: 'align-items:flex-start' }, h('b', { style: 'min-width:140px' }, l.agent), h('span', { style: 'flex:1' }, l.text))));
    $('#traceCard').style.display = 'block'; $('#traceCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    logActivity('✳', `Coordinator proposed ${plan.rows.length} allocation(s)`); persist(); renderActivity();
    toast(plan.rows.length ? `${plan.rows.length} allocation(s) ready for your review.` : 'No new allocations needed.');
  });
  /* ---------- AI coordination desk chat (local simulation) ---------- */
  function chatReply(q) {
    const t = q.toLowerCase(), tr = name => plan.trace.filter(l => l.agent.startsWith(name));
    const say = lines => ({ lines });
    if (!plan.ranked.length) return say([{ agent: 'Coordinator', text: 'There are no open incidents right now, so nothing to prioritize.' }]);
    const place = plan.ranked.filter(i => t.includes(String(i.area).toLowerCase()) || t.includes(String(i.name).toLowerCase()));
    if (place.length) return say(place.flatMap(i => {
      const row = plan.rows.find(r => r.id === i.id), c = row && row.convoy;
      return [{ agent: 'Data analysis', text: `${i.name} in ${i.area}: priority score ${i.score}, status “${i.status}”.` },
        { agent: 'Location & route', text: c ? `${c.hub.name} to ${i.area}: ${c.km} km, about ${A.fmtMin(c.min)} by road.` : 'No route computed yet.' },
        { agent: 'Rescue coordination', text: row && row.teams.length ? `${row.teams.length} team(s) proposed${row.etaMin ? ', ETA ' + A.fmtMin(row.etaMin) : ''}.` : 'No team proposed yet.' }];
    }));
    if (/priorit|rank|urgent|first|critical/.test(t)) return say([{ agent: 'Data analysis', text: plan.ranked.slice(0, 4).map((i, n) => `${n + 1}. ${i.name} (${i.area}, score ${i.score})`).join(' · ') }, ...tr('Coordinator')]);
    if (/gap|short|stock|suppl|resource|inventory/.test(t)) { const g = shortLines(plan); return say([...tr('Supply'), { agent: 'Coordinator', text: g.length ? g.join('; ') : 'No shortfalls at the moment.' }]); }
    if (/team|rescue|member|deploy/.test(t)) return say(tr('Rescue'));
    if (/route|road|hub|eta|travel/.test(t)) return say(tr('Location'));
    if (/advis|draft|message|public|communic|alert/.test(t)) return say(tr('Communication'));
    return say(plan.trace);
  }
  function sendChat(text) {
    text = (text || '').trim(); if (!text) return;
    data.chat.push({ role: 'user', text });
    data.chat.push({ role: 'agent', ...chatReply(text) });
    data.chat = data.chat.slice(-40);
    persist(); renderChat();
  }
  $('#chatForm').addEventListener('submit', e => { e.preventDefault(); const input = $('#chatInput'); sendChat(input.value); input.value = ''; input.focus(); });
  $$('.prompt').forEach(b => b.addEventListener('click', () => sendChat(b.textContent)));
  $('#refresh').addEventListener('click', () => { renderAll(); toast('Priorities, routes and allocations recomputed from the current board.'); });
  /* ---------- report a problem: any place on the map, search, GPS or city ---------- */
  let pick = null, pickMap = null, pickMarker = null, geoSeq = 0;
  const nearestCity = (lat, lon) => { const { x, y } = A.MAP.proj(lat, lon); return CITIES.reduce((b, c) => Math.hypot(c.x - x, c.y - y) < Math.hypot(b.x - x, b.y - y) ? c : b); };
  function ensurePickMap() {
    const host = $('#pickMap'); if (pickMap) return;
    if (!window.L) { host.textContent = 'Map unavailable offline. Choose a city below.'; return; }
    host.replaceChildren(); pickMap = L.map(host, { minZoom: 4 }).setView(map ? map.getCenter() : [10.9, 78.4], map ? map.getZoom() : 7);
    osmTiles().addTo(pickMap); pickMap.on('click', e => setPick(e.latlng.lat, e.latlng.lng));
  }
  async function setPick(lat, lon, label) {
    const seq = ++geoSeq, c = nearestCity(lat, lon);
    pick = { lat, lon, area: label || c.name + ' area' };
    const info = () => { $('#pickInfo').textContent = `📍 ${pick.area} (${lat.toFixed(4)}, ${lon.toFixed(4)})`; }; info();
    if (pickMap) { if (pickMarker) pickMarker.setLatLng([lat, lon]); else pickMarker = L.marker([lat, lon], { icon: pinIcon(false, '!', 0) }).addTo(pickMap); }
    if (label) return;
    try {   // friendlier place name via OpenStreetMap Nominatim (needs internet; the nearest-city name is the fallback)
      const j = await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=15&lat=${lat}&lon=${lon}`)).json();
      if (seq !== geoSeq) return; const a = j.address || {};
      const local = a.suburb || a.neighbourhood || a.village || a.hamlet || a.town, big = a.city || a.town || a.county || a.state_district;
      const nm = [local, big && big !== local ? big : ''].filter(Boolean).join(', '); if (nm) { pick.area = nm; info(); }
    } catch { /* keep the nearest-city name */ }
  }
  function openInc() {
    $('#incForm').reset(); pick = null; geoSeq++; if (pickMarker) { pickMarker.remove(); pickMarker = null; }
    $('#pickInfo').textContent = 'No location picked yet. Click the map.'; $('#incModal').style.display = 'grid'; ensurePickMap();
    if (pickMap) setTimeout(() => { pickMap.invalidateSize(); if (map) pickMap.setView(map.getCenter(), map.getZoom()); }, 80);
    $('#placeSearch').focus();
  }
  $('#newIncident').addEventListener('click', openInc); $('#newIncident2').addEventListener('click', openInc);
  $('#closeInc').addEventListener('click', closeModals);
  $('#incModal').addEventListener('click', e => { if (e.target.id === 'incModal') closeModals(); });
  $('#incArea').replaceChildren(h('option', { value: '' }, '— choose a city —'), ...CITIES.map(c => h('option', { value: c.name }, c.name)));
  $('#incArea').addEventListener('change', e => { const c = city(e.target.value); if (!c) return; setPick(c.lat, c.lon, c.name); if (pickMap) pickMap.setView([c.lat, c.lon], 12); });
  async function searchPlace() {
    const q = $('#placeSearch').value.trim(); if (!q) return;
    try { const j = await (await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=' + encodeURIComponent(q))).json();
      if (!j.length) return toast('Place not found. Try a nearby town or click the map.');
      const r = j[0]; setPick(+r.lat, +r.lon, r.display_name.split(',').slice(0, 2).join(',').trim()); if (pickMap) pickMap.setView([+r.lat, +r.lon], 14);
    } catch { toast('Search needs an internet connection. Click the map or choose a city instead.'); }
  }
  $('#placeGo').addEventListener('click', searchPlace);
  $('#placeSearch').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); searchPlace(); } });
  $('#useGps').addEventListener('click', () => {
    if (!navigator.geolocation) return toast('This browser has no location service. Click the map instead.');
    navigator.geolocation.getCurrentPosition(pos => { setPick(pos.coords.latitude, pos.coords.longitude); if (pickMap) pickMap.setView([pos.coords.latitude, pos.coords.longitude], 15); },
      () => toast('Could not get your location. Click the map instead.'), { enableHighAccuracy: true, timeout: 10000 });
  });
  $('#incForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!pick) return toast('Pick the location first: click the map, search, or choose a city.');
    const type = $('#incType').value, tl = $('#incType').selectedOptions[0].textContent;
    addIncident({ name: $('#incName').value.trim() || `${tl} · ${pick.area}`.slice(0, 60), area: pick.area, lat: pick.lat, lon: pick.lon, type, severity: +$('#incSev').value, affected: +$('#incAff').value || 1, desc: $('#incDesc').value.trim() });
    closeModals();
  });

  /* ---------- alert bell + simulated incoming alerts ---------- */
  $('#bell').addEventListener('click', e => { e.stopPropagation(); $('#alertPanel').classList.toggle('hidden'); });
  document.addEventListener('click', e => { if (!e.target.closest('.bellwrap')) $('#alertPanel').classList.add('hidden'); });
  $('#markRead').addEventListener('click', () => { data.alerts.forEach(a => { a.read = true; }); persist(); renderAlerts(); });
  $('#enableNotif').addEventListener('click', async () => {
    if (!('Notification' in window)) return toast('This browser does not support desktop notifications.');
    const r = await Notification.requestPermission(); toast(r === 'granted' ? 'Desktop alerts enabled.' : 'Desktop alerts were not allowed.');
  });
  $('#simAlert').addEventListener('click', () => addIncident({ ...makeEvent(pickOf(PLACES)), desc: 'Simulated citizen report', source: 'Simulated alert' }));
  showApp();
})();