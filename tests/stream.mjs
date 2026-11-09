import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('streaming com provedor de contrato, edição e conversa temporária',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jack-stream-'));
 const upstream=spawn(process.execPath,['tests/support/fixture-openrouter.mjs'],{env:{...process.env,FIXTURE_PORT:'31312'},stdio:'ignore'});
 // JACK_ROUTE_CHECKS=off: as rotas listadas ficam disponíveis sem a chamada mínima.
 const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'31313',DATA_DIR:dir,OPENROUTER_API_KEY:'chave-de-teste',OPENROUTER_BASE_URL:'http://127.0.0.1:31312/api/v1',JACK_ROUTE_CHECKS:'off'},stdio:'ignore'});
 let cookie='';
 async function call(route,body){const r=await fetch('http://127.0.0.1:31313/api/'+route,{method:body?'POST':'GET',headers:{cookie,'Content-Type':'application/json'},body:body&&JSON.stringify(body)});if(r.headers.has('Set-Cookie'))cookie=r.headers.get('Set-Cookie').split(';')[0];assert.equal(r.status,200);return r}
 try{
  for(let i=0;i<100;i++){try{await fetch('http://127.0.0.1:31312/api/v1/key');await call('session',{});break}catch{await new Promise(r=>setTimeout(r,40))}}
  const catalog=await (await call('models')).json();const model=catalog.models.find(m=>m.available).id;assert.equal(model,'jack/flash');
  const {id}=await (await call('chats',{})).json();
  async function exchange(body){const r=await call('generate',{model,...body});const frames=(await r.text()).trim().split('\n').map(JSON.parse);assert.ok(frames.filter(f=>f.delta).length>=3);assert.equal(frames.at(-1).done,true)}
  await exchange({id,content:'Teste de contrato'});await exchange({id,index:0,content:'Teste editado'});await exchange({history:[],content:'Temporária'});
  const chats=await (await call('chats')).json();assert.equal(chats.length,1);assert.equal(chats[0].messages.length,2);assert.equal(chats[0].messages[0].content,'Teste editado');assert.match(chats[0].messages[1].content,/servidor de contrato[\s\S]*claude-haiku-5\.5/);
 }finally{const stopped=[server,upstream].map(async child=>{if(child.exitCode===null){let exit=once(child,'exit');child.kill();await exit}});await Promise.all(stopped);await rm(dir,{recursive:true,force:true})}
});
