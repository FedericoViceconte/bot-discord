# Instrucciones para trabajar en el bot

## Repositorio compartido

- Repositorio: https://github.com/federicoviceconte5-jpg/bot-discord.git.
- Después de cada cambio solicitado en el bot, hacer el commit y subirlo a este repositorio.
- Antes de modificar, revisar el estado local y traer las referencias remotas. Integrar los cambios de los compañeros sin sobrescribir trabajo ajeno. No usar push forzado ni restablecer cambios de otros.
- Revisar los archivos preparados para el commit. Subir únicamente código, documentación, pruebas y recursos de ejemplo del bot.
- Nunca subir .env, credenciales, tokens, data/, bases SQLite, mensajes privados, registros de ejecución, copias de seguridad o node_modules. .env.example es una plantilla sin credenciales.
- Si faltan permisos de GitHub o hay un conflicto que requiere una decisión del equipo, preservar el trabajo local e informar el problema. No afirmar que una subida se completó sin verificar el remoto.

## Funcionamiento y límites acordados

- WO EQUIPO, voz privado y los demás canales privados existentes de los administradores están protegidos. No cambiar nombres, ubicación, permisos ni contenido; no crear canales dentro de esa categoría.
- El ingreso tiene un único selector de idioma. Después de elegir, se oculta la entrada y se habilita solo la comunidad del idioma elegido. Los administradores ven todos los canales por los permisos de Discord.
- Hay cinco idiomas: español, inglés, portugués, francés y alemán.
- Confirmar el cierre de un ticket elimina su canal. Solo Administrador puede usar /ticket-reabrir; crea un canal nuevo con el asunto y la consulta inicial guardados. Mantener recuperación persistente de cierres pendientes y evitar borrar espacios ajenos a tickets.
- El asistente Jarvis y la reproducción de voz fueron retirados. No reintroducirlos ni activar OpenAI sin un pedido explícito del equipo.
- Las novedades se originan solo en el canal privado configurado de publicaciones y solo por administradores. El bot prepara las traducciones y copia los adjuntos a cada idioma con su propia identidad. Usa MyMemory gratuito, con cuota y caché; no usa OpenAI para ese flujo.
- No recrear WO ARCHIVO si archiveRetired está activado.

## Desarrollo y operación

- El relevo entre las PC es automático y gratuito, sin pasarse archivos en cada cambio. El modo activo usa Supabase Free, comunidad pública en community.json y acceso privado en data/cloud-access.json. No contratar planes pagos ni activar facturación.
- Mantener el control remoto con dueño, epoch y revisión; ninguna PC debe conectar Discord sin adquirirlo ni usar datos locales antiguos si falla el servicio. Conservar el reloj monotónico, los márgenes, la cancelación y la guarda en cada petición de red de Discord, incluso después de límites de frecuencia. Confirmar cambios pendientes en la base compartida antes de enviar una respuesta.
- La copia de trabajo está en data/cloud-state/guardian.sqlite; el SQLite original es un respaldo previo a la migración. No escribir sobre esa copia antigua como si fuera producción. En modo compartido, instalar canales solo desde el bot activo mediante /instalar.
- Cada PC se vincula una vez con un código privado. Nunca subir data/cloud-*.json, códigos WO1., secretos de acceso, copias SQLite o tokens a GitHub ni mostrarlos en respuestas. community.json usa una clave publicable; nunca distribuir una clave sb_secret_ o service_role. Las funciones SQL no deben dar lectura pública a las tablas privadas.
- No afirmar conexión instantánea o disponibilidad con todas las PC apagadas. El permiso remoto vence a los 45 segundos, más el sondeo y arranque; la opción gratuita puede pausarse por inactividad. Mantener la detención coordinada antes de liberar el control y las pruebas de PGlite, vencimiento, doble anfitrión y persistencia.

- Node.js 24.17 o superior; módulos ESM, discord.js y SQLite local de Node.
- Para cambios de código ejecutar npm test y npm run check. Las pruebas locales no necesitan tokens reales ni deben hacer llamadas a servicios pagos.
- Para colaborar no hace falta copiar .env ni la base de producción. Cada desarrollador puede usar su propia aplicación y servidor de pruebas de Discord.
- Ejecutar una sola instancia por servidor/base. No iniciar otra instancia de producción mientras la anterior siga activa.
- El alojamiento gratuito por turnos está documentado en docs/alojamiento-automatico.md y el relevo manual en docs/relevo-manual.md; los scripts .cmd están en scripts/windows/. Mantener el cifrado y las exclusiones de .wohost/relevos/. El botón 7 detiene y exporta la base actual; el 8 importa con respaldo; el 5 inicia en segundo plano. No incluir credenciales ni copias de producción en pruebas, commits o respuestas. El bloqueo es local; nunca afirmar que detecta otra PC o realiza un relevo automático.
- Agente-Canino.exe es el panel de Windows; su fuente es launcher/AgenteCanino.cs. El exe no se versiona en Git: se publica en Releases dentro de WO-Guardian-Windows.zip. Si cambia esa fuente, recompilar con scripts/build-launcher.ps1 y publicar una nueva versión. No incluir runtimes, node_modules o credenciales dentro del exe. Mantener .runtime/ fuera de Git y Docker. El runtime portátil se obtiene de nodejs.org y se verifica con SHASUMS256.txt. Preservar data/host-handoff.json: evita el inicio automático de la copia que ya preparó un relevo; una importación correcta elimina la pausa.
- En Windows, los scripts de inicio y reinicio comprueban el PID, fecha y ruta del proceso. No detener procesos que no pertenezcan a este bot.
- Guardar las credenciales del despliegue en el hosting; conservar SQLite en almacenamiento persistente. Publicar código en GitHub no migra el proceso que actualmente se ejecuta en la PC.
