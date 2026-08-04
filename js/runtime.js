// runtime.js — bucle de simulación, escenario (Actor) y consola.

import { ctx, fireEvent, stepScheduler, resetScheduler, initVars } from './interpreter.js';
import { updateWires } from './render.js';
import { $ } from './util.js';

let playing = false, raf = null, last = 0;
export const isPlaying = () => playing;

const playBtn = $('#play'), playTxt = $('#playtxt');
const actorG  = $('#actor'), readout = $('#readout'), consoleEl = $('#console');

ctx.log = pushLog;   // conectar la consola al intérprete

function setBtn(){
  playBtn.classList.toggle('on', playing);
  const icon = playBtn.querySelector('.tri, .sq');
  if (icon) icon.className = playing ? 'sq' : 'tri';
  playTxt.textContent = playing ? 'Detener' : 'Reproducir';
}

export function play(){
  initVars();
  resetScheduler();
  ctx.actor = { x:0, y:0, rot:0, scale:1 };
  ctx.time = 0; ctx.dt = 0;
  playing = true; setBtn(); updateWires(); renderActor();
  fireEvent('event_begin');
  last = performance.now();
  raf = requestAnimationFrame(loop);
}

export function stop(){
  playing = false;
  cancelAnimationFrame(raf);
  setBtn(); updateWires();
}

function loop(t){
  if (!playing) return;
  const dt = Math.min(0.05, (t - last) / 1000);  // acota el salto tras pausas
  last = t;
  ctx.time += dt; ctx.dt = dt;
  stepScheduler(dt);
  fireEvent('event_tick');
  renderActor();
  raf = requestAnimationFrame(loop);
}

export function renderActor(){
  const a = ctx.actor;
  actorG.setAttribute('transform', `translate(${a.x} ${-a.y}) rotate(${a.rot}) scale(${a.scale})`);
  readout.innerHTML =
    `x <b>${a.x.toFixed(1)}</b>  y <b>${a.y.toFixed(1)}</b><br>` +
    `rot <b>${(a.rot % 360).toFixed(1)}°</b>  scale <b>${a.scale.toFixed(2)}</b><br>` +
    `t <b>${ctx.time.toFixed(2)}s</b>`;
}

/* -------- consola -------- */
export function pushLog(m){
  const empty = consoleEl.querySelector('.empty');
  if (empty) empty.remove();
  const d = document.createElement('div');
  d.className = 'logline';
  d.innerHTML = `<span class="t">+${ctx.time.toFixed(2)}</span><span class="m"></span>`;
  d.querySelector('.m').textContent = String(m);
  consoleEl.appendChild(d);
  while (consoleEl.children.length > 200) consoleEl.removeChild(consoleEl.firstChild);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}
export function clearLog(){
  consoleEl.innerHTML = '<div class="empty">Sin salida todavía. Apretá Reproducir.</div>';
}

// Grilla del escenario (una sola vez).
export function buildStageGrid(){
  const g = $('#grid');
  let s = '';
  for (let i = -160; i <= 160; i += 40){
    s += `<line x1="${i}" y1="-160" x2="${i}" y2="160" stroke="#ffffff08"/>`;
    s += `<line x1="-160" y1="${i}" x2="160" y2="${i}" stroke="#ffffff08"/>`;
  }
  g.innerHTML = s;
}

// Cablea los botones que maneja el runtime.
export function bindRuntimeUI(onReset){
  playBtn.onclick = () => (playing ? stop() : play());
  $('#reset').onclick = () => {
    stop();
    ctx.actor = { x:0, y:0, rot:0, scale:1 };
    renderActor(); clearLog();
    onReset?.();
  };
  $('#clearlog').onclick = clearLog;
}
