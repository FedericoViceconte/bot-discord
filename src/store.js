import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export class Store {
  constructor(directory) {
    mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(join(directory, 'guardian.sqlite'));
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS settings (guild TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS languages (guild TEXT, user TEXT, code TEXT NOT NULL, PRIMARY KEY(guild,user));
      CREATE TABLE IF NOT EXISTS arrivals (guild TEXT,user TEXT,joined INTEGER NOT NULL,channel TEXT,prompt TEXT,greeted INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild,user));
      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT, guild TEXT NOT NULL, owner TEXT NOT NULL, type TEXT NOT NULL,
        lang TEXT NOT NULL, subject TEXT NOT NULL, detail TEXT NOT NULL, channel TEXT UNIQUE,
        state TEXT NOT NULL DEFAULT 'open', claimed TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS one_open_ticket ON tickets(guild,owner) WHERE state='open';
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_ticket ON tickets(guild,owner) WHERE state IN ('open','closing');
      CREATE TABLE IF NOT EXISTS suggestions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, guild TEXT NOT NULL, author TEXT NOT NULL, body TEXT NOT NULL,
        lang TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', channel TEXT, message TEXT, note TEXT,
        created TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS votes (
        suggestion INTEGER REFERENCES suggestions(id) ON DELETE CASCADE, user TEXT, value INTEGER CHECK(value IN (-1,1)),
        PRIMARY KEY(suggestion,user)
      );
      CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT, guild TEXT NOT NULL, body TEXT NOT NULL, channel TEXT, message TEXT
      );
      CREATE TABLE IF NOT EXISTS translations (
        announcement INTEGER REFERENCES announcements(id) ON DELETE CASCADE, lang TEXT, body TEXT NOT NULL,
        PRIMARY KEY(announcement,lang)
      );
      CREATE TABLE IF NOT EXISTS ai_usage (guild TEXT, day TEXT, count INTEGER NOT NULL, PRIMARY KEY(guild,day));
      CREATE TABLE IF NOT EXISTS ai_cooldowns (guild TEXT, user TEXT, at INTEGER NOT NULL, PRIMARY KEY(guild,user));
      CREATE TABLE IF NOT EXISTS cooldowns (key TEXT PRIMARY KEY, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS free_translation_cache (key TEXT PRIMARY KEY,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS free_translation_usage (day TEXT PRIMARY KEY,chars INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS news_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,source TEXT UNIQUE NOT NULL,guild TEXT NOT NULL,
        channel TEXT NOT NULL,author TEXT NOT NULL,body TEXT NOT NULL,files TEXT NOT NULL,
        language TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',error TEXT,status_message TEXT,
        created TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS news_texts (
        job INTEGER REFERENCES news_jobs(id) ON DELETE CASCADE,lang TEXT,body TEXT NOT NULL,PRIMARY KEY(job,lang)
      );
      CREATE TABLE IF NOT EXISTS news_posts (
        job INTEGER REFERENCES news_jobs(id) ON DELETE CASCADE,lang TEXT,part INTEGER,channel TEXT NOT NULL,
        message TEXT,attempted INTEGER NOT NULL,PRIMARY KEY(job,lang,part)
      );
    `);
  }
  transaction(work) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = work(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  getConfig(guild) { return JSON.parse(this.db.prepare('SELECT body FROM settings WHERE guild=?').get(guild)?.body || '{}'); }
  setConfig(guild, patch) {
    const config = { ...this.getConfig(guild), ...patch };
    this.db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(guild) DO UPDATE SET body=excluded.body').run(guild, JSON.stringify(config));
    return config;
  }
  getLanguage(guild, user) { return this.db.prepare('SELECT code FROM languages WHERE guild=? AND user=?').get(guild,user)?.code; }
  setLanguage(guild, user, code) { this.db.prepare('INSERT INTO languages VALUES (?,?,?) ON CONFLICT(guild,user) DO UPDATE SET code=excluded.code').run(guild,user,code); }
  beginArrival(guild,user,joined) {
    this.db.prepare('INSERT INTO arrivals(guild,user,joined) VALUES (?,?,?) ON CONFLICT(guild,user) DO UPDATE SET joined=excluded.joined,channel=NULL,prompt=NULL,greeted=0 WHERE arrivals.joined<>excluded.joined').run(guild,user,joined);
    return this.arrival(guild,user);
  }
  arrival(guild,user) {return this.db.prepare('SELECT * FROM arrivals WHERE guild=? AND user=?').get(guild,user);}
  arrivalPrompt(guild,user,channel,prompt) {this.db.prepare('UPDATE arrivals SET channel=?,prompt=? WHERE guild=? AND user=?').run(channel,prompt,guild,user);}
  greetArrival(guild,user) {this.db.prepare('UPDATE arrivals SET greeted=1 WHERE guild=? AND user=?').run(guild,user);}
  openTicket(guild, user) { return this.db.prepare("SELECT * FROM tickets WHERE guild=? AND owner=? AND state IN ('open','closing')").get(guild,user); }
  ticket(id, guild) { return this.db.prepare('SELECT * FROM tickets WHERE id=? AND guild=?').get(id,guild); }
  createTicket({ guild, owner, type, lang, subject, detail, channel }) {
    return Number(this.db.prepare('INSERT INTO tickets(guild,owner,type,lang,subject,detail,channel) VALUES (?,?,?,?,?,?,?)').run(guild,owner,type,lang,subject,detail,channel).lastInsertRowid);
  }
  ticketState(id, state) { this.db.prepare('UPDATE tickets SET state=? WHERE id=?').run(state,id); }
  ticketsToDelete(guild) {return this.db.prepare("SELECT * FROM tickets WHERE guild=? AND channel IS NOT NULL AND state IN ('closing','closed')").all(guild);}
  finishTicketClose(id) {this.db.prepare("UPDATE tickets SET state='closed',channel=NULL WHERE id=?").run(id);}
  reopenTicket(id,channel) {
    const result=this.db.prepare("UPDATE tickets SET state='open',channel=?,claimed=NULL WHERE id=? AND state='closed'").run(channel,id);
    if(!result.changes)throw new Error('El ticket ya no está cerrado.');
  }
  claimTicket(id, user) { this.db.prepare('UPDATE tickets SET claimed=? WHERE id=?').run(user,id); }
  suggestion(id, guild) { return this.db.prepare('SELECT * FROM suggestions WHERE id=? AND guild=?').get(id,guild); }
  createSuggestion(guild, author, body, lang) { return Number(this.db.prepare('INSERT INTO suggestions(guild,author,body,lang) VALUES (?,?,?,?)').run(guild,author,body,lang).lastInsertRowid); }
  publishSuggestion(id, channel, message) { this.db.prepare('UPDATE suggestions SET channel=?,message=? WHERE id=?').run(channel,message,id); }
  deleteSuggestion(id) { this.db.prepare('DELETE FROM suggestions WHERE id=?').run(id); }
  setSuggestionState(id, state, note) { this.db.prepare('UPDATE suggestions SET state=?,note=? WHERE id=?').run(state,note || null,id); }
  vote(id, user, value) {
    return this.transaction(() => {
      const old = this.db.prepare('SELECT value FROM votes WHERE suggestion=? AND user=?').get(id,user);
      if (old?.value === value) this.db.prepare('DELETE FROM votes WHERE suggestion=? AND user=?').run(id,user);
      else this.db.prepare('INSERT INTO votes VALUES (?,?,?) ON CONFLICT(suggestion,user) DO UPDATE SET value=excluded.value').run(id,user,value);
      return this.countVotes(id);
    });
  }
  countVotes(id) {
    return this.db.prepare('SELECT COUNT(CASE WHEN value=1 THEN 1 END) AS yes, COUNT(CASE WHEN value=-1 THEN 1 END) AS no FROM votes WHERE suggestion=?').get(id);
  }
  createAnnouncement(guild, body) { return Number(this.db.prepare('INSERT INTO announcements(guild,body) VALUES (?,?)').run(guild,body).lastInsertRowid); }
  announcement(id, guild) { return this.db.prepare('SELECT * FROM announcements WHERE id=? AND guild=?').get(id,guild); }
  publishAnnouncement(id, channel, message) { this.db.prepare('UPDATE announcements SET channel=?,message=? WHERE id=?').run(channel,message,id); }
  translation(id, lang) { return this.db.prepare('SELECT body FROM translations WHERE announcement=? AND lang=?').get(id,lang)?.body; }
  saveTranslation(id, lang, body) { this.db.prepare('INSERT OR REPLACE INTO translations VALUES (?,?,?)').run(id,lang,body); }
  reserveAI(guild, user, limit, cooldownMs, now = Date.now()) {
    return this.transaction(() => {
      const day = new Date(now).toISOString().slice(0,10);
      const last = this.db.prepare('SELECT at FROM ai_cooldowns WHERE guild=? AND user=?').get(guild,user)?.at;
      if (last !== undefined && now-last < cooldownMs) throw new Error('Esperá antes de consultar otra vez. / Please wait before asking again.');
      const count = this.db.prepare('SELECT count FROM ai_usage WHERE guild=? AND day=?').get(guild,day)?.count || 0;
      if (count >= limit) throw new Error('Se alcanzó el límite diario de IA. / Daily AI limit reached.');
      this.db.prepare('INSERT INTO ai_usage VALUES (?,?,1) ON CONFLICT(guild,day) DO UPDATE SET count=count+1').run(guild,day);
      this.db.prepare('INSERT INTO ai_cooldowns VALUES (?,?,?) ON CONFLICT(guild,user) DO UPDATE SET at=excluded.at').run(guild,user,now);
    });
  }
  cooldown(key, milliseconds, now = Date.now()) {
    const last = this.db.prepare('SELECT at FROM cooldowns WHERE key=?').get(key)?.at;
    if (last !== undefined && now-last < milliseconds) throw new Error('Esperá un momento antes de repetirlo. / Please wait.');
    this.db.prepare('INSERT INTO cooldowns VALUES (?,?) ON CONFLICT(key) DO UPDATE SET at=excluded.at').run(key,now);
  }
  freeTranslation(key){return this.db.prepare('SELECT body FROM free_translation_cache WHERE key=?').get(key)?.body;}
  saveFreeTranslation(key,body){this.db.prepare('INSERT OR REPLACE INTO free_translation_cache VALUES (?,?)').run(key,body);}
  reserveFreeTranslation(chars,now=Date.now()){
    return this.transaction(()=>{
      const day=new Date(now).toISOString().slice(0,10),used=this.db.prepare('SELECT chars FROM free_translation_usage WHERE day=?').get(day)?.chars || 0;
      if(used+chars>5000)throw new Error('Se alcanzó el cupo diario local del traductor gratuito (5.000 caracteres). Reintentá mañana.');
      this.db.prepare('INSERT INTO free_translation_usage VALUES (?,?) ON CONFLICT(day) DO UPDATE SET chars=chars+excluded.chars').run(day,chars);
    });
  }
  addNews({source,guild,channel,author,body,files,language}){
    const result=this.db.prepare('INSERT OR IGNORE INTO news_jobs(source,guild,channel,author,body,files,language) VALUES (?,?,?,?,?,?,?)').run(source,guild,channel,author,body,JSON.stringify(files),language);
    return {created:Boolean(result.changes),job:this.db.prepare('SELECT * FROM news_jobs WHERE source=? AND guild=?').get(source,guild)};
  }
  news(id,guild){return this.db.prepare('SELECT * FROM news_jobs WHERE id=? AND guild=?').get(id,guild);}
  pendingNews(guild){return this.db.prepare("SELECT * FROM news_jobs WHERE guild=? AND status IN ('pending','working') ORDER BY id").all(guild);}
  newsState(id,status,error=null){this.db.prepare('UPDATE news_jobs SET status=?,error=? WHERE id=?').run(status,error,id);}
  newsStatusMessage(id,message){this.db.prepare('UPDATE news_jobs SET status_message=? WHERE id=?').run(message,id);}
  newsText(id,code){return this.db.prepare('SELECT body FROM news_texts WHERE job=? AND lang=?').get(id,code)?.body;}
  saveNewsText(id,code,body){this.db.prepare('INSERT OR REPLACE INTO news_texts VALUES (?,?,?)').run(id,code,body);}
  newsPost(id,code,part){return this.db.prepare('SELECT * FROM news_posts WHERE job=? AND lang=? AND part=?').get(id,code,part);}
  beginNewsPost(id,code,part,channel){this.db.prepare('INSERT INTO news_posts VALUES (?,?,?,?,NULL,?) ON CONFLICT(job,lang,part) DO NOTHING').run(id,code,part,channel,Date.now());}
  saveNewsPost(id,code,part,message){this.db.prepare('UPDATE news_posts SET message=? WHERE job=? AND lang=? AND part=?').run(message,id,code,part);}
  close() { this.db.close(); }
}
