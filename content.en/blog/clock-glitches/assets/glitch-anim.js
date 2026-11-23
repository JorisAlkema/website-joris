/* Self-playing figure for the clock-glitch post.
   Three passes over the hidden-layer loop of a small MNIST network:
   (1) normal execution, (2) a clock glitch on the ChipWhisperer, (3) GDB replays
   that skip one instruction at a time. Assembly, cycle counts and values are illustrative. */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  function h(tag, attrs, parent, text) {
    const svg = ['svg', 'g', 'line', 'circle', 'text', 'rect', 'path', 'image', 'polyline'].includes(tag);
    const n = svg ? document.createElementNS(NS, tag) : document.createElement(tag);
    for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  const ASM = [
    ['ldr', 'r0, [r6, r5, lsl #2]', '@ w[j*784 + i]', 2],
    ['ldr', 'r1, [r7, r5, lsl #2]', '@ input[i]', 2],
    ['bl', '__aeabi_fmul', '@ float multiply', 38],
    ['mov', 'r1, r0', '', 1],
    ['ldr', 'r0, [r4]', '@ h[j]', 2],
    ['bl', '__aeabi_fadd', '@ float add', 46],
    ['str', 'r0, [r4]', '@ h[j] = r0', 2],
    ['adds', 'r5, r5, #1', '@ i++', 1],
    ['cmp', 'r5, r8', '@ i < 784 ?', 1],
    ['blt', '.L_inner', '', 2]
  ];
  const H = [0.62, 0.18, 0.47, 0.83, 0.29, 0.55];
  const OUT = {
    normal:   [0.71, 0.01, 0.04, 0.03, 0.01, 0.09, 0.06, 0.01, 0.03, 0.01],
    measured: [0.22, 0.01, 0.03, 0.05, 0.01, 0.48, 0.12, 0.01, 0.06, 0.01],
    small:    [0.70, 0.01, 0.04, 0.03, 0.01, 0.10, 0.06, 0.01, 0.03, 0.01],
    early:    [0.19, 0.02, 0.09, 0.38, 0.02, 0.16, 0.05, 0.04, 0.03, 0.02]
  };
  // GDB candidates: which row is skipped, the resulting h[3], and the outputs.
  const SKIPS = [
    { row: 5, h3: 0.82, out: OUT.small, why: 'one addition is lost' },
    { row: 9, h3: 0.38, out: OUT.early, why: 'the loop exits early' }
  ];
  const GLITCH_NEURON = 3, GLITCH_H = 0.21, SLOW_I = 406;

  function build(fig) {
    const stage = fig.querySelector('.anim-stage');
    const wide = h('div', { class: 'anim-wide' }, stage);
    const head = h('div', { class: 'anim-head' }, wide);
    const phaseEl = h('span', { class: 'anim-title' }, head, '');
    const cycEl = h('span', { class: 'anim-clock' }, head, '');

    /* clock and trigger lanes */
    const CW = 12, NC = 80, LW = NC * CW + 60;
    const lane = h('svg', { viewBox: `0 -14 ${LW} 78`, class: 'anim-lanes' }, wide);
    const gBand = h('path', { class: 'gband' }, lane);
    const gLabel = h('text', { y: -4, 'text-anchor': 'middle', class: 'glabel' }, lane, '');
    h('text', { x: 0, y: 22, class: 'lane-lbl' }, lane, 'CLK');
    h('text', { x: 0, y: 54, class: 'lane-lbl' }, lane, 'trigger');
    const clkPath = h('path', { class: 'clk' }, lane);
    const gPath = h('path', { class: 'clk-g' }, lane);
    const trgPath = h('path', { class: 'trg' }, lane);
    let cycles = [], trig = false, cycleCount = 0, trigAt = 0;
    function pushCycle(glitch) { cycles.push({ t: trig, g: !!glitch }); if (cycles.length > NC) cycles.shift(); cycleCount++; }
    function drawLanes() {
      let d = '', g = '', t = '', band = '', lx = null;
      const x0 = 60 + (NC - cycles.length) * CW;
      cycles.forEach((c, k) => {
        const x = x0 + k * CW, hi = 8, lo = 28;
        d += `M${x} ${lo}V${hi}H${x + CW / 2}V${lo}H${x + CW}`;
        if (c.g) { g += `M${x + CW * 0.62} ${lo}V${hi}H${x + CW * 0.78}V${lo}`; band += `M${x - 3} 0H${x + CW + 3}V62H${x - 3}Z`; lx = x + CW / 2; }
        const y = c.t ? 40 : 58; t += (k ? 'L' : 'M') + `${x} ${y}H${x + CW}`;
      });
      clkPath.setAttribute('d', d); gPath.setAttribute('d', g); trgPath.setAttribute('d', t); gBand.setAttribute('d', band);
      if (lx != null) { gLabel.setAttribute('x', lx); gLabel.textContent = 'glitch'; } else gLabel.textContent = '';
    }

    /* assembly listing and network, side by side */
    const cols = h('div', { class: 'glitch-cols' }, wide);
    const asmBox = h('div', { class: 'glitch-asm' }, cols);
    h('div', { class: 'asm-cap' }, asmBox, 'Inner loop of one hidden neuron (ARM assembly)');
    const pre = h('div', { class: 'asm' }, asmBox);
    h('div', { class: 'asm-row lbl' }, pre, '.L_inner:');
    const rows = ASM.map(([op, args, cmt, cyc]) => {
      const r = h('div', { class: 'asm-row' }, pre);
      h('span', { class: 'op' }, r, op); h('span', { class: 'args' }, r, args); h('span', { class: 'cmt' }, r, cmt);
      const c = h('span', { class: 'cyc' }, r, cyc > 2 ? `~${cyc}` : String(cyc));
      const tag = h('span', { class: 'tag' }, r, '');
      return { r, c, cyc, tag };
    });
    h('div', { class: 'asm-foot' }, asmBox, 'Right column: approximate clock cycles per instruction.');

    const net = h('svg', { viewBox: '0 0 440 300', class: 'glitch-net' }, cols);
    const IMG = { x: 6, y: 94, s: 112 };
    const gl = h('g', { class: 'links' }, net);
    const hy = j => 38 + j * 45, oy = d => 24 + d * 27.5;
    for (let j = 0; j < 6; j++) {
      h('line', { x1: IMG.x + IMG.s, y1: IMG.y + IMG.s / 2, x2: 186, y2: hy(j) }, gl);
      for (let d = 0; d < 10; d++) h('line', { x1: 198, y1: hy(j), x2: 312, y2: oy(d) }, gl);
    }
    if (fig.dataset.image) h('image', { href: fig.dataset.image, x: IMG.x, y: IMG.y, width: IMG.s, height: IMG.s, class: 'mnist' }, net);
    else h('rect', { x: IMG.x, y: IMG.y, width: IMG.s, height: IMG.s, class: 'mnist-ph' }, net);
    h('rect', { x: IMG.x, y: IMG.y, width: IMG.s, height: IMG.s, class: 'frame' }, net);
    const cursor = h('rect', { width: 4, height: 4, class: 'px' }, net);
    h('text', { x: IMG.x + IMG.s / 2, y: IMG.y + IMG.s + 16, 'text-anchor': 'middle', class: 'cap' }, net, 'input (28 × 28)');
    function setPixel(i) { cursor.setAttribute('x', IMG.x + (i % 28) * 4); cursor.setAttribute('y', IMG.y + Math.floor(i / 28) * 4); }

    const hid = [];
    for (let j = 0; j < 6; j++) {
      const g = h('g', { class: 'hn' }, net);
      h('circle', { cx: 192, cy: hy(j), r: 7 }, g);
      h('text', { x: 178, y: hy(j), dy: '0.35em', 'text-anchor': 'end', class: 'cap' }, g, `h${j}`);
      const flag = h('text', { x: 258, y: hy(j) + 15, class: 'flag' }, g, '');
      h('rect', { x: 204, y: hy(j) + 10, width: 50, height: 4, class: 'track' }, g);
      const bar = h('rect', { x: 204, y: hy(j) + 10, width: 0, height: 4, class: 'val' }, g);
      hid.push({ g, bar, flag, v: 0 });
    }
    h('text', { x: 192, y: 292, 'text-anchor': 'middle', class: 'cap' }, net, 'hidden layer');
    const outs = [];
    for (let d = 0; d < 10; d++) {
      const g = h('g', { class: 'on' }, net);
      h('text', { x: 318, y: oy(d), dy: '0.35em', class: 'cap' }, g, String(d));
      h('rect', { x: 330, y: oy(d) - 5, width: 100, height: 10, class: 'track' }, g);
      const bar = h('rect', { x: 330, y: oy(d) - 5, width: 0, height: 10, class: 'val' }, g);
      const ghost = h('line', { x1: 330, x2: 330, y1: oy(d) - 8, y2: oy(d) + 8, class: 'ghost' }, g);
      outs.push({ g, bar, ghost });
    }
    h('text', { x: 380, y: 292, 'text-anchor': 'middle', class: 'cap' }, net, 'output scores');
    const pred = h('text', { x: IMG.x + IMG.s / 2, y: IMG.y + IMG.s + 42, 'text-anchor': 'middle', class: 'pred' }, net, '');
    const pred2 = h('text', { x: IMG.x + IMG.s / 2, y: IMG.y + IMG.s + 60, 'text-anchor': 'middle', class: 'pred2' }, net, '');
    const setPred = (d, bad, extra) => { pred.textContent = d == null ? '' : `prediction: ${d}`; pred.setAttribute('class', 'pred' + (bad ? ' bad' : '')); pred2.textContent = extra || ''; };
    const note = h('div', { class: 'anim-note' }, wide, '\u00a0');
    const ctrl = h('div', { class: 'anim-ctrl' }, wide);
    const counter = h('span', { class: 'anim-slide' }, ctrl, '');
    const btn = h('button', { type: 'button', class: 'anim-restart' }, ctrl, '\u21ba restart');
    const TOTAL = 2 + 3 + SKIPS.length + 1;
    let slide = 0;
    const say = txt => { note.textContent = txt; slide++; counter.textContent = `slide ${slide} / ${TOTAL}`; };

    /* visible-time scheduler */
    let visible = false, T = 0, last = performance.now(); const waiters = [];
    const wait = ms => new Promise((r, j) => waiters.push({ at: T + ms, r, j }));
    function frame(now) {
      if (visible) T += Math.min(now - last, 100);
      last = now;
      for (let k = waiters.length - 1; k >= 0; k--) if (waiters[k].at <= T) { waiters[k].r(); waiters.splice(k, 1); }
      drawLanes();
      cycEl.textContent = trigAt ? `cycles since trigger: ${(cycleCount - trigAt).toLocaleString('en-GB')}` : '';
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0.3 }).observe(fig);

    /* drawing helpers */
    const setH = (j, v, cls) => { hid[j].v = v; hid[j].bar.setAttribute('width', 50 * Math.max(0, v)); hid[j].g.setAttribute('class', 'hn ' + (cls || '')); hid[j].flag.textContent = cls === 'bad' ? 'faulty' : ''; };
    const setOut = (vec, ghost) => {
      const best = vec.indexOf(Math.max(...vec));
      outs.forEach((o, d) => {
        o.bar.setAttribute('width', 100 * vec[d] / 0.75);
        o.g.setAttribute('class', 'on' + (d === best ? ' win' : ''));
        const gx = ghost ? 330 + 100 * ghost[d] / 0.75 : 330;
        o.ghost.setAttribute('x1', gx); o.ghost.setAttribute('x2', gx); o.ghost.style.display = ghost ? '' : 'none';
      });
      return best;
    };
    const clearOut = () => outs.forEach(o => { o.bar.setAttribute('width', 0); o.g.setAttribute('class', 'on'); });
    const TAGS = { glitch: '\u2190 glitch', skip: '\u21b7 skipped', skipped: 'skipped' };
    const pc = (k, cls) => rows.forEach((r, i) => { const c = i === k ? (cls || 'pc') : ''; r.r.className = 'asm-row' + (c ? ' ' + c : '') + (r.r.dataset.mark ? ' ' + r.r.dataset.mark : ''); r.tag.textContent = TAGS[c] || TAGS[r.r.dataset.mark] || ''; });
    const mark = (k, cls) => { rows.forEach(r => { r.r.dataset.mark = ''; }); if (k != null) rows[k].r.dataset.mark = cls; pc(-1); };
    const resetCyc = () => rows.forEach(r => { r.c.textContent = r.cyc > 2 ? `~${r.cyc}` : String(r.cyc); });

    // Fast-forward pixels a..b of neuron j while the bar grows from v0 to v1.
    async function ff(j, a, b, v0, v1, ms, cls) {
      const steps = Math.max(1, Math.round(ms / 30));
      for (let s = 1; s <= steps; s++) {
        const i = Math.round(a + (b - a) * s / steps);
        setPixel(Math.min(i, 783)); pc(s % rows.length);
        for (let c = 0; c < 8; c++) pushCycle();
        setH(j, v0 + (v1 - v0) * s / steps, cls);
        await wait(30);
      }
    }
    // One visible iteration of the loop body, at a readable speed.
    async function iterate(j, opts = {}) {
      for (let k = 0; k < rows.length; k++) {
        if (opts.skip === k) { pc(k, 'skip'); await wait(1600); continue; }
        pc(k);
        const r = rows[k], ms = r.cyc > 2 ? 9 : 90;
        for (let c = 1; c <= r.cyc; c++) {
          const g = opts.glitchRow === k && c === opts.glitchCycle;
          pushCycle(g);
          if (r.cyc > 2) r.c.textContent = `${c}/${r.cyc}`;
          if (g) { pc(k, 'glitch'); await opts.onGlitch(); }
          await wait(ms);
        }
        resetCyc();
      }
    }
    async function neuron(j, target, mode = {}) {
      hid.forEach((n, i) => n.g.classList.toggle('cur', i === j));
      if (!mode.slow) { await ff(j, 0, 783, 0, target, 450, mode.cls); return; }
      const mid = (H[j] * SLOW_I) / 784;
      await ff(j, 0, SLOW_I, 0, mid, 700);
      setPixel(SLOW_I); await iterate(j, mode);
      if (mode.stop) { setH(j, target, mode.cls); return; }
      setPixel(SLOW_I + 1); await iterate(j, { skip: mode.skip2 });
      await ff(j, SLOW_I + 1, 783, mid, target, 800, mode.cls);
    }
    function resetAll() { setPred(null); cycles = []; trig = false; trigAt = 0; hid.forEach((_, j) => setH(j, 0)); clearOut(); setOut(new Array(10).fill(0)); mark(null); resetCyc(); }

    btn.addEventListener('click', () => { waiters.splice(0).forEach(w => w.j('restart')); });
    async function run() {
      for (;;) {
        try { await cycle(); } catch (e) { if (e !== 'restart') throw e; }
      }
    }
    async function cycle() {
      {
        slide = 0;
        // (1) normal execution
        resetAll(); phaseEl.textContent = '(1) Normal execution';
        say('Each iteration multiplies one pixel by a weight and adds the product to h[j].');
        for (let j = 0; j < 6; j++) await neuron(j, H[j], { slow: j === 0 });
        hid.forEach(n => n.g.classList.remove('cur'));
        setOut(OUT.normal); setPred(0); say('Without a fault, the network classifies the input as 0.');
        await wait(2800);

        // (2) glitch on the hardware
        resetAll(); phaseEl.textContent = '(2) Clock glitch on the hardware';
        say('The target raises the trigger; the ChipWhisperer inserts a glitch after a chosen delay.');
        for (let j = 0; j < GLITCH_NEURON; j++) await neuron(j, H[j]);
        trig = true; trigAt = cycleCount;
        await neuron(GLITCH_NEURON, GLITCH_H, {
          slow: true, glitchRow: 5, glitchCycle: 21, cls: 'bad',
          onGlitch: async () => { say('A glitch is injected during the software floating-point addition (__aeabi_fadd). Which instruction it affected cannot be determined from the timing alone.'); await wait(2600); }
        });
        trig = false;
        for (let j = GLITCH_NEURON + 1; j < 6; j++) await neuron(j, H[j]);
        hid.forEach(n => n.g.classList.remove('cur'));
        setOut(OUT.measured); setPred(5, true, 'expected: 0'); say('Measured result: h[3] differs from its normal value and the input is classified as 5.');
        await wait(3200);

        // (3) GDB replays
        phaseEl.textContent = '(3) GDB: skipping one instruction';
        for (const s of SKIPS) {
          trig = false; trigAt = 0; cycles = []; mark(s.row, 'skipped'); clearOut(); setPred(null);
          hid.forEach((_, j) => setH(j, j < GLITCH_NEURON ? H[j] : 0));
          say(`Replay in GDB, stepping over “${ASM[s.row][0]} ${ASM[s.row][1]}” once.`);
          await wait(400);
          await neuron(GLITCH_NEURON, s.h3, { slow: true, skip: s.row, stop: s.row === 9, cls: 'bad' });
          for (let j = GLITCH_NEURON + 1; j < 6; j++) setH(j, H[j]);
          hid.forEach(n => n.g.classList.remove('cur'));
          const d = setOut(s.out, OUT.measured);
          setPred(d, true, `measured: 5, so no match`);
          note.textContent = `Skipping ${ASM[s.row][0]}: ${s.why}; the input is classified as ${d}. This does not match the measurement (vertical marks).`;
          await wait(3400);
        }
        mark(null);
        say('Skipping other single instructions in the loop, such as the store or the counter increment, did not reproduce the measured output either.');
        await wait(4000);
      }
    }
    run();
  }

  function init() {
    document.querySelectorAll('[data-anim="glitch"]').forEach(fig => { if (!fig.dataset.ready) { fig.dataset.ready = '1'; build(fig); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
