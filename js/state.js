// state.js — modelo del grafo + geometría de pines + queries.
// Todo el estado vive en el objeto G (un único objeto mutable compartido),
// así cualquier módulo lo lee y lo modifica sin problemas de bindings.

import { T } from './nodeTypes.js';
import { uid, coerce } from './util.js';

export const G = {
  nodes: [],       // { id, type, x, y, props, _index? }
  wires: [],       // { id, kind:'exec'|'data', type, from:{node,pin}, to:{node,pin} }
  variables: [],   // { id, name, type:'float'|'bool'|'string', def }
  sel: null,       // { kind:'node'|'wire', id }
  world: { x:60, y:40, k:1 },
};

// Geometría: alto de cabecera, alto de fila, padding superior de .rows.
export const LAY = { W:200, HEAD:32, ROW:28, PAD:5 };

export const getNode = id => G.nodes.find(n => n.id === id);
export const getVar  = id => G.variables.find(v => v.id === id);

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
    return ft === tt;
  });
}

/* --------- persistencia --------- */
export function serialize(){
  return JSON.stringify({ v:1, nodes:G.nodes, wires:G.wires, variables:G.variables, world:G.world });
}
export function deserialize(txt){
  const d = JSON.parse(txt);
  if (!d || !Array.isArray(d.nodes)) throw new Error('formato inválido');
  G.nodes = d.nodes;
  G.wires = d.wires || [];
  G.variables = d.variables || [];
  if (d.world) G.world = d.world;
  G.sel = null;
  pruneBadWires();
}

/* --------- grafo demo por defecto ---------
   Tick.DeltaSeconds × Speed  ->  Add Actor Rotation   (gira usando una VARIABLE)
   BeginPlay -> Print String                                                    */
export function defaultGraph(){
  const sid = uid('v');
  G.variables = [{ id:sid, name:'Speed', type:'float', def:90 }];

  const N = [], W = [];
  const mk = (type, x, y, props = {}) => {
    const n = { id:uid(), type, x, y, props:{} };
    const t = T[type];
    const ins = typeof t.inputs === 'function' ? t.inputs(n) : (t.inputs || []);
    for (const i of ins) if (i.editable && props[i.name] === undefined) n.props[i.name] = i.default;
    for (const pr of (t.props || [])) if (n.props[pr.name] === undefined) n.props[pr.name] = pr.default;
    for (const k in props) n.props[k] = props[k];
    N.push(n); return n;
  };
  const w = (kind, fn, fp, tn, tp, ty) =>
    W.push({ id:uid('w'), kind, type: ty || (kind === 'exec' ? 'exec' : 'float'),
             from:{ node:fn, pin:fp }, to:{ node:tn, pin:tp } });

  const tick = mk('event_tick', 20, 30);
  const spd  = mk('var_get', 30, 210, { varId:sid });
  const mul  = mk('math_mul', 320, 70, { a:1, b:1 });
  const rot  = mk('add_rotation', 580, 40);
  const beg  = mk('event_begin', 20, 370);
  const pr   = mk('print_string', 320, 370, { in:'Blueprint corriendo 🎬' });

  w('data', tick.id, 'dt',  mul.id, 'a', 'float');
  w('data', spd.id,  'value', mul.id, 'b', 'float');
  w('data', mul.id,  'res', rot.id, 'deg', 'float');
  w('exec', tick.id, 'then', rot.id, 'exec');
  w('exec', beg.id,  'then', pr.id,  'exec');

  G.nodes = N; G.wires = W; G.sel = null; G.world = { x:60, y:40, k:1 };
}
