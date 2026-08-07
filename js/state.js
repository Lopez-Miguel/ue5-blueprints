// state.js — modelo del grafo + geometría de pines + queries.
// Todo el estado vive en el objeto G (un único objeto mutable compartido),
// así cualquier módulo lo lee y lo modifica sin problemas de bindings.

import { T } from './nodeTypes.js';
import { uid, coerce } from './util.js';

export const G = {
  nodes: [],       // { id, type, x, y, props, _index? }
  wires: [],       // { id, kind:'exec'|'data', type, from:{node,pin}, to:{node,pin} }
  variables: [],   // { id, name, type:'float'|'bool'|'string', def }
  events: [],      // { id, name, params:[{id, name, type}] }  (custom events)
  functions: [],   // { id, name, params:[{id,name,type}], returns:[{id,name,type}] }
  sel: null,       // { kind:'node'|'wire', id }
  active: 'main',  // grafo/pestaña visible: 'main' o 'fn:<functionId>'
  world: { x:60, y:40, k:1 },
};

// Geometría: alto de cabecera, alto de fila, padding superior de .rows.
export const LAY = { W:200, HEAD:32, ROW:28, PAD:5 };

export const getNode = id => G.nodes.find(n => n.id === id);
export const getVar  = id => G.variables.find(v => v.id === id);
export const getEvent = id => G.events.find(e => e.id === id);
export const getFunc  = id => G.functions.find(f => f.id === id);

// Traduce una referencia de pin por NOMBRE de parámetro/retorno a su id estable
// (para eventos y funciones). Deja pasar 'exec'/'then' y nombres ya resueltos.
export function paramPin(node, pin){
  if (!node) return pin;
  if (node.type === 'custom_event' || node.type === 'call_event'){
    const e = getEvent(node.props.evId);
    const p = e && e.params.find(x => x.name === pin);
    return p ? p.id : pin;
  }
  if (node.type === 'fn_entry' || node.type === 'fn_return' || node.type === 'fn_call'){
    const f = getFunc(node.props.fnId);
    const p = f && [...f.params, ...f.returns].find(x => x.name === pin);
    return p ? p.id : pin;
  }
  return pin;
}

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
  return JSON.stringify({ v:1, nodes:G.nodes, wires:G.wires, variables:G.variables,
                          events:G.events, functions:G.functions, world:G.world });
}
export function deserialize(txt){
  const d = JSON.parse(txt);
  if (!d || !Array.isArray(d.nodes)) throw new Error('formato inválido');
  G.nodes = d.nodes;
  G.wires = d.wires || [];
  G.variables = d.variables || [];
  G.events = d.events || [];
  G.functions = d.functions || [];
  if (d.world) G.world = d.world;
  G.sel = null;
  G.active = 'main';
  for (const n of G.nodes) if (!n.g) n.g = 'main';   // compatibilidad con guardados previos
  pruneBadWires();
}

/* --------- construir un grafo desde una especificación declarativa ---------
   spec = {
     vars:  [{ name, type, def }],
     events:    [{ name, params:[{name,type}] }],
     functions: [{ name, params:[{name,type}], returns:[{name,type}] }],
     nodes: [{ k:'tipo', x, y, props:{...}, var:'Nombre', ev:'Nombre', fn:'Nombre' }],
     links: [[fromIdx, 'pinSalida', toIdx, 'pinEntrada'], ...],   // params por NOMBRE
     world: { x, y, k }
   }
   Usado por las lecciones cargables.                                         */
export function buildGraph(spec){
  G.variables = (spec.vars || []).map(v => ({ id:uid('v'), name:v.name, type:v.type || 'float', def:v.def ?? 0 }));
  G.events = (spec.events || []).map(e => ({ id:uid('e'), name:e.name,
    params:(e.params || []).map(p => ({ id:uid('p'), name:p.name, type:p.type || 'float' })) }));
  G.functions = (spec.functions || []).map(f => ({ id:uid('f'), name:f.name,
    params:(f.params || []).map(p => ({ id:uid('p'), name:p.name, type:p.type || 'float' })),
    returns:(f.returns || []).map(r => ({ id:uid('p'), name:r.name, type:r.type || 'float' })) }));

  const vid = Object.fromEntries(G.variables.map(v => [v.name, v.id]));
  const eid = Object.fromEntries(G.events.map(e => [e.name, e.id]));
  const fid = Object.fromEntries(G.functions.map(f => [f.name, f.id]));

  G.nodes = (spec.nodes || []).map(nd => {
    const t = T[nd.k];
    const n = { id:uid(), type:nd.k, x:nd.x || 0, y:nd.y || 0, g:(nd.g ? 'fn:' + fid[nd.g] : 'main'), props:{} };
    if (t.variableNode && nd.var) n.props.varId = vid[nd.var];
    if (t.eventNode && nd.ev)     n.props.evId  = eid[nd.ev];
    if (t.functionNode && nd.fn)  n.props.fnId  = fid[nd.fn];
    const ins = typeof t.inputs === 'function' ? t.inputs(n) : (t.inputs || []);
    for (const i of ins) if (i.editable) n.props[i.name] = i.default;
    for (const pr of (t.props || [])) n.props[pr.name] = pr.default;
    Object.assign(n.props, nd.props || {});
    return n;
  });

  G.wires = [];
  G.sel = null;
  G.active = 'main';
  G.world = spec.world || { x:60, y:40, k:1 };
  linkByIndex(spec.links || []);
}

// Crea un nodo nuevo con sus props por defecto, opcionalmente en un grafo (g).
export function newNode(type, { x = 0, y = 0, g = 'main', props = {} } = {}){
  const t = T[type];
  const n = { id:uid(), type, x, y, g, props:{ ...props } };
  const ins = typeof t.inputs === 'function' ? t.inputs(n) : (t.inputs || []);
  for (const i of ins) if (i.editable && n.props[i.name] === undefined) n.props[i.name] = i.default;
  for (const pr of (t.props || [])) if (n.props[pr.name] === undefined) n.props[pr.name] = pr.default;
  return n;
}

// Crea cables a partir de pares [fromIdx, 'pinSalida', toIdx, 'pinEntrada'] sobre
// los nodos actuales. Traduce nombres de parámetro a ids. Reutilizado por "Resolver".
export function linkByIndex(links){
  for (const [fi, fp0, ti, tp0] of links){
    const from = G.nodes[fi], to = G.nodes[ti];
    if (!from || !to) continue;
    const fp = paramPin(from, fp0), tp = paramPin(to, tp0);
    const od = getOutputs(from).find(o => o.name === fp);
    const kind = od && od.kind === 'exec' ? 'exec' : 'data';
    G.wires.push({ id:uid('w'), kind, type: kind === 'exec' ? 'exec' : (od ? od.type : 'float'),
                   from:{ node:from.id, pin:fp }, to:{ node:to.id, pin:tp } });
  }
}
