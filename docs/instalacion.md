# Instalación y puesta en marcha

## Equipo de WO Definitive Edition

**Para este equipo, descargá `WO-Guardian-Windows.zip` desde la [última versión publicada](https://github.com/federicoviceconte5-jpg/bot-discord/releases/latest), extraelo entero, abrí Agente-Canino.exe y seguí [alojamiento-automatico.md](alojamiento-automatico.md).** Solo se vincula cada PC una vez con el código de un administrador. Después, basta con abrir el exe: si otra PC está activa, espera y toma el relevo automáticamente. No hay que pasar archivos ni copiar el token.

Agente-Canino.exe prepara los componentes y tiene botones para iniciar, detener, pasar o recibir un relevo. Tiene que quedar dentro de la carpeta del bot; para el escritorio, creá un acceso directo. Si ya tenés los datos del bot, intenta iniciarlo al abrir la app; después podés cerrar la ventana y el bot sigue funcionando.

Para instalaciones independientes, sin la comunidad compartida, el relevo manual está en [relevo-manual.md](relevo-manual.md). GitHub no contiene el token ni la base de datos.

## Crear un bot nuevo en otro servidor

Los scripts `.cmd` están en `scripts/windows/`.

1. Instalá **Node.js 24.17 o superior**, si no lo tenés: [nodejs.org](https://nodejs.org/).
2. Abrí **1-INSTALAR.cmd** con doble clic.
3. Entrá al [Discord Developer Portal](https://discord.com/developers/applications), creá una aplicación llamada **WO Guardian** (o el nombre que prefieras) y entrá a **Bot**.
4. Activá **SERVER MEMBERS INTENT** y **MESSAGE CONTENT INTENT**. Este último permite leer el texto y los adjuntos del canal privado de publicaciones. No necesita Presence Intent.
5. En **Bot → Reset Token**, copiá el token. Abrí **2-CONFIGURAR.cmd** y pegalo únicamente en `DISCORD_TOKEN=`. No lo publiques ni lo pegues en chats.
6. En **General Information**, copiá **Application ID** a `DISCORD_CLIENT_ID=`.
7. En Discord, activá **Ajustes de usuario → Avanzado → Modo desarrollador**. Clic derecho en tu servidor → **Copiar ID del servidor**. Pegalo en `DISCORD_GUILD_ID=`. Guardá `.env`.
8. Abrí **3-INVITAR.cmd**, copiá el enlace que muestra e invitá al bot a tu servidor.
9. En **Ajustes del servidor → Roles**, mové el rol del bot **por encima** del rol de nuevos miembros y de todos los roles de idioma que vaya a gestionar.
10. Abrí **4-REGISTRAR-COMANDOS.cmd** y luego **5-INICIAR.cmd**. Esperá a que diga CONECTADO; podés cerrar esa ventana porque el bot sigue en segundo plano. Para detenerlo, **6-DETENER.cmd**.
11. En tu servidor, si ya tenés roles propios, ejecutá **antes de instalar** `/configurar rol_nuevos:@TuRol rol_soporte:@TuEquipo`. Si no, el bot los creará.
12. Ejecutá `/instalar`. El bot crea sus canales, categorías, roles de idioma y paneles. Cada idioma tiene su propia bienvenida, central, soporte, ideas, novedades, chat y voz. Podés repetir este comando sin duplicar los recursos que haya registrado.
13. Asignale el rol **WO · Soporte** (o el que elegiste) a tu equipo. Ejecutá `/diagnostico`.

En macOS o Linux se usan los mismos pasos con `npm ci`, `npm run invite`, `npm run register` y `npm start` en lugar de los `.cmd`.

Para elegir el rol de ingreso después: `/configurar rol_nuevos:@TuRol`. Debe ser un rol de miembro, sin permisos elevados, debajo del bot. El cambio se aplica a los próximos ingresos; no modifica masivamente miembros existentes.

Probalo con otra cuenta que no sea administradora: entrá al servidor, elegí idioma y abrí un ticket. Las cuentas con Administrador ven todos los canales por diseño de Discord, aunque sean privados.

La pregunta de ingreso es breve. La tarjeta y el mensaje de bienvenida aparecen después de elegir idioma, en la sección correspondiente. Al cambiar de idioma con `/idioma`, se actualizan los accesos sin repetir el saludo público. Los botones de confirmación llevan directo a tu central y al chat.

Para novedades automáticas, escribí el texto y adjuntá imágenes o videos en 📝・publicar-novedades; el bot publica en los cinco idiomas y muestra el resultado en 📋・estado-de-envíos. La traducción usa MyMemory gratuito con cupo diario.

La PC debe quedar encendida para que el bot responda. Al volver a encender Windows, abrí **5-INICIAR.cmd**: abrir Discord no inicia el bot. Para errores de arranque usá **9-DIAGNOSTICO.cmd**. También se incluye una configuración de Docker para alojarlo en un servidor.

Más detalles técnicos: [arquitectura.md](arquitectura.md).
