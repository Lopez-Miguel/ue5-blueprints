// render.js — todo lo visual del grafo: nodos, pines, editores y cables.

import { G, getNode, getInputs, getOutputs, dataWireInto, pinPos, LAY, pruneBadWires } from './state.js';
import { T, CAT_COLOR } from './nodeTypes.js';
import { PC } from './util.js';
import { isPlaying } from './runtime.js';

// El DOM ya existe cuando corre un <script type="module"> (es diferido).
export const refs = {
  wrap:     document.querySelector('#canvasWrap'),
  canvas:   document.querySelector('#canvas'),
  worldEl:  document.querySelector('#world'),
  wiresEl:  document.querySelector('#wires'),
  tempWire: document.querySelector('#tempwire'),
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

function buildNode(n){
  const t = T[n.type];
  const el = document.createElement('div');
  el.className = 'node ' + t.cat + (G.sel?.kind === 'node' && G.sel.id === n.id ? ' sel' : '');
  el.dataset.id = n.id;
  el.style.left = n.x + 'px';
  el.style.top  = n.y + 'px';

  const head = document.createElement('div');
  head.className = 'node-header';
  head.innerHTML = `<span class="ic">${t.ic || ''}</span>${t.title}`;
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
      row.appendChild(pinEl(n.id, out, 'right'));
    }
    rows.appendChild(row);
  }

  // Nodos de variable: desplegable para elegir la variable (fila SIN pin,
  // renderizada DESPUÉS de las filas de pines para no correr las posiciones).
  if (t.variableNode) rows.appendChild(varSelectRow(n));

  // Props sin pin (p. ej. el valor del literal Float).
  for (const p of (t.props || [])){
    if (n.props[p.name] === undefined) n.props[p.name] = p.default;
    const pr = document.createElement('div');
    pr.className = 'prop';
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

/* -------------------- cables -------------------- */
const SVGNS = 'http://www.w3.org/2000/svg';
const mkPath = () => document.createElementNS(SVGNS, 'path');

function wirePath(a, b){
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

export function updateWires(){
  [...refs.wiresEl.querySelectorAll('path.wire')].forEach(e => e.remove());
  const playing = isPlaying();
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
    vis.setAttribute('class', 'wire ' + (w.kind === 'exec' ? 'exec' : 'data') +
      (playing && w.kind === 'exec' ? ' flowing' : ''));
    vis.setAttribute('stroke', col);
    vis.setAttribute('stroke-width', selected ? '4.5' : '3');
    vis.setAttribute('fill', 'none');
    vis.setAttribute('stroke-linecap', 'round');
    vis.style.opacity = selected ? '1' : '.9';

    refs.wiresEl.appendChild(hit);
    refs.wiresEl.appendChild(vis);
  }
}
