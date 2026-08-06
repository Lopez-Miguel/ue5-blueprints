// state.js — modelo del grafo + geometría de pines + queries.
// Todo el estado vive en el objeto G (un único objeto mutable compartido),
// así cualquier módulo lo lee y lo modifica sin problemas de bindings.

import { T } from './nodeTypes.js';
import { uid, coerce } from './util.js';

export const G = {
  nodes: [],       // { id, type, x, y, props, _index? }
  wires: [],       // { id, kind:'exec'|'data', type, from:{node,pin}, to:{node,pin} }
  variables: [],   // { id, name, type:'float'|'bool'|'string', def }
  events: [],      // { id, name, params:[{name, type}] }  (custom events)
  sel: null,       // { kind:'node'|'wire', id }
  world: { x:60, y:40, k:1 },
};

// Geometría: alto de cabecera, alto de fila, padding superior de .rows.
export const LAY = { W:200, HEAD:32, ROW:28, PAD:5 };

export const getNode = id => G.nodes.find(n => n.id === id);
export const getVar  = id => G.variables.find(v => v.id === id);
export const getEvent = id => G.events.find(e => e.id === id);

// Resuelve inputs/outputs que pueden ser array o función(node) (pines dinámicos).
export function getInputs(n){ const v = T[n.type].inputs;  return (typeof v === 'function' ? v(n) : v) || []; }
export function getOutputs(n){ const v = T[n.type].outputs; return (typeof v === 'function' ? v(n) : v) || []; }

export const inputDef  = (n, pin) => getInputs(n).find(i => i.name === pin);
export const outputDef = (n, pin) => getOutputs(n).find(o => o.name === pin);
export const dataWireInto = (id, pin) =>
  G.wires.find(w => w.kind === 'data' && w.to.node === id && w.to.pin === pin);

// Tipo efectivo de un pin ('exec' o el tipo de dato). null si el pin no existe.
export function pinType(node, pin, side){
  const list = side === 'out' ? getOutputs(node) : getInputs(node);
  const p = list.find(x => x.name === pin);
  return p ? (p.kind === 'exec' ? 'exec' : p.type) : null;
}

// Posición en coordenadas de MUNDO de un pin, calculada desde el layout
// (sin medir el DOM: cabecera + índice de fila).
export function pinPos(nodeId, pin, side){
  const n = getNode(nodeId);
  const list = side === 'out' ? getOutputs(n) : getInputs(n);
  const idx = list.findIndex(p => p.name === pin);
  const y = n.y + LAY.HEAD + idx * LAY.ROW + LAY.ROW / 2 + LAY.PAD;
  const x = n.x + (side === 'out' ? LAY.W : 0);
  return { x, y };
}

// Elimina cables cuyos extremos ya no existen o cuyos tipos dejaron de coincidir
// (por ejemplo tras cambiar el tipo de una variable).
export function pruneBadWires(){
  G.wires = G.wires.filter(w => {
    const fn = getNode(w.from.node), tn = getNode(w.to.node);
    if (!fn || !tn) return false;
    const ft = pinType(fn, w.from.pin, 'out');
    const tt = pinType(tn, w.to.pin, 'in');
    if (ft == null || tt == null) return false;
    if (w.kind === 'exec') return ft === 'exec' && tt === 'exec';
    if (ft === tt) return true;
    const numeric = t => t === 'int' || t === 'float';
    return numeric(ft) && numeric(tt);   // int/float son intercambiables
  });
}

/* --------- persistencia --------- */
export function serialize(){
  return JSON.stringify({ v:1, nodes:G.nodes, wires:G.wires, variables:G.variables, events:G.events, world:G.world });
}
export function deserialize(txt){
  const d = JSON.parse(txt);
  if (!d || !Array.isArray(d.nodes)) throw new Error('formato inválido');
  G.nodes = d.nodes;
  G.wires = d.wires || [];
  G.variables = d.variables || [];
  G.events = d.events || [];
  if (d.world) G.world = d.world;
  G.sel = null;
  pruneBadWires();
}

/* --------- construir un grafo desde una especificación declarativa ---------
   spec = {
     vars:  [{ name, type, def }],
     nodes: [{ k:'tipo', x, y, props:{...}, var:'NombreVar' }],   // var: para var_get/var_set
     links: [[fromIdx, 'pinSalida', toIdx, 'pinEntrada'], ...],
     world: { x, y, k }
   }
   Usado por las lecciones cargables.                                         */
export function buildGraph(spec){
  G.variables = (spec.vars || []).map(v => ({ id:uid('v'), name:v.name, type:v.type || 'float', def:v.def ?? 0 }));
  G.events = [];
  const vid = Object.fromEntries(G.variables.map(v => [v.name, v.id]));

  G.nodes = (spec.nodes || []).map(nd => {
    const t = T[nd.k];
    const n = { id:uid(), type:nd.k, x:nd.x || 0, y:nd.y || 0, props:{} };
    const ins = typeof t.inputs === 'function' ? t.inputs(n) : (t.inputs || []);
    for (const i of ins) if (i.editable) n.props[i.name] = i.default;
    for (const pr of (t.props || [])) n.props[pr.name] = pr.default;
    Object.assign(n.props, nd.props || {});
    if (t.variableNode && nd.var) n.props.varId = vid[nd.var];
    return n;
  });

  G.wires = [];
  G.sel = null;
  G.world = spec.world || { x:60, y:40, k:1 };
  linkByIndex(spec.links || []);
}

// Crea cables a partir de pares [fromIdx, 'pinSalida', toIdx, 'pinEntrada'] sobre
// los nodos actuales (mismo orden que spec.nodes). Reutilizado por "Resolver".
export function linkByIndex(links){
  for (const [fi, fp, ti, tp] of links){
    const from = G.nodes[fi], to = G.nodes[ti];
    if (!from || !to) continue;
    const outs = getOutputs(from);
    const od = outs.find(o => o.name === fp);
    const kind = od && od.kind === 'exec' ? 'exec' : 'data';
    G.wires.push({ id:uid('w'), kind, type: kind === 'exec' ? 'exec' : (od ? od.type : 'float'),
                   from:{ node:from.id, pin:fp }, to:{ node:to.id, pin:tp } });
  }
}
