// interaction.js — puntero: conectar, mover, panear, zoom, seleccionar, borrar.

import { G, getNode, pinPos, LAY, getInputs, getOutputs } from './state.js';
import { refs, renderNodes, updateWires, applyWorld, applySelection } from './render.js';
import { T, CONV } from './nodeTypes.js';
import { uid, clamp, $, PC } from './util.js';
import { markDirty } from './storage.js';

let drag = null;       // { mode:'node'|'pan'|'wire', ... }
let spawnI = 0;

export function screenToWorld(cx, cy){
  const r = refs.wrap.getBoundingClientRect();
  return { x:(cx - r.left - G.world.x) / G.world.k, y:(cy - r.top - G.world.y) / G.world.k };
}

function select(s){ G.sel = s; applySelection(); }

/* ----------- alta de nodos ----------- */
export function addNode(type){
  const r = refs.wrap.getBoundingClientRect();
  const c = screenToWorld(r.left + r.width * 0.4 + (spawnI % 6) * 26,
                          r.top  + 120            + (spawnI % 6) * 26);
  spawnI++;
  const n = { id:uid(), type, x:Math.round(c.x), y:Math.round(c.y), props:{} };
  const t = T[type];
  if (t.variableNode && G.variables[0]) n.props.varId = G.variables[0].id;
  const ins = typeof t.inputs === 'function' ? t.inputs(n) : (t.inputs || []);
  for (const i of ins) if (i.editable) n.props[i.name] = i.default;
  for (const pr of (t.props || [])) n.props[pr.name] = pr.default;
  G.nodes.push(n);
  G.sel = { kind:'node', id:n.id };
  renderNodes();   // dibujar el nodo nuevo: select() ya no reconstruye el DOM
  markDirty();
}

/* ----------- eventos de puntero ----------- */
function onDown(e){
  if (e.target.closest('input, select')) return;
  const pin = e.target.closest('.pin');
  const head = e.target.closest('.node-header');
  const nodeEl = e.target.closest('.node');
  const wireEl = e.target.closest('.wire-hit');

  if (pin){
    startWire(pin, e);
  } else if (head && nodeEl){
    select({ kind:'node', id:nodeEl.dataset.id });
    const p = screenToWorld(e.clientX, e.clientY);
    const n = getNode(nodeEl.dataset.id);
    drag = { mode:'node', id:n.id, ox:p.x - n.x, oy:p.y - n.y, el:nodeEl };
    nodeEl.style.zIndex = 10;
  } else if (nodeEl){
    select({ kind:'node', id:nodeEl.dataset.id });
  } else if (wireEl){
    select({ kind:'wire', id:wireEl.dataset.id });
  } else {
    select(null);
    drag = { mode:'pan', sx:e.clientX, sy:e.clientY, wx:G.world.x, wy:G.world.y };
    refs.wrap.classList.add('panning');
  }
}

function startWire(pin, e){
  drag = { mode:'wire', from:{
    node:pin.dataset.node, pin:pin.dataset.pin, side:pin.dataset.side,
    kind:pin.dataset.kind, dtype:pin.dataset.dtype } };
  refs.tempWire.style.display = '';
  refs.tempWire.setAttribute('stroke', PC[pin.dataset.dtype] || '#888');
  moveTempWire(e.clientX, e.clientY);
}

function moveTempWire(cx, cy){
  const f = drag.from;
  const a = pinPos(f.node, f.pin, f.side === 'out' ? 'out' : 'in');
  const b = screenToWorld(cx, cy);
  const [p, q] = f.side === 'out' ? [a, b] : [b, a];
  const dx = Math.max(40, Math.abs(q.x - p.x) * 0.5);
  refs.tempWire.setAttribute('d', `M ${p.x} ${p.y} C ${p.x + dx} ${p.y}, ${q.x - dx} ${q.y}, ${q.x} ${q.y}`);
}

function onMove(e){
  if (!drag) return;
  if (drag.mode === 'node'){
    const p = screenToWorld(e.clientX, e.clientY);
    const n = getNode(drag.id);
    n.x = Math.round(p.x - drag.ox);
    n.y = Math.round(p.y - drag.oy);
    drag.el.style.left = n.x + 'px';
    drag.el.style.top  = n.y + 'px';
    updateWires();
  } else if (drag.mode === 'pan'){
    G.world.x = drag.wx + (e.clientX - drag.sx);
    G.world.y = drag.wy + (e.clientY - drag.sy);
    applyWorld();
  } else if (drag.mode === 'wire'){
    moveTempWire(e.clientX, e.clientY);
  }
}

function onUp(e){
  if (drag?.mode === 'wire'){
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const pin = el && el.closest('.pin');
    if (pin) tryConnect(drag.from, pin.dataset);
    refs.tempWire.style.display = 'none';
  }
  if (drag?.mode === 'node' && drag.el){ drag.el.style.zIndex = ''; markDirty(); }
  if (drag?.mode === 'pan'){ refs.wrap.classList.remove('panning'); markDirty(); }
  drag = null;
}

function tryConnect(from, to){
  let out, inp;
  if (from.side === 'out' && to.side === 'in'){ out = from; inp = to; }
  else if (from.side === 'in' && to.side === 'out'){ out = to; inp = from; }
  else return;                              // dos pines del mismo lado
  if (out.node === inp.node) return;
  if (out.kind !== inp.kind) return;        // exec sólo con exec
  if (out.kind === 'data' && out.dtype !== inp.dtype){
    const conv = CONV[out.dtype]?.[inp.dtype];
    if (!conv) return;                      // tipos incompatibles y sin conversión
    insertConversion(out, inp, conv);       // autocast estilo UE
    return;
  }

  const kind = out.kind;
  // Cardinalidad estilo UE: input de dato = uno; output de exec = uno.
  if (kind === 'data'){
    G.wires = G.wires.filter(w => !(w.kind === 'data' && w.to.node === inp.node && w.to.pin === inp.pin));
  } else {
    G.wires = G.wires.filter(w => !(w.kind === 'exec' && w.from.node === out.node && w.from.pin === out.pin));
  }
  G.wires.push({ id:uid('w'), kind, type: kind === 'data' ? out.dtype : 'exec',
    from:{ node:out.node, pin:out.pin }, to:{ node:inp.node, pin:inp.pin } });
  renderNodes();
  markDirty();
}

// Inserta un nodo de conversión entre out (dato tipo A) e inp (dato tipo B).
function insertConversion(out, inp, convType){
  const a = pinPos(out.node, out.pin, 'out');
  const b = pinPos(inp.node, inp.pin, 'in');
  const n = { id:uid(), type:convType, props:{ from: out.dtype },
              x: Math.round((a.x + b.x) / 2 - 40), y: Math.round((a.y + b.y) / 2 - 18) };
  G.nodes.push(n);
  // el input de dato admite un solo cable
  G.wires = G.wires.filter(w => !(w.kind === 'data' && w.to.node === inp.node && w.to.pin === inp.pin));
  G.wires.push({ id:uid('w'), kind:'data', type: out.dtype, from:{ node:out.node, pin:out.pin }, to:{ node:n.id, pin:'in' } });
  G.wires.push({ id:uid('w'), kind:'data', type: inp.dtype, from:{ node:n.id, pin:'out' }, to:{ node:inp.node, pin:inp.pin } });
  G.sel = { kind:'node', id:n.id };
  renderNodes();
  markDirty();
}

/* ----------- teclado (borrar) ----------- */
function onKey(e){
  if (e.key !== 'Delete' && e.key !== 'Backspace') return;
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA')) return;
  if (!G.sel) return;
  if (G.sel.kind === 'wire') G.wires = G.wires.filter(w => w.id !== G.sel.id);
  if (G.sel.kind === 'node'){
    G.wires = G.wires.filter(w => w.from.node !== G.sel.id && w.to.node !== G.sel.id);
    G.nodes = G.nodes.filter(n => n.id !== G.sel.id);
  }
  G.sel = null; renderNodes(); markDirty();
}

/* ----------- zoom ----------- */
function zoomAround(mx, my, factor){
  const wx = (mx - G.world.x) / G.world.k, wy = (my - G.world.y) / G.world.k;
  const k2 = clamp(G.world.k * factor, 0.35, 2.2);
  G.world.x = mx - wx * k2; G.world.y = my - wy * k2; G.world.k = k2;
  applyWorld();
}
function onWheel(e){
  e.preventDefault();
  const r = refs.wrap.getBoundingClientRect();
  zoomAround(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 0.89);
}

// Encuadra todo el grafo en el lienzo (zoom-to-fit).
export function fitView(){
  if (!G.nodes.length){ G.world = { x:60, y:40, k:1 }; applyWorld(); return; }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of G.nodes){
    const rows = Math.max(getInputs(n).length, getOutputs(n).length);
    const h = LAY.HEAD + rows * LAY.ROW + 46;   // alto aproximado del nodo
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + LAY.W); maxY = Math.max(maxY, n.y + h);
  }
  const r = refs.wrap.getBoundingClientRect();
  const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY), pad = 70;
  const k = clamp(Math.min((r.width - pad) / bw, (r.height - pad) / bh, 1.3), 0.3, 1.3);
  G.world = { x: (r.width - bw * k) / 2 - minX * k, y: (r.height - bh * k) / 2 - minY * k, k };
  applyWorld();
}

export function initInteraction(){
  refs.wrap.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);
  refs.wrap.addEventListener('wheel', onWheel, { passive:false });

  const c = () => { const r = refs.wrap.getBoundingClientRect(); return [r.width / 2, r.height / 2]; };
  $('#zin').onclick  = () => zoomAround(...c(), 1.15);
  $('#zout').onclick = () => zoomAround(...c(), 0.87);
  $('#zfit').onclick = fitView;
}
