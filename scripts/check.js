import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { commands } from '../src/commands.js';
import { LANGUAGES } from '../src/catalog.js';
import { panel,ticketModal,suggestionModal } from '../src/ui.js';

function checkTree(directory) {
  for (const entry of readdirSync(directory,{ withFileTypes:true })) {
    const path=join(directory,entry.name);
    if (entry.isDirectory()) checkTree(path);
    else if (entry.name.endsWith('.js')) {
      const result=spawnSync(process.execPath,['--check',path],{ stdio:'inherit' });
      if (result.status!==0) process.exit(result.status || 1);
    }
  }
}
checkTree('src'); checkTree('test');
for (const l of LANGUAGES) {
  ticketModal('general',l).toJSON(); suggestionModal(l).toJSON();
  for (const kind of ['central','idiomas','tickets','sugerencias']) {
    const payload=panel(kind,l);
    payload.embeds.forEach(e=>e.toJSON()); payload.components.forEach(c=>c.toJSON());
  }
}
console.log(`✅ Sintaxis, ${commands.length} comandos y componentes en ${LANGUAGES.length} idiomas válidos.`);
