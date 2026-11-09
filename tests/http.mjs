import {test} from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
test('cadastro, recuperação, sessões, isolamento, histórico, catálogo e exclusão',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jack-test-'));const port=31258;
 const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),DATA_DIR:dir,OPENROUTER_API_KEY:''},stdio:'ignore'});
 const base='http://127.0.0.1:'+port+'/api/';
 function client(){let cookie='';return async(route,method='GET',body)=>{let r=await fetch(base+route,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:body&&JSON.stringify(body)});if(r.headers.has('Set-Cookie'))cookie=r.headers.get('Set-Cookie').split(';')[0];return {s:r.status,v:await r.json()}}}
 try{for(let i=0;i<60;i++){try{await fetch(base+'models');break}catch{await new Promise(r=>setTimeout(r,50))}}
 const a=client(),b=client();assert.equal((await b('chats')).s,401);await a('session','POST',{});await b('session','POST',{});
 const account={email:'teste@example.invalid',password:'senha-de-teste-123',name:'Explorador'};
 const results=await Promise.all([a('register','POST',account),a('register','POST',account)]);assert.equal(results.filter(r=>r.s===200).length,1);const recovery=results.find(r=>r.s===200).v.recovery;assert.ok(recovery);
 const {v:{id}}=await a('chats','POST',{});assert.ok(id);assert.equal((await a('chats/'+id,'PATCH',{title:'Projeto',pinned:true})).s,200);
 assert.equal((await a('chats/'+id)).v.title,'Projeto');assert.equal((await b('chats/'+id)).s,404);assert.deepEqual((await b('chats')).v,[]);assert.equal((await b('chats/'+id,'DELETE')).s,404);
 assert.equal((await a('models')).v.models.filter(x=>x.available).length,0);
 const g=await fetch(base+'auth/google/start',{redirect:'manual'});assert.equal(g.headers.get('location'),'/#/?google=desativado');assert.equal((await a('session','POST',{})).v.auth.google,false);
 await a('logout','POST',{});assert.equal((await a('chats')).s,401);await a('session','POST',{});assert.equal((await a('login','POST',account)).s,200);assert.equal((await a('chats')).v[0].title,'Projeto');
 assert.equal((await b('recover','POST',{...account,password:'outra-senha-123',code:recovery})).s,200);assert.equal((await a('chats')).s,401);
 assert.equal((await b('login','POST',{...account,password:'outra-senha-123'})).s,200);
 await b('account','DELETE');assert.equal((await b('chats')).s,401)
 }finally{server.kill();await new Promise(r=>server.once('exit',r));await rm(dir,{force:true,recursive:true})}
});
