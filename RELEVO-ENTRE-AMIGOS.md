# Alojar el mismo bot por turnos, gratis

**El equipo ya usa [ALOJAMIENTO-AUTOMATICO.md](ALOJAMIENTO-AUTOMATICO.md): no necesita estos archivos de relevo.** Vincular cada PC una vez y después abrir el exe. Esta guía queda únicamente como alternativa para bots independientes sin `community.json` ni acceso compartido.

Cada uno puede usar su PC con Windows. Solo una PC ejecuta el bot a la vez. Tener Discord abierto no inicia el programa. Si todas las PC están apagadas, el bot estará desconectado. El relevo es manual; no hay detección de otras computadoras ni sincronización por GitHub.

## Con la app, sin CMD

1. Descargar la versión nueva de GitHub, extraer toda la carpeta y abrir **Agente-Canino.exe**. Dejarlo en esa carpeta; para el escritorio se puede crear un acceso directo.
2. El anfitrión actual elige **Pasar a un amigo**, confirma la parada y crea una contraseña. La app abre `relevos/` con el archivo cifrado nuevo. Le pasa ese archivo por privado a su amigo y la contraseña por separado.
3. El amigo abre el exe, elige **Recibir y comenzar**, confirma que el otro anfitrión ya detuvo su copia, selecciona el último archivo e ingresa la contraseña. La app prepara los componentes que falten, recibe los datos con respaldo e inicia el bot. La primera vez necesita Internet; si falta Node, usa una copia portátil sin instalarla en Windows.
4. Para devolver el bot, el nuevo anfitrión genera otro relevo con **Pasar a un amigo**. No devuelve el archivo viejo que recibió.

Al abrir de nuevo la app inicia el bot si ya tiene sus datos, excepto si esa PC preparó un relevo: en ese caso queda en pausa hasta recibir una copia actualizada. Si el amigo nunca llegó a usar el relevo y está detenido, se puede elegir **Iniciar bot** y confirmar la reanudación. La app no comprueba si otra PC está conectada. Cerrar la ventana deja el bot funcionando; **Detener en esta PC** lo apaga. Encender Windows no abre la app por sí solo.

Los pasos siguientes con CMD son una alternativa a la ventana; usan los mismos datos y no necesitan ejecutarse si usás la app.

## Primera vez en la PC de tu amigo

1. Descargar o actualizar el código de https://github.com/federicoviceconte5-jpg/bot-discord. Si descarga un ZIP, primero debe extraerlo entero y abrir la carpeta que contiene los archivos numerados.
2. Instalar Node.js 24.17 o superior desde https://nodejs.org/ y abrir **1-INSTALAR.cmd**. Si acaba de instalar Node, cerrar y volver a abrir la ventana del instalador del bot.
3. Recibir del anfitrión actual el archivo **.wohost** más reciente y su contraseña. Descargarlo a la PC.
4. Abrir **8-RECIBIR-RELEVO.cmd**, escribir RECIBIR, seleccionar el archivo e introducir la contraseña. Si ya tiene su bot abierto, detenerlo antes con **6-DETENER.cmd**.
5. Cuando el anfitrión anterior confirme que detuvo su copia, abrir **5-INICIAR.cmd**. Debe decir **CONECTADO**. Puede cerrar la ventana: el proceso sigue funcionando en segundo plano.

No crear otra aplicación, no regenerar el token y no volver a ejecutar /instalar ni registrar comandos para un relevo. El archivo ya incluye las credenciales del mismo bot y la base del servidor. No es necesario pasar `.env` por chat ni copiar sus valores a mano. La contraseña se escribe de forma oculta; no la olviden.

## Cada vez que cambian de anfitrión

**Quien está alojando:**

1. Abrir **7-PREPARAR-RELEVO.cmd**, escribir RELEVO y elegir una contraseña de al menos 12 caracteres, dos veces.
2. El asistente detiene su proceso del bot, toma una copia consistente de SQLite y crea un archivo cifrado dentro de **relevos/**. No copia registros, auditorías, mensajes de diagnóstico ni otras claves de API.
3. Pasar ese archivo por un medio privado al siguiente anfitrión y la contraseña por separado. Avisarle que su copia ya está detenida. No volver a abrir 5-INICIAR mientras el amigo lo esté alojando.

**Quien recibe:** abrir **8-RECIBIR-RELEVO.cmd** con el último archivo y después **5-INICIAR.cmd**. Al terminar su turno, genera un relevo NUEVO con **7-PREPARAR-RELEVO.cmd** y lo devuelve al siguiente. Nunca reutilizar el archivo de la ida para la vuelta: perderían cambios de idiomas, tickets y publicaciones.

El importador conserva la configuración y base anteriores en `data/respaldos-relevo/`. Ese respaldo y el archivo cifrado contienen información privada; no publicarlos en GitHub ni en canales del servidor. Los `.wohost`, `relevos/`, `.env` y `data/` están excluidos de Git.

## Si no arranca

- **9-DIAGNOSTICO.cmd** comprueba Node, dependencias, `.env` y SQLite. No imprime el token. No comprueba Internet ni que otra PC esté ejecutando el bot.
- Si falta Node o dependencias, volver a **1-INSTALAR.cmd**. Si falta configuración o la base, **8-RECIBIR-RELEVO.cmd** con la copia del anfitrión actual.
- Si ya está abierto en esta PC, el arranque no crea otro proceso. Para una copia iniciada con `npm start`, detenerla con Ctrl+C en esa consola.
- Si quedó un token viejo, pedir un nuevo relevo del anfitrión que actualmente funciona. No regenerarlo porque sí: afectaría a todos.
- Si el anfitrión anterior apagó de golpe sin preparar un relevo, pedirle que vuelva a encender su PC para generar la copia actualizada antes de cambiar de equipo. GitHub no guarda la base de datos.
- Antes de probar que un amigo puede alojarlo, coordinar un relevo real. La comprobación de instancias duplicadas protege una sola PC; no evita que dos PC distintas se conecten con el mismo token.

El código puede actualizarse con GitHub; los datos del servidor se trasladan únicamente con el relevo. No se instaló inicio automático de Windows: hay que abrir **5-INICIAR.cmd** al comenzar cada turno.
