// functions.js — panel para definir funciones (nombre + parámetros + retornos).

import { G, pruneBadWires, newNode } from './state.js';
import { uid } from './util.js';
import { renderNodes, buildTabs, switchGraph } from './render.js';
import { markDirty } from './storage.js';

const listEl = document.querySelector('#funclist');
const addBtn = document.querySelector('#addfunc');

export function buildFunctionPanel(){
  listEl.innerHTML = '';
  if (!G.functions.length){
    const e = document.createElement('div');
    e.style.cssText = 'color:var(--muted-2);font-size:11px;padding:2px 2px 8px';
    e.textContent = 'Sin funciones. Creá una (Entry + Return) y llamala con Call.';
    listEl.appendChild(e);
  }
  for (const f of G.functions) listEl.appendChild(funcBlock(f));
}

function funcBlock(f){
  const box = document.createElement('div');
  box.className = 'var-block';

  const top = document.createElement('div');
  top.className = 'var-top';
  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.style.background = '#2f8a7e';
  const name = document.createElement('input');
  name.className = 'var-name-input';
  name.value = f.name;
  name.addEventListener('input', () => { f.name = name.value; renderNodes(); buildTabs(); markDirty(); });
  const del = document.createElement('button');
  del.className = 'var-del';
  del.textContent = '×';
  del.title = 'Eliminar función';
  del.addEventListener('click', () => {
    const gid = 'fn:' + f.id;
    G.functions = G.functions.filter(x => x.id !== f.id);
    G.nodes = G.nodes.filter(n => (n.g || 'main') !== gid);   // borra el cuerpo de la función
    if (G.active === gid) G.active = 'main';
    pruneBadWires(); renderNodes(); buildTabs(); buildFunctionPanel(); markDirty();
  });
  top.append(chip, name, del);
  box.appendChild(top);

  box.appendChild(sig(f.params,  'Parámetros', 'param'));
  box.appendChild(sig(f.returns, 'Retornos',   'ret'));
  return box;
}

function sig(list, label, base){
  const wrap = document.createElement('div');
  wrap.className = 'fn-sig';
  const h = document.createElement('div');
  h.className = 'fn-sig-h';
  h.textContent = label;
  wrap.appendChild(h);

  for (const p of list) wrap.appendChild(paramRow(list, p));

  const add = document.createElement('button');
  add.className = 'ev-addparam';
  add.textContent = '+ ' + (base === 'ret' ? 'retorno' : 'parámetro');
  add.addEventListener('click', () => {
    const names = new Set(list.map(x => x.name));
    let i = 1, nm = base; while (names.has(nm)) nm = base + (++i);
    list.push({ id:uid('p'), name:nm, type:'float' });
    renderNodes(); buildFunctionPanel(); markDirty();
  });
  wrap.appendChild(add);
  return wrap;
}

function paramRow(list, p){
  const row = document.createElement('div');
  row.className = 'var-bot';
  const pn = document.createElement('input');
  pn.className = 'var-def-input';
  pn.value = p.name;
  pn.placeholder = 'nombre';
  pn.addEventListener('input', () => { p.name = pn.value; renderNodes(); markDirty(); });
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
  pd.title = 'Quitar';
  pd.addEventListener('click', () => {
    const i = list.indexOf(p); if (i >= 0) list.splice(i, 1);
    pruneBadWires(); renderNodes(); buildFunctionPanel(); markDirty();
  });
  row.append(pn, pt, pd);
  return row;
}

addBtn.onclick = () => {
  const names = new Set(G.functions.map(f => f.name));
  let i = 1, nm = 'MiFuncion'; while (names.has(nm)) nm = 'MiFuncion' + (++i);
  const f = { id:uid('f'), name:nm, params:[], returns:[] };
  G.functions.push(f);
  const gid = 'fn:' + f.id;
  G.nodes.push(newNode('fn_entry',  { x:60,  y:120, g:gid, props:{ fnId:f.id } }));
  G.nodes.push(newNode('fn_return', { x:520, y:120, g:gid, props:{ fnId:f.id } }));
  buildFunctionPanel();
  switchGraph(gid);   // abre la pestaña de la nueva función (renderiza + pestañas)
  markDirty();
};
