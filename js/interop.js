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
  let minX = Infinity, minY = Infinity;

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

    // título + color según el tipo de nodo
    let title, cat = 'act';
    if (evtName){ title = 'Event ' + prettyEvent(evtName); cat = 'ev'; }
    else if (custName){ title = 'Event ' + custName; cat = 'ev'; }
    else if (/VariableGet/.test(short)){ title = 'Get ' + (varName || '?'); cat = 'var'; }
    else if (/VariableSet/.test(short)){ title = 'Set ' + (varName || '?'); cat = 'var'; }
    else if (/IfThenElse/.test(short)){ title = 'Branch'; }
    else if (/ExecutionSequence/.test(short)){ title = 'Sequence'; }
    else if (funcName){ title = funcName; cat = isPure ? 'pure' : 'act'; }
    else { title = short.replace(/^K2Node_/, ''); cat = isPure ? 'pure' : 'act'; }

    const id = uid();
    const pins = [];
    const usedName = { in:new Set(), out:new Set() };

    for (const ps of extractPinStrings(body)){
      const pinId = (ps.match(/PinId=([0-9A-Fa-f]+)/) || [])[1];
      const rawName = (ps.match(/PinName="([^"]+)"/) || [])[1];
      if (!pinId || !rawName) continue;
      if (/bHidden=True/.test(ps)) continue;                 // pines ocultos: no se muestran

      const dir = /Direction="EGPD_Output"/.test(ps) ? 'out' : 'in';
      const category = (ps.match(/PinCategory="([^"]+)"/) || [])[1] || '';
      const kind = category.toLowerCase() === 'exec' ? 'exec' : 'data';
      const type = kind === 'exec' ? 'exec' : mapDataType(category);

      // asegurar nombre único por dirección dentro del nodo
      let name = rawName, k = 2;
      while (usedName[dir].has(name)) name = rawName + '_' + (k++);
      usedName[dir].add(name);

      pins.push({ name, kind, type, label:rawName, dir });
      pinMap[pinId] = { node:id, pin:name, dir, kind, type };

      const linked = (ps.match(/LinkedTo=\(([^)]*)\)/) || [])[1];
      if (linked){
        for (const entry of linked.split(',')){
          const g = entry.trim().split(/\s+/).pop();
          if (g && /^[0-9A-Fa-f]+$/.test(g)) linkPairs.push([pinId, g]);
        }
      }
    }

    minX = Math.min(minX, posX);
    minY = Math.min(minY, posY);
    nodes.push({ id, type:'ue_node', _x:posX, _y:posY, props:{ title, cat, pins, ueName } });
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

  return { nodes, wires, warnings };
}

// Parsea y agrega el resultado al grafo actual. Devuelve stats para la UI.
export function importUE(text){
  const res = parseUEBlueprint(text);
  if (res.error) return res;
  for (const n of res.nodes) G.nodes.push(n);
  for (const w of res.wires) G.wires.push(w);
  return { count:res.nodes.length, wireCount:res.wires.length, warnings:res.warnings || [] };
}
