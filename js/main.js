// main.js — punto de entrada: arma la UI y arranca todo.

import { G, defaultGraph } from './state.js';
import { T, PALETTE, CAT_COLOR, DESC } from './nodeTypes.js';
import { renderNodes, applyWorld } from './render.js';
import { addNode, initInteraction } from './interaction.js';
import { renderActor, clearLog, bindRuntimeUI, buildStageGrid } from './runtime.js';
import { buildVarPanel } from './variables.js';
import { loadLocal, exportFile, importFile, markDirty } from './storage.js';
import { importUE } from './interop.js';
import { $ } from './util.js';

/* -------- paleta de nodos (acordeón + búsqueda) -------- */
const palCollapsed = {};   // grupo -> plegado?

function buildPalette(){
  const host = $('#paletteNodes');
  host.innerHTML = '';
  PALETTE.forEach(([group, types], gi) => {
    if (palCollapsed[group] === undefined) palCollapsed[group] = gi !== 0;  // sólo el 1º abierto

    const g = document.createElement('div');
    g.className = 'pal-group' + (palCollapsed[group] ? ' collapsed' : '');
    g.dataset.group = group;

    const head = document.createElement('button');
    head.className = 'pal-head';
    head.innerHTML = `<span class="chev">▾</span><span>${group}</span><span class="pal-count">${types.length}</span>`;
    head.onclick = () => {
      palCollapsed[group] = !palCollapsed[group];
      g.classList.toggle('collapsed', palCollapsed[group]);
    };
    g.appendChild(head);

    const items = document.createElement('div');
    items.className = 'pal-items';
    for (const ty of types){
      const b = document.createElement('button');
      b.className = 'pal-item';
      b.style.setProperty('--tag', CAT_COLOR[T[ty].cat]);
      b.innerHTML = `<span class="k">${T[ty].ic || ''}</span> ${T[ty].title}`;
      b.title = DESC[ty] || '';
      b.dataset.search = (T[ty].title + ' ' + (DESC[ty] || '')).toLowerCase();
      b.onclick = () => addNode(ty);
      items.appendChild(b);
    }
    g.appendChild(items);
    host.appendChild(g);
  });
  filterPalette($('#palSearch') ? $('#palSearch').value : '');
}

// Filtra por nombre/descripción: expande grupos con coincidencias, oculta los vacíos.
function filterPalette(raw){
  const host = $('#paletteNodes');
  const q = raw.trim().toLowerCase();
  const searching = q.length > 0;
  let anyVisible = false;

  for (const g of host.querySelectorAll('.pal-group')){
    let groupHas = false;
    for (const it of g.querySelectorAll('.pal-item')){
      const match = !searching || it.dataset.search.includes(q);
      it.classList.toggle('hidden', !match);
      if (match) groupHas = true;
    }
    g.classList.toggle('hidden', searching && !groupHas);
    g.classList.toggle('collapsed', searching ? false : !!palCollapsed[g.dataset.group]);
    if (groupHas) anyVisible = true;
  }

  let empty = host.querySelector('.pal-empty');
  if (searching && !anyVisible){
    if (!empty){ empty = document.createElement('div'); empty.className = 'pal-empty'; host.appendChild(empty); }
    empty.textContent = `Sin resultados para "${raw.trim()}".`;
    empty.classList.remove('hidden');
  } else if (empty){
    empty.classList.add('hidden');
  }
}

/* -------- barra superior -------- */
function bindTopBar(){
  $('#demo').onclick = () => {
    defaultGraph(); buildVarPanel(); applyWorld(); renderNodes(); markDirty();
  };
  $('#export').onclick = exportFile;
  $('#importBtn').onclick = () => $('#importFile').click();
  $('#importFile').onchange = (e) => {
    const f = e.target.files[0];
    if (f) importFile(f, (ok) => {
      if (ok){ buildVarPanel(); applyWorld(); renderNodes(); markDirty(); }
      else alert('No pude leer ese archivo como grafo válido.');
    });
    e.target.value = '';
  };
}

/* -------- modal: importar desde Unreal -------- */
function bindUEModal(){
  const modal = $('#ueModal'), text = $('#ueText'), msg = $('#ueMsg');
  const open  = () => { text.value = ''; msg.textContent = ''; modal.hidden = false; text.focus(); };
  const close = () => { modal.hidden = true; };

  $('#ueimport').onclick = open;
  $('#ueCancel').onclick = close;
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  $('#ueDo').onclick = () => {
    const res = importUE(text.value);
    if (res.error){ msg.textContent = res.error; return; }
    renderNodes(); markDirty();
    const w = res.warnings.length ? ` (${res.warnings.length} avisos)` : '';
    msg.textContent = `Importados ${res.count} nodos y ${res.wireCount} conexiones${w}.`;
    setTimeout(close, 900);
  };
}

/* -------- modal: ayuda / leyenda -------- */
function bindHelp(){
  const modal = $('#helpModal');
  $('#help').onclick = () => { modal.hidden = false; };
  $('#helpClose').onclick = () => { modal.hidden = true; };
  modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });
}

/* -------- arranque -------- */
buildStageGrid();
if (!loadLocal()) defaultGraph();   // recupera el último trabajo, o carga el demo
buildPalette();
$('#palSearch').addEventListener('input', e => filterPalette(e.target.value));
buildVarPanel();
initInteraction();
bindRuntimeUI();
bindTopBar();
bindUEModal();
bindHelp();
applyWorld();
renderNodes();
renderActor();
clearLog();
