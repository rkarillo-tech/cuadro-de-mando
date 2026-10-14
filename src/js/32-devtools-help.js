/* =====================================================================
   HERRAMIENTAS · AYUDA Y EJEMPLOS DE CADA UNA
   ===================================================================== */
function setVal(id, v, ev = 'input') { const el = $('#' + id); el.value = v; el.dispatchEvent(new Event(ev, { bubbles: true })); }
function exampleLoaded(msg) { toast(msg || 'Ejemplo cargado', 'info', 3000); }
const b64url = s => toUrlSafe(b64enc(te.encode(s)));

const DEV_HELP = {
  json: {
    what: '<b>JSON</b> y <b>XML</b> son formatos de texto para intercambiar datos entre aplicaciones: respuestas de APIs, ficheros de configuración, servicios web (SOAP), facturas electrónicas, etc.',
    uses: ['Leer una respuesta de una API que llega en una sola línea interminable.', 'Encontrar exactamente dónde está el error de un JSON que no se carga (una coma de más, unas comillas sin cerrar…).', 'Minificar un JSON para pegarlo en un campo o reducir su tamaño.', 'Ordenar las claves para comparar dos JSON con la herramienta «Comparar».', 'Comprobar que un XML está bien formado (etiquetas cerradas, atributos entre comillas).'],
    how: ['Elige <b>JSON</b> o <b>XML</b> arriba (si pegas uno u otro se cambia solo).', 'Pega el texto: se valida automáticamente mientras escribes.', 'Pulsa <b>Formatear</b> para indentarlo, <b>Minificar</b> para dejarlo en una línea u <b>Ordenar claves</b> (solo JSON) para ordenarlas alfabéticamente.', 'Si hay un error, verás la línea y la columna, y el cursor se coloca justo en el carácter que falla.'],
    tip: 'El tabulador dentro del cuadro inserta la sangría elegida en lugar de cambiar de campo.',
    examples: [
      { label: 'Ejemplo JSON', fn: () => { $('#jxMode [data-m="json"]').click(); setVal('jxIn', '{"expediente":"2026/0042","solicitante":{"nombre":"Ana Pérez","nif":"12345678Z"},"documentos":[{"tipo":"DNI","paginas":2},{"tipo":"Justificante","paginas":1}],"urgente":false,"importe":125.5}'); jxRun('validate'); exampleLoaded('JSON de ejemplo cargado en una línea: pulsa «Formatear»'); } },
      { label: 'JSON con error', fn: () => { $('#jxMode [data-m="json"]').click(); setVal('jxIn', '{\n  "nombre": "Ana",\n  "edad": 34,\n  "aficiones": ["leer", "correr",],\n}'); jxRun('format'); exampleLoaded('Mira el mensaje de error: indica la línea y la columna exactas'); } },
      { label: 'Ejemplo XML', fn: () => { $('#jxMode [data-m="xml"]').click(); setVal('jxIn', '<?xml version="1.0" encoding="UTF-8"?><registro id="R-0042"><fecha>2026-10-13</fecha><interesado tipo="fisica"><nombre>Ana Pérez</nombre><nif>12345678Z</nif></interesado><asunto>Solicitud de licencia</asunto><adjuntos/></registro>'); jxRun('validate'); exampleLoaded('XML de ejemplo cargado: pulsa «Formatear»'); } }
    ]
  },
  b64: {
    what: '<b>Base64</b> convierte cualquier dato (texto, imágenes, PDF…) en texto formado solo por letras, números, <code>+</code> y <code>/</code>, para poder enviarlo por canales que solo admiten texto. <b>No es cifrado</b>: cualquiera puede decodificarlo.',
    uses: ['Ver qué contiene una cabecera <code>Authorization: Basic …</code> (usuario:contraseña).', 'Extraer un documento que viene incrustado en Base64 dentro de un JSON o un XML (por ejemplo, un PDF adjunto en un servicio web).', 'Incrustar una imagen pequeña en un HTML o CSS como <i>data URI</i>.', 'Decodificar partes de correos electrónicos o tokens.'],
    how: ['Escribe en «Texto» y verás el Base64 al instante, o pega Base64 a la derecha y verás el texto.', '<b>Archivo → Base64</b> codifica un fichero; luego puedes copiarlo como <i>data URI</i>.', '<b>Base64 → archivo</b> descarga el fichero original a partir del Base64 pegado (si el contenido es binario, como un PDF).', 'Marca <b>URL-safe</b> para la variante que usa <code>-</code> y <code>_</code> (la de los JWT y las URL).'],
    tip: 'Si al decodificar aparece «contenido binario», no es texto: usa «Base64 → archivo» para descargarlo.',
    examples: [{ label: 'Cargar ejemplo', fn: () => { $('#b64Url').checked = false; setVal('b64Plain', ''); setVal('b64Enc', b64enc(te.encode('usuario:contraseña'))); exampleLoaded('Así se ve una cabecera «Basic» decodificada'); } }]
  },
  url: {
    what: 'Las direcciones web solo admiten ciertos caracteres. El resto (espacios, tildes, <code>&amp;</code>, <code>?</code>, <code>#</code>…) se codifica como <code>%XX</code>; por ejemplo, un espacio es <code>%20</code> y la «ñ» es <code>%C3%B1</code>.',
    uses: ['Leer un enlace lleno de <code>%20</code> y <code>%C3%</code>.', 'Preparar el valor de un parámetro que contiene caracteres especiales antes de añadirlo a una URL.', 'Ver de un vistazo los parámetros de una URL larga (filtros de un buscador, redirecciones, parámetros de campañas).'],
    how: ['Escribe el texto normal a la izquierda o pega el texto codificado a la derecha: se convierte al momento.', 'Marca <b>URL completa</b> para codificar una dirección entera sin estropear <code>: / ? &amp; =</code>. Sin marcarla, se codifica todo (lo correcto para el valor de un parámetro).', 'Si escribes una URL completa (que empiece por <code>https://</code>), debajo verás sus partes y una tabla con los parámetros ya decodificados.'],
    examples: [{ label: 'Cargar ejemplo', fn: () => { $('#urlFull').checked = false; setVal('urlPlain', ''); setVal('urlEnc', 'https%3A%2F%2Fejemplo.es%2Fbuscar%3Fq%3Dd%C3%ADas%20h%C3%A1biles%26tipo%3Dley%26pagina%3D2%23resultados'); exampleLoaded('URL decodificada: mira la tabla de parámetros'); } }]
  },
  jwt: {
    what: 'Un <b>JWT</b> (JSON Web Token) es el «pase» que usan muchas aplicaciones para saber quién eres tras iniciar sesión. Tiene tres partes separadas por puntos: <b>cabecera</b>, <b>contenido</b> (los datos o <i>claims</i>) y <b>firma</b>, todas en Base64URL.',
    uses: ['Depurar inicios de sesión y llamadas a APIs (OAuth, OpenID Connect…).', 'Ver para quién es el token (<code>sub</code>), quién lo emitió (<code>iss</code>), qué permisos tiene (<code>scope</code>, <code>roles</code>) y cuándo caduca (<code>exp</code>).', 'Averiguar por qué una API responde 401: muchas veces el token ya ha caducado.'],
    how: ['Pega el token, con o sin el prefijo «Bearer ».', 'Verás la cabecera y el contenido formateados, con las fechas (<code>exp</code>, <code>iat</code>, <code>nbf</code>) en formato legible y un aviso si ha caducado.'],
    tip: 'Esta herramienta no comprueba la firma, solo lee el contenido. Aquí el token no sale de tu navegador, pero evita pegar tokens reales en webs de terceros.',
    examples: [{ label: 'Cargar ejemplo', fn: () => { const now = Math.floor(Date.now() / 1000); setVal('jwtIn', b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) + '.' + b64url(JSON.stringify({ sub: '12345678Z', name: 'Ana Pérez', iss: 'https://auth.ejemplo.es', roles: ['lector', 'tramitador'], iat: now - 600, exp: now + 3000 })) + '.firma-de-ejemplo'); exampleLoaded('Token de ejemplo: caduca dentro de 50 minutos'); } }]
  },
  hash: {
    what: 'Un <b>hash</b> es una «huella digital» de longitud fija calculada a partir de un texto o un archivo. Si cambia un solo carácter, el hash cambia por completo, y no se puede obtener el original a partir del hash.',
    uses: ['Comprobar que un archivo descargado está íntegro y no ha sido manipulado, comparándolo con el hash que publica la web oficial.', 'Saber si dos archivos son idénticos sin abrirlos.', 'Verificar el resumen (huella) de un documento firmado o enviado.'],
    how: ['Elige <b>Texto</b> y escribe, o <b>Archivo</b> y arrastra el fichero (se procesa en tu equipo, no se sube a ningún sitio).', 'Se calculan a la vez MD5, SHA-1, SHA-256, SHA-384 y SHA-512.', 'Pega el hash esperado en el campo de comparación: la fila que coincida se marca en verde.'],
    tip: 'MD5 y SHA-1 sirven para detectar errores, pero ya no son seguros frente a manipulaciones deliberadas. Para seguridad, usa SHA-256 o superior.',
    examples: [{ label: 'Cargar ejemplo', fn: () => { $('#hashMode [data-m="text"]').click(); setVal('hashIn', 'abc'); setVal('hashExpect', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'); exampleLoaded('El SHA-256 de «abc» coincide con el valor esperado'); } }]
  },
  diff: {
    what: 'Compara dos versiones de un texto <b>línea a línea</b> y marca lo añadido (<span class="ok-text">+ verde</span>) y lo eliminado (<span class="bad-text">− rojo</span>).',
    uses: ['Ver qué ha cambiado entre dos versiones de un fichero de configuración, un script SQL o un documento.', 'Revisar los cambios antes de un despliegue o de enviar una nueva versión.', 'Comparar dos JSON (ordénalos antes con «Ordenar claves» en JSON / XML).'],
    how: ['Pega el texto original a la izquierda y el modificado a la derecha.', 'Pulsa <b>Comparar</b>.', 'Opciones: ignorar espacios o mayúsculas; «Solo cambios y contexto» oculta las líneas iguales que están lejos de algún cambio.'],
    tip: 'Una línea modificada aparece como una línea eliminada seguida de una añadida.',
    examples: [{ label: 'Cargar ejemplo', fn: () => { setVal('diffA', 'servidor=pre.ejemplo.es\npuerto=8080\nusuario=app\ntimeout=30\nlog=INFO\ncache=true'); setVal('diffB', 'servidor=pro.ejemplo.es\npuerto=8080\nusuario=app\ntimeout=60\nlog=INFO\ncache=true\nreintentos=3'); runDiff(); exampleLoaded(); } }]
  },
  regex: {
    what: 'Una <b>expresión regular</b> (regex) es un patrón para buscar textos que tienen una forma concreta: fechas, correos, DNI, códigos de expediente… Aquí puedes <b>probarlas</b>, <b>leerlas</b> en castellano y <b>crearlas</b> sin saberte la sintaxis.',
    uses: ['Probar un patrón antes de usarlo en código, en una validación de formulario o en el «buscar y reemplazar» de tu editor.', 'Entender una regex que te has encontrado en un código ajeno (pestaña <b>Explicar</b>).', 'Crear una desde cero con bloques (<b>Construir</b>) o a partir de ejemplos (<b>Desde ejemplos</b>).', 'Partir de patrones habituales ya hechos: DNI, IBAN, fechas, correos, teléfonos… (<b>Biblioteca</b>).', 'Llevártela a Java, Python, JavaScript, C#, PHP o SQL ya escapada (<b>Código</b>).'],
    how: ['Escribe el patrón sin las barras <code>/ /</code>. Debajo lo verás <b>coloreado</b> por partes y con un resumen; pasa el ratón por cada carácter para saber qué significa.', 'Activa los modificadores que necesites (pasa el ratón por cada uno para ver qué hace).', '<b>Probar</b>: pega un texto y verás las coincidencias resaltadas, sus grupos y el reemplazo. Marca «Validar línea a línea» para comprobar una lista de valores.', '<b>Explicar</b>: el patrón traducido pieza a pieza, con avisos de errores típicos.', '<b>Construir</b>: inserta bloques donde está el cursor; los grupos envuelven lo que tengas seleccionado. <b>↶</b> deshace.', '<b>Desde ejemplos</b>: escribe ejemplos que deben (y que no deben) coincidir y te propongo el patrón.'],
    cheat: [['\\d', 'un dígito'], ['\\w', 'letra, número o _'], ['\\s', 'espacio o salto'], ['.', 'cualquier carácter'], ['+', 'una o más veces'], ['*', 'cero o más veces'], ['?', 'opcional'], ['{2,4}', 'entre 2 y 4 veces'], ['^ $', 'inicio / final'], ['[A-Z]', 'un carácter del rango'], ['[^0-9]', 'cualquiera menos esos'], ['( )', 'grupo que captura'], ['(?<año>…)', 'grupo con nombre'], ['a|b', 'a o b'], ['\\b', 'límite de palabra']],
    examples: [
      { label: 'Fechas', fn: () => { rxSetTab('test'); rxSetPattern('(\\d{2})/(\\d{2})/(\\d{4})', 'g'); setVal('rxText', 'Presentado el 13/10/2026, plazo hasta el 26/10/2026.'); setVal('rxRepl', '$3-$2-$1'); $('#rxByLine').checked = false; rxRun(); exampleLoaded('Fechas convertidas de dd/mm/aaaa a aaaa-mm-dd'); } },
      { label: 'Correos', fn: () => { rxSetTab('test'); rxSetPattern('[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+', 'g'); setVal('rxText', 'Contactos: ana.perez@ejemplo.es, soporte@ayto-ejemplo.org; no válido: juan@'); setVal('rxRepl', ''); $('#rxByLine').checked = false; rxRun(); exampleLoaded(); } },
      { label: 'Explicar una regex', fn: () => { rxSetPattern('^(?<usuario>[\\w.+-]+)@(?<dominio>[\\w-]+(\\.[\\w-]+)*\\.[A-Za-z]{2,})$', 'gm'); rxSetTab('explain'); exampleLoaded('Pasa el ratón por las filas para ver cada parte en el patrón'); } },
      { label: 'Crear desde ejemplos', fn: () => { rxSetTab('infer'); setVal('rxInfPos', '2026/0042\n2025/1234\n2024/7'); setVal('rxInfNeg', '26/0042\n2026-0042'); rxInfer(); exampleLoaded('Patrón propuesto a partir de los ejemplos'); } }
    ]
  },
  uuid: {
    what: 'Un <b>UUID</b> es un identificador de 128 bits, como <code>3f2b8c1e-7d4a-4f6b-9c2e-1a5d8e7f0b3c</code>. La versión 4 es aleatoria: la probabilidad de que se repita uno es prácticamente nula.',
    uses: ['Claves primarias o identificadores de registros que no deben chocar entre sistemas.', 'Datos de prueba, nombres de fichero únicos o identificadores de correlación en logs.', 'Claves de idempotencia en llamadas a APIs.'],
    how: ['Elige cuántos quieres y el formato (mayúsculas, sin guiones).', 'Pulsa <b>Generar UUID v4</b> y luego <b>Copiar</b> (uno por línea).'],
    tip: 'Se generan con el generador criptográfico del navegador.',
    examples: [{ label: 'Generar 10', fn: () => { $('#uuidN').value = 10; genUuids(); exampleLoaded('10 UUID generados'); } }]
  },
  time: {
    what: 'El <b>tiempo Unix</b> (epoch) es el número de segundos —o milisegundos— transcurridos desde el 1 de enero de 1970 a las 00:00 UTC. Es como guardan las fechas muchas bases de datos, logs y APIs.',
    uses: ['Entender una fecha que aparece como <code>1760000000</code> en un log, una base de datos o un JWT.', 'Obtener el epoch de una fecha concreta para una consulta o una prueba.', 'Saber la semana ISO o el día del año de una fecha.'],
    how: ['Pega un número a la izquierda: se detecta solo si son segundos (10 dígitos) o milisegundos (13).', 'O elige una fecha y hora local a la derecha para obtener su epoch.', 'Arriba tienes el instante actual, con botón para copiarlo.'],
    tip: 'El epoch siempre es UTC. La hora «local» que ves depende de la zona horaria de tu equipo (en España, UTC+1 en invierno y UTC+2 en verano).',
    examples: [{ label: 'Cargar ejemplo', fn: () => { setVal('epIn', '1760000000'); const d = new Date(); setVal('epDate', `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`); exampleLoaded(); } }]
  },
  valid: {
    what: 'Comprueba el <b>carácter de control</b> de documentos y cuentas españolas: la letra del <b>DNI/NIF</b>, el <b>NIE</b> (empieza por X, Y o Z), el <b>CIF</b> o NIF de entidades (letra de tipo de entidad + dígito o letra de control) y el <b>IBAN</b> (control internacional y, en cuentas españolas, también los dígitos de control nacionales).',
    uses: ['Detectar errores de tecleo en formularios, cargas masivas o migraciones de datos.', 'Saber qué tipo de entidad es un CIF: P corporación local, Q organismo público, S órgano de la Administración, B sociedad limitada…', 'Convertir una cuenta antigua de 20 dígitos (CCC) en su IBAN.', 'Calcular la letra de un DNI a partir de sus 8 números.'],
    how: ['Escribe o pega el valor, con o sin espacios y guiones.', 'El tipo se detecta automáticamente y verás si es válido y sus datos.'],
    tip: '«Válido» significa que está bien formado, no que el documento o la cuenta existan realmente.',
    examples: [
      { label: 'DNI', fn: () => setVal('valIn', '12345678Z') },
      { label: 'Letra de DNI', fn: () => setVal('valIn', '12345678') },
      { label: 'NIE', fn: () => setVal('valIn', 'X1234567L') },
      { label: 'CIF', fn: () => setVal('valIn', 'Q2826000H') },
      { label: 'IBAN', fn: () => setVal('valIn', 'ES91 2100 0418 4502 0005 1332') },
      { label: 'CCC → IBAN', fn: () => setVal('valIn', '2100 0418 45 0200051332') }
    ]
  },
  text: {
    what: 'Contador y transformaciones rápidas de texto.',
    uses: ['Contar caracteres o palabras para campos con límite (asuntos, SMS, resúmenes, redes sociales).', 'Convertir nombres a <code>camelCase</code>, <code>snake_case</code> o <code>CONSTANT_CASE</code> para código o columnas de base de datos.', 'Generar <i>slugs</i> para URL o nombres de fichero.', 'Limpiar listas: ordenar, quitar duplicados y líneas vacías, numerar.', 'Quitar tildes para sistemas antiguos que no las admiten.'],
    how: ['Pega el texto: encima de los botones verás caracteres, palabras, líneas, bytes y tiempo de lectura.', 'Pulsa una transformación; las de formato de código se aplican línea a línea.', '<b>Deshacer</b> recupera el texto anterior.'],
    examples: [{ label: 'Cargar ejemplo', fn: () => { setVal('txIn', 'Fecha de Presentación\nNúmero de Expediente\nnombre del interesado\nFecha de Presentación\n\nImporte Total'); exampleLoaded('Prueba «Quitar duplicadas», «snake_case» o «Ordenar A→Z»'); } }]
  }
};

function devHelpHtml(id, h) {
  const list = arr => `<ul>${arr.map(x => `<li>${x}</li>`).join('')}</ul>`;
  return `<details class="tool-help" data-help="${id}">
    <summary>ℹ️ Qué es y cómo se usa</summary>
    <div class="tool-help-body">
      <p>${h.what}</p>
      <div class="tool-help-cols">
        <div><h5>¿Para qué sirve?</h5>${list(h.uses)}</div>
        <div><h5>Cómo usarlo</h5><ol>${h.how.map(x => `<li>${x}</li>`).join('')}</ol></div>
      </div>
      ${h.cheat ? `<h5>Chuleta</h5><div class="cheat">${h.cheat.map(([c, d]) => `<span><code>${esc(c)}</code> ${esc(d)}</span>`).join('')}</div>` : ''}
      ${h.tip ? `<p class="tool-help-tip">💡 ${h.tip}</p>` : ''}
      <div class="row">${h.examples.map((e, i) => `<button class="btn sm${i === 0 ? ' primary' : ''}" data-example="${i}">✨ ${esc(e.label)}</button>`).join('')}</div>
    </div>
  </details>`;
}
function initDevHelp() {
  const open = store.get('devHelpOpen', true) !== false;
  Object.entries(DEV_HELP).forEach(([id, h]) => {
    const pane = $(`.tool-pane[data-pane="${id}"]`);
    if (!pane || $('.tool-help', pane)) return;
    pane.insertAdjacentHTML('afterbegin', devHelpHtml(id, h));
    $('.tool-help', pane).open = open;
  });
}
$('#view-devtools').addEventListener('click', e => {
  const b = e.target.closest('[data-example]'); if (!b) return;
  const id = b.closest('[data-help]').dataset.help;
  DEV_HELP[id].examples[+b.dataset.example].fn();
});
$('#view-devtools').addEventListener('toggle', e => {
  if (!e.target.matches || !e.target.matches('details.tool-help')) return;
  const open = e.target.open;
  store.set('devHelpOpen', open);
  $$('details.tool-help').forEach(d => { if (d !== e.target && d.open !== open) d.open = open; });
}, true);
