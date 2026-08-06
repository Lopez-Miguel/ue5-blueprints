// nodeTypes.js — el "catálogo" de nodos.
//
// Cada tipo define:
//   title, cat ('ev'|'act'|'flow'|'pure'|'var'), ic (ícono)
//   inputs / outputs : array de pines, o función(node)->array para pines dinámicos
//     pin = { name, kind:'exec'|'data', type, label, editable, default }
//   props   : editores sin pin -> { name, type, label, default }
//   pure    : eval(node, getIn, ctx) -> { salida: valor }   (se recalcula on-demand)
//   acción  : run(node, ctx, getIn, fire)                    (efecto + control de flujo)
//   readData(node, ctx, pin) : salida de dato de un nodo NO puro (eventos, For Loop…)
//   isEvent : punto de entrada     latent : nodo latente (usa el scheduler)
//   variableNode : muestra un desplegable para elegir la variable

import { num, clamp, sampleCurve, coerce } from './util.js';
import { getVar } from './state.js';

const vtype = n => { const v = getVar(n.props.varId); return v ? v.type : 'float'; };
const vname = n => { const v = getVar(n.props.varId); return v ? v.name : '(sin variable)'; };

export const T = {
  /* ---------------- eventos ---------------- */
  event_begin:{ title:'Event BeginPlay', cat:'ev', ic:'▸', isEvent:true,
    inputs:[], outputs:[{ name:'then', kind:'exec', label:'' }] },

  event_tick:{ title:'Event Tick', cat:'ev', ic:'↻', isEvent:true,
    inputs:[],
    outputs:[{ name:'then', kind:'exec', label:'' },
             { name:'dt', kind:'data', type:'float', label:'Delta Seconds' }],
    readData:(n, ctx, pin) => pin === 'dt' ? ctx.dt : 0 },

  /* ---------------- acciones ---------------- */
  print_string:{ title:'Print String', cat:'act', ic:'≡',
    inputs:[{ name:'exec', kind:'exec' },
            { name:'in', kind:'data', type:'string', label:'In String', editable:true, default:'Hola' }],
    outputs:[{ name:'then', kind:'exec' }],
    run:(n, ctx, gi, fire) => { ctx.log(gi('in')); fire('then'); } },

  add_rotation:{ title:'Add Actor Rotation', cat:'act', ic:'⟳',
    inputs:[{ name:'exec', kind:'exec' },
            { name:'deg', kind:'data', type:'float', label:'Delta Degrees', editable:true, default:0 }],
    outputs:[{ name:'then', kind:'exec' }],
    run:(n, ctx, gi, fire) => { ctx.actor.rot += gi('deg'); fire('then'); } },

  set_rotation:{ title:'Set Actor Rotation', cat:'act', ic:'⟳',
    inputs:[{ name:'exec', kind:'exec' },
            { name:'deg', kind:'data', type:'float', label:'Degrees', editable:true, default:0 }],
    outputs:[{ name:'then', kind:'exec' }],
    run:(n, ctx, gi, fire) => { ctx.actor.rot = gi('deg'); fire('then'); } },

  set_location:{ title:'Set Actor Location', cat:'act', ic:'✛',
    inputs:[{ name:'exec', kind:'exec' },
            { name:'x', kind:'data', type:'float', label:'X', editable:true, default:0 },
            { name:'y', kind:'data', type:'float', label:'Y', editable:true, default:0 }],
    outputs:[{ name:'then', kind:'exec' }],
    run:(n, ctx, gi, fire) => { ctx.actor.x = gi('x'); ctx.actor.y = gi('y'); fire('then'); } },

  add_offset:{ title:'Add Location Offset', cat:'act', ic:'✛',
    inputs:[{ name:'exec', kind:'exec' },
            { name:'dx', kind:'data', type:'float', label:'Delta X', editable:true, default:0 },
            { name:'dy', kind:'data', type:'float', label:'Delta Y', editable:true, default:0 }],
    outputs:[{ name:'then', kind:'exec' }],
    run:(n, ctx, gi, fire) => { ctx.actor.x += gi('dx'); ctx.actor.y += gi('dy'); fire('then'); } },

  set_scale:{ title:'Set Actor Scale', cat:'act', ic:'⤢',
    inputs:[{ name:'exec', kind:'exec' },
            { name:'s', kind:'data', type:'float', label:'Scale', editable:true, default:1 }],
    outputs:[{ name:'then', kind:'exec' }],
    run:(n, ctx, gi, fire) => { ctx.actor.scale = gi('s'); fire('then'); } },

  /* ---------------- flujo ---------------- */
  branch:{ title:'Branch', cat:'flow', ic:'⑂',
    inputs:[{ name:'exec', kind:'exec' },
            { name:'cond', kind:'data', type:'bool', label:'Condition', editable:true, default:false }],
    outputs:[{ name:'true', kind:'exec', label:'True' },
             { name:'false', kind:'exec', label:'False' }],
    run:(n, ctx, gi, fire) => fire(gi('cond') ? 'true' : 'false') },

  sequence:{ title:'Sequence', cat:'flow', ic:'⇉',
    inputs:[{ name:'exec', kind:'exec' }],
    outputs:[{ name:'t0', kind:'exec', label:'Then 0' },
             { name:'t1', kind:'exec', label:'Then 1' }],
    run:(n, ctx, gi, fire) => { fire('t0'); fire('t1'); } },

  forloop:{ title:'For Loop', cat:'flow', ic:'↺',
    inputs:[{ name:'exec', kind:'exec' },
            { name:'first', kind:'data', type:'int', label:'First Index', editable:true, default:0 },
            { name:'last',  kind:'data', type:'int', label:'Last Index',  editable:true, default:3 }],
    outputs:[{ name:'body',  kind:'exec', label:'Loop Body' },
             { name:'index', kind:'data', type:'int', label:'Index' },
             { name:'done',  kind:'exec', label:'Completed' }],
    run:(n, ctx, gi, fire) => {
      const a = gi('first'), b = gi('last');
      for (let i = a; i <= b; i++){ n._index = i; fire('body'); if (ctx.overBudget()) break; }
      fire('done');
    },
    readData:(n, ctx, pin) => pin === 'index' ? (n._index || 0) : 0 },

  delay:{ title:'Delay', cat:'flow', ic:'⏲', latent:true,
    inputs:[{ name:'exec', kind:'exec' },
            { name:'dur', kind:'data', type:'float', label:'Duration', editable:true, default:1 }],
    outputs:[{ name:'completed', kind:'exec', label:'Completed' }],
    // Programa el disparo diferido; 'completed' lo lanza el scheduler.
    run:(n, ctx, gi) => { ctx.schedule(n.id, gi('dur')); } },

  timeline:{ title:'Timeline', cat:'flow', ic:'⟋', timelineNode:true,
    inputs:[{ name:'play', kind:'exec', label:'Play' },
            { name:'stop', kind:'exec', label:'Stop' }],
    outputs:[{ name:'update',   kind:'exec', label:'Update' },
             { name:'finished', kind:'exec', label:'Finished' },
             { name:'value', kind:'data', type:'float', label:'Value' },
             { name:'alpha', kind:'data', type:'float', label:'Alpha' }],
    props:[{ name:'length', type:'float', label:'Length', default:2 },
           { name:'loop',   type:'bool',  label:'Loop',   default:false }],
    // Play = reproducir desde el inicio; Stop = pausar. El avance por frame y
    // los disparos de Update/Finished los maneja stepTimelines() en el intérprete.
    run:(n, ctx, gi, fire, inPin) => {
      if (inPin === 'stop'){
        const s = ctx.timelines.get(n.id);
        if (s) s.playing = false;
      } else {
        ctx.timelines.set(n.id, { t:0, playing:true });
      }
    },
    readData:(n, ctx, pin) => {
      const s = ctx.timelines.get(n.id);
      const len = Math.max(0.0001, num(n.props.length));
      const a = s ? clamp(s.t / len, 0, 1) : 0;
      return pin === 'alpha' ? a : sampleCurve(n.props.curve, a);
    } },

  /* ---------------- variables ---------------- */
  var_get:{ title:'Get', cat:'var', ic:'◧', variableNode:true,
    inputs:[],
    outputs:(n) => [{ name:'value', kind:'data', type:vtype(n), label:vname(n) }],
    eval:(n, gi, ctx) => ({ value: ctx.vars[n.props.varId] }) },

  var_set:{ title:'Set', cat:'var', ic:'◨', variableNode:true,
    inputs:(n) => [{ name:'exec', kind:'exec' },
                   { name:'value', kind:'data', type:vtype(n), label:vname(n), editable:true, default:0 }],
    outputs:[{ name:'then', kind:'exec' }],
    run:(n, ctx, gi, fire) => { ctx.vars[n.props.varId] = gi('value'); fire('then'); } },

  /* ---------------- puros ---------------- */
  lit_float:{ title:'Float', cat:'pure', ic:'#',
    inputs:[], outputs:[{ name:'val', kind:'data', type:'float', label:'' }],
    props:[{ name:'value', type:'float', label:'', default:0 }],
    eval:(n) => ({ val: num(n.props.value) }) },

  math_add:{ title:'Add  +', cat:'pure', ic:'+',
    inputs:[{ name:'a', kind:'data', type:'float', label:'A', editable:true, default:0 },
            { name:'b', kind:'data', type:'float', label:'B', editable:true, default:0 }],
    outputs:[{ name:'res', kind:'data', type:'float', label:'' }],
    eval:(n, gi) => ({ res: gi('a') + gi('b') }) },

  math_mul:{ title:'Multiply  ×', cat:'pure', ic:'×',
    inputs:[{ name:'a', kind:'data', type:'float', label:'A', editable:true, default:1 },
            { name:'b', kind:'data', type:'float', label:'B', editable:true, default:1 }],
    outputs:[{ name:'res', kind:'data', type:'float', label:'' }],
    eval:(n, gi) => ({ res: gi('a') * gi('b') }) },

  cmp_gt:{ title:'Greater  >', cat:'pure', ic:'>',
    inputs:[{ name:'a', kind:'data', type:'float', label:'A', editable:true, default:0 },
            { name:'b', kind:'data', type:'float', label:'B', editable:true, default:0 }],
    outputs:[{ name:'res', kind:'data', type:'bool', label:'' }],
    eval:(n, gi) => ({ res: gi('a') > gi('b') }) },

  cmp_lt:{ title:'Less  <', cat:'pure', ic:'<',
    inputs:[{ name:'a', kind:'data', type:'float', label:'A', editable:true, default:0 },
            { name:'b', kind:'data', type:'float', label:'B', editable:true, default:0 }],
    outputs:[{ name:'res', kind:'data', type:'bool', label:'' }],
    eval:(n, gi) => ({ res: gi('a') < gi('b') }) },

  cmp_eq:{ title:'Equal  =', cat:'pure', ic:'=',
    inputs:[{ name:'a', kind:'data', type:'float', label:'A', editable:true, default:0 },
            { name:'b', kind:'data', type:'float', label:'B', editable:true, default:0 }],
    outputs:[{ name:'res', kind:'data', type:'bool', label:'' }],
    eval:(n, gi) => ({ res: gi('a') === gi('b') }) },

  math_sub:{ title:'Subtract  −', cat:'pure', ic:'−',
    inputs:[{ name:'a', kind:'data', type:'float', label:'A', editable:true, default:0 },
            { name:'b', kind:'data', type:'float', label:'B', editable:true, default:0 }],
    outputs:[{ name:'res', kind:'data', type:'float', label:'' }],
    eval:(n, gi) => ({ res: gi('a') - gi('b') }) },

  math_div:{ title:'Divide  ÷', cat:'pure', ic:'÷',
    inputs:[{ name:'a', kind:'data', type:'float', label:'A', editable:true, default:0 },
            { name:'b', kind:'data', type:'float', label:'B', editable:true, default:1 }],
    outputs:[{ name:'res', kind:'data', type:'float', label:'' }],
    eval:(n, gi) => { const b = gi('b'); return { res: b === 0 ? 0 : gi('a') / b }; } },

  lit_bool:{ title:'Bool', cat:'pure', ic:'✓',
    inputs:[], outputs:[{ name:'val', kind:'data', type:'bool', label:'' }],
    props:[{ name:'value', type:'bool', label:'', default:false }],
    eval:(n) => ({ val: coerce(n.props.value, 'bool') }) },

  lit_string:{ title:'String', cat:'pure', ic:'"',
    inputs:[], outputs:[{ name:'val', kind:'data', type:'string', label:'' }],
    props:[{ name:'value', type:'string', label:'', default:'' }],
    eval:(n) => ({ val: n.props.value == null ? '' : String(n.props.value) }) },

  math_sin:{ title:'Sin (deg)', cat:'pure', ic:'∿',
    inputs:[{ name:'x', kind:'data', type:'float', label:'Degrees', editable:true, default:0 }],
    outputs:[{ name:'res', kind:'data', type:'float', label:'' }],
    eval:(n, gi) => ({ res: Math.sin(gi('x') * Math.PI / 180) }) },

  get_time:{ title:'Get Time', cat:'pure', ic:'⏱',
    inputs:[], outputs:[{ name:'t', kind:'data', type:'float', label:'Seconds' }],
    eval:(n, gi, ctx) => ({ t: ctx.time }) },

  get_location:{ title:'Get Actor Location', cat:'pure', ic:'✛',
    inputs:[],
    outputs:[{ name:'x', kind:'data', type:'float', label:'X' },
             { name:'y', kind:'data', type:'float', label:'Y' }],
    eval:(n, gi, ctx) => ({ x: ctx.actor.x, y: ctx.actor.y }) },

  get_rotation:{ title:'Get Actor Rotation', cat:'pure', ic:'⟳',
    inputs:[], outputs:[{ name:'deg', kind:'data', type:'float', label:'Degrees' }],
    eval:(n, gi, ctx) => ({ deg: ctx.actor.rot }) },

  /* ---------------- conversiones (autocast) ----------------
     No están en la paleta: se insertan solos al conectar tipos distintos.
     El tipo de su pin de entrada sale de props.from.                        */
  to_string:{ title:'To String', cat:'pure', ic:'→',
    inputs:(n) => [{ name:'in', kind:'data', type:n.props.from || 'float', label:'' }],
    outputs:[{ name:'out', kind:'data', type:'string', label:'' }],
    eval:(n, gi) => ({ out: String(gi('in')) }) },

  to_float:{ title:'To Float', cat:'pure', ic:'→',
    inputs:(n) => [{ name:'in', kind:'data', type:n.props.from || 'int', label:'' }],
    outputs:[{ name:'out', kind:'data', type:'float', label:'' }],
    eval:(n, gi) => ({ out: num(gi('in')) }) },

  to_int:{ title:'To Int', cat:'pure', ic:'→',
    inputs:(n) => [{ name:'in', kind:'data', type:n.props.from || 'float', label:'' }],
    outputs:[{ name:'out', kind:'data', type:'int', label:'' }],
    eval:(n, gi) => ({ out: Math.trunc(num(gi('in'))) }) },

  // Nodo genérico para grafos importados desde Unreal (sólo visualización).
  // Sus pines salen de props.pins; el título y el color, de props.title/props.cat.
  ue_node:{ title:'UE Node', cat:'act', ic:'⬚', imported:true,
    inputs:(n)  => (n.props.pins || []).filter(p => p.dir === 'in')
                     .map(p => ({ name:p.name, kind:p.kind, type:p.type, label:p.label })),
    outputs:(n) => (n.props.pins || []).filter(p => p.dir === 'out')
                     .map(p => ({ name:p.name, kind:p.kind, type:p.type, label:p.label })) },
};

export const PALETTE = [
  ['Eventos',  ['event_begin', 'event_tick']],
  ['Acciones', ['print_string', 'add_rotation', 'set_rotation', 'set_location', 'add_offset', 'set_scale']],
  ['Flujo',    ['branch', 'sequence', 'forloop', 'delay', 'timeline']],
  ['Variables',['var_get', 'var_set']],
  ['Puros',    ['lit_float', 'lit_bool', 'lit_string', 'math_add', 'math_sub', 'math_mul', 'math_div', 'cmp_gt', 'cmp_lt', 'cmp_eq', 'math_sin', 'get_time', 'get_location', 'get_rotation']],
];

export const CAT_COLOR = { ev:'#8a2b2f', act:'#255a8c', flow:'#4b4470', pure:'#33472f', var:'#6e5426' };

// Autocast: al conectar un pin de dato a otro de tipo distinto, si hay entrada acá
// se inserta el nodo de conversión correspondiente entre ambos.
export const CONV = {
  float: { string:'to_string', int:'to_int' },
  int:   { string:'to_string', float:'to_float' },
  bool:  { string:'to_string' },
};

// Descripciones breves para el tooltip de cada nodo (material de estudio).
export const DESC = {
  event_begin:  'Se dispara una vez, al iniciar la simulación.',
  event_tick:   'Se dispara cada frame. Delta Seconds = tiempo desde el frame anterior.',
  print_string: 'Escribe un texto en la consola.',
  add_rotation: 'Suma grados a la rotación del Actor.',
  set_rotation: 'Fija la rotación del Actor (en grados).',
  set_location: 'Fija la posición (X, Y) del Actor.',
  add_offset:   'Desplaza al Actor sumando a su posición.',
  set_scale:    'Fija la escala del Actor.',
  branch:       'If/else: sigue por True o por False según la condición.',
  sequence:     'Ejecuta sus salidas en orden: primero Then 0, después Then 1.',
  forloop:      'Repite Loop Body de First a Last; Index es el número de vuelta.',
  delay:        'Espera Duration segundos y sigue por Completed (nodo latente).',
  timeline:     'Reproduce una curva en el tiempo. Value = la curva; Alpha = 0→1.',
  var_get:      'Lee el valor de una variable.',
  var_set:      'Escribe un valor en una variable.',
  lit_float:    'Un número constante (dato float).',
  lit_bool:     'Un valor booleano constante (verdadero/falso).',
  lit_string:   'Un texto constante.',
  math_add:     'Suma dos números (nodo puro, sin efectos).',
  math_sub:     'Resta B a A (nodo puro).',
  math_mul:     'Multiplica dos números (nodo puro).',
  math_div:     'Divide A por B (nodo puro; si B es 0 devuelve 0).',
  cmp_gt:       'Devuelve verdadero si A es mayor que B (nodo puro).',
  cmp_lt:       'Devuelve verdadero si A es menor que B (nodo puro).',
  cmp_eq:       'Devuelve verdadero si A es igual a B (nodo puro).',
  math_sin:     'Seno del ángulo en grados (nodo puro).',
  get_time:     'Segundos transcurridos desde que arrancó la simulación.',
  get_location: 'Posición actual (X, Y) del Actor.',
  get_rotation: 'Rotación actual del Actor, en grados.',
  ue_node:      'Nodo importado de Unreal (sólo visualización; no se ejecuta).',
  to_string:    'Convierte un valor a texto. Se inserta solo al conectar tipos distintos.',
  to_float:     'Convierte un valor a número decimal.',
  to_int:       'Convierte un valor a entero (trunca los decimales).',
};
