# WO Guardian · Definitive Edition

Bot de comunidad con bienvenida, idiomas, soporte privado, sugerencias y anuncios. OpenAI está desactivado y no hay asistente ni reproducción de voz. Las novedades automáticas se traducen gratuitamente con MyMemory.

**El equipo usa alojamiento automático gratuito entre PC.** Una vez vinculada cada PC desde el exe, solo hay que abrirlo: la comunidad elige un anfitrión, comparte los datos cifrados y toma el relevo cuando el anterior se desconecta. Ya no hay que pasarse archivos en cada cambio. Ver **[ALOJAMIENTO-AUTOMATICO.md](ALOJAMIENTO-AUTOMATICO.md)**. La selección inicial se realiza con **Vincular esta PC** y el código privado de un administrador; **Código para el equipo** permite copiarlo. Una PC en espera puede cerrar la ventana y seguir esperando en segundo plano. Tras un apagado brusco, el cambio suele tardar alrededor de un minuto. Si todas las PC están apagadas, el bot permanece desconectado.

En Windows, extraé la carpeta completa y abrí **Agente-Canino.exe**. Tiene botones para iniciar, detener, preparar la PC y vincular el acceso compartido; no hace falta abrir los CMD. Podés cerrar la ventana: el bot sigue activo o esperando en segundo plano. Para tenerlo en el escritorio, creá un acceso directo; no muevas el exe fuera de su carpeta. Los botones de relevo por archivo solo se muestran en instalaciones independientes que no tienen comunidad compartida.

La primera preparación usa Node.js 24.17 o superior ya instalado o descarga una versión portátil de la rama 24 del [sitio oficial de Node.js](https://nodejs.org/dist/index.json), comprueba el SHA-256 del archivo y la guarda en `.runtime/`. No necesita permisos de Administrador ni modifica el inicio o PATH de Windows. Instala los componentes con el lockfile del repositorio; necesita Internet la primera vez. La PC debe permanecer encendida; también se incluye Docker para un servidor permanente. Los CMD anteriores siguen disponibles.

## Código compartido

Repositorio del equipo: https://github.com/federicoviceconte5-jpg/bot-discord.

Cada integrante puede clonar el repositorio, abrirlo con su IA y seguir AGENTS.md. Antes de editar debe traer los cambios remotos; al terminar un cambio de código debe ejecutar npm test y npm run check, revisar el commit y subirlo. No incluir .env, data/, tokens ni bases de producción. Para probar se puede usar una aplicación y servidor de Discord propios.

El usuario autorizó subir a este repositorio los cambios que solicite en el bot. Esa instrucción corresponde al trabajo realizado por el asistente; no instala un monitor de archivos ni sincroniza automáticamente ediciones hechas por otros programas.

## Funciones

- Ingreso: asigna el rol configurado. Antes de elegir idioma solo se ve 🌐・idioma-language.
- Idiomas: español, inglés, portugués, francés y alemán. Al elegir se oculta la entrada y se abre únicamente la comunidad del idioma elegido. Las cuentas administradoras ven todos los canales por los permisos de Discord.
- Bienvenida: tarjeta personalizada y saludo en el idioma elegido, una vez por ingreso. Cambiar idioma no repite el saludo.
- Cada comunidad tiene bienvenida, central, cambiar idioma, soporte, ideas, novedades, chat y voz. Los canales de voz son para los miembros; el bot no entra a hablar ni captura micrófonos.
- Tickets: categorías general, cuenta, error, reporte de jugador y apelación. Un ticket abierto por persona, formulario, asignación a soporte, cierre confirmado con eliminación del canal y reapertura exclusiva de administradores.
- Sugerencias: formulario, votos por persona y estados administrados por soporte.
- Novedades automáticas: un mensaje con texto y adjuntos en el canal privado de publicaciones se envía como bot, traducido a los cinco idiomas. Solo los administradores pueden originarlo.

## Espacios privados

WO · SOPORTE PRIVADO aloja los canales de tickets. Cada ticket permite acceso a su autor, al rol de soporte y al bot. Los administradores también pueden acceder. Al confirmar el cierre se elimina el canal. Se conserva en SQLite el número, autor, categoría, idioma, asunto y consulta inicial. La reapertura no recupera la conversación completa eliminada: crea un canal nuevo con la consulta inicial. Solo los administradores pueden usar /ticket-reabrir id:NUMERO, incluso si el autor tiene el rol de soporte. Los tickets cerrados no tienen botón Reabrir.

WO EQUIPO y sus canales privados de los administradores están protegidos: la instalación no cambia sus nombres, ubicación ni permisos, ni recrea canales eliminados dentro de ese espacio.

WO ARCHIVO y sus paneles obsoletos fueron eliminados a pedido del administrador. La configuración archiveRetired impide volver a crearlos.

## Comandos

| Comando | Acceso | Función |
| --- | --- | --- |
| /instalar | Administrador | Crea o actualiza los recursos registrados sin duplicarlos. |
| /configurar | Administrador | Rol de ingreso, soporte y destinos de bienvenida, ideas, anuncios y registros. |
| /panel | Administrador | Publica o actualiza un panel de central, idiomas, tickets o sugerencias. |
| /diagnostico | Administrador | Revisa permisos, roles y configuración. |
| /ticket-reabrir id:NUMERO | Administrador | Reabre una consulta cerrada en un canal privado nuevo. |
| /idioma | Todos | Elige o cambia el idioma. |
| /sugerir | Todos | Abre el formulario de sugerencias. |
| /sugerencia | Soporte | Cambia estado y nota de una propuesta. |
| /anunciar | Administrador | Publica un anuncio manual en la comunidad actual. |
| /novedades-idioma | Administrador | Cambia el idioma de origen de los próximos mensajes. |
| /novedades-reintentar id:NUMERO | Administrador | Reintenta destinos pendientes sin repetir los completados. |
| /ayuda | Todos | Muestra la central. |

El rol del bot debe estar por encima del rol de ingreso y de los roles de idioma. No requiere Administrador. Es necesario activar SERVER MEMBERS INTENT y MESSAGE CONTENT INTENT. Los roles de idioma tienen cero permisos globales; acceden mediante excepciones de sus categorías.

## Publicar novedades en todos los idiomas

En 📢 WO · PUBLICACIONES hay dos canales visibles solo para administradores:

1. 📝・publicar-novedades: cada mensaje nuevo de un administrador se trata como una novedad. Escribí el texto y adjuntá las imágenes, videos o archivos al mismo mensaje. Por defecto el original se interpreta en español.
2. 📋・estado-de-envíos: muestra preparación, destinos completados y errores. La publicación pública sale con el nombre y avatar del bot.

El bot prepara todas las traducciones antes de publicar. Copia los adjuntos sin transformarlos: no traduce texto dentro de imágenes ni audio o subtítulos de videos. Admite hasta 10 adjuntos y 24 MiB en total por novedad, sujeto también a los límites de subida de Discord. Para videos más grandes se puede publicar un enlace. El contenido original no debe superar 8.000 caracteres.

MyMemory recibe solamente los fragmentos de texto que deben traducirse; los adjuntos no se envían al traductor. Se conservan enlaces, menciones, saltos de línea y código. Las menciones públicas no generan notificaciones masivas. Solo se procesa el canal de publicaciones configurado, nunca conversaciones de otros canales.

La [API gratuita de MyMemory](https://mymemory.translated.net/doc/usagelimits.php) tiene un límite anónimo de 5.000 caracteres diarios, compartido entre los cuatro idiomas traducidos. La caché local evita repetir consultas. Las peticiones se dividen en segmentos de menos de 500 bytes UTF-8, como indican sus [especificaciones](https://mymemory.translated.net/doc/spec.php). Puede haber límites de disponibilidad o errores de traducción automática. No se usa OpenAI ni se necesitan claves nuevas.

Si falla el traductor, no se inicia la publicación. Si falla Discord durante un envío, se conserva el estado de cada destino y /novedades-reintentar continúa los pendientes. Las partes enviadas se identifican con un registro persistente, nonce y referencia en el pie para recuperar respuestas de red ambiguas. Editar o borrar el original no edita las copias públicas: publicá una nueva novedad para corregirla. Al reiniciar se recuperan trabajos pendientes y se revisan los últimos 100 mensajes del canal desde su activación.

La traducción manual heredada de /anunciar conserva su implementación opcional de OpenAI; permanece desactivada con AI_ENABLED=false. Esa configuración no afecta al traductor gratuito de novedades.

## Datos y operación

En el modo compartido, `src/host-runtime.js` coordina el arranque y la detención, `src/cloud.js` sincroniza instantáneas cifradas de SQLite y `cloud/supabase.sql` implementa un control de 45 segundos con turnos y revisión de datos. La copia local de trabajo está en `data/cloud-state/guardian.sqlite`. Antes de cada petición real de Discord, incluyendo reintentos y peticiones que esperaron un límite de frecuencia, se verifica el control y se sincronizan cambios pendientes. El límite local conservador de 33 segundos usa un reloj monotónico desde el inicio de cada petición; una respuesta tardía o despertar del equipo no extienden el permiso. Las peticiones en curso tienen un tiempo máximo y se cancelan al perder el control. Los guardados se serializan y usan comparación de versiones; los registros de acceso no se incluyen en instantáneas.

El almacenamiento compartido utiliza AES-256-GCM y una clave derivada con HKDF del código privado. Supabase guarda solo la copia cifrada y el hash del código. El cliente usa una clave publicable/anon y una única función limitada; no se distribuyen claves secretas del proyecto. Las tablas privadas tienen RLS y no tienen permisos de lectura de los roles públicos. La activación inicial usa `scripts/cloud-admin.js`; vincular una PC usa `scripts/cloud-client.js`. El cliente instalado no contiene contraseñas de la base PostgreSQL. Las pruebas de PostgreSQL usan PGlite local y credenciales falsas.

### Alternativa manual para instalaciones independientes

Lo siguiente describe el modo anterior, sin comunidad compartida. El equipo configurado con `community.json` usa el relevo automático descrito arriba y no necesita pasar archivos.

El panel de Windows utiliza los mismos scripts y la misma base; no contiene credenciales ni el runtime de Node embebidos. Su fuente está en `launcher/AgenteCanino.cs`. Para reconstruir `Agente-Canino.exe`, ejecutar `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-launcher.ps1` en Windows con .NET Framework. No requiere instalar Visual Studio. Se incluye el exe compilado para que el equipo pueda abrirlo directamente. `Pasar a un amigo` guarda una marca local para que reabrir el panel no reinicie esa copia después de exportar; recibir el relevo actualizado elimina la pausa. La selección de anfitrión entre PC sigue siendo manual. La app no se inicia automáticamente al encender Windows.

Para alojarlo gratis por turnos en las PC del equipo: **[RELEVO-ENTRE-AMIGOS.md](RELEVO-ENTRE-AMIGOS.md)**. `5-INICIAR.cmd` inicia en segundo plano y espera confirmación de conexión; `6-DETENER.cmd` detiene solo el proceso registrado de esta carpeta. `7-PREPARAR-RELEVO.cmd` detiene el bot y genera una copia portátil cifrada con AES-256-GCM y una clave derivada mediante scrypt. `8-RECIBIR-RELEVO.cmd` pide contraseña, comprueba el archivo y conserva un respaldo antes de reemplazar la base y `.env`. Solo traslada las credenciales de Discord, desactiva OpenAI y normaliza `DATA_DIR=./data`; no incluye claves de otros servicios. Si la PC receptora usa otra ruta de datos, se requiere recibir el relevo en una descarga nueva. `9-DIAGNOSTICO.cmd` valida requisitos locales sin mostrar el token. Se requiere Windows con Node.js 24.17 o superior; el asistente admite bases de hasta 128 MiB.

Siempre generar un relevo nuevo desde el anfitrión actual. No usar copias antiguas: no existe mezcla automática de bases de datos ni elección automática del anfitrión. El bloqueo de arranque evita instancias simultáneas del mismo bot en una PC, incluso en carpetas distintas; entre varias PC deben coordinar el cambio manualmente. Los archivos `.wohost` y `relevos/` se excluyen tanto de Git como del contexto de Docker.

La configuración, idiomas, ingresos, tickets, sugerencias, votos y anuncios se guardan en data/guardian.sqlite. No publiques data/, .env ni credenciales. Para una copia consistente, detené el bot y copiá toda la carpeta data/ junto con .env a un lugar privado.

Ejecutá una sola instancia del bot por base de datos. El proceso en segundo plano se administra con scripts/start-background.ps1, scripts/stop-background.ps1 y scripts/restart-background.ps1; comprueban el PID, la fecha de inicio y la ruta antes de detener o reutilizar un proceso. Sus salidas están en data/runtime.log y data/runtime.err.log. No se instaló inicio automático de Windows.

Para registrar comandos: npm run register. Para validar código y componentes: npm run check. Para probar: npm test. npm run audit-server comprueba permisos y paneles reales. Se puede indicar una copia de permisos reciente con --baseline RUTA.

La auditoría histórica conserva también el estado previo de los privados. Cualquier diferencia debe revisarse; no restablece ni modifica permisos automáticamente. Las pruebas de usuario real se deben hacer desde una cuenta sin Administrador.

Un cierre pendiente reserva al autor hasta completar la eliminación. Si Discord falla o el proceso se reinicia, la limpieza reintenta los tickets cerrados o pendientes cada minuto, comprobando su categoría y marca de propietario. Nunca elimina canales de WO EQUIPO ni canales privados de administradores.
