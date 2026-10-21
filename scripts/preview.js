import { mkdirSync,writeFileSync } from 'node:fs';
import { welcomeCard } from '../src/welcome.js';
mkdirSync('docs',{recursive:true});
writeFileSync('docs/welcome-preview.png',await welcomeCard({name:'Comandante WO',number:174}));
console.log('Vista previa: docs/welcome-preview.png');
