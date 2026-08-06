// render.js — todo lo visual del grafo: nodos, pines, editores y cables.

import { G, getNode, getInputs, getOutputs, dataWireInto, pinPos, LAY, pruneBadWires } from './state.js';
import { T, CAT_COLOR, DESC } from './nodeTypes.js';
import { PC, num, clamp } from './util.js';
import { isPlaying } from './runtime.js';
import { markDirty } from './storage.js';
import { ctx, outputValue } from './interpreter.js';

// El DOM ya existe cuando corre un <script type="module"> (es diferido).
export const refs = {
  wrap:     document.querySelector('#canvasWrap'),
  canvas:   document.querySelector('#canvas'),
  worldEl:  document.querySelector('#world'),
  wiresEl:  document.querySelector('#wires'),
  tempWire: document.querySelector('#tempwire'),
  trace:    document.querySelector('#trace'),
};

export function applyWorld(){
  const { x, y, k } = G.world;
  refs.worldEl.style.transform = `translate(${x}px,${y}px) scale(${k})`;
}

export function renderNodes(){
  [...refs.worldEl.querySelectorAll('.node')].forEach(e => e.remove());
  for (const n of G.nodes) refs.worldEl.appendChild(buildNode(n));
  updateWires();
}

// Actualiza SÓLO el resaltado de selección, sin reconstruir los nodos.
// (Reconstruir el DOM al seleccionar invalidaba el elemento que se estaba
//  por arrastrar, y eso se sentía como lag al mover o conectar.)
export function applySelection(){
  for (const el of refs.worldEl.querySelectorAll('.node'))
    el.classList.toggle('sel', G.sel?.kind === 'node' && G.sel.id === el.dataset.id);
  updateWires();
}

function buildNode(n){
  const t = T[n.type];
  const cat = n.props.cat || t.cat;
  const title = (t.dynTitle && t.dynTitle(n)) || n.props.title || t.title;
  const el = document.createElement('div');
  el.className = 'node ' + cat + (t.imported ? ' imported' : '') +
    (G.sel?.kind === 'node' && G.sel.id === n.id ? ' sel' : '');
  el.dataset.id = n.id;
  el.style.left = n.x + 'px';
  el.style.top  = n.y + 'px';

  const head = document.createElement('div');
  head.className = 'node-header';
  head.title = DESC[n.type] || '';
  head.innerHTML = `<span class="ic">${t.ic || ''}</span>${title}`;
  if (t.imported){
    const badge = document.createElement('span');
    badge.className = 'node-badge';
    badge.textContent = 'sólo vista';
    badge.title = 'Nodo importado sin equivalente: no se ejecuta';
    head.appendChild(badge);
  }
  el.appendChild(head);

  const rows = document.createElement('div');
  rows.className = 'rows';

  const ins = getInputs(n), outs = getOutputs(n);
  const nRows = Math.max(ins.length, outs.length);
  for (let i = 0; i < nRows; i++){
    const row = document.createElement('div');
    row.className = 'row';
    const inp = ins[i], out = outs[i];

    if (inp){
      row.appendChild(pinEl(n.id, inp, 'left'));
      const lbl = document.createElement('span');
      lbl.className = 'lbl';
      lbl.textContent = inp.label ?? inp.name;
      row.appendChild(lbl);
      if (inp.editable && !dataWireInto(n.id, inp.name)) row.appendChild(editorEl(n, inp));
    }
    if (out){
      if (!inp){ const sp = document.createElement('span'); sp.className = 'fill'; row.appendChild(sp); row.classList.add('out'); }
      const lbl = document.createElement('span');
      lbl.className = 'lbl';
      lbl.textContent = out.label ?? out.name;
      lbl.style.marginLeft = 'auto';
      row.appendChild(lbl);
      if (out.kind !== 'exec'){
        const w = document.createElement('span');
        w.className = 'watch';
        w.dataset.pin = out.name;
        row.appendChild(w);
      }
      row.appendChild(pinEl(n.id, out, 'right'));
    }
    rows.appendChild(row);
  }

  // Timeline: editor de curva (después de las filas de pines, no afecta posiciones).
  if (t.timelineNode) rows.appendChild(curveEditor(n));

  // Nodos de variable: desplegable para elegir la variable (fila SIN pin,
  // renderizada DESPUÉS de las filas de pines para no correr las posiciones).
  if (t.variableNode) rows.appendChild(varSelectRow(n));
  if (t.eventNode) rows.appendChild(eventSelectRow(n));

  // Props sin pin (p. ej. el valor del literal Float).
  for (const p of (t.props || [])){
    if (n.props[p.name] === undefined) n.props[p.name] = p.default;
    const pr = document.createElement('div');
    pr.className = 'prop';
    if (p.label){ const l = document.createElement('span'); l.className = 'lbl'; l.textContent = p.label; pr.appendChild(l); }
    pr.appendChild(editorEl(n, p, true));
    rows.appendChild(pr);
  }

  el.appendChild(rows);
  return el;
}

function pinEl(nodeId, pin, side){
  const p = document.createElement('div');
  const kind  = pin.kind === 'exec' ? 'exec' : 'data';
  const dtype = pin.kind === 'exec' ? 'exec' : pin.type;
  const connected = pin.kind === 'exec'
    ? G.wires.some(w => w.kind === 'exec' &&
        ((side === 'right' && w.from.node === nodeId && w.from.pin === pin.name) ||
         (side === 'left'  && w.to.node   === nodeId && w.to.pin   === pin.name)))
    : (side === 'right'
        ? G.wires.some(w => w.kind === 'data' && w.from.node === nodeId && w.from.pin === pin.name)
        : !!dataWireInto(nodeId, pin.name));

  p.className = `pin ${side} ${kind} ${connected ? 'filled' : ''}`;
  p.style.setProperty('--pc', PC[dtype] || '#888');
  p.dataset.node  = nodeId;
  p.dataset.pin   = pin.name;
  p.dataset.side  = side === 'left' ? 'in' : 'out';
  p.dataset.kind  = kind;
  p.dataset.dtype = dtype;
  p.innerHTML = '<span class="g"></span>';
  return p;
}

function editorEl(n, def){
  const key = def.name;
  if (n.props[key] === undefined) n.props[key] = def.default;
  let e;
  if (def.type === 'bool'){
    e = document.createElement('input'); e.type = 'checkbox'; e.className = 'ed chk';
    e.checked = !!n.props[key];
    e.addEventListener('change', () => n.props[key] = e.checked);
  } else if (def.type === 'string'){
    e = document.createElement('input'); e.type = 'text'; e.className = 'ed';
    e.value = n.props[key] ?? '';
    e.addEventListener('input', () => n.props[key] = e.value);
  } else {
    e = document.createElement('input'); e.type = 'number'; e.className = 'ed num';
    e.step = def.type === 'int' ? '1' : 'any';
    e.value = n.props[key] ?? 0;
    e.addEventListener('input', () => n.props[key] = e.value);
  }
  e.addEventListener('pointerdown', ev => ev.stopPropagation());
  return e;
}

function varSelectRow(n){
  const row = document.createElement('div');
  row.className = 'prop selrow';
  const sel = document.createElement('select');
  sel.className = 'ed';
  if (!G.variables.length){
    const o = document.createElement('option');
    o.textContent = '(creá una variable)'; o.disabled = true; o.selected = true;
    sel.appendChild(o);
  }
  for (const v of G.variables){
    const o = document.createElement('option');
    o.value = v.id; o.textContent = `${v.name} : ${v.type}`;
    if (v.id === n.props.varId) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('pointerdown', ev => ev.stopPropagation());
  sel.addEventListener('change', () => {
    n.props.varId = sel.value;
    pruneBadWires();     // cambió el tipo del pin: limpiar cables incompatibles
    renderNodes();
  });
  row.appendChild(sel);
  return row;
}

function eventSelectRow(n){
  const row = document.createElement('div');
  row.className = 'prop selrow';
  const sel = document.createElement('select');
  sel.className = 'ed';
  if (!G.events.length){
    const o = document.createElement('option');
    o.textContent = '(creá un evento)'; o.disabled = true; o.selected = true;
    sel.appendChild(o);
  }
  for (const e of G.events){
    const o = document.createElement('option');
    o.value = e.id; o.textContent = e.name;
    if (e.id === n.props.evId) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('pointerdown', ev => ev.stopPropagation());
  sel.addEventListener('change', () => {
    n.props.evId = sel.value;
    pruneBadWires();     // cambiaron los pines: limpiar cables incompatibles
    renderNodes();
  });
  row.appendChild(sel);
  return row;
}
const SVGNS = 'http://www.w3.org/2000/svg';
const mkPath = () => document.createElementNS(SVGNS, 'path');
const TLW = 176, TLH = 92;   // dimensiones internas del editor de curva

function wirePath(a, b){
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

export function updateWires(){
  [...refs.wiresEl.querySelectorAll('path.wire')].forEach(e => e.remove());
  for (const w of G.wires){
    const a = pinPos(w.from.node, w.from.pin, 'out');
    const b = pinPos(w.to.node,   w.to.pin,   'in');
    const col = w.kind === 'exec' ? PC.exec : (PC[w.type] || '#888');
    const selected = G.sel?.kind === 'wire' && G.sel.id === w.id;

    const hit = mkPath();
    hit.setAttribute('d', wirePath(a, b));
    hit.setAttribute('class', 'wire wire-hit');
    hit.setAttribute('stroke', 'transparent');
    hit.setAttribute('stroke-width', '14');
    hit.setAttribute('fill', 'none');
    hit.dataset.id = w.id;

    const vis = mkPath();
    vis.setAttribute('d', wirePath(a, b));
    vis.setAttribute('class', 'wire ' + (w.kind === 'exec' ? 'exec' : 'data'));
    vis.setAttribute('stroke', col);
    vis.setAttribute('stroke-width', selected ? '4.5' : '3');
    vis.setAttribute('fill', 'none');
    vis.setAttribute('stroke-linecap', 'round');
    vis.style.opacity = selected ? '1' : '.9';
    vis.dataset.id = w.id;
    vis.dataset.kind = w.kind;

    refs.wiresEl.appendChild(hit);
    refs.wiresEl.appendChild(vis);
  }
}

/* -------------------- editor de curva del Timeline -------------------- */
function mkLine(x1, y1, x2, y2){
  const l = document.createElementNS(SVGNS, 'line');
  l.setAttribute('x1', x1); l.setAttribute('y1', y1);
  l.setAttribute('x2', x2); l.setAttribute('y2', y2);
  return l;
}

function curveEditor(n){
  const pts = (n.props.curve ||= [{ t:0, v:0 }, { t:1, v:1 }]);  // por defecto: rampa 0→1
  const box = document.createElement('div');
  box.className = 'tl-curve';

  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'tl-svg');
  svg.setAttribute('viewBox', `0 0 ${TLW} ${TLH}`);

  for (let i = 0; i <= 4; i++){
    const gx = mkLine(i / 4 * TLW, 0, i / 4 * TLW, TLH); gx.setAttribute('class', 'tl-grid'); svg.appendChild(gx);
    const gy = mkLine(0, i / 4 * TLH, TLW, i / 4 * TLH); gy.setAttribute('class', 'tl-grid'); svg.appendChild(gy);
  }

  const area = document.createElementNS(SVGNS, 'path');     area.setAttribute('class', 'tl-area'); svg.appendChild(area);
  const line = document.createElementNS(SVGNS, 'polyline'); line.setAttribute('class', 'tl-line'); svg.appendChild(line);
  const head = mkLine(0, 0, 0, TLH); head.setAttribute('class', 'tl-head'); head.style.opacity = '0'; svg.appendChild(head);
  const ptsG = document.createElementNS(SVGNS, 'g'); svg.appendChild(ptsG);

  const X = t => t * TLW, Y = v => TLH - v * TLH;
  function redraw(){
    const sorted = [...pts].sort((a, b) => a.t - b.t);
    line.setAttribute('points', sorted.map(p => `${X(p.t)},${Y(p.v)}`).join(' '));
    area.setAttribute('d', sorted.length
      ? `M ${X(sorted[0].t)} ${TLH} L ` + sorted.map(p => `${X(p.t)} ${Y(p.v)}`).join(' L ') +
        ` L ${X(sorted[sorted.length - 1].t)} ${TLH} Z`
      : '');
    ptsG.innerHTML = '';
    pts.forEach((p, i) => {
      const c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('class', 'tl-pt');
      c.setAttribute('cx', X(p.t)); c.setAttribute('cy', Y(p.v)); c.setAttribute('r', '4');
      c.dataset.i = i;
      ptsG.appendChild(c);
    });
  }
  redraw();

  svg.addEventListener('pointerdown', e => {
    e.stopPropagation();   // no arrastrar el nodo ni iniciar un cable
    const r = svg.getBoundingClientRect();
    const toC = (cx, cy) => ({ t: clamp((cx - r.left) / r.width, 0, 1), v: clamp(1 - (cy - r.top) / r.height, 0, 1) });
    const target = e.target.closest('.tl-pt');
    if (target){
      const i = +target.dataset.i;   // sin ordenar durante el arrastre: el índice se mantiene
      const move = ev => { const c = toC(ev.clientX, ev.clientY); pts[i] = c; redraw(); };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        pts.sort((a, b) => a.t - b.t); redraw(); markDirty();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    } else {
      pts.push(toC(e.clientX, e.clientY));
      pts.sort((a, b) => a.t - b.t); redraw(); markDirty();
    }
  });
  svg.addEventListener('dblclick', e => {
    e.stopPropagation();
    const target = e.target.closest('.tl-pt');
    if (target && pts.length > 2){ pts.splice(+target.dataset.i, 1); redraw(); markDirty(); }
  });

  box.appendChild(svg);
  return box;
}

// Mueve el cabezal (línea vertical) de cada Timeline según su reproducción actual.
export function renderTimelineHeads(){
  for (const el of refs.worldEl.querySelectorAll('.node')){
    const head = el.querySelector('.tl-head');
    if (!head) continue;
    const s = ctx.timelines.get(el.dataset.id);
    if (s){
      const n = getNode(el.dataset.id);
      const a = clamp(s.t / Math.max(0.0001, num(n.props.length)), 0, 1);
      head.setAttribute('x1', a * TLW); head.setAttribute('x2', a * TLW);
      head.style.opacity = s.playing ? '1' : '.35';
    } else {
      head.style.opacity = '0';
    }
  }
}

/* -------------------- visualizaciones de aprendizaje -------------------- */
function fmt(v){
  if (v == null) return '';
  if (typeof v === 'number')  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  const s = String(v);
  return s.length > 9 ? s.slice(0, 8) + '…' : s;
}

// Brillo de los nodos que se están ejecutando (lee ctx.heat).
export function renderExecHeat(){
  for (const el of refs.worldEl.querySelectorAll('.node'))
    el.style.setProperty('--heat', (ctx.heat[el.dataset.id] || 0).toFixed(3));
}

// Anima el "flujo" sólo en los cables de ejecución realmente recorridos.
export function renderWireHeat(){
  for (const p of refs.wiresEl.querySelectorAll('path.wire')){
    if (p.dataset.kind !== 'exec') continue;
    p.classList.toggle('flowing', (ctx.wireHeat[p.dataset.id] || 0) > 0.05);
  }
}

// Muestra el valor actual de cada pin de dato de salida (watch values).
export function renderWatchValues(){
  for (const el of refs.worldEl.querySelectorAll('.node')){
    const spans = el.querySelectorAll('.watch');
    if (!spans.length) continue;
    const n = getNode(el.dataset.id);
    if (!n) continue;
    for (const span of spans) span.textContent = fmt(outputValue(n, span.dataset.pin));
  }
}

// Panel de traza: secuencia de nodos ejecutados y valores leídos (throttle ~120ms).
let _lastTrace = 0;
export function renderTrace(force){
  const host = refs.trace;
  if (!host) return;
  const now = performance.now();
  if (!force && now - _lastTrace < 120) return;
  _lastTrace = now;
  if (!ctx.trace.length){ host.innerHTML = '<div class="empty">La traza aparece al ejecutar.</div>'; return; }
  host.innerHTML = '';
  ctx.trace.forEach((s, i) => {
    const vals = Object.entries(s.values).map(([k, v]) => `${k}=${fmt(v)}`).join('  ');
    const d = document.createElement('div');
    d.className = 'trace-step';
    d.innerHTML = `<span class="n">${i + 1}</span><span class="ti"></span><span class="vv"></span>`;
    d.querySelector('.ti').textContent = s.title;
    d.querySelector('.vv').textContent = vals;
    host.appendChild(d);
  });
}

// Apaga todo el resaltado de aprendizaje (al reiniciar).
export function clearLearning(){
  for (const el of refs.worldEl.querySelectorAll('.node')){
    el.style.setProperty('--heat', '0');
    el.querySelectorAll('.watch').forEach(w => w.textContent = '');
  }
  for (const p of refs.wiresEl.querySelectorAll('path.wire')) p.classList.remove('flowing');
  renderTrace(true);
}
