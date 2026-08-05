// main.js — punto de entrada: arma la UI y arranca todo.

import { G, defaultGraph } from './state.js';
import { T, PALETTE, CAT_COLOR } from './nodeTypes.js';
import { renderNodes, applyWorld } from './render.js';
import { addNode, initInteraction } from './interaction.js';
import { renderActor, clearLog, bindRuntimeUI, buildStageGrid } from './runtime.js';
import { buildVarPanel } from './variables.js';
import { loadLocal, exportFile, importFile, markDirty } from './storage.js';
import { importUE } from './interop.js';
import { $ } from './util.js';

/* -------- paleta de nodos -------- */
function buildPalette(){
  const host = $('#paletteNodes');
  host.innerHTML = '';
  for (const [group, types] of PALETTE){
    const g = document.createElement('div');
    g.className = 'pal-group';
    g.innerHTML = `<div class="pal-title">${group}</div>`;
    for (const ty of types){
      const b = document.createElement('button');
      b.className = 'pal-item';
      b.style.setProperty('--tag', CAT_COLOR[T[ty].cat]);
      b.innerHTML = `<span class="k">${T[ty].ic || ''}</span> ${T[ty].title}`;
      b.onclick = () => addNode(ty);
      g.appendChild(b);
    }
    host.appendChild(g);
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
