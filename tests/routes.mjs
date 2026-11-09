import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

test('rotas públicas, arquivos estáticos, perfil e proteção de origem',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'jack-routes-'));
  const base='http://127.0.0.1:31315';
  const server=spawn(process.execPath,['server.mjs'],{cwd:process.env.JACK_TEST_ROOT||'.',env:{...process.env,PORT:'31315',DATA_DIR:dir},stdio:'ignore'});
  try {
    let page;
    for(let attempt=0;attempt<100;attempt++){
      try {page=await fetch(base);break} catch {await new Promise(resolve=>setTimeout(resolve,30))}
    }
    assert.equal(page.status,200);
    assert.match(await page.text(),/Jack AI/);
    for(const asset of ['app.js','style.css','render.css','render.js','math.js','icons.js','picker.js','library.js','workspace.js','files.js','zip.js','viewer.js','tour.js','studio/view.js','studio/data.js','studio/text.js','vendor/marked/marked.js','vendor/inter/inter-latin-wght-normal.woff2','logo.svg','orbit.svg','ring.webp','manifest.webmanifest','icon-192.png','icon-512.png']){
      assert.equal((await fetch(base+'/'+asset)).status,200,asset);
    }
    const art=await fetch(base+'/orbit.webp');assert.equal(art.headers.get('Content-Type'),'image/webp');
    const cached=await fetch(base+'/orbit.webp',{headers:{'If-None-Match':art.headers.get('ETag')}});
    assert.equal(cached.status,304);assert.equal((await cached.text()).length,0);
    for(const restricted of ['.env','server.mjs','migrations/001.sql']){
      assert.equal((await fetch(base+'/'+restricted)).status,404);
    }
    const foreign=await fetch(base+'/api/session',{method:'POST',headers:{Origin:'https://outra-origem.invalid'}});
    assert.equal(foreign.status,403);
    const session=await fetch(base+'/api/session',{method:'POST'});
    const raw=session.headers.get('Set-Cookie');
    assert.match(raw,/HttpOnly/);assert.match(raw,/SameSite=Strict/);
    const headers={cookie:raw.split(';')[0],'Content-Type':'application/json'};
    const prefs=await fetch(base+'/api/profile',{method:'POST',headers,body:JSON.stringify({name:'Perfil de teste',theme:'light',temperature:0.5,maxTokens:512,instructions:'Seja breve.'})});
    const saved=await prefs.json();assert.equal(saved.prefs.theme,'light');assert.equal(saved.prefs.temperature,0.5);
    const again=await fetch(base+'/api/session',{method:'POST',headers});assert.equal((await again.json()).name,'Perfil de teste');
  } finally {
    const stopped=once(server,'exit');server.kill();await stopped;await rm(dir,{recursive:true,force:true});
  }
});
