import {ChannelType,PermissionFlagsBits as P} from 'discord.js';
import {LANGUAGES,BRAND} from './catalog.js';
import {embed} from './ui.js';
import {assertCanPost} from './permissions.js';
import {assertNewsPrivate} from './news-setup.js';
import {looksLikeCredential} from './ai.js';

export function textParts(text,limit=3800){
  const parts=[];let rest=text;
  while(rest.length>limit){
    let end=rest.lastIndexOf('\n',limit);if(end<limit/2)end=rest.lastIndexOf(' ',limit);
    if(end<limit/2)end=limit;
    if(/[\uD800-\uDBFF]/.test(rest[end-1]))end--;
    parts.push(rest.slice(0,end));rest=rest.slice(end);
  }
  if(rest || !parts.length)parts.push(rest);return parts;
}

function attachmentData(file){
  const url=new URL(file.url);
  if(url.protocol!=='https:' || !['cdn.discordapp.com','media.discordapp.net'].includes(url.hostname) || !url.pathname.startsWith('/attachments/'))throw new Error('Los adjuntos deben haberse subido directamente a Discord.');
  if(!Number.isSafeInteger(file.size) || file.size<0 || file.size>24*1024*1024)throw new Error('Un adjunto supera 24 MB. Comprimilo o compartí un enlace al video.');
  return {id:file.id,name:String(file.name || 'archivo').replace(/[\\/\0]/g,'_').slice(0,180),url:url.href,size:file.size};
}

export class Newsroom {
  constructor({store,translator,fetcher=fetch,log=async()=>{}}){this.store=store;this.translator=translator;this.fetch=fetcher;this.log=log;this.tail=Promise.resolve();this.queued=new Set();}
  async accept(message){
    if(!message.guild || message.author.bot || message.webhookId || message.system)return false;
    const config=this.store.getConfig(message.guild.id);
    if(message.channelId!==config.newsSourceChannel)return false;
    if(message.channel.parentId!==config.newsCategory || message.channel.topic!=='wo:news:source')throw new Error('El origen no coincide con el canal privado de publicaciones.');
    const member=await message.guild.members.fetch(message.author.id);
    if(!member.permissions.has(P.Administrator))return false;
    assertNewsPrivate(message.channel,message.guild);
    const body=message.content || '',files=[...message.attachments.values()].map(attachmentData);
    if(!body.trim() && !files.length)throw new Error('El mensaje no tiene texto ni adjuntos disponibles para publicar.');
    if(body.length>8000)throw new Error('La novedad es demasiado larga. Dividila en mensajes de hasta 8.000 caracteres.');
    if(looksLikeCredential(body))throw new Error('El mensaje parece contener una clave o token. No se publicó.');
    if(files.length>10 || files.reduce((sum,file)=>sum+file.size,0)>24*1024*1024)throw new Error('Los adjuntos superan el máximo de 10 archivos o 24 MB por novedad.');
    const result=this.store.addNews({source:message.id,guild:message.guild.id,channel:message.channelId,author:message.author.id,body,files,language:config.newsSourceLanguage || 'es'});
    if(result.created)await this.enqueue(message.guild,result.job.id);
    return true;
  }
  enqueue(guild,id){
    if(this.queued.has(id))return this.tail;
    this.queued.add(id);
    const work=this.tail.then(()=>this.process(guild,id)).finally(()=>this.queued.delete(id));
    this.tail=work.catch(()=>{});return work;
  }
  async retry(guild,id){
    const job=this.store.news(id,guild.id);if(!job)throw new Error('No existe esa novedad en este servidor.');
    if(job.status==='sent')throw new Error('La novedad ya se envió a todos los idiomas.');
    await this.enqueue(guild,id);return this.store.news(id,guild.id);
  }
  async resume(guild){for(const job of this.store.pendingNews(guild.id))await this.enqueue(guild,job.id);}
  async catchup(guild){
    const config=this.store.getConfig(guild.id);if(!config.newsSourceChannel)return;
    const source=await guild.channels.fetch(config.newsSourceChannel);assertNewsPrivate(source,guild);
    const recent=await source.messages.fetch({limit:100});
    for(const message of [...recent.values()].sort((a,b)=>a.createdTimestamp-b.createdTimestamp)){
      if(message.createdTimestamp>=config.newsActivatedAt)await this.accept(message).catch(error=>this.inputError(message,error));
    }
  }
  async inputError(message,error){
    const config=this.store.getConfig(message.guild.id);
    if(message.channelId!==config.newsSourceChannel)return;
    const channel=await message.guild.channels.fetch(config.newsStatusChannel);assertNewsPrivate(channel,message.guild);
    const reason=error.name==='Error' ? error.message : 'No se pudo preparar la novedad. Revisá el texto y los adjuntos.';
    await channel.send({embeds:[embed('⚠️ Novedad sin publicar',`${reason}\n\n[Ver original](${message.url})`)],allowedMentions:{parse:[]}});
  }
  async status(guild,job,description){
    const config=this.store.getConfig(guild.id),channel=await guild.channels.fetch(config.newsStatusChannel);
    if(channel?.parentId!==config.newsCategory || channel.topic!=='wo:news:status')throw new Error('El canal de estado no coincide con el espacio de publicaciones.');
    assertNewsPrivate(channel,guild);
    const payload={embeds:[embed(`📢 Novedad #${job.id}`,description)],allowedMentions:{parse:[]}};
    const old=job.status_message && await channel.messages.fetch(job.status_message).catch(error=>{if(error.code===10008)return null;throw error;});
    if(old?.author.id===guild.client.user.id)await old.edit(payload);
    else{const message=await channel.send(payload);this.store.newsStatusMessage(job.id,message.id);job.status_message=message.id;}
  }
  async attachmentBuffers(guild,job){
    let files=JSON.parse(job.files);
    if(!files.length)return [];
    // Refresh Discord's signed URLs without changing the original attachment set.
    const config=this.store.getConfig(guild.id),channel=await guild.channels.fetch(job.channel);
    if(channel?.id!==config.newsSourceChannel || channel.parentId!==config.newsCategory || channel.topic!=='wo:news:source')throw new Error('No se pudo confirmar el origen de los adjuntos.');
    assertNewsPrivate(channel,guild);
    const original=await channel.messages.fetch(job.source);
    files=files.map(file=>{const fresh=original.attachments.get(file.id);if(!fresh)throw new Error('Falta un adjunto del mensaje original. Publicá la novedad de nuevo con todos los archivos.');return attachmentData(fresh);});
    const output=[];let total=0;
    for(const file of files){
      const response=await this.fetch(file.url,{signal:AbortSignal.timeout(60000),redirect:'error'});
      if(!response.ok)throw new Error('No se pudo descargar un adjunto de Discord.');
      const chunks=[];let length=0;
      for await(const chunk of response.body){length+=chunk.length;total+=chunk.length;if(length>24*1024*1024 || total>24*1024*1024)throw new Error('Los archivos superan 24 MB. Comprimilos o compartí un enlace.');chunks.push(chunk);}
      output.push({attachment:Buffer.concat(chunks),name:file.name});
    }
    return output;
  }
  marker(job,code,part){return `${BRAND} · #${job.id} · ${code} · ${part+1}`;}
  async process(guild,id){
    const job=this.store.news(id,guild.id);if(!job || job.status==='sent')return;
    this.store.newsState(id,'working');
    try{
      await this.status(guild,job,'⏳ Preparando las traducciones y los adjuntos. Todavía no se publicó.');
      const config=this.store.getConfig(guild.id),targets=new Map();
      await guild.members.fetchMe();
      for(const l of LANGUAGES){
        const channel=await guild.channels.fetch(config[`announcement_${l.code}`]);
        if(channel?.type!==ChannelType.GuildText || channel.parentId!==config.languageCategories?.[l.code] || channel.id===config.newsSourceChannel || channel.id===config.newsStatusChannel)throw new Error(`El destino de ${l.label} no es su canal de novedades.`);
        assertCanPost(channel,guild.members.me);
        if(JSON.parse(job.files).length && !channel.permissionsFor(guild.members.me).has(P.AttachFiles))throw new Error(`El bot no puede adjuntar archivos en las novedades de ${l.label}.`);
        targets.set(l.code,channel);
      }
      for(const l of LANGUAGES)if(this.store.newsText(id,l.code)===undefined){
        const translated=await this.translator.translate(job.body,job.language,l.code);
        this.store.saveNewsText(id,l.code,translated);
      }
      const files=await this.attachmentBuffers(guild,job),completed=[];
      for(const [index,l]of LANGUAGES.entries()){
        const channel=targets.get(l.code),parts=textParts(this.store.newsText(id,l.code));
        for(const [part,text]of parts.entries()){
          let post=this.store.newsPost(id,l.code,part);
          if(post?.channel && post.channel!==channel.id)throw new Error('Cambió un destino después de iniciar el envío. Revisá la configuración antes de reintentar.');
          if(post?.message)continue;
          const marker=this.marker(job,l.code,part);
          if(post){
            // Recover an ambiguous send by a durable footer marker. If older
            // history makes recovery uncertain, stop instead of duplicating it.
            let before,found=false;
            for(let page=0;page<20;page++){
              const recent=await channel.messages.fetch({limit:100,...(before?{before}: {})});
              const existing=recent.find(m=>m.author.id===guild.client.user.id && m.embeds.some(e=>e.footer?.text===marker));
              if(existing){this.store.saveNewsPost(id,l.code,part,existing.id);found=true;break;}
              if(recent.size<100)break;
              const oldest=recent.last();if(oldest.createdTimestamp<post.attempted-60000)break;
              before=oldest.id;if(page===19)throw new Error('No se pudo confirmar un envío anterior. Revisá el canal antes de volver a publicar.');
            }
            if(found)continue;
          }
          this.store.beginNewsPost(id,l.code,part,channel.id);
          const card=embed(l.announcementTitle,text || '📎').setFooter({text:marker});
          const sent=await channel.send({embeds:[card],files:part===0?files:[],allowedMentions:{parse:[]},nonce:`${job.source}${index}${part}`,enforceNonce:true});
          this.store.saveNewsPost(id,l.code,part,sent.id);
        }
        completed.push(`${l.emoji} ${l.label}: <#${channel.id}>`);
        await this.status(guild,job,`📤 Enviando…\n\n${completed.join('\n')}`);
      }
      this.store.newsState(id,'sent');
      await this.status(guild,job,`✅ Publicado por el bot en los cinco idiomas.\n\n${completed.join('\n')}\n\n${files.length} adjunto(s) por idioma. Traducción gratuita; sin OpenAI.`);
    }catch(error){
      const reason=error.code===40005 ? 'Discord rechazó el tamaño de un archivo. Publicá una versión más liviana o un enlace al video.' : error.name==='Error' ? error.message : `Discord no pudo completar el envío (${error.code || 'error'}).`;
      this.store.newsState(id,'error',reason);
      await this.status(guild,job,`⚠️ No se completó el envío.\n\n${reason}\n\nUsá /novedades-reintentar id:${id}. Los idiomas ya enviados se conservan y no se vuelven a publicar.`).catch(()=>{});
      await this.log(guild,`Falló la novedad #${id}.`,error);
    }
  }
}
