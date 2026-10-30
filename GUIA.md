# Cuadro de Mando · Guía para sacarle el máximo partido

> Guía de uso de la aplicación. El manual técnico está en el [README](README.md).

## La idea en una frase

El Cuadro de Mando rinde más cuando cada cosa vive en su sitio y está enlazada con lo demás: las **notas** guardan el conocimiento, los **mapas mentales** lo ordenan, las **tareas** lo convierten en acción y las **conexiones** te enseñan cómo se relaciona todo.

Todo funciona sin internet y se guarda solo en tu navegador. Por eso la última pieza, la **protección de datos** (bloqueo, historial, archivo en disco y copias), no es opcional: es lo que hace que puedas confiarle tu trabajo.

Una regla práctica para decidir dónde va cada cosa:

| Si lo que tienes es… | Va en… | Y se conecta con… |
| --- | --- | --- |
| Información que querrás releer (actas, apuntes, procedimientos, ideas) | 📝 Notas | Otras notas con `[[Título]]` |
| Un tema que necesitas desmenuzar o planificar | 🧠 Mapa mental | Notas (📝 en cada idea) y tareas (☑️) |
| Algo que tienes que hacer tú, con fecha o sin ella | ☑️ Tareas | Una nota con `[[Título]]` en sus notas |
| Trabajo con etapas (por hacer, en curso, hecho) | 📋 Kanban | Una nota con `[[Título]]` en la descripción |
| Algo que ocurre en un día y hora concretos | 📅 Calendario | Con aviso, si quieres que te lo recuerde |
| Un enlace web que usas a menudo | 🔖 Marcadores | — |

## Notas enlazadas: tu red de conocimiento

Una nota aislada se olvida; una nota enlazada aparece cada vez que visitas algo relacionado. Enlazar cuesta dos teclas: escribe `[[` dentro de una nota y elige otra del menú.

**Cómo enlazar**

1. Escribe `[[` y empieza a teclear el título. Muévete con ↑ ↓ y pulsa Enter.
2. Si la nota no existe, la última opción es **«＋ Crear nota»**: se crea vacía y te quedas donde estabas.
3. También puedes escribir o pegar `[[Título completo]]` y se convierte solo. Si aún no existe, queda como enlace pendiente (borde discontinuo) y se activa en cuanto crees esa nota.
4. Un clic en el enlace abre la nota. El botón **[[ ]] Nota** de la barra hace lo mismo que teclear `[[`.

**Lo que pasa por detrás**

- El enlace va por la identidad de la nota, no por el título: si la renombras, todos los enlaces se actualizan.
- Si borras una nota, sus enlaces se ven tachados en rojo; un clic la vuelve a crear.

**El panel bajo cada nota** es donde está el valor:

- **Enlazada desde**: qué notas te traen aquí. Es la forma de descubrir contexto que ya no recordabas.
- **Enlaza a**: los enlaces que salen de esta nota.
- **Menciones sin enlazar**: notas que nombran el título de esta, pero sin enlace. El botón **🔗 Enlazar** lo convierte en un clic.

**Buenas prácticas**

- **Títulos claros y únicos**: «Cliente ACME» mejor que «Notas cliente».
- **Notas índice**: una nota por proyecto, cliente o área que enlaza a las demás.
- **Enlaza al escribir, no después**: en un acta, cada persona, proyecto o decisión relevante con `[[ ]]`.
- **Plantillas**: el botón 📄 crea actas, diarios, planes semanales, checklists de despliegue o informes de incidencia. Puedes guardar las tuyas desde el menú ⋯ de cualquier nota.

**Compatibilidad con Obsidian**: al importar un `.md` se respetan `[[Nota]]`, `[[Nota|alias]]` y `[[Nota#sección]]`. Al exportar, los enlaces salen como `[[Nota]]`.

**Deshacer**: Ctrl + Z y Ctrl + Y funcionan en el editor como en cualquier procesador de textos, también después de insertar una etiqueta, una casilla o un enlace. La barra tiene además los botones ↶ ↷.

## Wiki: notas organizadas en árbol

Cuando un tema crece (un proyecto, un manual, una normativa), la lista plana se queda corta. En Notas, el selector **📄 Lista / 🌳 Wiki** convierte la barra lateral en un árbol de páginas y subpáginas. Cada página sigue siendo una nota normal: enlaces `[[ ]]`, grafo, búsqueda, historial y cifrado incluidos.

- **＋ Página en la raíz** (al pie del árbol) crea un libro nuevo; **⊕** junto al título o **＋ Añadir subpágina** crean una subpágina.
- **Reorganizar**: arrastra una página sobre otra. En el centro pasa a ser su subpágina; en el borde superior o inferior se coloca antes o después. Desde el móvil: menú ⋯ → **↦ Mover a…**.
- **Migas de pan**, **subpáginas** al pie y **☰ Índice de la página** para moverte.
- **Sacarla fuera** (menú ⋯): **📚 Manual HTML** (un único archivo con índice, buscador y código coloreado), **Markdown** (vale para Obsidian) o **🧠 Mapa mental**.
- **Traer documentación de CherryTree**: «Importar .md / .txt / .ctd» acepta archivos `.ctd` (XML) y crea la rama completa.

## Bloques de código

Para procedimientos técnicos, consultas SQL o fragmentos de configuración:

- **Crear**: escribe ``` (o ```sql, ```python…) en una línea vacía y pulsa Enter. También con el selector de estilo → «Código».
- **Dentro**: Enter mantiene la sangría, Tab añade 2 espacios y **Enter dos veces al final** sale del bloque.
- **Barra del bloque** (al pasar el ratón): lenguaje o detección automática, y 📋 Copiar.
- Lenguajes: SQL, JavaScript/TypeScript, Java, Python, JSON, XML/HTML, Shell, PowerShell y CSS.
- **Código en línea**: selecciona unas palabras y pulsa **‹/›**.

## Etiquetas: agrupar por tema en todas las secciones

Los enlaces `[[ ]]` relacionan cosas concretas; las **etiquetas** agrupan por tema o contexto. Una etiqueta como `#portal-ciudadano` reúne en un solo sitio las notas, tareas, tarjetas, eventos, marcadores y mapas que la llevan.

**Poner etiquetas**

- **Con el desplegable**: el botón **＋ Etiqueta** (bajo el título de la nota, o en el formulario de una tarea, tarjeta, evento o marcador) abre la lista de todas tus etiquetas con buscador. Marca o desmarca, o escribe una nueva y pulsa Enter para crearla.
- **Escribiendo** `#etiqueta` en cualquier texto. Las dos formas se suman: las escritas en el texto se ven con borde discontinuo y se quitan borrándolas del texto.
- **Niveles** con `/`: `#proyecto/portal` aparece también al consultar `#proyecto`.
- Mayúsculas y tildes no cuentan: `#Reunión` y `#reunion` son la misma.
- No cuentan como etiquetas las que están dentro de bloques de código ni de enlaces.

**Usarlas**

- **🏷️ Etiquetas** (menú lateral) es el sitio para gestionarlas: **☁️ Nube** (tamaño según cuántos elementos tiene cada una) o **☰ Lista**. Al elegir una ves todo lo que la lleva agrupado por sección.
- **＋ Nueva** crea una etiqueta con color y descripción aunque todavía no la uses; **＋ Subetiqueta** crea una hija.
- **＋ Añadir a elementos…**: ponle o quítale la etiqueta a muchos elementos de golpe.
- **🗑️ Eliminar**, **fusionar** y **cambiar el color** a varias a la vez desde **☰ Lista**. Antes de eliminar o fusionar se guarda una versión en el historial.
- **Renombrar / fusionar**: cambia la etiqueta en todas las secciones a la vez.

**Colores y filtros**

- **Color por etiqueta**: uno de los 12 de la paleta. Las subetiquetas heredan el del padre; sin color propio, cada una recibe un tono fijo automático.
- **Filtrar**: el botón **🏷️ Etiqueta ▾** de Notas, Tareas, Kanban y Marcadores muestra solo lo que la lleva (o alguna de sus subetiquetas).
- **Markdown**: al exportar una nota, las etiquetas van como `tags:` al principio del archivo (formato de Obsidian), y al importar se leen de vuelta.

**Consejo**: pocas etiquetas y estables funcionan mejor que muchas. Una combinación útil: una por proyecto o cliente (`#portal`, `#acme`), unas pocas de tipo (`#reunion`, `#incidencia`, `#idea`) y alguna de estado (`#esperando`, `#urgente`).

## Herramienta Listas (en Herramientas)

Para convertir una lista pegada de Excel, un correo o una consulta en el formato que necesites.

Debajo del cuadro de entrada tienes tres botones de ejemplo (**✨ Excel → IN de SQL**, **Buscar con OR**, **Comparar dos listas**): cargan un caso real ya resuelto, que es la forma rápida de entender la herramienta. El recorrido siempre es el mismo:

1. **Pega** la lista: se separa sola por líneas, tabuladores, punto y coma, comas o espacios, y debajo te dice por dónde la ha separado.
2. **Limpia**: espacios, vacíos, comillas, duplicados (y ver **cuáles** se repiten y cuántas veces), orden natural o alfabético, mayúsculas.
3. **Elige** qué valores usar: marcados (grupo 1) y sin marcar (grupo 2), con filtro para marcar o desmarcar muchos a la vez.
4. **Formato**: `OR`, `AND`, comas, una por línea, **`IN (…)` de SQL** (con comillas escapadas y partido en bloques de 1.000 para Oracle), JSON, CSV, Markdown, regex o un separador propio con prefijo y sufijo.
5. **Comparar** con una segunda lista: qué está solo en A, solo en B y en ambas.

**Ejemplo de principio a fin.** Te pasan por correo una columna de Excel con expedientes repetidos y necesitas consultarlos en la base de datos:

1. Pégala en el cuadro. Arriba verás «7 valores · 5 distintos · 2 valores repetidos» (pulsa en los repetidos para ver cuáles son).
2. Marca **Quitar duplicados**.
3. En formato de salida elige **SQL: IN**, escribe `NUM_EXPEDIENTE` en «Columna» y copia:

```sql
NUM_EXPEDIENTE IN ('2026/0042', '2026/0043', '2026/0051', '2026/0067', '2026/0088')
```

Y si lo que te piden es cruzar dos ficheros («de estos 300, ¿cuáles ya están dados de alta?»), pega el primero en **Lista**, cambia a **⚖️ Comparar con otra lista**, pega el segundo y tendrás tres cuadros: solo en A (los que faltan), solo en B y los que están en las dos.

**Las otras once herramientas** siguen el mismo patrón: cada una tiene su desplegable «ℹ️ Qué es y cómo se usa» con ejemplos que se cargan de un clic. Están JSON/XML, Base64, URL, JWT, hash, comparar textos, expresiones regulares explicadas en castellano, UUID, fechas y epoch, validadores de NIF/CIF/IBAN y transformaciones de texto.

En **Herramientas → Texto**, además de contar caracteres y palabras y de las transformaciones (slug, camelCase, snake_case, ordenar, quitar duplicadas…), tienes abajo un **generador de texto de relleno**: eliges cuántos párrafos, frases, palabras o líneas de lista, si empieza por el clásico «Lorem ipsum dolor sit amet…», y pulsas **✨ Generar** (lo sustituye) o **＋ Añadir** (lo pega detrás de lo que ya hay).

## Bloc rápido: un post-it siempre a mano

Para lo que no quieres clasificar todavía (un teléfono que te dictan, una idea a medias, lo que te acaban de decir por el pasillo) tienes el **bloc rápido**: el botón 🗒️ de la barra superior (o **Alt + B**) abre una caja pequeña sobre la pantalla en la que estés.

- Lo que escribes **se guarda solo** y viaja con el resto de tus datos: lo verás también en el móvil y en el otro equipo, y entra en las copias.
- La misma caja está en **Inicio**, como tarjeta: es el mismo texto, escribas donde escribas.
- Cuando lo apuntado ya merece un sitio: **📝 A nota** (la primera línea es el título y el resto, el contenido) o **☑️ A tareas** (una tarea por línea, con el lenguaje natural de siempre: «Llamar a Ana el viernes»). El bloc se vacía y el aviso lleva **Deshacer**.
- **Cuentas al vuelo**: escribe una operación y `=` y el resultado aparece detrás. Funciona con decimales en coma, miles con punto, paréntesis y porcentajes: `3*12,5=` → `37,5`, `cena 12,50+8=` → `20,5`, `120+21%=` → `145,2`. Si lo de delante no es una cuenta (un «total 20 =», una fecha o un código como `2026/0042`), no toca nada, y el resultado se quita con Ctrl+Z.
- El botón muestra un punto cuando hay algo apuntado, para que no se te olvide.

## Conexiones entre notas: el mapa de tu conocimiento

El grafo (🧠 Mapas → 🕸️ Conexiones entre notas) dibuja cada nota como un punto y cada enlace como una línea. Sirve para **ver lo que no se ve en una lista**.

| Forma | Qué es |
| --- | --- |
| Círculo morado (más grande = más conexiones) | Nota |
| Círculo naranja | Nota fijada |
| Círculo gris | Nota suelta, sin enlaces |
| Cuadrado verde | Tarea o tarjeta Kanban que menciona `[[una nota]]` |
| Rombo azul | Mapa mental con ideas enlazadas a notas |

- **Los nodos grandes** son tus temas centrales.
- **Los grupos** (racimos de puntos) son áreas de trabajo.
- **Los puntos grises sueltos** son notas olvidadas: ciérralas, enlázalas o bórralas.
- **🎯 Centrar aquí** muestra solo ese nodo y su entorno (1, 2 o 3 niveles). Es la vista más útil para preparar una reunión.

**Una rutina que funciona**: una vez por semana, abre el grafo con «Notas sueltas» activado y dedica cinco minutos a los puntos grises.

## Mapas mentales: pensar un tema de un vistazo

Un mapa mental sirve cuando tienes un tema y todavía no sabes cómo se ordena. El grafo muestra relaciones que ya existen; el mapa te ayuda a **crearlas**.

- **＋ Nuevo** ofrece: en blanco, Proyecto, Análisis DAFO, Reunión, Lluvia de ideas, Estudio de un tema, pegar un esquema o **convertir una nota**.

**Escribir rápido con el teclado** (el ratón casi sobra)

| Tecla | Acción |
| --- | --- |
| Tab | Nueva idea hija |
| Enter | Nueva idea hermana |
| Empezar a escribir, F2, Espacio o doble clic | Editar la idea |
| ← ↑ ↓ → | Moverse por el árbol |
| Alt + ↑ / ↓ | Subir o bajar entre hermanas |
| Supr | Borrar la rama (se puede deshacer) |
| Ctrl + . | Plegar o desplegar |
| Ctrl + Z / Ctrl + Y | Deshacer / rehacer |
| Ctrl + V | Pegar un esquema de texto como ideas hijas |
| Ctrl + rueda · Ctrl + 0 | Zoom · encajar todo |

El truco es no parar: Tab, escribes, Enter, escribes… Primero vuelca todo y después ordena.

**Conectar el mapa con el resto**

- **📝 Enlazar con una nota**: la idea muestra un 📝 que abre la nota.
- **☑️ Convertir en tarea**: envía la idea a Tareas (sus hijas, como pasos) o al Kanban (como subtareas).
- **✓ Hecha**: tacha la idea sin borrarla.

**Sacarlo fuera** (menú ⋯): guardar como nota, descargar imagen PNG o SVG, esquema Markdown, copiar como esquema, duplicar.

## Tareas y Kanban: de la idea a la acción

**Tareas** es tu lista personal de pendientes; **Kanban** es para trabajo con etapas.

**Tareas: escribe como hablas.** El campo entiende lenguaje natural:

- Fechas: «hoy», «mañana», «pasado mañana», «el viernes», «15/11», «en 3 días», «la próxima semana».
- Repeticiones: «cada día», «cada semana», «todos los lunes».
- Lista con `#nombre` e importante con `!`. Ejemplo: «Llamar a Ana mañana #trabajo !».
- Cada tarea tiene **pasos** (subtareas con casilla) y un campo de **notas**.

**Kanban**: tarjetas con prioridad, fecha, etiquetas, **subtareas** y **descripción**. Se arrastran entre columnas.

**Cuánto se ve de cada tarjeta.** En la barra del tablero eliges la vista:

- **Compacta**: solo el título y lo imprescindible (prioridad, fecha, subtareas hechas y etiquetas). Para ver muchas tarjetas de golpe o trabajar en el móvil.
- **Normal**: añade un extracto de la descripción, con las subtareas plegadas.
- **Detalle**: descripción completa y subtareas desplegadas. Para revisar un proyecto a fondo.

Cada equipo recuerda la suya: puedes tener compacta en el móvil y detalle en el portátil.

**Del Kanban a Tareas o a una nota.** Abre la tarjeta y pulsa **📤 Enviar a…**:

- **Mover a Tareas**: cuando ya no necesita etapas y basta con hacerla y tacharla. Se lleva fecha, etiquetas, prioridad y subtareas (como pasos) y desaparece del tablero.
- **Copiar a Tareas**: igual, pero la tarjeta se queda. Las dos van por su cuenta.
- **Volcar en una nota**: crea una nota con la descripción y las subtareas como casillas, hereda las etiquetas y la deja enlazada en la tarjeta. Para cuando lo que crece es el contenido, no el trabajo.

Los tres avisan con **Deshacer**.

**De Tareas al Kanban.** Cuando una tarea deja de ser «hazlo y táchalo» y pasa a tener estados, ábrela y pulsa **📋 Pasar a Kanban**. La aplicación pregunta qué quieres:

- **Mover** (lo recomendado): la tarjeta se crea en «Por hacer» con su fecha, etiquetas, prioridad y pasos convertidos en subtareas, y la tarea desaparece de la lista. Así cada cosa vive en un sitio y no tienes que acordarte de darla por hecha dos veces.
- **Copiar**: se crea la tarjeta y la tarea sigue en su lista. Útil si quieres seguir viéndola en tu día a día mientras avanza en el tablero, pero las dos quedan sueltas: completar una no completa la otra.

El aviso que sale después lleva **Deshacer**.

**Criterio para no duplicar**: la tarea dice *qué* hay que hacer y *cuándo*; la nota guarda el *porqué* y el *cómo*. Si el texto de una tarea pasa de unas líneas, muévelo a una nota y deja en la tarea solo el enlace.

## Avisos: la alarma que se queda en pantalla

Al crear o editar un evento del calendario hay un campo **Aviso**. Puedes elegir un rato antes (5, 10, 15 o 30 minutos, 1 o 2 horas, 1 día) o **a una hora concreta**, que es lo más útil cuando lo que quieres es acordarte *la noche de antes*:

| Lo que quieres | Qué eliges |
| --- | --- |
| Que me avise justo cuando empiece | **A la hora del evento** |
| Salir con tiempo a la reunión | **15 minutos antes** |
| Preparar los papeles la noche anterior | **A una hora concreta…** → *El día antes* + `20:00` |
| Acordarme una semana antes de la renovación | **A una hora concreta…** → *Una semana antes* + `09:00` |

**En las tareas y en las tarjetas del Kanban** también hay un campo **Aviso**. Como solo tienen fecha (no hora), el aviso es siempre **a una hora concreta** del día en que vencen o de días antes: *El mismo día* + `08:30`, *El día antes* + `20:00`… Para ponerlo hace falta que tengan fecha. Al pasar una tarea al Kanban (o una tarjeta a Tareas) el aviso va con ella, y en una tarea que se repite, al completarla la siguiente hereda el aviso. Las que llevan aviso se marcan con ⏰ en la lista, en el tablero y en el calendario.

Cuando llega el momento aparece un cartel **abajo a la izquierda** con el título del evento, su hora y sus notas, y **se queda ahí hasta que lo cierras**: aunque cambies de sección, aunque estuvieras en otra cosa. Tres salidas:

- **📅 Ver en el calendario**: te lleva al día del evento (en una tarea o tarjeta, **Abrir la tarea / la tarjeta**, y además **✓ Hecha** para completarla y cerrar el aviso de una vez).
- **Posponer**: 5, 10, 30 minutos o 1 hora, y vuelve a avisar.
- **✕ Cerrar**: se va y no vuelve (si coinciden varios, hay un **Cerrar todos**).

**Que se vea bien**: en **Ajustes → ⏰ Avisos** eliges cómo se ve el cartel (**Discreto**, **Destacado** —todo de color, el de por defecto— o **Muy llamativo**, arriba y más grande) y su color (el de cada evento o uno fijo). Con **👀 Probar el aviso** ves cómo queda sin esperar a uno de verdad.

El cartel solo se pinta dentro de la pestaña de la aplicación. Fuera de ella: el título de la pestaña del navegador pasa a `⏰ (1) Cuadro de Mando` (y parpadea si estás en otra pestaña), suena un aviso corto y, si le das permiso, el navegador te lo notifica aunque estés en otra pestaña. El permiso, el sonido y la lista de **próximos avisos** están en **Ajustes → ⏰ Avisos**.

**Dos cosas que conviene saber**, para que no te lleves sorpresas:

- La aplicación no tiene servidor ni nada corriendo por detrás: **los avisos solo suenan con la aplicación abierta** (basta con que esté en otra pestaña o minimizada). Si la tenías cerrada, el aviso **te espera** y lo ves al abrirla, hasta 36 horas después. Para algo que no te puedes jugar, pon el aviso aquí *y* exporta el `.ics` a tu calendario del móvil: al exportar, los avisos viajan dentro del archivo.
- Lo que cierras o pospones es **de este equipo**. Así el aviso te salta igual en el portátil de casa aunque ese día lo cerraras en el del trabajo.

## El calendario: abrir, arrastrar y cambiar un solo día

- **Pincha cualquier cosa de la cuadrícula** (evento, tarea o tarjeta) para abrirla. **«+N más»** te lleva a la lista del día con todo lo que hay.
- **Arrástrala a otro día** para cambiarle la fecha (en el ordenador; en el móvil, cambia la fecha desde el formulario). Sale un aviso con **Deshacer**.
- **📆 Año** enseña los 12 meses de un vistazo: los días con cosas, más oscuros cuantas más tienen; los festivos en rojo; hoy, recuadrado. Pincha un día o el nombre de un mes para ir a él.

**Eventos que se repiten: cambiar solo un día.** Si los lunes tienes reunión pero este lunes es festivo, **ábrela desde ese lunes** en el calendario. Arriba verás «Se repite · estás en el lunes…», y abajo dos botones:

| Lo que quieres | Qué pulsas | Qué queda |
| --- | --- | --- |
| Ese lunes no hay reunión | **⏭️ Saltar este día** | Ese lunes, tachado como *cancelado* |
| Esa semana la reunión es el martes | **📆 Mover solo este…** y eliges día y hora | El lunes, tachado como *aplazado al martes*; el martes, la reunión |

El resto del formulario sigue cambiando **toda la serie**. Para deshacerlo, abre el día tachado y pulsa **↩️ Recuperar este día**. Al arrastrar un evento que se repite, te pregunta si mover **solo ese día** o **toda la serie**. Los días saltados viajan en el `.ics`, así que Outlook o Google Calendar también los respetan.

## Siete casos prácticos, de principio a fin

**1. Arrancar un proyecto**

1. Crea una nota índice con el nombre del proyecto.
2. Crea un mapa mental con la plantilla **Proyecto** y vuelca objetivos, tareas, personas, plazos, riesgos y recursos.
3. Las ramas que necesiten detalle: 📝 → «Crear una nota nueva». Enlaza esas notas desde la nota índice con `[[ ]]`.
4. Lo accionable: ☑️ a Tareas (lo tuyo) o al Kanban (lo que tiene fases).
5. A partir de ahí, «🎯 Centrar aquí» en la nota índice te da el proyecto entero de un vistazo.

**2. Reuniones**

1. Antes: plantilla «Acta de reunión» (botón 📄). Enlaza el proyecto y a las personas con `[[ ]]`.
2. Durante: escribe acuerdos y casillas de tareas con Ctrl + Shift + X.
3. Después: pasa cada tarea con fecha a Tareas, añadiendo `[[Reunión …]]` en sus notas.
4. En la siguiente reunión, el panel «Enlazada desde» de la nota del proyecto te da todas las actas anteriores.

**3. Estudiar o investigar un tema**

1. Mapa mental con la plantilla **Estudio de un tema**: conceptos, ejemplos, dudas, recursos.
2. Una nota por concepto importante, enlazada desde su idea del mapa.
3. Entre conceptos relacionados, enlaces `[[ ]]` en las propias notas.
4. Para repasar, abre el grafo: los conceptos aislados son los que aún no has integrado.
5. Si tienes apuntes en Obsidian, impórtalos como `.md`.

**4. Revisión semanal** (15 minutos)

- [ ] Inicio: revisa lo vencido y lo de la semana que viene.
- [ ] Tareas: vacía la bandeja de entrada (fecha, lista o borrar).
- [ ] Kanban: mueve tarjetas y archiva lo hecho.
- [ ] Grafo: notas sueltas, enlazar o descartar.
- [ ] Mapas: marca como hechas las ideas terminadas.
- [ ] Ajustes: comprueba que el archivo en disco está «Guardado»; una vez al mes, exporta una copia cifrada.

**5. Un listado de libros (o de cursos, películas, bodegas…)**

Cuando lo que quieres es una colección con fichas, no una lista de recados:

1. Una **nota por libro**, con el título como título de la nota. Dentro, lo que te importe: autor, año, quién te lo recomendó, citas, tu valoración.
2. Etiquetas comunes para poder filtrar: `#libro` más el estado (`#leido`, `#leyendo`, `#pendiente`) y el tema (`#libro/historia`, `#libro/tecnico`).
3. En **Notas**, el desplegable 🏷️ Etiqueta filtra la lista; en **Etiquetas** tienes la nube, con el tamaño según cuántos elementos tiene cada una.
4. Si además quieres «sacar» uno a la lectura activa, crea una tarea «Leer *Título*» con `[[Título]]`: desde la tarea llegas a la ficha de un clic, y desde la ficha verás «☑️ Tareas que la mencionan».

La regla es la de siempre: si es algo que **se consulta**, nota; si es algo que **hay que hacer**, tarea.

**6. Seguir una incidencia o un expediente de principio a fin**

1. Tarjeta en el **Kanban** con la etiqueta del asunto (`#portal-ciudadano`) y la prioridad.
2. Los pasos concretos, como **subtareas** de la tarjeta; las decisiones y el contexto, en una **nota** enlazada con `[[ ]]`.
3. Si hay fecha límite legal, calcúlala en **Plazos** (días hábiles con los festivos de tu comunidad) y pon esa fecha en la tarjeta.
4. Mientras trabajas, el **cronómetro de Horas** sobre el proyecto correspondiente.
5. Al terminar, la tarjeta a «Hecho» y la nota se queda como memoria del caso. Dentro de seis meses, buscar la etiqueta te devuelve todo junto.

**7. Un día normal con dos equipos y el móvil**

1. En el portátil del trabajo abres la aplicación, el semáforo pone ✅ Al día y trabajas normal; cada cambio se guarda solo en el `.json` de la nube.
2. En el autobús apuntas algo desde el móvil (misma dirección web, añadida a la pantalla de inicio).
3. Al llegar a casa, abres el otro portátil: lo del móvil **ya está ahí**, sin importar ni exportar nada.
4. Una vez al mes, Ajustes → Exportar copia cifrada y la guardas en otro sitio.

## El resto de la caja de herramientas

**Ctrl + K es la puerta a todo.** Busca a la vez en tareas, notas, ideas de los mapas, Kanban, calendario, marcadores, hábitos y proyectos, y lanza acciones.

| Sección | Para qué sirve |
| --- | --- |
| 🏠 Inicio | Resumen del día: tareas, eventos, avisos |
| 📅 Calendario | Eventos con aviso, fechas límite y festivos; arrastrar a otro día, cambiar un solo día de una serie, vista del año; importa y exporta `.ics` |
| 🔖 Marcadores | Enlaces web frecuentes, por categorías |
| 🍅 Pomodoro | Bloques de concentración con descansos |
| ⏱️ Horas | Registro de tiempo por proyecto y cliente |
| 🔁 Hábitos | Constancia diaria con historial de 6 meses |
| 🧮 Calculadora | Con paréntesis, porcentajes e historial |
| 📆 Plazos | Días hábiles y vencimientos con festivos españoles |
| 🛠️ Herramientas | JSON/XML, Base64, URL, JWT, hash, comparar, Regex, UUID, fechas, NIF/CIF/IBAN, texto, listas |
| 🔐 Encriptador | Cifrado AES-256 de textos y archivos, con almacén cifrado |
| 🔑 Contraseñas | Contraseñas y frases seguras |

## Proteger lo que construyes

Cinco capas, cada una contra un riesgo distinto (todo está en Ajustes):

| Capa | Qué hace | Te protege de | Qué tienes que hacer |
| --- | --- | --- | --- |
| 🔒 Bloqueo | Cifra todo en el navegador y pide contraseña al abrir | Que alguien use tu equipo | Activarlo una vez |
| 🕘 Historial | Versiones automáticas al abrir, cada 30 min y antes de importar o restaurar | Tus propios errores | Nada; «Guardar versión ahora» antes de un cambio grande |
| 🗄️ Archivo en disco | Un `.json` que se reescribe solo tras cada cambio | Perder el navegador o el equipo | Vincularlo una vez, mejor en una carpeta de la nube |
| 💾 Copias automáticas | Una copia con fecha en la carpeta que elijas, conservando las N últimas | Que se estropee o se borre el archivo vinculado | Elegir la carpeta una vez |
| 💾 Copia exportada | Una foto fija, cifrada o no | Casi todo, si la guardas fuera | Exportarla cada mes |

**Copias automáticas con fecha** (Ajustes → 💾 Copias automáticas): el archivo vinculado guarda **solo la última versión**, así que si algo se estropea ahí, se estropea para todos los dispositivos. Esta capa es la que te deja volver atrás: eliges una carpeta y la aplicación va dejando `cuadro-de-mando-2026-10-20.json` con la frecuencia que digas (cada vez que abres, una vez al día o una vez a la semana), borrando las más antiguas cuando pasan del número que quieras conservar. Elige una carpeta **distinta** de la del archivo vinculado. Si el bloqueo está activado, las copias van cifradas. Disponible en Chrome, Edge y Brave de ordenador.

**Varios dispositivos: combinar sin perder nada**

- **Al importar una copia** (o cargar el archivo vinculado) la aplicación te enseña antes qué cambia en cada sección: lo nuevo, lo más reciente en cada lado y, en rojo, lo que se perdería al reemplazar.
- **🔀 Combinar** (recomendado) junta lo de los dos: lo que solo está en un lado se conserva, si algo se cambió en los dos gana lo más reciente y lo que borraste en un dispositivo no vuelve.
- **Archivo vinculado**: si otro dispositivo guardó en él, los cambios se **combinan solos** cuando no hay conflicto y aparece un aviso con lo que ha llegado. Solo te pregunta si algo se cambió en los dos sitios o se va a borrar.
- **En el móvil**: Chrome para Android también puede vincular el archivo (Ajustes → Archivo en disco → **Abrir archivo existente**).
- **Semáforo de sincronización** (arriba, junto al buscador): ✅ Al día, ⏳ Guardando…, 🔄 Sincronizando…, ⚠️ Revisar, ⚠️ Reconectar, 🔒 Archivo cifrado o ⚪ Sin sincronizar. Al pulsarlo sincroniza al momento.
- **Combinar no recarga la página**: te quedas en la misma pantalla y, si estabas escribiendo una nota, no pierdes ni el texto ni el cursor.
- **Si cifras, cífralo en todos los equipos**. El bloqueo es de cada navegador: no viaja dentro del `.json`. Al activarlo en uno, el archivo pasa a guardarse cifrado; la primera vez que otro equipo lo lea te pedirá esa contraseña y te ofrecerá activar allí el bloqueo con ella. Mientras un equipo no tenga bloqueo, **no escribirá nada en el archivo** para no dejarlo sin cifrar.

**¿Y si pierdo el `.json` compartido?** No pierdes los datos: cada dispositivo guarda su copia completa en el navegador. Además, Drive y OneDrive guardan papelera y versiones anteriores. Aun así, exporta una copia de vez en cuando y guárdala **fuera** de esa misma carpeta.

**Con el bloqueo activado**, se pide la contraseña al abrir la aplicación y no se vuelve a pedir mientras la pestaña siga abierta. Para bloquear al momento: botón **🔒 Bloquear**, **Alt + L** o la paleta de comandos. La contraseña no se puede recuperar: guárdala en un gestor de contraseñas.

## Chuleta de atajos

| Dónde | Atajo | Acción |
| --- | --- | --- |
| En toda la app | Ctrl + K | Buscar en todo y lanzar acciones |
| En toda la app | Alt + 1…9 | Ir a Inicio, Tareas, Kanban, Calendario, Notas, Mapas, Marcadores, Pomodoro, Horas |
| En toda la app | Alt + N / Alt + T | Nueva nota / nueva tarea |
| En toda la app | Alt + L | Bloquear (con el bloqueo activado) |
| En toda la app | Alt + B | Abrir o cerrar el bloc rápido |
| Notas | `[[` | Enlazar con otra nota |
| Notas | Ctrl + Shift + X | Casilla de tarea |
| Notas | Ctrl + K | Enlace web |
| Notas | Ctrl + S | Guardar ya (se guarda solo igualmente) |
| Notas | Ctrl + Z / Ctrl + Y | Deshacer / rehacer |
| Mapas mentales | Tab / Enter | Idea hija / hermana |
| Mapas mentales | F2, Espacio o escribir | Editar |
| Mapas mentales | Flechas · Alt + ↑↓ | Moverse · reordenar |
| Mapas mentales | Supr · Ctrl + . | Borrar · plegar |
| Mapas mentales | Ctrl + Z / Y · Ctrl + 0 | Deshacer / rehacer · encajar |
| Pomodoro | Espacio | Iniciar o pausar |
| Cualquier ventana | Esc | Cerrar |

## Licencia

El Cuadro de Mando es software libre con **licencia MIT**: puedes usarlo, copiarlo, modificarlo y distribuirlo libremente, manteniendo el aviso de autoría. Se comparte tal cual, sin garantías.

[MIT](LICENSE) © 2026 Rafael Karino Arillo ([rkarillo-tech](https://github.com/rkarillo-tech)).

El aviso de licencia va también dentro del propio HTML y en Ajustes → Licencia y créditos. Tus datos no tienen nada que ver con todo esto: siguen siendo tuyos y solo tuyos, guardados en tu navegador y en el archivo que tú elijas.
