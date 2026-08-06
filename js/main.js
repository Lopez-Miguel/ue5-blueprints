// main.js — punto de entrada: arma la UI y arranca todo.

import { buildGraph, linkByIndex } from './state.js';
import { T, PALETTE, CAT_COLOR, DESC } from './nodeTypes.js';
import { renderNodes, applyWorld, clearLearning } from './render.js';
import { addNode, initInteraction, fitView } from './interaction.js';
import { renderActor, clearLog, bindRuntimeUI, buildStageGrid, stop, runHeadless } from './runtime.js';
import { buildVarPanel } from './variables.js';
import { loadLocal, exportFile, importFile, markDirty, getProgress, markComplete, loadLayout, saveLayout } from './storage.js';
import { importUE } from './interop.js';
import { LESSONS } from './lessons.js';
import { ctx, resetInstrumentation } from './interpreter.js';
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

/* -------- lecciones -------- */
let currentLesson = null;

function showLesson(lesson){
  const el = $('#lesson');
  currentLesson = lesson;
  if (!lesson){ el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML = '';

  const t = document.createElement('div'); t.className = 'lt'; t.textContent = lesson.title;
  const c = document.createElement('div'); c.className = 'lc'; c.textContent = lesson.concept;
  el.append(t, c);

  if (lesson.exercise){
    const g = document.createElement('div'); g.className = 'lg';
    const b = document.createElement('b'); b.textContent = 'Objetivo: ';
    g.append('🎯 ', b, document.createTextNode(lesson.goal));
    el.appendChild(g);

    const row = document.createElement('div'); row.className = 'lesson-check';
    const btn = document.createElement('button'); btn.textContent = 'Comprobar';
    btn.onclick = checkExercise;
    const solve = document.createElement('button'); solve.className = 'solve'; solve.textContent = 'Resolver';
    solve.onclick = solveExercise;
    const reset = document.createElement('button'); reset.className = 'solve'; reset.textContent = 'Reiniciar';
    reset.title = 'Volver al estado inicial del ejercicio';
    reset.onclick = resetExercise;
    const st = document.createElement('span'); st.className = 'lesson-status'; st.id = 'lessonStatus';
    if (getProgress()[lesson.id]){ st.className = 'lesson-status ok'; st.textContent = '✓ completado'; }
    row.append(btn, solve, reset, st);
    el.appendChild(row);
  } else if (lesson.task){
    const k = document.createElement('div'); k.className = 'lk'; k.textContent = '🎯 ' + lesson.task;
    el.appendChild(k);
  }
}

function checkExercise(){
  if (!currentLesson || !currentLesson.check) return;
  const cap = runHeadless();
  let ok = false;
  try { ok = !!currentLesson.check(cap); } catch (e) { ok = false; }
  const st = $('#lessonStatus');
  if (ok){
    st.className = 'lesson-status ok'; st.textContent = '✓ ¡Correcto!';
    markComplete(currentLesson.id);
    buildLessonList();   // refrescar tildes del modal
  } else {
    st.className = 'lesson-status bad';
    st.textContent = '✗ ' + (currentLesson.hint || 'Todavía no. Revisá las conexiones.');
  }
}

// Reconstruye el ejercicio y aplica la solución (los cables que faltaban).
function solveExercise(){
  if (!currentLesson) return;
  buildGraph(currentLesson.spec);
  linkByIndex(currentLesson.solution || []);
  ctx.actor = { x:0, y:0, rot:0, scale:1 }; ctx.time = 0;
  resetInstrumentation();
  buildVarPanel();
  applyWorld();
  renderNodes();
  renderActor();
  clearLearning();
  clearLog();
  markDirty();
  const st = $('#lessonStatus');
  if (st){ st.className = 'lesson-status'; st.textContent = 'Solución aplicada — probá Comprobar o Reproducir.'; }
}

// Vuelve el ejercicio a su estado inicial (sin la solución).
function resetExercise(){
  if (currentLesson) loadLesson(currentLesson);
}

function setStageVisible(v){ document.querySelector('.side').classList.toggle('hide-stage', !v); }

function loadLesson(lesson, save = true){
  stop();
  buildGraph(lesson.spec);
  ctx.actor = { x:0, y:0, rot:0, scale:1 }; ctx.time = 0;
  resetInstrumentation();
  showLesson(lesson);
  setStageVisible(lesson.usesStage !== false);
  buildVarPanel();
  applyWorld();
  renderNodes();
  renderActor();
  clearLearning();
  clearLog();
  if (save) markDirty();
}

const LEVELS = [['basico','Básico'], ['intermedio','Intermedio'], ['avanzado','Avanzado'], ['libre','Libre']];

function buildLessonList(){
  const list = $('#lessonList');
  list.innerHTML = '';
  const prog = getProgress();
  const next = LESSONS.find(l => l.exercise && !prog[l.id]);   // próximo ejercicio pendiente
  for (const [lvl, label] of LEVELS){
    const items = LESSONS.filter(l => (l.level || 'libre') === lvl);
    if (!items.length) continue;
    const h = document.createElement('div'); h.className = 'lesson-lvl'; h.textContent = label;
    list.appendChild(h);
    for (const lesson of items){
      const card = document.createElement('button');
      card.className = 'lesson-card';
      const t = document.createElement('div'); t.className = 't'; t.textContent = lesson.title;
      if (lesson.exercise){
        const done = !!prog[lesson.id];
        const isNext = next && lesson.id === next.id;
        if (isNext) card.classList.add('next');
        const badge = document.createElement('span');
        badge.className = 'lc-badge' + (done ? ' done' : isNext ? ' next' : '');
        badge.textContent = done ? '✓ completado' : isNext ? '▶ empezá acá' : 'ejercicio';
        t.append(' ', badge);
      }
      const c = document.createElement('div'); c.className = 'c'; c.textContent = lesson.concept;
      card.append(t, c);
      card.onclick = () => { loadLesson(lesson); $('#lessonModal').hidden = true; };
      list.appendChild(card);
    }
  }
  updateProgressUI();
}

// Actualiza la insignia del botón y la barra del modal.
function updateProgressUI(){
  const prog = getProgress();
  const ex = LESSONS.filter(l => l.exercise);
  const done = ex.filter(l => prog[l.id]).length;

  const badge = $('#lessonBadge');
  if (badge){
    badge.textContent = `${done}/${ex.length}`;
    badge.classList.toggle('complete', ex.length > 0 && done === ex.length);
  }
  const bar = $('#lessonProgress');
  if (bar){
    const pct = ex.length ? Math.round(done / ex.length * 100) : 0;
    bar.innerHTML = `<div class="lp-bar"><div class="lp-fill" style="width:${pct}%"></div></div>` +
                    `<span class="lp-txt">${done} / ${ex.length} ejercicios completados</span>`;
  }
}

function bindLessons(){
  const modal = $('#lessonModal');
  buildLessonList();
  $('#lessons').onclick = () => { buildLessonList(); modal.hidden = false; };
  $('#lessonCancel').onclick = () => { modal.hidden = true; };
  modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });
}

/* -------- redimensionar los paneles laterales -------- */
function bindResizers(){
  const app = document.querySelector('.app');
  const saved = loadLayout();
  if (saved.left)  app.style.setProperty('--left-w',  saved.left  + 'px');
  if (saved.right) app.style.setProperty('--right-w', saved.right + 'px');

  const setup = (handle, varName, side, min, max) => {
    let start = null;
    handle.addEventListener('pointerdown', e => {
      e.preventDefault();
      const cur = parseFloat(getComputedStyle(app).getPropertyValue(varName)) || (side === 'left' ? 180 : 300);
      start = { x:e.clientX, w:cur };
      handle.classList.add('active');
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', e => {
      if (!start) return;
      const dx = e.clientX - start.x;
      let w = side === 'left' ? start.w + dx : start.w - dx;
      w = Math.max(min, Math.min(max, w));
      app.style.setProperty(varName, w + 'px');
    });
    const end = e => {
      if (!start) return;
      start = null;
      handle.classList.remove('active');
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
      saveLayout({
        left:  parseFloat(getComputedStyle(app).getPropertyValue('--left-w'))  || 180,
        right: parseFloat(getComputedStyle(app).getPropertyValue('--right-w')) || 300,
      });
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  setup($('#resizeL'), '--left-w',  'left',  150, 420);
  setup($('#resizeR'), '--right-w', 'right', 240, 560);
}

function bindStageToggle(){
  $('#stageHead').onclick = () => document.querySelector('.side').classList.toggle('hide-stage');
}

/* -------- barra superior -------- */
function bindTopBar(){
  $('#export').onclick = exportFile;
  $('#importBtn').onclick = () => $('#importFile').click();
  $('#importFile').onchange = (e) => {
    const f = e.target.files[0];
    if (f) importFile(f, (ok) => {
      if (ok){
        showLesson(null); setStageVisible(true);
        buildVarPanel(); applyWorld(); renderNodes(); renderActor(); markDirty();
      } else alert('No pude leer ese archivo como grafo válido.');
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
    showLesson(null); setStageVisible(true);
    buildVarPanel(); renderNodes(); fitView(); markDirty();
    const generic = res.count - res.mapped;
    let extra = '';
    if (generic > 0){
      const names = [...new Set(res.generic)].slice(0, 3).join(', ');
      extra += ` · ${generic} sólo-visualización (${names}${res.generic.length > 3 ? '…' : ''})`;
    }
    if (res.warnings.length) extra += ` · ${res.warnings.length} avisos`;
    msg.textContent = `Importados ${res.count} nodos (${res.mapped} ejecutables), ${res.wireCount} conexiones${extra}.`;
    setTimeout(close, generic > 0 ? 2400 : 1100);
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
buildPalette();
$('#palSearch').addEventListener('input', e => filterPalette(e.target.value));
initInteraction();
bindRuntimeUI();
bindTopBar();
bindUEModal();
bindHelp();
bindLessons();
bindStageToggle();
bindResizers();

if (loadLocal()){
  // Recupera el último trabajo guardado.
  showLesson(null); setStageVisible(true);
  buildVarPanel(); applyWorld(); renderNodes(); renderActor(); clearLog();
} else {
  // Primera visita: abrí la lección 1 (sin autoguardar hasta que el usuario edite).
  loadLesson(LESSONS[0], false);
}
