# Blueprint Sim

Editor visual de nodos con un intérprete que reproduce la semántica de los
Blueprints de Unreal Engine, más un escenario 2D donde un *Actor* reacciona en
vivo a la lógica que cableás. Vainilla puro: sin frameworks ni build step, sólo
ES Modules nativos.

## Correr localmente

Como usa `import`/`export`, hay que servirlo por HTTP (no abrir el `index.html`
con `file://`). Cualquiera de estos sirve:

```bash
python3 -m http.server 8000
# o
npx serve
```

Luego abrí `http://localhost:8000`.

## Publicar en GitHub Pages

1. Subí el contenido de esta carpeta a un repositorio.
2. En **Settings → Pages**, elegí *Deploy from a branch*, rama `main`, carpeta `/root`.
3. Listo: las rutas son relativas (`css/…`, `js/…`), así que funciona tal cual,
   también si el sitio queda bajo `usuario.github.io/repo/`.

## Estructura

| Archivo | Rol |
|---|---|
| `index.html` | Estructura de la app |
| `css/styles.css` | Estilos y tema |
| `js/util.js` | Utilidades puras (tipos, colores, descarga) |
| `js/nodeTypes.js` | Catálogo de nodos + paleta |
| `js/state.js` | Modelo del grafo, layout de pines, queries, serialización |
| `js/render.js` | Dibujo de nodos, pines y cables |
| `js/interpreter.js` | Motor: pull de datos, push de ejecución, scheduler de latentes |
| `js/runtime.js` | Loop de Play, escenario, consola |
| `js/interaction.js` | Puntero: conectar, mover, zoom, borrar |
| `js/variables.js` | Panel de variables |
| `js/storage.js` | Autosave + export/import JSON |
| `js/main.js` | Arranque y cableado de la UI |

## Conceptos del intérprete

- **Pines de ejecución** (blancos): control de flujo, se caminan en orden (push).
- **Pines de dato** (de color, tipados): se evalúan *on-demand* cuando alguien
  los necesita (pull).
- **Nodos puros** (`eval`): sin efectos, se recalculan cada vez que se los lee.
- **Nodos de acción** (`run`): tienen efecto y continúan el flujo con `fire()`.
- **Nodos latentes** (`Delay`): se agendan en el scheduler y disparan `Completed`
  más tarde, avanzados por el `dt` del loop.

## Agregar un nodo

Añadí una entrada en `js/nodeTypes.js` y sumala al arreglo `PALETTE`. Ejemplo:

```js
clamp01:{ title:'Clamp01', cat:'pure', ic:'⊓',
  inputs:[{ name:'x', kind:'data', type:'float', label:'X', editable:true, default:0 }],
  outputs:[{ name:'res', kind:'data', type:'float', label:'' }],
  eval:(n, gi) => ({ res: Math.min(1, Math.max(0, gi('x'))) }) },
```

No hace falta tocar nada más: render, interacción e intérprete lo toman del
catálogo automáticamente.

## Estado de la hoja de ruta

- [x] Editor de nodos + intérprete + escenario
- [x] Variables (Get/Set tipados: float / bool / string)
- [x] Nodo latente `Delay` (scheduler)
- [x] `Sequence` y `For Loop`
- [x] Guardar / cargar (autosave + export/import JSON)
- [ ] Eventos custom y funciones (subgrafos)
- [ ] `Timeline`
- [ ] Importar/exportar el formato de copiar-pegar de Blueprints de UE
