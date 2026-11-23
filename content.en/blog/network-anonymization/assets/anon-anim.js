/* Self-playing animations for the network anonymization post.
   The algorithms below are real (degree/triangle signatures, exact ΔU preview,
   dependency-tracked cache, ClassTargeted priority); the animation replays their trace. */
(() => {
  'use strict';

  // A 20-node toy graph. Greedy (and FastTracking) end at 2 unique nodes with a
  // budget of 4 deletions; ClassTargeted reaches 0.
  const G = {
    n: 20,
    pts: [[268,114],[116,226],[367,160],[578,207],[451,90],[289,298],[552,70],[184,310],[508,284],[131,40],[202,210],[336,229],[613,127],[98,146],[59,271],[109,339],[197,101],[49,88],[439,170],[628,40]],
    edges: [[0,2],[0,11],[0,16],[1,7],[1,10],[1,13],[1,14],[1,15],[2,4],[2,11],[3,6],[3,8],[4,6],[4,18],[5,7],[5,11],[6,19],[7,10],[7,14],[7,15],[8,18],[9,13],[9,16],[9,17],[10,11],[10,13],[10,16],[12,19],[13,14],[13,16],[13,17],[14,15]]
  };
  const BUDGET = 4;

  /* ---------- algorithm core ---------- */
  function makeState() {
    const adj = Array.from({ length: G.n }, () => new Map());
    G.edges.forEach(([a, b], i) => { adj[a].set(b, i); adj[b].set(a, i); });
    const deg = adj.map(m => m.size), tri = new Array(G.n).fill(0);
    for (let u = 0; u < G.n; u++) {
      const nb = [...adj[u].keys()];
      for (let i = 0; i < nb.length; i++) for (let j = i + 1; j < nb.length; j++) if (adj[nb[i]].has(nb[j])) tri[u]++;
    }
    const S = { adj, deg, tri, cc: new Map(), deleted: new Array(G.edges.length).fill(false) };
    S.key = u => S.deg[u] + ',' + S.tri[u];
    for (let u = 0; u < G.n; u++) S.cc.set(S.key(u), (S.cc.get(S.key(u)) || 0) + 1);
    return S;
  }
  const uniqueNodes = S => { const r = []; for (let u = 0; u < G.n; u++) if (S.cc.get(S.key(u)) === 1) r.push(u); return r; };
  const common = (S, a, b) => [...S.adj[a].keys()].filter(c => c !== b && S.adj[b].has(c));
  function preview(S, e) {
    const [a, b] = G.edges[e], cm = common(S, a, b), prop = new Map();
    prop.set(a, (S.deg[a] - 1) + ',' + (S.tri[a] - cm.length));
    prop.set(b, (S.deg[b] - 1) + ',' + (S.tri[b] - cm.length));
    for (const c of cm) prop.set(c, S.deg[c] + ',' + (S.tri[c] - 1));
    const ch = new Map();
    for (const [u, ns] of prop) { const os = S.key(u); ch.set(os, (ch.get(os) || 0) - 1); ch.set(ns, (ch.get(ns) || 0) + 1); }
    let dU = 0;
    for (const [s, c] of ch) { const bef = S.cc.get(s) || 0, aft = bef + c; dU += (aft === 1) - (bef === 1); }
    const touched = [...prop.keys()].filter(u => S.cc.get(S.key(u)) === 1);
    return { dU, touched, deps: [...ch.keys()], nodes: [...prop.keys()] };
  }
  function commit(S, e) {
    const [a, b] = G.edges[e], cm = common(S, a, b), changed = [a, b, ...cm], states = new Set();
    for (const u of changed) { const k = S.key(u); S.cc.set(k, S.cc.get(k) - 1); states.add(k); }
    S.adj[a].delete(b); S.adj[b].delete(a); S.deg[a]--; S.deg[b]--;
    S.tri[a] -= cm.length; S.tri[b] -= cm.length; for (const c of cm) S.tri[c]--;
    for (const u of changed) { const k = S.key(u); S.cc.set(k, (S.cc.get(k) || 0) + 1); states.add(k); }
    S.deleted[e] = true;
    return { changed, states };
  }
  const priority = (rule, p, e) => rule === 'ct' ? [-(-100 * p.dU + 4 * p.touched.length), p.dU, e] : [p.dU, 0, e];
  const less = (x, y) => { for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i]; return false; };
  const snap = S => ({ deg: S.deg.slice(), tri: S.tri.slice(), uniq: new Set(uniqueNodes(S)), cc: new Map(S.cc) });
  const live = S => G.edges.map((_, i) => i).filter(i => !S.deleted[i]);
  const name = e => `${G.edges[e][0]}–${G.edges[e][1]}`;
  const fmtDU = d => d === 0 ? '0' : (d < 0 ? '−' + -d : '+' + d);
  const list = xs => xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];


  /* ---------- drawing ---------- */
  const NS = 'http://www.w3.org/2000/svg';
  const SVG_TAGS = ['svg', 'g', 'line', 'circle', 'text', 'rect', 'path', 'defs', 'marker'];
  function h(tag, attrs, parent, text) {
    const n = SVG_TAGS.includes(tag) ? document.createElementNS(NS, tag) : document.createElement(tag);
    for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  class GraphView {
    constructor(parent, { edgeLabels = false } = {}) {
      this.svg = h('svg', { viewBox: '24 12 632 352', class: 'anim-graph' }, parent);
      const ge = h('g', {}, this.svg), gl = h('g', {}, this.svg), gn = h('g', {}, this.svg);
      this.edges = G.edges.map(([a, b]) => h('line', { x1: G.pts[a][0], y1: G.pts[a][1], x2: G.pts[b][0], y2: G.pts[b][1] }, ge));
      this.elab = edgeLabels ? G.edges.map(([a, b]) => {
        const x = (G.pts[a][0] + G.pts[b][0]) / 2, y = (G.pts[a][1] + G.pts[b][1]) / 2;
        const g = h('g', { transform: `translate(${x} ${y})`, class: 'el' }, gl);
        h('rect', { x: -12, y: -8, width: 24, height: 16 }, g);
        return { g, t: h('text', { 'text-anchor': 'middle', dy: '0.35em' }, g, '') };
      }) : null;
      this.nodes = G.pts.map(([x, y]) => {
        const g = h('g', { transform: `translate(${x} ${y})`, class: 'nd' }, gn);
        h('circle', { r: 15 }, g);
        return { g, t: h('text', { 'text-anchor': 'middle', dy: '0.35em' }, g, '') };
      });
      this.reset();
    }
    reset() {
      this.edges.forEach(l => l.setAttribute('class', 'ed'));
      this.nodes.forEach(n => n.g.setAttribute('class', 'nd'));
      if (this.elab) this.elab.forEach(l => { l.t.textContent = ''; l.g.setAttribute('class', 'el hide'); });
    }
    setSig(s) {
      this.sig = s;
      this.nodes.forEach((n, u) => { n.g.classList.toggle('uniq', s.uniq.has(u)); n.t.textContent = s.deg[u] + ',' + s.tri[u]; n.g.classList.remove('prev'); });
    }
    preview(u, label) { this.nodes[u].t.textContent = label; this.nodes[u].g.classList.add('prev'); }
    edgeClass(e, cls) { const l = this.edges[e]; if (l.classList.contains('gone')) return; l.setAttribute('class', 'ed ' + (cls || '')); }
    allEdges(cls) { this.edges.forEach((_, e) => this.edgeClass(e, cls)); }
    score(e, dU) { this.edgeClass(e, dU <= -2 ? 'g2' : dU < 0 ? 'g1' : dU === 0 ? 'z' : 'bad'); }
    label(e, txt, cls) { const l = this.elab[e]; l.t.textContent = txt; l.g.setAttribute('class', 'el ' + (cls || '')); }
    mark(list, cls) { this.nodes.forEach((n, u) => n.g.classList.toggle(cls, list.includes(u))); }
    ring(list) { this.mark(list, 'ring'); }
    tick() {}
    remove(e) { this.edges[e].setAttribute('class', 'ed gone'); if (this.elab) this.elab[e].g.setAttribute('class', 'el hide'); }
  }

  // Degree–triangle "state space": one circle per occupied signature, sized by group size.
  class SpaceView {
    constructor(parent) {
      const S0 = makeState();
      this.D = Math.max(...S0.deg); this.T = Math.max(...S0.tri);
      const cw = 40, chh = 30, ox = 34, oy = 24;
      this.xy = (d, t) => [ox + d * cw, oy + (this.T - t) * chh];
      const W = ox + this.D * cw + 26, H = oy + this.T * chh + 34;
      this.svg = h('svg', { viewBox: `0 0 ${W} ${H}`, class: 'anim-space' }, parent);
      for (let d = 0; d <= this.D; d++) h('text', { x: this.xy(d, 0)[0], y: H - 12, 'text-anchor': 'middle', class: 'ax' }, this.svg, d);
      for (let t = 0; t <= this.T; t++) h('text', { x: ox - 18, y: this.xy(0, t)[1], dy: '0.35em', 'text-anchor': 'end', class: 'ax' }, this.svg, t);
      h('text', { x: W - 4, y: H - 1, 'text-anchor': 'end', class: 'ax lbl' }, this.svg, 'degree →');
      h('text', { x: 2, y: 9, class: 'ax lbl' }, this.svg, 'triangles ↑');
      const defs = h('defs', {}, this.svg), mk = h('marker', { id: 'arrowhead', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs);
      h('path', { d: 'M0 0L10 5L0 10z', class: 'ah' }, mk);
      this.g = h('g', {}, this.svg);
      this.ga = h('g', {}, this.svg);
      this.cells = new Map();
    }
    mark(keys) { for (const [k, c] of this.cells) c.g.classList.toggle('chg', keys.includes(k)); }
    moves(list) {
      this.ga.textContent = '';
      const seen = new Set();
      for (const [a, b] of list) {
        if (a === b || seen.has(a + '>' + b)) continue; seen.add(a + '>' + b);
        const [x1, y1] = this.xy(...a.split(',').map(Number)), [x2, y2] = this.xy(...b.split(',').map(Number));
        const L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L, o = 12;
        h('path', { class: 'mv', d: `M${x1 + ux * o} ${y1 + uy * o}L${x2 - ux * o} ${y2 - uy * o}` }, this.ga);
      }
    }
    set(cc) {
      for (const [k, c] of cc) {
        let cell = this.cells.get(k);
        if (!cell) {
          const [d, t] = k.split(',').map(Number), [x, y] = this.xy(d, t);
          const g = h('g', { transform: `translate(${x} ${y})`, class: 'sp' }, this.g);
          cell = { g, c: h('circle', { r: 0 }, g), t: h('text', { 'text-anchor': 'middle', dy: '0.35em' }, g, '') };
          this.cells.set(k, cell);
        }
        cell.c.setAttribute('r', c ? 6 + 3.2 * Math.sqrt(c) : 0);
        cell.t.textContent = c ? c : '';
        cell.g.classList.toggle('uniq', c === 1);
      }
    }
  }

  function panel(parent, title, opts) {
    const p = h('div', { class: 'anim-panel' }, parent);
    const view = new GraphView(p, opts);
    const space = opts && opts.space ? new SpaceView(h('div', { class: 'anim-space-wrap' }, p)) : null;
    const bar = opts && opts.bar ? h('div', { class: 'anim-bar' }, p) : null;
    const fill = bar ? h('span', {}, bar) : null;
    const sub = h('div', { class: 'anim-sub' }, p);
    h('span', {}, sub, title);
    const clock = h('span', { class: 'anim-clock' }, sub, '');
    const stats = h('div', { class: 'anim-stats' }, p, '');
    const note = h('div', { class: 'anim-note' }, p, '\u00a0');
    return { p, view, space, clock, stats, note, fill };
  }

  /* ---------- action tracks ---------- */
  // An action waits `t` ticks, then runs `f`. Tracks in one scene share a clock.
  class Scene {
    constructor(root, tickMs, build, holdMs = 4500) {
      this.root = root; this.tickMs = tickMs; this.build = build; this.holdMs = holdMs;
      const bar = h('div', { class: 'anim-ctrl' }, root);
      this.counter = h('span', { class: 'anim-slide' }, bar, '');
      const btn = h('button', { type: 'button', class: 'anim-restart' }, bar, '\u21ba restart');
      btn.addEventListener('click', () => { this.start(); this.kick(); });
      this.visible = false; this.last = 0; this.start();
      new IntersectionObserver(es => { this.visible = es[0].isIntersecting; if (this.visible) this.kick(); }, { threshold: 0.25 }).observe(root);
    }
    start() {
      this.tracks = this.build().map(a => ({ a, i: 0, acc: 0 })); this.ticks = 0; this.doneAt = 0;
      this.total = this.tracks[0].a.filter(x => x.sl).length; this.slide = 0; this.showSlide();
      this.runFor(0);
    }
    showSlide() { this.counter.textContent = this.total ? `slide ${Math.max(1, this.slide)} / ${this.total}` : ''; }
    runFor(dt) {
      let alive = false;
      for (const tr of this.tracks) {
        tr.acc += dt;
        while (tr.i < tr.a.length && tr.acc >= tr.a[tr.i].t) { const act = tr.a[tr.i++]; tr.acc -= act.t; act.f(this.now || 0, this.ticks); if (act.sl && tr === this.tracks[0]) { this.slide++; this.showSlide(); } }
        if (tr.i < tr.a.length) alive = true; else tr.acc = 0;
      }
      return alive;
    }
    kick() { if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(t => this.frame(t)); } }
    frame(now) {
      this.raf = 0; this.now = now;
      const dt = Math.min(now - this.last, 100) / this.tickMs; this.last = now;
      if (this.doneAt) { if (now - this.doneAt > this.holdMs) this.start(); }
      else { this.ticks += dt; if (!this.runFor(dt)) this.doneAt = now; }
      this.onFrame && this.onFrame(now);
      if (this.visible) this.kick();
    }
  }

  /* ---------- Figure 4: greedy vs ClassTargeted ---------- */
  // Both runs are traced first; the figure then plays them side by side and
  // slows down at the first step where the two rules choose different edges.
  function trace(rule) {
    const S = makeState(), out = [];
    for (let k = 0; k < BUDGET && uniqueNodes(S).length > 0; k++) {
      const before = snap(S), ps = new Map(); let bp = null, be = -1;
      for (const e of live(S)) { const p = preview(S, e), pr = priority(rule, p, e); ps.set(e, p); if (!bp || less(pr, bp)) { bp = pr; be = e; } }
      const minDU = Math.min(...[...ps.values()].map(p => p.dU));
      const ties = [...ps].filter(([, p]) => p.dU === minDU).map(([e]) => e);
      const p = ps.get(be), [a, b] = G.edges[be], cm = common(S, a, b);
      const mv = p.nodes.map(u => [u, S.key(u), (u === a || u === b) ? (S.deg[u] - 1) + ',' + (S.tri[u] - cm.length) : S.deg[u] + ',' + (S.tri[u] - 1)]);
      const touchedOf = new Map(ties.map(e => [e, ps.get(e).touched]));
      const dUs = [...ps].map(([e, q]) => [e, q.dU]);
      commit(S, be);
      out.push({ pick: be, p, ties, touchedOf, minDU, mv, dUs, before, after: snap(S), rest: live(S) });
    }
    return out;
  }

  function sceneRule(stage) {
    const step = stepBox(stage);
    const wrap = h('div', { class: 'anim-pair' }, stage);
    const RULES = ['greedy', 'ct'];
    const P = { greedy: panel(wrap, '(a) Greedy rule', { space: true, edgeLabels: true }), ct: panel(wrap, '(b) ClassTargeted rule', { space: true, edgeLabels: true }) };
    const T = { greedy: trace('greedy'), ct: trace('ct') };
    const div = T.greedy.findIndex((s, k) => !T.ct[k] || s.pick !== T.ct[k].pick);
    const nodes = (xs, w = 'node') => `${w}${xs.length > 1 ? 's' : ''} ${list(xs)}`;
    const num = n => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][n] || String(n);
    function build() {
      const A = [], push = (t, f, sl) => A.push({ t, f, sl }), s0 = snap(makeState());
      const stat = (r, k, U) => { P[r].stats.textContent = `deletions ${k}/${BUDGET}; U = ${U}`; };
      const clear = r => { const v = P[r].view; v.ring([]); v.mark([], 'nb'); v.mark([], 'hid'); P[r].space.moves([]); P[r].space.mark([]); v.elab.forEach(l => l.g.setAttribute('class', 'el hide')); };
      const show = (r, s) => { const v = P[r].view; v.edgeClass(s.pick, 'pick'); v.mark(s.p.nodes, 'nb'); v.ring(s.p.touched); P[r].space.moves(s.mv.map(m => [m[1], m[2]])); P[r].space.mark(s.mv.map(m => m[1])); };
      const apply = (r, s, k) => { const v = P[r].view; clear(r); v.remove(s.pick); v.setSig(s.after); P[r].space.set(s.after.cc); stat(r, k + 1, s.after.uniq.size); s.rest.forEach(e => v.edgeClass(e, 'un')); };
      push(0, () => {
        RULES.forEach(r => { const v = P[r].view; v.reset(); v.setSig(s0); P[r].space.set(s0.cc); clear(r); stat(r, 0, s0.uniq.size); P[r].note.textContent = ' '; P[r].clock.textContent = ''; });
        step.textContent = 'Both rules delete one edge at a time and score every candidate by ΔU, as in Figure 3. They can differ only when several edges have the same best score.';
      }, 1);
      for (let k = 0; k < BUDGET; k++) {
        const g = T.greedy[k], c = T.ct[k];
        if (!g && !c) break;
        if (k < div) {
          push(400, () => {
            RULES.forEach(r => { T[r][k].dUs.forEach(([e, d]) => P[r].view.score(e, d)); show(r, T[r][k]); P[r].note.textContent = `Deletes ${name(T[r][k].pick)} (ΔU = ${fmtDU(T[r][k].p.dU)}).`; });
            step.textContent = `Step ${k + 1}. ` + (g.ties.length > 1
              ? `${num(g.ties.length)[0].toUpperCase() + num(g.ties.length).slice(1)} edges tie at ΔU = ${fmtDU(g.minDU)} (${list(g.ties.map(name))}). Both rules choose ${name(g.pick)}: greedy because it comes first, ClassTargeted because it changes the most unique nodes (${num(g.p.touched.length)}).`
              : `Edge ${name(g.pick)} gives the largest reduction (ΔU = ${fmtDU(g.p.dU)}), so both rules delete it.`) + ' The changed nodes are shaded; the arrows in the grid show their new signatures.';
          }, 1);
          push(380, () => RULES.forEach(r => apply(r, T[r][k], k)));
        } else if (k === div) {
          const tie = g.ties, tl = tie.map(e => [e, g.touchedOf.get(e)]);
          push(380, () => {
            RULES.forEach(r => { const v = P[r].view; tie.forEach(e => { v.edgeClass(e, 'try'); v.label(e, fmtDU(g.minDU), 'top'); }); P[r].note.textContent = ' '; });
            step.textContent = `Step ${k + 1}. Now ${num(tie.length)} edges give the same best score, ΔU = ${fmtDU(g.minDU)}: ${list(tie.map(name))}. ` +
              tl.map(([e, t], i) => `${i ? 'edge' : 'Edge'} ${name(e)} changes ${t.length ? `${num(t.length)} unique nodes (${list(t)})` : 'no unique node'}`).join('; ') + '.';
          }, 1);
          const hidden = g.mv.map(m => m[2]).filter(k2 => g.before.cc.get(k2) === 1).map(k2 => [...g.before.uniq].find(u => g.before.deg[u] + ',' + g.before.tri[u] === k2)).filter(u => u != null).sort((x, y) => x - y);
          const moved = c.p.touched.filter(u => !c.after.uniq.has(u)), still = c.p.touched.filter(u => c.after.uniq.has(u));
          push(450, () => {
            RULES.forEach(r => { const s = T[r][k], v = P[r].view; tie.forEach(e => { if (e !== s.pick) { v.edgeClass(e, 'un'); v.label(e, '', 'hide'); } }); show(r, s); });
            P.greedy.note.textContent = `Takes ${name(g.pick)}.`;
            P.ct.note.textContent = `Takes ${name(c.pick)} (ΔU plus bonus).`;
            step.textContent = `Greedy takes ${name(g.pick)}, the first of the tied edges. ClassTargeted takes ${name(c.pick)}: the same ΔU, plus a bonus for the ${num(c.p.touched.length)} unique nodes it changes (thick outline).`;
          }, 1);
          push(550, () => {
            P.greedy.view.mark(hidden, 'hid');
            step.textContent = `The arrows show where the changed nodes move. Greedy's edge gives other nodes the signatures of ${nodes(hidden)}, which hides ${hidden.length > 1 ? 'them' : 'it'} (dashed outline). ClassTargeted's edge moves the unique ${nodes(moved)} into existing groups${still.length ? ` and also changes ${nodes(still)}` : ''}.`;
          }, 1);
          push(500, () => RULES.forEach(r => apply(r, T[r][k], k)));
        } else {
          push(420, () => {
            RULES.forEach(r => {
              const s = T[r][k], v = P[r].view;
              if (!s) return;
              s.dUs.forEach(([e, d]) => v.score(e, d)); show(r, s);
              P[r].note.textContent = `Deletes ${name(s.pick)} (ΔU = ${fmtDU(s.p.dU)})` + (r === 'ct' && s.ties.length > 1 && s.p.touched.length ? `, chosen from ${s.ties.length} tied edges.` : '.');
            });
            step.textContent = `Step ${k + 1}. ` + (k === div + 1 ? 'From here on the two rules work on different networks. ClassTargeted again breaks a tie in favour of the edge that changes unique nodes.' : `Greedy's best remaining edge ${g.p.dU ? `reduces U by ${-g.p.dU}` : 'no longer reduces U'}; ClassTargeted's reduces it by ${-c.p.dU}.`);
          }, 1);
          push(400, () => RULES.forEach(r => T[r][k] && apply(r, T[r][k], k)));
        }
      }
      const fg = T.greedy[T.greedy.length - 1].after.uniq, fc = T.ct[T.ct.length - 1].after.uniq;
      push(100, () => {
        RULES.forEach(r => { const f = T[r][T[r].length - 1].after.uniq.size; P[r].note.textContent = `Final U = ${f}.`; P[r].clock.textContent = `, final U = ${f}`; });
        step.textContent = `With the same budget of ${BUDGET} deletions, greedy leaves ${fg.size} unique node${fg.size === 1 ? '' : 's'} (${list([...fg])}) and ClassTargeted ${fc.size ? fc.size : 'none'}. The runs split at the tie in step ${div + 1}, and ClassTargeted's tie-breaks in steps ${div + 1} and ${div + 2} together leave no unique nodes.`;
      }, 1);
      push(600, () => {});
      return A;
    }
    new Scene(stage, 10, () => [build()], 3000);
  }


  const stepBox = parent => h('div', { class: 'anim-step' }, parent, ' ');
  const affected = (S, e) => { const [a, b] = G.edges[e]; return [a, b, ...common(S, a, b)]; };
  const sigOf = (S, u) => `(${S.deg[u]}, ${S.tri[u]})`;

  /* ---------- Figure 1: what the problem is ---------- */
  function sceneProblem(stage) {
    const step = stepBox(stage);
    const solo = h('div', { class: 'anim-solo' }, stage);
    const v = new GraphView(solo);
    const cnt = h('div', { class: 'anim-sub' }, solo, '');
    function build() {
      const S = makeState(), A = [], push = (t, f, sl) => A.push({ t, f, sl }), s0 = snap(S);
      const nb = u => [...S.adj[u].keys()];
      const uniq = [...s0.uniq];
      const u = uniq.filter(x => S.tri[x] >= 1 && S.deg[x] >= 2).sort((x, y) => S.deg[x] - S.deg[y])[0];
      const nbs = nb(u), spokes = nbs.map(w => S.adj[u].get(w)), tris = [];
      for (let i = 0; i < nbs.length; i++) for (let j = i + 1; j < nbs.length; j++) if (S.adj[nbs[i]].has(nbs[j])) tris.push(S.adj[nbs[i]].get(nbs[j]));
      const pairKey = [...S.cc].find(([k, c]) => c === 2 && +k.split(',')[0] >= 2)[0];
      const pair = [...Array(G.n).keys()].filter(x => S.key(x) === pairKey);
      let best = null, be = -1;
      for (const e of live(S)) { const p = preview(S, e), pr = priority('greedy', p, e); if (!best || less(pr, best)) { best = pr; be = e; } }
      const aff = affected(S, be), sig0 = aff.map(x => sigOf(S, x));
      commit(S, be); const s1 = snap(S), sig1 = aff.map(x => sigOf(S, x));
      const U = n => `U = ${n} unique nodes (red)`;
      push(0, () => {
        v.reset(); v.setSig(s0); cnt.textContent = U(s0.uniq.size);
        step.textContent = 'Each node is labelled with its signature: its degree and the number of triangles it belongs to. Red nodes have a signature that no other node has, so anyone who knows these two numbers can single them out.';
      }, 1);
      push(450, () => {
        v.mark([u], 'sel'); v.mark(nbs, 'nb'); spokes.forEach(e => v.edgeClass(e, 'hl')); tris.forEach(e => v.edgeClass(e, 'tri'));
        step.textContent = `For example, node ${u} has ${s0.deg[u]} neighbours (thick edges)${tris.length ? `, and ${tris.length} pair${tris.length > 1 ? 's' : ''} of them ${tris.length > 1 ? 'are' : 'is'} connected (dashed), giving ${tris.length} triangle${tris.length > 1 ? 's' : ''}` : ''}. No other node has signature ${'(' + s0.deg[u] + ', ' + s0.tri[u] + ')'}, so node ${u} is unique.`;
      }, 1);
      push(550, () => {
        v.mark([], 'sel'); v.mark([], 'nb'); v.allEdges('');
        v.mark(pair, 'sel');
        step.textContent = `Nodes ${pair[0]} and ${pair[1]} share the signature (${pairKey.replace(',', ', ')}). Their structure alone does not tell them apart, so they are not unique.`;
      }, 1);
      push(500, () => {
        v.mark([], 'sel'); v.edgeClass(be, 'try'); v.mark(aff, 'nb');
        step.textContent = `Deleting an edge changes the signatures of its two endpoints and of the nodes they have in common. Consider edge ${name(be)}; the shaded nodes ${aff.join(', ')} would be affected.`;
      }, 1);
      push(450, () => {
        v.remove(be); v.setSig(s1); v.mark([], 'nb'); v.mark(aff, 'chg'); cnt.textContent = U(s1.uniq.size);
        step.textContent = `After the deletion, nodes ${list(aff)} have new signatures (shown on the nodes). Several of them now share a signature with another node, and U falls from ${s0.uniq.size} to ${s1.uniq.size}.`;
      }, 1);
      push(650, () => {
        v.mark([], 'chg');
        step.textContent = `The task is to choose at most ${BUDGET} edges to delete so that as few nodes as possible remain unique. The reference greedy algorithm does this one edge at a time, each time deleting the edge that reduces U the most.`;
      }, 1);
      push(500, () => {});
      return A;
    }
    new Scene(stage, 10, () => [build()], 2500);
  }

  /* ---------- Figure 2: scoring one candidate ---------- */
  function sceneEval(stage) {
    const step = stepBox(stage);
    const wrap = h('div', { class: 'anim-pair' }, stage);
    const mk = title => { const p = h('div', { class: 'anim-panel' }, wrap); const v = new GraphView(p); h('div', { class: 'anim-sub' }, p, title); const c = h('div', { class: 'anim-count' }, p, ''); return { v, c }; };
    const L = mk('(a) Reference: delete, recount every node, undo');
    const R = mk('(b) FastTracking: compute only the affected nodes');
    const NODE = 11;
    // Work over a full run, for the closing summary.
    function totals() {
      const S = makeState(); let ref = 0, ft = 0, ftc = 0; const cache = new Map();
      for (const e of live(S)) { const p = preview(S, e); cache.set(e, p); ft += p.nodes.length; ftc += p.nodes.length; }
      for (let k = 0; k < BUDGET; k++) {
        ref += live(S).length * G.n;
        let bp = null, be = -1; for (const e of live(S)) { const pr = priority('greedy', cache.get(e), e); if (!bp || less(pr, bp)) { bp = pr; be = e; } }
        const { changed, states } = commit(S, be);
        for (const e of live(S)) {
          const [a, b] = G.edges[e];
          const p = preview(S, e); ft += p.nodes.length;
          if (changed.includes(a) || changed.includes(b) || cache.get(e).deps.some(d => states.has(d))) { cache.set(e, p); ftc += p.nodes.length; }
        }
      }
      return { ref, ft, ftc };
    }
    function build() {
      const S = makeState(), A = [], push = (t, f, sl) => A.push({ t, f, sl }), s0 = snap(S);
      const byCommon = c => live(S).find(e => common(S, ...G.edges[e]).length === c);
      const cands = [byCommon(2), byCommon(0), byCommon(1)].filter(e => e != null);
      const { ref, ft, ftc } = totals();
      let cl = 0, cr = 0;
      const count = () => { L.c.textContent = `nodes recounted so far: ${cl}`; R.c.textContent = `nodes computed so far: ${cr}`; };
      push(0, () => {
        [L, R].forEach(P => { P.v.reset(); P.v.setSig(s0); }); cl = 0; cr = 0; count();
        step.textContent = 'To choose an edge, both methods first score every candidate: how would U change if this edge were deleted? Below, three candidates are scored at the same rate per node.';
      }, 1);
      cands.forEach((e, i) => {
        const p = preview(S, e), aff = p.nodes;
        const [a, b] = G.edges[e], cm = common(S, a, b);
        const newSig = new Map([[a, `${S.deg[a] - 1},${S.tri[a] - cm.length}`], [b, `${S.deg[b] - 1},${S.tri[b] - cm.length}`], ...cm.map(c => [c, `${S.deg[c]},${S.tri[c] - 1}`])]);
        push(250, () => {
          [L, R].forEach(P => { P.v.setSig(s0); P.v.mark([], 'done'); P.v.mark([], 'nb'); P.v.edgeClass(e, 'try'); });
          step.textContent = `Candidate ${i + 1}: edge ${name(e)}. ${cm.length ? `Its endpoints have ${cm.length} common neighbour${cm.length > 1 ? 's' : ''}, so ${aff.length} nodes change signature.` : `Its endpoints have no common neighbours, so only the ${aff.length} endpoints change signature.`}`;
        }, 1);
        for (let t = 0; t < G.n; t++) {
          push(NODE, () => {
            L.v.mark([...Array(t + 1).keys()], 'done'); cl++;
            if (t < aff.length) { R.v.mark(aff.slice(0, t + 1), 'nb'); R.v.preview(aff[t], newSig.get(aff[t])); cr++; }
            if (t === aff.length) R.c.textContent = `nodes computed so far: ${cr}. Score: ΔU = ${fmtDU(p.dU)}`;
            else if (t < aff.length) count();
            L.c.textContent = `nodes recounted so far: ${cl}`;
          });
        }
        push(NODE, () => { L.c.textContent = `nodes recounted so far: ${cl}. Score: ΔU = ${fmtDU(p.dU)}`; });
        push(200, () => { [L, R].forEach(P => P.v.edgeClass(e, '')); });
      });
      push(80, () => {
        [L, R].forEach(P => { P.v.setSig(s0); P.v.mark([], 'done'); P.v.mark([], 'nb'); });
        step.textContent = `Both methods obtain the same scores, but the reference does five to ten times as much work per candidate here, and the gap grows with the size of the network. Over all candidates and all ${BUDGET} deletions in this example, the reference recounts ${ref.toLocaleString('en-GB')} nodes and FastTracking computes ${ft.toLocaleString('en-GB')}. Reusing stored scores (Figure 3) lowers the latter to ${ftc.toLocaleString('en-GB')}.`;
      }, 1);
      push(700, () => {});
      return A;
    }
    new Scene(stage, 10, () => [build()], 2000);
  }

  /* ---------- Figure 3: reusing stored scores ---------- */
  function sceneCache(stage) {
    const step = stepBox(stage);
    const solo = h('div', { class: 'anim-solo' }, stage);
    const v = new GraphView(solo, { edgeLabels: true });
    const cnt = h('div', { class: 'anim-sub' }, solo, '');
    function build() {
      const S = makeState(), A = [], push = (t, f, sl) => A.push({ t, f, sl }), s0 = snap(S);
      const cache = new Map(), rescore = e => cache.set(e, preview(S, e));
      live(S).forEach(rescore);
      const init = live(S).map(e => [e, cache.get(e).dU]);
      push(0, () => {
        v.reset(); v.setSig(s0); cnt.textContent = `U = ${s0.uniq.size}`;
        step.textContent = 'FastTracking scores every edge once and stores the result. The number on each edge is its stored score, ΔU: the change in the number of unique nodes if that edge were deleted. Negative is good; −2 means two fewer unique nodes.';
      }, 1);
      init.forEach(([e, d]) => push(5, () => v.label(e, fmtDU(d))));
      for (let k = 0; k < BUDGET; k++) {
        let top = null; for (const e of live(S)) if (top == null || less(priority('greedy', cache.get(e), e), priority('greedy', cache.get(top), top))) top = e;
        const pe = top, pdU = cache.get(top).dU;
        const { changed, states } = commit(S, top), s = snap(S), ch = changed.slice();
        const local = live(S).filter(e => changed.includes(G.edges[e][0]) || changed.includes(G.edges[e][1]));
        const viaGroup = live(S).filter(e => !local.includes(e) && cache.get(e).deps.some(d => states.has(d)));
        const keep = live(S).length - local.length - viaGroup.length;
        [...local, ...viaGroup].forEach(rescore);
        const upd = [...local, ...viaGroup].map(e => [e, cache.get(e).dU]);
        const pick = () => { v.edgeClass(pe, 'pick'); v.label(pe, fmtDU(pdU), 'top'); };
        const del = () => { v.remove(pe); v.setSig(s); v.mark(ch, 'chg'); cnt.textContent = `U = ${s.uniq.size}`; };
        const inv1 = () => local.forEach(e => { v.edgeClass(e, 'stale'); v.label(e, '?', 'st1'); });
        const inv2 = () => viaGroup.forEach(e => { v.edgeClass(e, 'stale2'); v.label(e, '?', 'st2'); });
        const fix = () => upd.forEach(([e, d]) => { v.edgeClass(e, ''); v.label(e, fmtDU(d), 'new'); });
        const settle = () => { upd.forEach(([e, d]) => v.label(e, fmtDU(d))); v.mark([], 'chg'); };
        if (k === 0) {
          // The first deletion is shown in detail.
          push(330, () => { pick(); step.textContent = `Step 1. The best stored score belongs to edge ${name(pe)} (ΔU = ${fmtDU(pdU)}), so this edge is deleted. No scores need to be recomputed to find it.`; }, 1);
          push(300, () => { del(); step.textContent = `Deleting it changes the signatures of nodes ${ch.join(', ')} (shaded).`; }, 1);
          push(400, () => {
            inv1(); step.textContent = `The stored scores of the ${local.length} edges that touch these nodes are no longer valid (dotted, marked ?).` +
              (viaGroup.length ? ` ${viaGroup.length} further scores (dash-dotted) relied on how many nodes had a particular signature; those counts have changed, so these scores are invalid as well, even though some of the edges are far from the deletion.` : '');
          }, 1);
          push(120, inv2);
          push(450, () => { fix(); step.textContent = `Only these ${upd.length} scores are recomputed, each from the few nodes the edge affects. The other ${keep} stored scores are reused unchanged.`; }, 1);
          push(300, settle);
        } else {
          // Later deletions repeat the same cycle at a faster pace.
          push(150, () => { pick(); step.textContent = `Step ${k + 1}. Edge ${name(pe)} has the best stored score (ΔU = ${fmtDU(pdU)}) and is deleted. ${upd.length} scores become invalid and are recomputed; the other ${keep} are reused.`; }, 1);
          push(120, del); push(110, inv1); push(80, inv2); push(150, fix); push(180, settle);
        }
      }
      push(100, () => { step.textContent = `The budget of ${BUDGET} deletions is used up. FastTracking has chosen exactly the same edges as the reference greedy algorithm.`; }, 1);
      push(400, () => {});
      return A;
    }
    new Scene(stage, 10, () => [build()], 2500);
  }

  const scenes = { problem: sceneProblem, eval: sceneEval, cache: sceneCache, rule: sceneRule };

  function init() {
    document.querySelectorAll('[data-anim]').forEach(fig => {
      const f = scenes[fig.dataset.anim];
      if (f && !fig.dataset.ready) { fig.dataset.ready = '1'; f(fig.querySelector('.anim-stage')); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
