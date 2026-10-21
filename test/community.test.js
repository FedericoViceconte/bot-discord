import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGES} from '../src/catalog.js';
import {panel,onboardingPrompt,ticketMessage,suggestionMessage} from '../src/ui.js';

test('la selección inicial es breve y las opciones muestran los nombres nativos',()=>{
  const initial=onboardingPrompt();const body=initial.embeds[0].toJSON().description;
  assert.ok(body.length<80);assert.equal(initial.components[0].toJSON().components[0].options.length,5);
  assert.ok(!body.includes('Português'));assert.ok(!body.includes('Deutsch'));
});
test('cada panel, ticket y propuesta usa un único idioma con sus propios textos',()=>{
  for(const l of LANGUAGES){
    for(const kind of ['central','tickets','sugerencias','idiomas']){
      const payload=panel(kind,l);for(const e of payload.embeds)e.toJSON();for(const c of payload.components)c.toJSON();
      assert.ok(!payload.embeds[0].toJSON().description.includes(' / '));
    }
    assert.equal(panel('central',l).embeds[0].toJSON().title,l.hubTitle);
    const ticket=ticketMessage({id:1,lang:l.code,type:'general',owner:'u',subject:'Subject',detail:'Details',state:'open'});
    assert.ok(ticket.embeds[0].toJSON().description.includes(l.waiting));
    const suggestion=suggestionMessage({id:1,lang:l.code,state:'pending',author:'u',body:'Idea'},{yes:1,no:0});
    assert.equal(suggestion.embeds[0].toJSON().title,`💡 ${l.states.pending} #1`);
    const closed=ticketMessage({id:1,lang:l.code,type:'general',owner:'u',subject:'Subject',detail:'Details',state:'closed'});
    assert.equal(closed.components.length,0);assert.ok(closed.embeds[0].toJSON().description.includes(l.closed));
  }
});
