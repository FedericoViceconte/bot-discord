import { createCanvas, loadImage } from '@napi-rs/canvas';
import { AttachmentBuilder } from 'discord.js';
import { BRAND,language } from './catalog.js';
import { embed } from './ui.js';
import { validateMemberRole, textChannel } from './permissions.js';

export async function welcomeCard({ name, number, avatar,lang='es' }) {
  const l=language(lang);
  const canvas = createCanvas(1000,330);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b0d17'; ctx.fillRect(0,0,1000,330);
  const gradient = ctx.createLinearGradient(0,0,1000,330);
  gradient.addColorStop(0,'#36224e'); gradient.addColorStop(0.55,'#1c172b'); gradient.addColorStop(1,'#60213f');
  ctx.fillStyle = gradient; ctx.fillRect(14,14,972,302);
  ctx.fillStyle = '#11121e'; ctx.beginPath(); ctx.roundRect(32,32,936,266,28); ctx.fill();
  ctx.strokeStyle = '#f13b82'; ctx.lineWidth = 2; ctx.stroke();
  ctx.save(); ctx.beginPath(); ctx.arc(160,165,86,0,Math.PI*2); ctx.clip();
  ctx.fillStyle = '#2a2c49'; ctx.fillRect(74,79,172,172);
  if (avatar) {
    try { ctx.drawImage(await loadImage(avatar),74,79,172,172); } catch { /* Avatar optional. */ }
  } else {
    ctx.fillStyle = '#f13b82'; ctx.font = 'bold 50px sans-serif'; ctx.fillText('WO',112,184);
  }
  ctx.restore();
  ctx.fillStyle = '#f13b82'; ctx.font = 'bold 18px sans-serif'; ctx.fillText(BRAND,290,98);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 34px sans-serif'; ctx.fillText(l.cardHeadline,290,151,625);
  ctx.fillStyle = '#f13b82'; ctx.font = 'bold 32px sans-serif'; ctx.fillText(String(name).replace(/[\r\n]/g,' '),290,203,625);
  ctx.fillStyle = '#a7a9bd'; ctx.font = '20px sans-serif'; ctx.fillText(`${l.cardMember} #${number}  ·  ${l.cardMotto}`,290,248,625);
  return canvas.toBuffer('image/png');
}

export async function welcomeMember(member, store, log) {
  const guild = member.guild;
  if (member.user.bot) return;
  const config = store.getConfig(guild.id);
  if (!config.installed) return;
  const arrival=store.beginArrival(guild.id,member.id,member.joinedTimestamp || Date.now());
  try {
    const me = await guild.members.fetchMe();
    const role = await guild.roles.fetch(config.memberRole);
    validateMemberRole(role,me,config);
    await member.roles.add(role,'Rol de ingreso configurado por administrador');
  } catch (error) { await log(guild,`No se pudo asignar rol de ingreso a ${member.id}. Revisá /diagnostico.`,error); }
  if(arrival.greeted)return;
  // All arrivals share the same entrance. No extra room or multilingual wall
  // of messages is created for each new member.
  const entry=config.entryChannel || config.languageChannel;
  store.arrivalPrompt(guild.id,member.id,entry,config.panels?.[`idiomas:${entry}`] || null);
}

export async function welcomeAfterLanguage(member,code,store,log) {
  const guild=member.guild,arrival=store.arrival(guild.id,member.id);
  if(!arrival || arrival.greeted)return false;
  const config=store.getConfig(guild.id),l=language(code);
  try{
    const channel=await textChannel(guild,config[`welcome_${code}`] || config.welcomeChannel);
    const card=embed(l.welcomeTitle,`<@${member.id}>\n\n${l.welcomeBody}\n\n${l.welcomeNext}`);
    let files=[];
    try{
      const avatarUrl=member.user.displayAvatarURL({extension:'png',size:256});
      const response=await fetch(avatarUrl,{signal:AbortSignal.timeout(5000)});
      const avatar=response.ok ? Buffer.from(await response.arrayBuffer()) : undefined;
      const png=await welcomeCard({name:member.displayName,number:guild.memberCount,avatar,lang:code});
      files=[new AttachmentBuilder(png,{name:'welcome.png'})];card.setImage('attachment://welcome.png');
    }catch{/* Welcome text remains available if the image cannot be generated. */}
    await channel.send({content:`<@${member.id}>`,embeds:[card],files,allowedMentions:{users:[member.id]}});
    store.greetArrival(guild.id,member.id);
    return true;
  }catch(error){await log(guild,`No se pudo publicar la bienvenida localizada de ${member.id}.`,error);return false;}
}
