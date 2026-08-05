// lessons.js — lecciones cargables (datos declarativos).
//
// Cada lección: { id, title, concept, task, usesStage, spec }
//   spec lo consume state.buildGraph (nodos por índice + enlaces).
//   usesStage:true  -> se muestra el escenario 2D (lecciones de movimiento).
//   usesStage:false -> el foco está en consola / traza / watch values.

export const LESSONS = [
  {
    id:'eventos',
    title:'1 · Eventos y ejecución',
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
    id:'datos',
    title:'2 · Datos y nodos puros',
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
    id:'variables',
    title:'3 · Variables',
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
    id:'branch',
    title:'4 · Branch (decisiones)',
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
    id:'forloop',
    title:'5 · For Loop',
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
    id:'delay',
    title:'6 · Delay (nodos latentes)',
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
    id:'blank',
    title:'Lienzo en blanco',
    concept:'Un grafo vacío para experimentar libremente.',
    task:'Abrí una categoría en la paleta de la izquierda y agregá nodos.',
    usesStage:true,
    spec:{ nodes:[], links:[] },
  },
];
