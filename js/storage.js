// storage.js — autosave en localStorage + export/import de JSON.

import { serialize, deserialize } from './state.js';
import { download } from './util.js';

const KEY = 'bpsim.v1';
const PKEY = 'bpsim.progress';
const LKEY = 'bpsim.layout';
let timer = null;

// Guardado diferido: se llama en cada cambio, escribe tras una pausa breve.
export function markDirty(){ clearTimeout(timer); timer = setTimeout(saveLocal, 400); }

export function saveLocal(){ try { localStorage.setItem(KEY, serialize()); } catch (e) {} }

export function loadLocal(){
  try { const t = localStorage.getItem(KEY); if (!t) return false; deserialize(t); return true; }
  catch (e) { return false; }
}

export function exportFile(){ download('blueprint.json', serialize()); }

export function importFile(file, done){
  const r = new FileReader();
  r.onload  = () => { try { deserialize(String(r.result)); done?.(true); } catch (e) { done?.(false, e); } };
  r.onerror = () => done?.(false, r.error);
  r.readAsText(file);
}

/* --------- progreso de ejercicios --------- */
export function getProgress(){ try { return JSON.parse(localStorage.getItem(PKEY)) || {}; } catch (e) { return {}; } }
export function markComplete(id){ try { const p = getProgress(); p[id] = true; localStorage.setItem(PKEY, JSON.stringify(p)); } catch (e) {} }

/* --------- tamaños de paneles --------- */
export function loadLayout(){ try { return JSON.parse(localStorage.getItem(LKEY)) || {}; } catch (e) { return {}; } }
export function saveLayout(obj){ try { localStorage.setItem(LKEY, JSON.stringify(obj)); } catch (e) {} }
