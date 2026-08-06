// events.js — panel para definir eventos custom (nombre + parámetros).

import { G, pruneBadWires } from './state.js';
import { uid } from './util.js';
import { renderNodes } from './render.js';
import { markDirty } from './storage.js';

const listEl = document.querySelector('#eventlist');
const addBtn = document.querySelector('#addevent');

export function buildEventPanel(){
  listEl.innerHTML = '';
  if (!G.events.length){
    const empty = document.createElement('div');
    empty.style.cssText = 'color:var(--muted-2);font-size:11px;padding:2px 2px 8px';
    empty.textContent = 'Sin eventos. Creá uno y llamalo con un nodo Call.';
    listEl.appendChild(empty);
  }
  for (const e of G.events) listEl.appendChild(eventBlock(e));
}

function eventBlock(e){
  const box = document.createElement('div');
  box.className = 'var-block';

  const top = document.createElement('div');
  top.className = 'var-top';
  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.style.background = 'var(--ev-b)';
  const name = document.createElement('input');
  name.className = 'var-name-input';
  name.value = e.name;
  name.addEventListener('input', () => { e.name = name.value; renderNodes(); markDirty(); });
  const del = document.createElement('button');
  del.className = 'var-del';
  del.textContent = '×';
  del.title = 'Eliminar evento';
  del.addEventListener('click', () => {
    G.events = G.events.filter(x => x.id !== e.id);
    pruneBadWires(); renderNodes(); buildEventPanel(); markDirty();
  });
  top.append(chip, name, del);
  box.appendChild(top);

  for (const p of e.params) box.appendChild(paramRow(e, p));

  const addP = document.createElement('button');
  addP.className = 'ev-addparam';
  addP.textContent = '+ parámetro';
  addP.addEventListener('click', () => {
    const names = new Set(e.params.map(x => x.name));
    let i = 1, nm = 'param'; while (names.has(nm)) nm = 'param' + (++i);
    e.params.push({ id:uid('p'), name:nm, type:'float' });
    renderNodes(); buildEventPanel(); markDirty();
  });
  box.appendChild(addP);
  return box;
}

function paramRow(e, p){
  const row = document.createElement('div');
  row.className = 'var-bot';
  const pn = document.createElement('input');
  pn.className = 'var-def-input';
  pn.value = p.name;
  pn.placeholder = 'parámetro';
  pn.addEventListener('input', () => { p.name = pn.value; renderNodes(); markDirty(); });   // el pin usa id: renombrar no rompe cables
  const pt = document.createElement('select');
  for (const t of ['float', 'bool', 'string']){
    const o = document.createElement('option');
    o.value = t; o.textContent = t;
    if (t === p.type) o.selected = true;
    pt.appendChild(o);
  }
  pt.addEventListener('change', () => { p.type = pt.value; pruneBadWires(); renderNodes(); markDirty(); });
  const pd = document.createElement('button');
  pd.className = 'var-del';
  pd.textContent = '×';
  pd.title = 'Quitar parámetro';
  pd.addEventListener('click', () => {
    e.params = e.params.filter(x => x !== p);
    pruneBadWires(); renderNodes(); buildEventPanel(); markDirty();
  });
  row.append(pn, pt, pd);
  return row;
}

addBtn.onclick = () => {
  const names = new Set(G.events.map(e => e.name));
  let i = 1, nm = 'MiEvento'; while (names.has(nm)) nm = 'MiEvento' + (++i);
  G.events.push({ id:uid('e'), name:nm, params:[] });
  buildEventPanel(); markDirty();
};
