// lessons.js — lecciones cargables (datos declarativos).
//
// Cada lección: { id, title, level, concept, task, usesStage, spec, exercise?, goal?, hint?, check?, solution? }
//   level: 'basico' | 'intermedio' | 'avanzado' | 'libre'
//   spec  lo consume state.buildGraph (nodos por índice + enlaces).
//   Ejercicios: goal (objetivo), check(cap)->bool, hint (pista), solution (enlaces que lo resuelven).
//   cap = { log:[], actor:{x,y,rot,scale}, vars:{Nombre:valor}, time } (de runtime.runHeadless).

export const LESSONS = [
  /* ---------------- BÁSICO ---------------- */
  {
    id:'eventos', level:'basico',
    title:'Eventos y ejecución',
    concept:'Los pines blancos son de ejecución: definen el ORDEN en que corren los nodos. ' +
            'BeginPlay se dispara una vez al iniciar; Tick, una vez por frame.',
    task:'Usá BeginPlay ▷ para ver el disparo único. Después Reproducir: el mensaje de Tick se repite cada frame.',
    usesStage:false,
    spec:{
      nodes:[
        { k:'event_begin',  x:40,  y:60 },
        { k:'print_string', x:300, y:60,  props:{ in:'¡Arrancó! (BeginPlay, una vez)' } },
        { k:'event_tick',   x:40,  y:260 },
        { k:'print_string', x:300, y:260, props:{ in:'Un frame (Tick, cada frame)' } },
      ],
      links:[ [0,'then',1,'exec'], [2,'then',3,'exec'] ],
    },
  },
  {
    id:'datos', level:'basico',
    title:'Datos y nodos puros',
    concept:'Los pines de color son datos, con tipo. Se calculan "tirando" desde el destino. ' +
            'Los nodos puros (verdes) no tienen efectos: sólo devuelven un valor.',
    task:'Reproducí y mirá el valor en las salidas (watch values). Cambiá los números y volvé a reproducir.',
    usesStage:false,
    spec:{
      nodes:[
        { k:'lit_float', x:40,  y:90,  props:{ value:6 } },
        { k:'lit_float', x:40,  y:250, props:{ value:7 } },
        { k:'math_mul',  x:340, y:90 },
        { k:'math_add',  x:340, y:250 },
      ],
      links:[ [0,'val',2,'a'], [1,'val',2,'b'], [0,'val',3,'a'], [1,'val',3,'b'] ],
    },
  },
  {
    id:'ex-hola', level:'basico', exercise:true, usesStage:false,
    title:'Ejercicio · Tu primer Blueprint',
    concept:'Conectá los dos nodos para que el programa salude al iniciar.',
    goal:'Que se imprima algo en la consola al iniciar (conectá BeginPlay con Print String).',
    hint:'Arrastrá desde el pin de ejecución (triángulo blanco) de BeginPlay hasta el de Print String.',
    spec:{
      nodes:[
        { k:'event_begin',  x:60,  y:90 },
        { k:'print_string', x:340, y:90, props:{ in:'¡Hola desde mi Blueprint!' } },
      ],
      links:[],
    },
    solution:[ [0,'then',1,'exec'] ],
    check:(cap) => cap.log.some(l => l.trim().length > 0),
  },

  /* ---------------- INTERMEDIO ---------------- */
  {
    id:'variables', level:'intermedio',
    title:'Variables',
    concept:'Las variables guardan estado. El nodo Get lee su valor y Set lo escribe. ' +
            'Acá una variable Speed controla cuánto gira el Actor por segundo.',
    task:'Reproducí: gira a Speed grados/seg. Cambiá el valor por defecto de Speed en el panel de variables.',
    usesStage:true,
    spec:{
      vars:[ { name:'Speed', type:'float', def:90 } ],
      nodes:[
        { k:'event_tick',  x:20,  y:40 },
        { k:'var_get',     x:30,  y:210, var:'Speed' },
        { k:'math_mul',    x:320, y:70 },
        { k:'add_rotation',x:580, y:40 },
      ],
      links:[ [0,'dt',2,'a'], [1,'value',2,'b'], [2,'res',3,'deg'], [0,'then',3,'exec'] ],
    },
  },
  {
    id:'branch', level:'intermedio',
    title:'Branch (decisiones)',
    concept:'Branch elige el camino según una condición booleana: sigue por True o por False. ' +
            'La condición viene de un nodo de comparación (Greater).',
    task:'Usá BeginPlay ▷. Cambiá los números (5 y 3) para invertir la condición: el flujo pasará por False.',
    usesStage:false,
    spec:{
      nodes:[
        { k:'event_begin',  x:20,  y:70 },
        { k:'lit_float',    x:20,  y:250, props:{ value:5 } },
        { k:'lit_float',    x:20,  y:360, props:{ value:3 } },
        { k:'cmp_gt',       x:300, y:270 },
        { k:'branch',       x:320, y:70 },
        { k:'print_string', x:600, y:40,  props:{ in:'La condición es verdadera ✓' } },
        { k:'print_string', x:600, y:170, props:{ in:'La condición es falsa ✗' } },
      ],
      links:[
        [0,'then',4,'exec'],
        [1,'val',3,'a'], [2,'val',3,'b'],
        [3,'res',4,'cond'],
        [4,'true',5,'exec'], [4,'false',6,'exec'],
      ],
    },
  },
  {
    id:'forloop', level:'intermedio',
    title:'For Loop',
    concept:'For Loop ejecuta su cuerpo (Loop Body) una vez por cada índice, de First a Last. ' +
            'Index indica la vuelta actual. Corre de forma sincrónica: termina antes de seguir.',
    task:'Usá BeginPlay ▷: el cuerpo corre 5 veces moviendo al Actor. Mirá las 5 entradas en la Traza y el Index.',
    usesStage:true,
    spec:{
      nodes:[
        { k:'event_begin', x:20,  y:70 },
        { k:'forloop',     x:300, y:60,  props:{ first:0, last:4 } },
        { k:'add_offset',  x:600, y:40,  props:{ dx:22, dy:0 } },
      ],
      links:[ [0,'then',1,'exec'], [1,'body',2,'exec'] ],
    },
  },
  {
    id:'sequence', level:'intermedio',
    title:'Sequence (orden)',
    concept:'Sequence ejecuta sus salidas en orden: Then 0 se completa entero antes de empezar Then 1. ' +
            'Sirve para encadenar varios pasos desde un mismo disparo.',
    task:'Usá BeginPlay ▷ y mirá la consola: primero "Paso A", después "Paso B".',
    usesStage:false,
    spec:{
      nodes:[
        { k:'event_begin',  x:40,  y:90 },
        { k:'sequence',     x:290, y:90 },
        { k:'print_string', x:560, y:40,  props:{ in:'Paso A (Then 0)' } },
        { k:'print_string', x:560, y:170, props:{ in:'Paso B (Then 1)' } },
      ],
      links:[ [0,'then',1,'exec'], [1,'t0',2,'exec'], [1,'t1',3,'exec'] ],
    },
  },
  {
    id:'ex-branch', level:'intermedio', exercise:true, usesStage:false,
    title:'Ejercicio · Decisión con Branch',
    concept:'Los números ya están conectados a Greater. Completá el flujo.',
    goal:'Que imprima "mayor" (A=8 es mayor que B=3). Cableá BeginPlay→Branch, Greater→Condition y la salida True al Print correcto.',
    hint:'La salida de Greater va a "Condition" del Branch; la salida True del Branch, al Print que dice "mayor".',
    spec:{
      nodes:[
        { k:'event_begin',  x:40,  y:60 },
        { k:'lit_float',    x:40,  y:250, props:{ value:8 } },
        { k:'lit_float',    x:40,  y:360, props:{ value:3 } },
        { k:'cmp_gt',       x:300, y:270 },
        { k:'branch',       x:320, y:60 },
        { k:'print_string', x:620, y:40,  props:{ in:'mayor' } },
        { k:'print_string', x:620, y:170, props:{ in:'menor o igual' } },
      ],
      links:[ [1,'val',3,'a'], [2,'val',3,'b'] ],
    },
    solution:[ [0,'then',4,'exec'], [3,'res',4,'cond'], [4,'true',5,'exec'] ],
    check:(cap) => cap.log.some(l => l.toLowerCase().includes('mayor')),
  },
  {
    id:'ex-contador', level:'intermedio', exercise:true, usesStage:false,
    title:'Ejercicio · Contador con variable',
    concept:'Combiná Get, Add y Set para acumular estado en una variable.',
    goal:'Hacé que la variable Contador aumente de a 1 en cada Tick (Get Contador → Add 1 → Set Contador).',
    hint:'Conectá Get Contador y el Float(1) al Add; el resultado al valor de Set Contador; y el Tick al pin de ejecución de Set.',
    spec:{
      vars:[ { name:'Contador', type:'float', def:0 } ],
      nodes:[
        { k:'event_tick', x:20,  y:40 },
        { k:'var_get',    x:20,  y:220, var:'Contador' },
        { k:'lit_float',  x:20,  y:350, props:{ value:1 } },
        { k:'math_add',   x:300, y:240 },
        { k:'var_set',    x:330, y:50,  var:'Contador' },
      ],
      links:[],
    },
    solution:[ [1,'value',3,'a'], [2,'val',3,'b'], [3,'res',4,'value'], [0,'then',4,'exec'] ],
    check:(cap) => cap.vars.Contador >= 60,
  },

  /* ---------------- AVANZADO ---------------- */
  {
    id:'delay', level:'avanzado',
    title:'Delay (nodos latentes)',
    concept:'Un nodo latente no bloquea: Delay espera Duration segundos y recién ahí continúa por Completed. ' +
            'Necesita que el tiempo avance, así que se estudia con Reproducir.',
    task:'Reproducí y mirá la consola: "Inicio" sale enseguida y el segundo mensaje 1.5 s después.',
    usesStage:false,
    spec:{
      nodes:[
        { k:'event_begin',  x:20,  y:70 },
        { k:'print_string', x:250, y:70, props:{ in:'Inicio (t=0)' } },
        { k:'delay',        x:500, y:70, props:{ dur:1.5 } },
        { k:'print_string', x:730, y:70, props:{ in:'¡1.5 s después!' } },
      ],
      links:[ [0,'then',1,'exec'], [1,'then',2,'exec'], [2,'completed',3,'exec'] ],
    },
  },
  {
    id:'timeline', level:'avanzado',
    title:'Timeline (curvas en el tiempo)',
    concept:'Un Timeline reproduce una curva en el tiempo. Su Update se dispara cada frame y su Value da la ' +
            'altura de la curva. Acá ese valor mueve al Actor en X.',
    task:'Reproducí: el Actor se desliza siguiendo la curva. Editá la curva (clic para agregar puntos) y volvé a reproducir.',
    usesStage:true,
    spec:{
      nodes:[
        { k:'event_begin',  x:20,  y:60 },
        { k:'timeline',     x:230, y:60,  props:{ length:2, loop:true } },
        { k:'lit_float',    x:250, y:430, props:{ value:200 } },
        { k:'math_mul',     x:560, y:330 },
        { k:'set_location', x:770, y:60 },
      ],
      links:[
        [0,'then',1,'play'],
        [1,'update',4,'exec'],
        [1,'value',3,'a'], [2,'val',3,'b'],
        [3,'res',4,'x'],
      ],
    },
  },
  {
    id:'ex-rot', level:'avanzado', exercise:true, usesStage:true,
    title:'Ejercicio · Girar a 45°/s',
    concept:'Usá Delta Seconds para que la velocidad no dependa de los FPS.',
    goal:'Que el Actor gire a 45 grados por segundo. Pista: Delta Seconds × 45 → Add Actor Rotation (conectá también el pin de ejecución).',
    hint:'Si gira demasiado rápido, te falta multiplicar por Delta Seconds. Si no gira, revisá el pin de ejecución (blanco).',
    spec:{
      nodes:[
        { k:'event_tick',   x:20,  y:40 },
        { k:'lit_float',    x:40,  y:250, props:{ value:45 } },
        { k:'math_mul',     x:320, y:80 },
        { k:'add_rotation', x:580, y:40 },
      ],
      links:[],
    },
    solution:[ [0,'dt',2,'a'], [1,'val',2,'b'], [2,'res',3,'deg'], [0,'then',3,'exec'] ],
    check:(cap) => cap.time > 0.5 && Math.abs(cap.actor.rot - 45 * cap.time) < 5,
  },

  /* ---------------- LIBRE ---------------- */
  {
    id:'blank', level:'libre',
    title:'Lienzo en blanco',
    concept:'Un grafo vacío para experimentar libremente.',
    task:'Abrí una categoría en la paleta de la izquierda y agregá nodos.',
    usesStage:true,
    spec:{ nodes:[], links:[] },
  },
];
