// variables.js — panel lateral para definir variables del grafo.

import { G, pruneBadWires } from './state.js';
import { uid, coerce } from './util.js';
import { renderNodes } from './render.js';
import { markDirty } from './storage.js';

const TYPE_COLOR = { float:'var(--float)', bool:'var(--bool)', string:'var(--string)' };
const listEl = document.querySelector('#varlist');
const addBtn = document.querySelector('#addvar');

export function buildVarPanel(){
  listEl.innerHTML = '';
  if (!G.variables.length){
    const empty = document.createElement('div');
    empty.style.cssText = 'color:var(--muted-2);font-size:11px;padding:2px 2px 8px';
    empty.textContent = 'Sin variables. Creá una para usar los nodos Get/Set.';
    listEl.appendChild(empty);
  }
  for (const v of G.variables) listEl.appendChild(varBlock(v));
}

function varBlock(v){
  const box = document.createElement('div');
  box.className = 'var-block';

  const row = document.createElement('div');
  row.className = 'var-row';

  const nameWrap = document.createElement('div');
  nameWrap.className = 'var-name';
  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.style.background = TYPE_COLOR[v.type] || '#888';
  const name = document.createElement('input');
  name.value = v.name;
  name.addEventListener('input', () => { v.name = name.value; renderNodes(); markDirty(); });
  nameWrap.append(chip, name);

  const type = document.createElement('select');
  for (const t of ['float', 'bool', 'string']){
    const o = document.createElement('option');
    o.value = t; o.textContent = t;
    if (t === v.type) o.selected = true;
    type.appendChild(o);
  }
  type.addEventListener('change', () => {
    v.type = type.value;
    v.def  = coerce(v.def, v.type);
    pruneBadWires();      // el tipo de los pines Get/Set cambió
    renderNodes();
    buildVarPanel();      // refrescar el editor de valor por defecto
    markDirty();
  });

  const del = document.createElement('button');
  del.className = 'var-del';
  del.textContent = '×';
  del.title = 'Eliminar variable';
  del.addEventListener('click', () => {
    G.variables = G.variables.filter(x => x.id !== v.id);
    pruneBadWires();
    renderNodes();
    buildVarPanel();
    markDirty();
  });

  row.append(nameWrap, type, del);

  const defRow = document.createElement('div');
  defRow.className = 'var-def';
  defRow.appendChild(defaultEditor(v));

  box.append(row, defRow);
  return box;
}

function defaultEditor(v){
  let e;
  if (v.type === 'bool'){
    e = document.createElement('input'); e.type = 'checkbox';
    e.style.width = '16px'; e.style.accentColor = 'var(--accent)';
    e.checked = !!v.def;
    e.addEventListener('change', () => { v.def = e.checked; markDirty(); });
  } else if (v.type === 'string'){
    e = document.createElement('input'); e.type = 'text';
    e.placeholder = 'valor por defecto';
    e.value = v.def ?? '';
    e.addEventListener('input', () => { v.def = e.value; markDirty(); });
  } else {
    e = document.createElement('input'); e.type = 'number'; e.step = 'any';
    e.placeholder = 'valor por defecto';
    e.value = v.def ?? 0;
    e.addEventListener('input', () => { v.def = e.value; markDirty(); });
  }
  return e;
}

addBtn.onclick = () => {
  const names = new Set(G.variables.map(v => v.name));
  let i = 1, name = 'NewVar';
  while (names.has(name)) name = 'NewVar' + (++i);
  G.variables.push({ id:uid('v'), name, type:'float', def:0 });
  buildVarPanel();
  markDirty();
};
