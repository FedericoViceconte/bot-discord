# WO Guardian — empezá por acá

El bot está creado. **Si sos del equipo y querés alojar el bot existente de un amigo, seguí [RELEVO-ENTRE-AMIGOS.md](RELEVO-ENTRE-AMIGOS.md). No crees otra aplicación ni vuelvas a instalar los canales.** GitHub no contiene el token ni la base de datos; el anfitrión actual prepara un relevo cifrado con el botón 7 y vos lo recibís con el 8.

Los siguientes pasos son para crear un bot nuevo en otro servidor:

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

Para elegir el rol de ingreso después: `/configurar rol_nuevos:@TuRol`. Debe ser un rol de miembro, sin permisos elevados, debajo del bot. El cambio se aplica a los próximos ingresos; no modifica masivamente miembros existentes.

Probalo con otra cuenta que no sea administradora: entrá al servidor, elegí idioma y abrí un ticket. Las cuentas con Administrador ven todos los canales por diseño de Discord, aunque sean privados.

La pregunta de ingreso es breve. La tarjeta y el mensaje de bienvenida aparecen después de elegir idioma, en la sección correspondiente. Al cambiar de idioma con `/idioma`, se actualizan los accesos sin repetir el saludo público. Los botones de confirmación llevan directo a tu central y al chat.

El asistente de IA y la reproducción de voz fueron retirados. OpenAI está desactivado. Para novedades automáticas, escribí el texto y adjuntá imágenes o videos en 📝・publicar-novedades; el bot publica en los cinco idiomas y muestra el resultado en 📋・estado-de-envíos. La traducción usa MyMemory gratuito con cupo diario.

La PC debe quedar encendida para que el bot responda. Al volver a encender Windows, abrí **5-INICIAR.cmd**: abrir Discord no inicia el bot. Para errores de arranque usá **9-DIAGNOSTICO.cmd**. También se incluye una configuración de Docker para alojarlo en un servidor.

Más funciones, solución de problemas y detalles: [README.md](README.md).
