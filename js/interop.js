// interop.js — importar grafos desde el texto de copiar/pegar de Unreal Engine.
//
// Al copiar nodos en el editor de Blueprints (Ctrl+C) se obtiene texto tipo T3D:
// bloques "Begin Object … End Object" (un nodo cada uno) con Class, Name,
// NodePosX/Y y líneas "CustomProperties Pin (…)". Las conexiones se codifican
// dentro de cada pin como LinkedTo=(NodoDestino GUIDdelPin,…), referenciando el
// GUID del pin del otro extremo. Reconstruimos todo eso en nuestro modelo.
//
// Los nodos entran como tipo genérico 'ue_node' (sólo visualización): reproducen
// pines/tipos/título/conexiones, pero no los ejecuta el intérprete.

import { G } from './state.js';
import { uid } from './util.js';
import { T } from './nodeTypes.js';

// PinType.PinCategory de UE -> nuestro tipo de dato.
const DATA_TYPE = {
  real:'float', float:'float', double:'float',
  int:'int', int64:'int', byte:'int',
  bool:'bool', boolean:'bool',
  string:'string', name:'string', text:'string',
};
const mapDataType = cat => DATA_TYPE[(cat || '').toLowerCase()] || 'object';

const prettyEvent = name =>
  name === 'ReceiveBeginPlay' ? 'BeginPlay'
  : name === 'ReceiveTick'    ? 'Tick'
  : name.replace(/^Receive/, '');

/* ---------- separar en bloques Begin/End Object ---------- */
function splitObjects(text){
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let cur = null, depth = 0;
  for (const line of lines){
    const t = line.trim();
    if (/^Begin Object\b/.test(t)){
      if (depth === 0) cur = { header:t, body:[] };
      else if (cur) cur.body.push(line);
      depth++;
      continue;
    }
    if (/^End Object\b/.test(t)){
      depth--;
      if (depth === 0 && cur){ blocks.push(cur); cur = null; }
      else if (cur) cur.body.push(line);
      continue;
    }
    if (cur) cur.body.push(line);
  }
  return blocks;
}

/* ---------- extraer el contenido balanceado de cada "CustomProperties Pin (…)" ---------- */
function extractPinStrings(body){
  const out = [];
  const token = 'CustomProperties Pin ';
  let i = 0;
  while ((i = body.indexOf(token, i)) !== -1){
    const j = body.indexOf('(', i + token.length);
    if (j === -1) break;
    let depth = 0, inStr = false, k = j;
    for (; k < body.length; k++){
      const ch = body[k];
      if (ch === '"') inStr = !inStr;
      else if (!inStr && ch === '(') depth++;
      else if (!inStr && ch === ')'){ depth--; if (depth === 0){ k++; break; } }
    }
    out.push(body.slice(j + 1, k - 1));
    i = k;
  }
  return out;
}

function memberName(body, key){
  const m = body.match(new RegExp(key + '=\\(([^)]*)\\)'));
  if (!m) return null;
  const mm = m[1].match(/MemberName="([^"]+)"/);
  return mm ? mm[1] : null;
}

// Extrae los datos crudos de un pin de UE.
function parsePin(ps){
  const pinId = (ps.match(/PinId=([0-9A-Fa-f]+)/) || [])[1];
  const name  = (ps.match(/PinName="([^"]+)"/) || [])[1];
  if (!pinId || !name) return null;
  const hidden = /bHidden=True/.test(ps);
  const dir = /Direction="EGPD_Output"/.test(ps) ? 'out' : 'in';
  const category = (ps.match(/PinCategory="([^"]+)"/) || [])[1] || '';
  const kind = category.toLowerCase() === 'exec' ? 'exec' : 'data';
  const type = kind === 'exec' ? 'exec' : mapDataType(category);
  const dv = (ps.match(/(?:^|,)DefaultValue="([^"]*)"/) || [])[1];
  const links = [];
  const linked = (ps.match(/LinkedTo=\(([^)]*)\)/) || [])[1];
  if (linked) for (const e of linked.split(',')){
    const g = e.trim().split(/\s+/).pop();
    if (g && /^[0-9A-Fa-f]+$/.test(g)) links.push(g);
  }
  return { pinId, name, hidden, dir, category, kind, type, dv, links };
}

// ¿Este nodo de UE tiene equivalente NATIVO? Devuelve el tipo + cómo renombrar pines.
function mapNative(short, funcName, varName, evtName){
  if (evtName === 'ReceiveBeginPlay') return { type:'event_begin', rename:{ then:'then' } };
  if (evtName === 'ReceiveTick')      return { type:'event_tick', rename:{ then:'then', DeltaSeconds:'dt' } };
  if (/IfThenElse/.test(short))       return { type:'branch',   rename:{ execute:'exec', Condition:'cond', then:'true', else:'false' } };
  if (/ExecutionSequence/.test(short))return { type:'sequence', rename:{ execute:'exec', then_0:'t0', then_1:'t1' } };
  if (/VariableGet/.test(short) && varName) return { type:'var_get', var:true, varName };
  if (/VariableSet/.test(short) && varName) return { type:'var_set', var:true, varName };
  if (funcName){
    if (/^Conv_/.test(funcName)){
      const to = /ToString$/.test(funcName)         ? 'to_string'
               : /To(Float|Double)$/.test(funcName) ? 'to_float'
               : /ToInt/.test(funcName)             ? 'to_int' : null;
      if (to) return { type:to, conv:true };
    }
    if (/^MakeLiteral(Float|Double|Int)$/.test(funcName)) return { type:'lit_float',  literal:true };
    if (/^MakeLiteralBool$/.test(funcName))               return { type:'lit_bool',   literal:true };
    if (/^MakeLiteralString$/.test(funcName))             return { type:'lit_string', literal:true };
    if (/^Delay$/.test(funcName))       return { type:'delay', rename:{ execute:'exec', then:'completed', Duration:'dur' } };
    if (/^PrintString$/.test(funcName)) return { type:'print_string', rename:{ execute:'exec', then:'then', InString:'in' } };
    if (/^Add_/.test(funcName))         return { type:'math_add', rename:{ A:'a', B:'b', ReturnValue:'res' } };
    if (/^Subtract_/.test(funcName))    return { type:'math_sub', rename:{ A:'a', B:'b', ReturnValue:'res' } };
    if (/^Multiply_/.test(funcName))    return { type:'math_mul', rename:{ A:'a', B:'b', ReturnValue:'res' } };
    if (/^Divide_/.test(funcName))      return { type:'math_div', rename:{ A:'a', B:'b', ReturnValue:'res' } };
    if (/^Greater_/.test(funcName))     return { type:'cmp_gt', rename:{ A:'a', B:'b', ReturnValue:'res' } };
    if (/^Less_/.test(funcName))        return { type:'cmp_lt', rename:{ A:'a', B:'b', ReturnValue:'res' } };
    if (/^GreaterEqual_/.test(funcName))return { type:'cmp_ge', rename:{ A:'a', B:'b', ReturnValue:'res' } };
    if (/^LessEqual_/.test(funcName))   return { type:'cmp_le', rename:{ A:'a', B:'b', ReturnValue:'res' } };
    if (/^EqualEqual_/.test(funcName))  return { type:'cmp_eq', rename:{ A:'a', B:'b', ReturnValue:'res' } };
    if (/^NotEqual_/.test(funcName))    return { type:'cmp_ne', rename:{ A:'a', B:'b', ReturnValue:'res' } };
    if (/^BooleanAND$/.test(funcName))  return { type:'bool_and', rename:{ A:'a', B:'b', ReturnValue:'res' } };
    if (/^BooleanOR$/.test(funcName))   return { type:'bool_or',  rename:{ A:'a', B:'b', ReturnValue:'res' } };
    if (/^SelectFloat$/.test(funcName)) return { type:'select_float', rename:{ A:'a', B:'b', bPickA:'pick', ReturnValue:'res' } };
  }
  return null;
}

// Renombrado de pines para var_get / var_set (el pin de dato se llama como la variable).
function varPin(type, varName, ueName, dir){
  if (type === 'var_get') return (dir === 'out' && ueName === varName) ? 'value' : null;
  if (dir === 'in'  && ueName === 'execute') return 'exec';
  if (dir === 'out' && ueName === 'then')    return 'then';
  if (dir === 'in'  && ueName === varName)   return 'value';
  return null;
}

// Inicializa props por defecto de un nodo nativo (inputs editables + props).
function initNativeProps(n){
  const t = T[n.type];
  const ins = typeof t.inputs === 'function' ? t.inputs(n) : (t.inputs || []);
  for (const i of ins) if (i.editable) n.props[i.name] = i.default;
  for (const pr of (t.props || [])) n.props[pr.name] = pr.default;
}

/* ---------- parser principal ---------- */
export function parseUEBlueprint(text){
  const warnings = [];
  if (!text || !/Begin Object/.test(text))
    return { error:'No encontré objetos de Blueprint. Copiá nodos en el editor de UE (Ctrl+C) y pegá el texto.' };

  const blocks = splitObjects(text);
  if (!blocks.length) return { error:'No pude separar ningún nodo del texto pegado.' };

  const nodes = [];
  const pinMap = {};       // PinId (GUID) -> { node, pin, dir, kind, type }
  const linkPairs = [];    // [guidA, guidB]
  const importVars = {};   // nombre -> { id, name, type, def }
  const genericTitles = []; // nodos que quedaron sólo-visualización
  let mapped = 0;
  let minX = Infinity, minY = Infinity;

  const ensureVar = name => {
    if (!importVars[name]) importVars[name] = { id:uid('v'), name, type:'float', def:0 };
    return importVars[name].id;
  };

  for (const block of blocks){
    const body = block.body.join('\n');
    const cls  = (block.header.match(/Class=([^\s]+)/) || [])[1] || '';
    const short = cls.split('.').pop().replace(/["']/g, '');
    const ueName = (block.header.match(/Name="([^"]+)"/) || [])[1] || uid('ue');

    const funcName = memberName(body, 'FunctionReference');
    const varName  = memberName(body, 'VariableReference');
    const evtName  = memberName(body, 'EventReference');
    const custName = (body.match(/CustomFunctionName="([^"]+)"/) || [])[1];
    const isPure   = /bIsPureFunc=True/.test(body);
    const posX = +((body.match(/NodePosX=(-?\d+)/) || [])[1] || 0);
    const posY = +((body.match(/NodePosY=(-?\d+)/) || [])[1] || 0);
    const pinStrings = extractPinStrings(body);
    const id = uid();

    minX = Math.min(minX, posX);
    minY = Math.min(minY, posY);

    const native = mapNative(short, funcName, varName, evtName);

    if (native){
      // ---- nodo NATIVO (ejecutable) ----
      const n = { id, type:native.type, _x:posX, _y:posY, props:{} };
      if (native.var) n.props.varId = ensureVar(native.varName);
      initNativeProps(n);

      for (const ps of pinStrings){
        const p = parsePin(ps); if (!p || p.hidden) continue;
        let np;
        if (native.literal){
          if (p.dir === 'out' && p.name === 'ReturnValue') np = 'val';
          else if (p.dir === 'in' && p.name === 'Value'){ if (p.dv != null) n.props.value = p.dv; np = null; }
          else np = null;
        } else if (native.conv){
          if (p.dir === 'in' && p.kind === 'data'){ np = 'in'; n.props.from = p.type; }
          else if (p.dir === 'out' && p.name === 'ReturnValue'){ np = 'out'; }
          else np = null;
        } else if (native.var){
          np = varPin(native.type, native.varName, p.name, p.dir);
        } else {
          np = native.rename[p.name] || null;
        }
        if (!np) continue;
        if (native.var && np === 'value' && importVars[native.varName])
          importVars[native.varName].type = (p.kind === 'exec' ? 'float' : p.type);
        pinMap[p.pinId] = { node:id, pin:np, dir:p.dir, kind:p.kind, type:p.type };
        if (p.dir === 'in' && p.dv != null && np !== 'exec' && np !== 'in') n.props[np] = p.dv;
        for (const g of p.links) linkPairs.push([p.pinId, g]);
      }
      nodes.push(n);
      mapped++;
    } else {
      // ---- nodo GENÉRICO (sólo visualización) ----
      let title, cat = 'act';
      if (evtName){ title = 'Event ' + prettyEvent(evtName); cat = 'ev'; }
      else if (custName){ title = 'Event ' + custName; cat = 'ev'; }
      else if (/VariableGet/.test(short)){ title = 'Get ' + (varName || '?'); cat = 'var'; }
      else if (/VariableSet/.test(short)){ title = 'Set ' + (varName || '?'); cat = 'var'; }
      else if (funcName){ title = funcName; cat = isPure ? 'pure' : 'act'; }
      else { title = short.replace(/^K2Node_/, ''); cat = isPure ? 'pure' : 'act'; }

      const pins = [];
      const usedName = { in:new Set(), out:new Set() };
      for (const ps of pinStrings){
        const p = parsePin(ps); if (!p || p.hidden) continue;
        let name = p.name, k = 2;
        while (usedName[p.dir].has(name)) name = p.name + '_' + (k++);
        usedName[p.dir].add(name);
        pins.push({ name, kind:p.kind, type:p.type, label:p.name, dir:p.dir });
        pinMap[p.pinId] = { node:id, pin:name, dir:p.dir, kind:p.kind, type:p.type };
        for (const g of p.links) linkPairs.push([p.pinId, g]);
      }
      nodes.push({ id, type:'ue_node', _x:posX, _y:posY, props:{ title, cat, pins, ueName } });
      genericTitles.push(title);
    }
  }

  // posiciones: normalizar al mínimo, compactar un poco y desplazar a la vista
  if (!Number.isFinite(minX)){ minX = 0; minY = 0; }
  for (const n of nodes){
    n.x = Math.round((n._x - minX) * 0.75) + 40;
    n.y = Math.round((n._y - minY) * 0.75) + 40;
    delete n._x; delete n._y;
  }

  // resolver enlaces (dedup por par no ordenado de GUIDs)
  const seen = new Set();
  const wires = [];
  for (const [ga, gb] of linkPairs){
    const key = ga < gb ? ga + '|' + gb : gb + '|' + ga;
    if (seen.has(key)) continue;
    seen.add(key);
    const a = pinMap[ga], b = pinMap[gb];
    if (!a || !b){ warnings.push('Enlace sin destino visible (pin oculto o fuera de la selección).'); continue; }
    let out, inp;
    if (a.dir === 'out' && b.dir === 'in'){ out = a; inp = b; }
    else if (a.dir === 'in' && b.dir === 'out'){ out = b; inp = a; }
    else continue;
    wires.push({ id:uid('w'), kind:out.kind, type: out.kind === 'exec' ? 'exec' : out.type,
      from:{ node:out.node, pin:out.pin }, to:{ node:inp.node, pin:inp.pin } });
  }

  return { nodes, wires, variables:Object.values(importVars), mapped, generic:genericTitles, warnings };
}

// Parsea y agrega el resultado al grafo actual. Devuelve stats para la UI.
export function importUE(text){
  const res = parseUEBlueprint(text);
  if (res.error) return res;
  for (const v of res.variables) G.variables.push(v);
  for (const n of res.nodes) G.nodes.push(n);
  for (const w of res.wires) G.wires.push(w);
  return { count:res.nodes.length, wireCount:res.wires.length, mapped:res.mapped,
           generic:res.generic, warnings:res.warnings || [] };
}
