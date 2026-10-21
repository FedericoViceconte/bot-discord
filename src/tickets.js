import {ChannelType,PermissionFlagsBits as P} from 'discord.js';
import {privateOverwrites} from './permissions.js';
import {protectedChannelIds} from './setup.js';
import {ticketMessage} from './ui.js';

async function managedChannel(guild,ticket,config) {
  if(!ticket.channel)return null;
  const channel=await guild.channels.fetch(ticket.channel).catch(error=>{if(error.code===10003)return null;throw error;});
  if(!channel)return null;
  if(channel.guild.id!==guild.id || channel.type!==ChannelType.GuildText || channel.parentId!==config.ticketCategory || protectedChannelIds(guild,config).has(channel.id) || ![`wo:ticket:${ticket.owner}`,`wo:closed:${ticket.id}:${ticket.owner}`].includes(channel.topic)){
    throw new Error('El canal no coincide con un ticket del bot. No se modificó ningún espacio privado.');
  }
  return channel;
}

// A closing ticket keeps its reservation until deletion succeeds. If Discord
// fails or the process restarts, the persisted state lets cleanup retry safely.
export async function closeTicket(guild,ticket,store,reason='Eliminar ticket cerrado') {
  if(ticket.guild!==guild.id || !['open','closing','closed'].includes(ticket.state))throw new Error('Ticket inválido.');
  const channel=await managedChannel(guild,ticket,store.getConfig(guild.id));
  if(ticket.state==='open')store.ticketState(ticket.id,'closing');
  if(channel)await channel.delete(reason).catch(error=>{if(error.code!==10003)throw error;});
  store.finishTicketClose(ticket.id);
}

export async function reopenTicket(guild,ticket,store) {
  if(ticket.guild!==guild.id || ticket.state!=='closed')throw new Error('Solo se puede reabrir un ticket cerrado.');
  if(store.openTicket(guild.id,ticket.owner))throw new Error('Este usuario ya tiene otro ticket abierto o cerrándose.');
  const config=store.getConfig(guild.id);
  await guild.members.fetch(ticket.owner);
  const parent=await guild.channels.fetch(config.ticketCategory);
  if(parent?.type!==ChannelType.GuildCategory || protectedChannelIds(guild,config).has(parent.id) || !parent.permissionOverwrites.cache.get(guild.id)?.deny.has(P.ViewChannel) || !await guild.roles.fetch(config.staffRole))throw new Error('Falta la categoría privada de soporte o está mal configurada.');
  // Remove a closed room left by an older version before opening its replacement.
  if(ticket.channel)await closeTicket(guild,ticket,store);
  const channel=await guild.channels.create({name:`${ticket.type}-${ticket.owner}`,type:ChannelType.GuildText,parent:parent.id,topic:`wo:ticket:${ticket.owner}`,permissionOverwrites:privateOverwrites(guild,guild.client.user.id,config.staffRole,ticket.owner),reason:`Reabrir ticket #${ticket.id} por administrador`});
  try{store.reopenTicket(ticket.id,channel.id);}
  catch(error){await channel.delete('Reapertura no registrada').catch(()=>{});throw error;}
  try{
    await channel.send({content:`<@${ticket.owner}> <@&${config.staffRole}>`,...ticketMessage(store.ticket(ticket.id,guild.id)),allowedMentions:{users:[ticket.owner],roles:[config.staffRole]}});
  }catch(error){
    store.ticketState(ticket.id,'closing');
    await closeTicket(guild,store.ticket(ticket.id,guild.id),store,'Reapertura incompleta').catch(()=>{});
    throw error;
  }
  return channel;
}

export async function cleanupTickets(guild,store,locks,log) {
  for(const ticket of store.ticketsToDelete(guild.id)){
    try{
      await locks.run(`ticket-owner:${guild.id}:${ticket.owner}`,async()=>{
        const current=store.ticket(ticket.id,guild.id);
        if(['closed','closing'].includes(current.state) && current.channel)await closeTicket(guild,current,store);
      });
    }catch(error){await log(guild,`No se pudo eliminar el canal del ticket #${ticket.id}. Se volverá a intentar.`,error);}
  }
}
