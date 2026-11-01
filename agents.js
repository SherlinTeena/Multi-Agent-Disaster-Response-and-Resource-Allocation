/* Response Grid — multi-agent engine (pure functions, no DOM).
   Pipeline: Analysis -> Location -> Rescue -> Supply -> Communication, merged by a Coordinator.
   All numbers are fictional demo data. */
(function (root) {
  'use strict';
  // Map units: equirectangular projection of Tamil Nadu (1 unit ≈ 1.35 km). Real city coordinates, sample scenarios.
  const KM_PER_UNIT = 1.352;
  const proj = (lat, lon) => ({ x: Math.round((450 + (lon - 78.3) * 80.6) * 10) / 10, y: Math.round((13.6 - lat) * 82.1 * 10) / 10 });
  const place = ([name, lat, lon]) => ({ name, lat, lon, ...proj(lat, lon) });
  const CITIES = [['Chennai',13.08,80.27],['Cuddalore',11.75,79.77],['Nagapattinam',10.77,79.84],['Thoothukudi',8.76,78.13],['Madurai',9.93,78.12],
    ['Coimbatore',11.02,76.96],['Tiruchirappalli',10.79,78.70],['Salem',11.66,78.15],['Vellore',12.92,79.13],['Tirunelveli',8.73,77.70],
    ['Nilgiris (Ooty)',11.41,76.70],['Kanyakumari',8.09,77.54],['Rameswaram',9.29,79.31],['Thanjavur',10.79,79.14],['Erode',11.34,77.72]].map(place);
  const HUBS = [['Chennai Hub',12.97,79.94],['Tiruchirappalli Hub',10.79,78.70],['Madurai Hub',9.93,78.12]].map(place);
  const SPEED_KMH = 35, ROAD_FACTOR = 1.35, RESERVE_PCT = 0.10, MAX_TEAMS = 4;
  const RES = { water:'Water crates', medical:'Medical kits', shelter:'Shelter packs', food:'Food boxes', generator:'Generator sets' };
  // Planning need per affected person (72 h horizon), by incident type.
  const PROFILE = {
    flood:{water:.9,medical:.28,shelter:.25,food:.5}, power:{water:.35,medical:.2,generator:.05,food:.2},
    shelter:{shelter:.45,food:.6,water:.5,medical:.1}, supply:{water:.8,food:.8,medical:.12},
    fire:{medical:.3,shelter:.3,water:.3,food:.3}, quake:{medical:.35,shelter:.4,water:.7,food:.5},
    cyclone:{water:.8,medical:.2,shelter:.4,food:.6,generator:.03}, landslide:{medical:.3,shelter:.3,food:.4,water:.4}
  };
  const VULN = { flood:1, quake:1, fire:1, cyclone:1, landslide:1, power:.7, shelter:.6, supply:.4 };
  const RISKY = new Set(['flood', 'quake', 'cyclone', 'landslide']);
  const ADVISORY = {
    flood:'Flooding reported in {a}. Avoid floodwater and follow official evacuation instructions. Responders are on the way.',
    power:'Power outage in {a}. Use flashlights, not candles, and check on vulnerable neighbors. Crews are assessing.',
    shelter:'The shelter in {a} is near capacity. Check official channels for alternate shelter locations.',
    supply:'Supply distribution is being arranged for {a}. Watch official channels for pickup points and times.',
    fire:'Fire or smoke reported in {a}. Leave immediately if instructed and keep roads clear for responders.',
    quake:'Earthquake damage reported in {a}. Expect aftershocks, avoid damaged buildings, and follow official guidance.',
    cyclone:'Cyclone impact in {a}. Move to designated shelters if instructed, stay away from the coast and fallen power lines, and follow official weather alerts.',
    landslide:'Landslide risk or damage in {a}. Avoid hill roads and slopes, and follow official guidance. Responders are on the way.'
  };

  const label = sev => sev >= 4 ? 'Critical' : sev === 3 ? 'Elevated' : 'Moderate';
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) * KM_PER_UNIT;
  const eta = km => Math.max(1, Math.round(km * ROAD_FACTOR / SPEED_KMH * 60));
  const fmtMin = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
  const reserve = s => Math.ceil(s.total * RESERVE_PCT);
  const usable = s => Math.max(0, s.avail - reserve(s));

  /* ---- Data analysis agent: priority score 0-100 ---- */
  function score(i) {
    const age = Math.min((i.ageMin || 0) / 120, 1);
    const unassigned = i.status === 'Needs assignment' ? 5 : 0;
    return Math.max(1, Math.round(Math.min(100, 40 * i.severity / 5 + 25 * Math.min(i.affected / 500, 1) + 20 * (VULN[i.type] ?? .5) + 10 * age + unassigned)));
  }
  function analysis(incs) {
    return incs.filter(i => i.status !== 'Resolved').map(i => ({ ...i, score: score(i), priority: label(i.severity) })).sort((a, b) => b.score - a.score);
  }
  function need(i) {
    const out = {};
    if (i.settled) return out;              // allocation already approved; leftover shows as "unmet", not re-competed
    for (const [r, k] of Object.entries(PROFILE[i.type] || PROFILE.supply)) {
      const n = Math.max(1, Math.ceil(i.affected * k)) - ((i.delivered || {})[r] || 0);
      if (n > 0) out[r] = n;
    }
    return out;
  }

  /* ---- Location & route agent: nearest supply hub, distance and ETA ---- */
  function location(ranked, hubs) {
    return Object.fromEntries(ranked.map(i => {
      const hub = hubs.reduce((best, h) => dist(h, i) < dist(best, i) ? h : best), km = dist(hub, i);
      return [i.id, { km: +km.toFixed(1), min: eta(km), risk: RISKY.has(i.type), hub }];
    }));
  }

  /* ---- Rescue coordination agent: nearest free teams, highest priority first ---- */
  function rescue(ranked, teams) {
    const free = teams.filter(t => t.status === 'available');
    const out = {}, short = [];
    for (const i of ranked) {
      const have = teams.filter(t => t.assigned === i.id).length;
      const want = Math.max(0, Math.min(MAX_TEAMS, Math.ceil(i.affected / 150)) - have);
      free.sort((a, b) => dist(a, i) - dist(b, i));
      const picks = free.splice(0, want);
      if (picks.length) out[i.id] = { teams: picks.map(t => t.id), min: Math.min(...picks.map(t => eta(dist(t, i)))) };
      if (picks.length < want) short.push({ id: i.id, kind: 'teams', missing: want - picks.length });
    }
    return { out, short };
  }

  /* ---- Supply matching agent: priority-weighted water-filling ----
     Each pass offers every unsatisfied incident a share proportional to its priority score;
     incidents whose need is covered are capped and their surplus is redistributed. */
  function fill(stock, demand, weight) {
    const out = {}, ids = Object.keys(demand);
    ids.forEach(k => { out[k] = 0; });
    let left = stock, active = ids;
    while (left > 0 && active.length) {
      const W = active.reduce((s, k) => s + weight[k], 0), next = []; let gave = 0;
      for (const k of active) {
        const room = demand[k] - out[k];
        if (left * weight[k] / W >= room) { out[k] += room; gave += room; } else next.push(k);
      }
      if (gave === 0) {                       // nobody saturates: split proportionally, largest remainders first
        const frac = []; let used = 0;
        for (const k of active) { const s = left * weight[k] / W, f = Math.floor(s); out[k] += f; used += f; frac.push([k, s - f]); }
        frac.sort((a, b) => b[1] - a[1] || weight[b[0]] - weight[a[0]]);
        let rem = left - used;
        for (const [k] of frac) { if (rem <= 0) break; if (out[k] < demand[k]) { out[k]++; rem--; } }
        break;
      }
      left -= gave; active = next;
    }
    return out;
  }
  function supply(ranked, stock) {
    const alloc = {}, short = [];
    for (const r of Object.keys(RES)) {
      const demand = {}, weight = {};
      ranked.forEach(i => { const n = need(i)[r]; if (n) { demand[i.id] = n; weight[i.id] = i.score; } });
      if (!Object.keys(demand).length) continue;
      const got = fill(usable(stock[r]), demand, weight);
      for (const id in got) {
        if (got[id] > 0) (alloc[id] ||= {})[r] = got[id];
        if (got[id] < demand[id]) short.push({ id, kind: r, missing: demand[id] - got[id], need: demand[id] });
      }
    }
    return { alloc, short };
  }

  /* ---- Communication agent: draft advisories (always need human release) ---- */
  const advisory = i => (ADVISORY[i.type] || ADVISORY.supply).replace('{a}', i.area);

  /* ---- Coordinator: runs the pipeline and returns proposals + an agent trace ---- */
  function plan(state) {
    const ranked = analysis(state.incidents);
    const loc = location(ranked, state.hubs);
    const res = rescue(ranked, state.teams);
    const sup = supply(ranked, state.stock);
    const rows = ranked.filter(i => sup.alloc[i.id] || res.out[i.id]).map(i => ({
      id: i.id, name: i.name, area: i.area, priority: i.priority, score: i.score,
      alloc: sup.alloc[i.id] || {}, teams: (res.out[i.id] || {}).teams || [], etaMin: (res.out[i.id] || {}).min || null,
      convoy: loc[i.id]
    }));
    const byId = Object.fromEntries(ranked.map(i => [i.id, i]));
    const shortLine = s => `${byId[s.id].area} short ${s.missing} ${s.kind === 'teams' ? 'team(s)' : RES[s.kind].toLowerCase()}`;
    const shortages = [...sup.short, ...res.short];
    const top = ranked[0];
    const trace = [
      { agent: 'Data analysis', text: ranked.length ? `Ranked ${ranked.length} open incident(s) by severity, people affected, vulnerability and age. Top: ${ranked.map(i => `${i.name} (${i.score})`).slice(0, 3).join(' > ')}.` : 'No open incidents.' },
      { agent: 'Location & route', text: top ? `${loc[top.id].hub.name} to ${top.area}: ${loc[top.id].km} km, about ${fmtMin(loc[top.id].min)} by road.${ranked.filter(i => loc[i.id].risk).length ? ' Hazard zones need road and bridge checks before dispatch.' : ''}` : 'Nothing to route.' },
      { agent: 'Rescue coordination', text: Object.keys(res.out).length ? Object.entries(res.out).map(([id, v]) => `${v.teams.length} team(s) to ${byId[id].area} (ETA ${fmtMin(v.min)})`).join('; ') + '.' : 'No new team assignments needed.' },
      { agent: 'Supply matching', text: Object.keys(sup.alloc).length ? `Stock is pooled across hubs and allocated by priority-weighted fair share, keeping a ${Math.round(RESERVE_PCT * 100)}% reserve per category. ${shortages.filter(s => s.kind !== 'teams').length ? 'Gaps: ' + shortages.filter(s => s.kind !== 'teams').slice(0, 4).map(shortLine).join('; ') + '.' : 'All needs covered.'}` : 'No supply allocations proposed.' },
      { agent: 'Communication', text: top ? `Draft for ${top.area}: “${advisory(top)}” (confirm with the incident lead before release).` : 'No advisories to draft.' },
      { agent: 'Coordinator', text: `${rows.length} proposal(s) await human approval. ${shortages.length ? shortages.length + ' shortfall(s) need escalation or mutual aid.' : 'No shortfalls.'}` }
    ];
    return { ranked, rows, shortages, trace, advisory };
  }

  const api = { MAP: { proj }, CITIES, HUBS, fmtMin, RES, PROFILE, label, score, need, analysis, location, rescue, supply, fill, plan, advisory, reserve, usable, dist, eta };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Agents = api;
})(typeof window !== 'undefined' ? window : globalThis);
