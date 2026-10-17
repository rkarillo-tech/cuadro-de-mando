# Cuadro de Mando

Tu espacio personal de productividad en **un único archivo HTML**: notas, wiki, tareas, Kanban,
calendario, mapas mentales, etiquetas y utilidades. Se abre con doble clic en cualquier navegador,
funciona **sin conexión a internet y sin servidor**, y tus datos **nunca salen de tu equipo**.

### ⬇️ [Descargar la última versión](https://github.com/rkarillo-tech/cuadro-de-mando/releases/latest/download/CuadroDeMando.html)

> Guarda el archivo donde quieras y ábrelo con Chrome, Edge, Firefox o Safari. No hay que instalar nada.
> Todas las versiones, con sus novedades, están en [Releases](https://github.com/rkarillo-tech/cuadro-de-mando/releases).

## Qué puedes hacer

| Área | Funciones |
| --- | --- |
| **Organización** | Tareas en listas con lenguaje natural («mañana», «el viernes», «cada lunes»), Kanban, calendario (importa y exporta `.ics`), marcadores |
| **Conocimiento** | Notas con editor enriquecido, wiki en árbol, enlaces entre notas `[[Nota]]`, grafo de conexiones, mapas mentales, bloques de código con resaltado |
| **Etiquetas** | Comunes a todas las secciones, con colores, niveles (`#trabajo/proyecto`), nube, filtros y gestión (crear, renombrar, fusionar, asignar en bloque) |
| **Foco** | Pomodoro, registro de horas por proyecto, hábitos |
| **Utilidades** | Calculadora, plazos en días hábiles (festivos de España), herramientas para desarrolladores (JSON/XML, Base64, JWT, hash, expresiones regulares explicadas, validadores NIF/CIF/IBAN, listas → `OR` / `IN` de SQL…), encriptador, generador de contraseñas |
| **Importar / exportar** | Markdown (compatible con Obsidian), CherryTree (`.ctd`), manual HTML de una rama de la wiki, copias de seguridad |

## Tus datos

- **Se guardan solo en tu navegador**, en el equipo donde la uses. El archivo HTML no contiene
  datos: si lo compartes, la otra persona tendrá su propio Cuadro de Mando vacío.
- **Sin conexiones.** La página lleva una política de seguridad que impide cualquier conexión de red;
  ni el propio código puede enviar nada fuera.
- **Bloqueo con contraseña** (Ajustes): cifra todo con AES-256-GCM. La contraseña no se guarda en
  ningún sitio, así que **si la olvidas no se puede recuperar**.
- **Haz copias de seguridad** (Ajustes → Exportar), mejor cifradas. Si borras los datos del navegador,
  se borran también los del Cuadro de Mando.
- **Historial de versiones**: la aplicación guarda instantáneas automáticas para poder volver atrás.
- **Varios dispositivos**: en Chrome y Edge (ordenador y Android) puedes vincular un mismo archivo `.json`,
  por ejemplo en Google Drive o OneDrive, donde se guarda cada cambio. Cuando otro dispositivo lo ha modificado,
  la app combina los cambios sola; si algo se cambió en los dos sitios o se va a borrar, te enseña qué cambia
  para que decidas.

## Preguntas frecuentes

**¿Necesito internet?** No. Solo para descargar el archivo la primera vez.

**¿Funciona en el móvil?** Sí. Lo más cómodo es abrirla desde su dirección web
(https://rkarillo-tech.github.io/cuadro-de-mando/) y añadirla a la pantalla de inicio. Con Chrome para Android
puedes vincular el mismo archivo `.json` que en el ordenador y se sincronizan solos.

**¿Puedo usarlo, modificarlo o compartirlo?** Sí, con licencia MIT (ver abajo).

**¿Hay soporte?** Es un proyecto personal que se comparte tal cual, sin garantía.

## Licencia

[MIT](LICENSE) © 2026 Rafael Karino Arillo ([rkarillo-tech](https://github.com/rkarillo-tech)).
Puedes usarlo, copiarlo, modificarlo y distribuirlo libremente, manteniendo el aviso de autoría.

---

## Para desarrolladores

El HTML se genera a partir de las piezas de `src/`.

```
build.py            Une las piezas en CuadroDeMando.html, añade versión y aviso, y calcula la CSP
VERSION             Número de versión
src/index.html      Plantilla (marcadores /*CSS*/, <!--VIEWS-->, /*JS*/, <!--CSP-->)
src/styles*.css     Estilos
src/views/*.html    Una vista por sección
src/js/NN-*.js      Módulos, concatenados en orden numérico en un único <script>
tests/              Pruebas de extremo a extremo con Playwright
```

**Principios:** un solo archivo y cero dependencias; CSP generada al construir (`connect-src 'none'`
y solo el script de la app, identificado por su huella SHA-256); datos en IndexedDB con respaldo en
localStorage; cifrado en reposo con AES-256-GCM y PBKDF2-SHA256 (600.000 iteraciones); el contenido
de las notas pasa por un limpiador de lista blanca.

```bash
python3 build.py                     # genera CuadroDeMando.html
python3 -m pip install playwright
python3 -m playwright install chromium
tests/run_all.sh                     # todas las pruebas
```
