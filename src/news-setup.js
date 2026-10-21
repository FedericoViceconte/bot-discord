import {ChannelType,PermissionFlagsBits as P} from 'discord.js';
import {BOT_CHANNEL_PERMISSIONS} from './permissions.js';
import {embed} from './ui.js';

export function assertNewsPrivate(channel,guild) {
  if(!channel?.permissionOverwrites.cache.get(guild.id)?.deny.has(P.ViewChannel))throw new Error('El espacio de publicaciones debe ser privado para administradores.');
  for(const overwrite of channel.permissionOverwrites.cache.values()){
    if(!overwrite.allow.has(P.ViewChannel) || overwrite.id===guild.client.user.id)continue;
    const role=guild.roles.cache.get(overwrite.id);
    if(!role?.permissions.has(P.Administrator))throw new Error('El espacio de publicaciones tiene acceso para un rol o miembro que no es administrador.');
  }
}

export async function installNewsroom(guild,store) {
  let config=store.getConfig(guild.id);
  const perms=[{id:guild.id,deny:[P.ViewChannel]},{id:guild.client.user.id,allow:BOT_CHANNEL_PERMISSIONS}];
  const get=async(key,name,type,parent,topic)=>{
    let channel=guild.channels.cache.get(config[key]);
    if(channel && (channel.id===config.staffCategory || channel.parentId===config.staffCategory || channel.type!==type || parent && channel.parentId!==parent || topic && channel.topic!==topic))throw new Error('La configuración de novedades apunta a un espacio distinto. No se modificaron los privados existentes.');
    if(!channel){
      channel=await guild.channels.create({name,type,parent,topic,permissionOverwrites:perms,reason:'Canales privados para publicar novedades multilingües'});
      config=store.setConfig(guild.id,{[key]:channel.id});
    }
    assertNewsPrivate(channel,guild);return channel;
  };
  const category=await get('newsCategory','📢 WO · PUBLICACIONES',ChannelType.GuildCategory);
  const source=await get('newsSourceChannel','📝・publicar-novedades',ChannelType.GuildText,category.id,'wo:news:source');
  const status=await get('newsStatusChannel','📋・estado-de-envíos',ChannelType.GuildText,category.id,'wo:news:status');
  if(!config.newsSourceLanguage)config=store.setConfig(guild.id,{newsSourceLanguage:'es'});
  if(!config.newsActivatedAt)config=store.setConfig(guild.id,{newsActivatedAt:Date.now()});
  for(const [key,channel,payload]of [
    ['newsIntroMessage',source,{embeds:[embed('📢 Publicá una vez. Llegá a toda la comunidad.',`Cada mensaje nuevo que escriba un administrador acá se publica automáticamente, con el nombre del bot, en las novedades de los cinco idiomas.\n\nAdjuntá el texto, imágenes, videos o archivos **en el mismo mensaje**. Por defecto el original se interpreta en español; podés cambiarlo con /novedades-idioma.\n\nHasta 10 adjuntos y 24 MB en total por novedad, sujeto a los límites de Discord. Para videos más grandes podés usar un enlace.\n\nEl texto se traduce con MyMemory gratuito. Los adjuntos se copian tal como están: no se traducen textos dentro de imágenes ni el audio de videos. No pongas contraseñas, tokens ni información privada.\n\nMirá el resultado en <#${status.id}>. Los errores se pueden reintentar con /novedades-reintentar sin volver a enviar los idiomas completados.`)]}],
    ['newsStatusIntroMessage',status,{embeds:[embed('📋 Estado de las novedades','Acá vas a ver qué idiomas recibieron cada novedad y cualquier problema de traducción o adjuntos.\n\nMyMemory ofrece 5.000 caracteres al día, compartidos entre las traducciones. La caché evita volver a traducir lo mismo. No se usa OpenAI.\n\nPara corregir el contenido, publicá un mensaje nuevo en el canal de publicaciones. Editar o borrar el original no modifica lo ya enviado.')]}],
  ]){
    const previous=config[key] && await channel.messages.fetch(config[key]).catch(error=>{if(error.code===10008)return null;throw error;});
    if(previous?.author.id===guild.client.user.id)await previous.edit(payload);
    else{const message=await channel.send({...payload,allowedMentions:{parse:[]}});config=store.setConfig(guild.id,{[key]:message.id});}
  }
  return {category,source,status};
}
