# Abrir el exe y alojar el bot por turnos

El modo compartido usa el proyecto gratuito de Supabase del equipo. Los datos se guardan cifrados en línea y la base decide cuál PC puede ejecutar el bot. No hay que preparar ni pasarse archivos al cambiar de anfitrión.

## Una sola vez por PC

1. Descargar la carpeta completa actualizada de GitHub y extraerla del ZIP. Abrir **Agente-Canino.exe** dentro de esa carpeta; se puede crear un acceso directo en el escritorio.
2. Un administrador ya vinculado abre **Código para el equipo**, elige **Copiar código** y lo comparte por privado con los otros administradores. Ese código permite alojar el bot: no publicarlo en GitHub, canales del servidor ni capturas.
3. En la PC nueva, elegir **Vincular esta PC**, pegar ese código completo y confirmar. La app prepara los componentes que falten, comprueba el acceso y comienza. No hace falta crear otro bot, copiar el token, tocar .env ni volver a instalar los canales de Discord.

## A partir de entonces

Solo abrir **Agente-Canino.exe**. Si otra PC está alojando el bot, aparecerá **En espera automática**. Cuando quede libre, toma el relevo con los datos actualizados. Se puede cerrar la ventana: el proceso activo o en espera sigue funcionando en segundo plano.

**Detener en esta PC** apaga esa instancia y, cuando es posible, libera el control después de guardar los cambios. Si se apaga de golpe o pierde Internet, el permiso anterior vence a los 45 segundos; la PC que espera vuelve a comprobar y conecta. Normalmente el cambio tarda alrededor de un minuto si hubo un apagado brusco. No es una promesa de conexión instantánea.

Cada anfitrión debe tener la PC encendida y conectada a Internet. Si todas las PC están apagadas, el bot no responde. El exe no se abre automáticamente al iniciar Windows. Si el servicio de datos no está disponible, el bot espera; nunca inicia con una copia local antigua ni permite dos anfitriones autorizados al mismo tiempo.

## Qué queda privado

- `data/cloud-access.json`: acceso de esta PC. No compartir la carpeta data/ completa.
- `data/cloud-state/`: copia de trabajo local, reconstruida desde la base compartida al tomar el control.
- `data/cloud-invite.txt`: código de vinculación generado por el botón del equipo.
- `.env`, copias de seguridad y registros: no se suben a GitHub.

`community.json` contiene únicamente identificadores y la clave **publicable** de Supabase. Puede estar en GitHub; no permite leer ni modificar los datos sin el código privado. La clave secreta/service_role del proyecto no forma parte de la app. El código de vinculación es el permiso del equipo: no entregarlo a usuarios comunes.

## Servicio gratuito y recuperación

El [plan Free de Supabase](https://supabase.com/pricing) no tiene cuota mensual de pago y dispone de límites de almacenamiento y transferencia. Sus proyectos pueden pausarse después de una semana de inactividad; si sucede, un administrador tiene que reactivarlo desde el panel. No se contrató un plan pago ni se configuró una tarjeta. El asistente admite bases locales de hasta 8 MiB por copia cifrada. Los adjuntos siguen alojados en Discord; no se guardan imágenes y videos dentro de esta base.

El bot conserva permisos, idiomas, tickets, sugerencias y trabajos de novedades. Antes de efectuar una solicitud a Discord, confirma que los cambios anteriores están guardados en la copia compartida. La base usa un dueño, un número de turno creciente y una versión de datos para rechazar a una PC anterior, incluso si despierta después de suspenderse. Si falla el guardado o vence el permiso, esa PC cancela solicitudes y deja de responder. Las peticiones que Discord ya haya recibido se recuperan según las reglas de cada función; este sistema no promete exactamente una ejecución para todas las acciones externas.

Para el mantenimiento, seguir AGENTS.md. No borrar `data/cloud-access.json` ni permitir que scripts antiguos escriban sobre la copia compartida. La base local original anterior a la migración se conserva como respaldo; no usarla para iniciar otra instancia de producción.
