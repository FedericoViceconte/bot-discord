# Instrucciones para trabajar en el bot

## Repositorio compartido

- Repositorio autorizado: https://github.com/federicoviceconte5-jpg/bot-discord.git.
- El usuario pidió que, después de cada cambio solicitado en este bot, se hagan los commits y se suban los cambios a este repositorio. Esa subida está autorizada; no es necesario pedir confirmación cada vez.
- Antes de modificar, revisar el estado local y traer las referencias remotas. Integrar los cambios de los compañeros sin sobrescribir trabajo ajeno. No usar push forzado ni restablecer cambios de otros.
- Revisar los archivos preparados para el commit. Subir únicamente código, documentación, pruebas y recursos de ejemplo del bot.
- Nunca subir .env, credenciales, tokens, data/, bases SQLite, mensajes privados, registros de ejecución, copias de seguridad o node_modules. .env.example es una plantilla sin credenciales.
- Si faltan permisos de GitHub o hay un conflicto que requiere una decisión del equipo, preservar el trabajo local e informar el problema. No afirmar que una subida se completó sin verificar el remoto.

## Funcionamiento y límites acordados

- WO EQUIPO, voz privado y los demás canales privados existentes de los administradores están protegidos. No cambiar nombres, ubicación, permisos ni contenido; no crear canales dentro de esa categoría.
- El ingreso tiene un único selector de idioma. Después de elegir, se oculta la entrada y se habilita solo la comunidad del idioma elegido. Los administradores ven todos los canales por los permisos de Discord.
- Hay cinco idiomas: español, inglés, portugués, francés y alemán.
- Confirmar el cierre de un ticket elimina su canal. Solo Administrador puede usar /ticket-reabrir; crea un canal nuevo con el asunto y la consulta inicial guardados. Mantener recuperación persistente de cierres pendientes y evitar borrar espacios ajenos a tickets.
- El asistente Jarvis y la reproducción de voz fueron retirados. No reintroducirlos ni activar OpenAI sin un pedido explícito del usuario.
- Las novedades se originan solo en el canal privado configurado de publicaciones y solo por administradores. El bot prepara las traducciones y copia los adjuntos a cada idioma con su propia identidad. Usa MyMemory gratuito, con cuota y caché; no usa OpenAI para ese flujo.
- No recrear WO ARCHIVO si archiveRetired está activado.

## Desarrollo y operación

- Node.js 24.17 o superior; módulos ESM, discord.js y SQLite local de Node.
- Para cambios de código ejecutar npm test y npm run check. Las pruebas locales no necesitan tokens reales ni deben hacer llamadas a servicios pagos.
- Para colaborar no hace falta copiar .env ni la base de producción. Cada desarrollador puede usar su propia aplicación y servidor de pruebas de Discord.
- Ejecutar una sola instancia por servidor/base. No iniciar otra instancia de producción mientras la anterior siga activa.
- En Windows, los scripts de inicio y reinicio comprueban el PID, fecha y ruta del proceso. No detener procesos que no pertenezcan a este bot.
- Guardar las credenciales del despliegue en el hosting; conservar SQLite en almacenamiento persistente. Publicar código en GitHub no migra el proceso que actualmente se ejecuta en la PC.
