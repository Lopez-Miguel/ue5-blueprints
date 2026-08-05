// interpreter.js — el "motor" que corre el grafo.
//
// Semántica estilo Blueprint:
//  · Pines de dato  -> evaluación PULL (el destino pide el valor a su origen).
//  · Pines de exec  -> ejecución PUSH (se camina el flujo de nodo en nodo).
//  · Nodos puros    -> se recalculan on-demand, sin efectos.
//  · Nodos latentes -> se agendan en el scheduler y disparan 'completed' luego.

import { G, getNode, inputDef, dataWireInto } from './state.js';
import { T } from './nodeTypes.js';
import { coerce, num } from './util.js';

const MAX_STEPS = 200000;   // cortafuegos anti-cuelgue para bucles/recursión
let steps = 0;
const scheduler = [];       // [{ node, remaining }]

export const ctx = {
  actor: { x:0, y:0, rot:0, scale:1 },
  time: 0,
  dt: 0,
  vars: {},                 // { varId: valor }
  timelines: new Map(),     // nodeId -> { t, playing }
  log: () => {},            // lo asigna runtime.js (consola)
  schedule(id, dur){
    if (!scheduler.some(s => s.node === id)) scheduler.push({ node:id, remaining: Math.max(0, dur) });
  },
  overBudget: () => steps > MAX_STEPS,
};

export function resetScheduler(){ scheduler.length = 0; ctx.timelines.clear(); }

export function initVars(){
  ctx.vars = {};
  for (const v of G.variables) ctx.vars[v.id] = coerce(v.def, v.type);
}

/* -------- evaluación de datos (pull) -------- */
export function pullData(nodeId, pin){
  const w = dataWireInto(nodeId, pin);
  if (w){
    const src = getNode(w.from.node), t = T[src.type];
    if (t.eval)     return t.eval(src, mkGetIn(src.id), ctx)[w.from.pin];
    if (t.readData) return t.readData(src, ctx, w.from.pin);
    return 0;
  }
  const n = getNode(nodeId), def = inputDef(n, pin);
  return def ? n.props[def.name] : 0;
}

export function mkGetIn(nodeId){
  return (pin) => {
    const def = inputDef(getNode(nodeId), pin);
    return coerce(pullData(nodeId, pin), def ? def.type : 'float');
  };
}

/* -------- ejecución de flujo (push) -------- */
function fire(nodeId, out){
  const w = G.wires.find(x => x.kind === 'exec' && x.from.node === nodeId && x.from.pin === out);
  if (w) runNode(w.to.node, w.to.pin);
}

// inPin = nombre del pin de ejecución por el que se entró (por defecto 'exec').
// Casi todos los nodos lo ignoran; Timeline lo usa para distinguir Play de Stop.
export function runNode(id, inPin = 'exec'){
  if (steps++ > MAX_STEPS) return;
  const n = getNode(id), t = T[n.type];
  if (!t || !t.run) return;
  t.run(n, ctx, mkGetIn(id), (out) => fire(id, out), inPin);
}

// Dispara un evento por su tipo (event_begin / event_tick).
export function fireEvent(type){
  const ev = G.nodes.find(n => n.type === type);
  if (!ev) return;
  steps = 0;
  fire(ev.id, 'then');
}

// Avanza los nodos latentes; los que llegan a 0 disparan su salida 'completed'.
export function stepScheduler(dt){
  for (const s of scheduler) s.remaining -= dt;
  const done = scheduler.filter(s => s.remaining <= 0);
  for (const s of done) scheduler.splice(scheduler.indexOf(s), 1);
  for (const s of done){ steps = 0; fire(s.node, 'completed'); }
}

// Avanza cada Timeline en reproducción; dispara 'update' por frame y 'finished' al terminar.
export function stepTimelines(dt){
  for (const [id, s] of ctx.timelines){
    if (!s.playing) continue;
    const n = getNode(id);
    if (!n){ ctx.timelines.delete(id); continue; }
    const len = Math.max(0.0001, num(n.props.length));
    s.t += dt;
    let finished = false;
    if (s.t >= len){
      if (n.props.loop) s.t = s.t % len;
      else { s.t = len; s.playing = false; finished = true; }
    }
    steps = 0; fire(id, 'update');
    if (finished){ steps = 0; fire(id, 'finished'); }
  }
}
