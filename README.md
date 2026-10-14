# Cuadro de Mando

Aplicación personal de productividad en **un único archivo HTML**: se abre con doble clic en
cualquier navegador, funciona **sin servidor y sin conexión a internet**, y guarda todos los datos
solo en el navegador (opcionalmente cifrados).

> El archivo listo para usar es [`CuadroDeMando.html`](CuadroDeMando.html). Descárgalo y ábrelo.

## Qué incluye

| Área | Funciones |
| --- | --- |
| Organización | Tareas (lenguaje natural: «mañana», «el viernes», «cada lunes», `#lista`, `!`), Kanban, Calendario (.ics), Notas, Wiki (notas en árbol), Mapas mentales, Grafo de conexiones, Marcadores |
| Conocimiento | Enlaces `[[Nota]]` con autocompletado, enlaces entrantes y menciones, bloques de código con resaltado, importación de Markdown/Obsidian y CherryTree (`.ctd`), exportación de ramas como manual HTML |
| Foco | Pomodoro, registro de horas por proyecto, hábitos |
| Utilidades | Calculadora, plazos en días hábiles (festivos de España), herramientas para desarrolladores (JSON/XML, Base64, JWT, hash, Regex explicada, validadores NIF/CIF/IBAN…), encriptador AES-256-GCM, generador de contraseñas |
| Datos | Bloqueo con contraseña (todo cifrado), historial de versiones, archivo de sincronización en disco, copias exportables cifradas |

## Principios de diseño

- **Un solo archivo, cero dependencias.** Todo el CSS y el JavaScript van dentro del HTML.
- **Sin red.** Una política de seguridad (CSP) generada al construir prohíbe cualquier conexión
  (`connect-src 'none'`) y solo permite ejecutar el script de la app, identificado por su huella
  SHA-256. Ni el propio código puede enviar datos fuera.
- **Privacidad.** Los datos se guardan en IndexedDB (o localStorage si el navegador no lo permite).
  Con el bloqueo activado se cifran con AES-256-GCM y una clave derivada con PBKDF2-SHA256
  (600.000 iteraciones); la contraseña no se guarda en ningún sitio.
- **HTML limpio.** El contenido de las notas pasa por un limpiador de **lista blanca**; pegar o
  soltar desde fuera solo admite texto.

## Estructura del código

```
build.py            Une las piezas en CuadroDeMando.html y calcula la CSP
src/index.html      Plantilla (marcadores /*CSS*/, <!--VIEWS-->, /*JS*/, <!--CSP-->)
src/styles*.css     Estilos
src/views/*.html    Una vista por sección
src/js/NN-*.js      Módulos, concatenados en orden numérico en un único <script>
tests/              Pruebas de extremo a extremo con Playwright
```

Módulos principales: `02-store` (almacenamiento, cifrado en reposo, copias), `03-shell`
(navegación, Ctrl+K, atajos), `13-notes` (editor y limpiador), `15-wikilinks`, `16-mindmap`,
`17-graph`, `18-wiki`, `19-code`, `20-ctd`, `40-settings`, `41-history`.

## Construir

```bash
python3 build.py          # genera CuadroDeMando.html
```

## Probar

```bash
python3 -m pip install playwright
python3 -m playwright install chromium
tests/run_all.sh
```

Cada archivo `tests/test_*.py` también se puede ejecutar por separado.
