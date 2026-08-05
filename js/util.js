// util.js — utilidades puras, sin dependencias de otros módulos.

export const num = v => { const n = +v; return Number.isFinite(n) ? n : 0; };
export const uid = (p = 'n') => p + Math.random().toString(36).slice(2, 8);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Colores por tipo de pin (referencian variables CSS del tema).
export const PC = {
  exec:'var(--exec)', float:'var(--float)', int:'var(--int)',
  bool:'var(--bool)', string:'var(--string)', object:'var(--object)'
};

// Convierte un valor crudo (de un editor o cable) al tipo del pin destino.
export function coerce(v, type){
  if (type === 'float')  return num(v);
  if (type === 'int')    return Math.trunc(num(v));
  if (type === 'bool')   return v === true || v === 'true' || v === 1 || v === '1';
  if (type === 'string') return v == null ? '' : String(v);
  return v;
}

export const $  = sel => document.querySelector(sel);
export const $$ = sel => [...document.querySelectorAll(sel)];

// Dispara la descarga de un archivo de texto desde el navegador.
export function download(filename, text){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type:'application/json' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Muestrea una curva (array de puntos {t, v} con t en 0..1) en la posición x (0..1),
// interpolando linealmente entre puntos y fijando los extremos.
export function sampleCurve(points, x){
  if (!points || !points.length) return x;
  const pts = [...points].sort((a, b) => a.t - b.t);
  if (x <= pts[0].t) return pts[0].v;
  const lastP = pts[pts.length - 1];
  if (x >= lastP.t) return lastP.v;
  for (let i = 0; i < pts.length - 1; i++){
    const a = pts[i], b = pts[i + 1];
    if (x >= a.t && x <= b.t){
      const span = (b.t - a.t) || 1;
      return a.v + (b.v - a.v) * ((x - a.t) / span);
    }
  }
  return lastP.v;
}
