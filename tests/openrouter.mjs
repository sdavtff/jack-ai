import assert from 'node:assert/strict';
import test from 'node:test';
import {listModels,generate} from '../providers.mjs';
test('OpenRouter valida a chave, expõe só rotas pagas do catálogo e interpreta SSE',async t=>{
  process.env.OPENROUTER_API_KEY='chave-ficticia-de-teste';
  const arch={input_modalities:['text','image'],output_modalities:['text']};
  const haiku={id:'anthropic/claude-haiku-5.5',name:'Anthropic: Claude Haiku 5.5',context_length:1000000,pricing:{prompt:'0.0000001',completion:'0.0000005'},architecture:arch};
  const calls=[];
  t.mock.method(globalThis,'fetch',async(url,opts)=>{
    assert.equal(opts.headers.Authorization,'Bearer chave-ficticia-de-teste');
    calls.push(url);
    if(url.endsWith('/key'))return Response.json({data:{limit:10,limit_remaining:7.5,usage:2.5}});
    if(url.endsWith('/models/user'))return Response.json({data:[
      {...haiku,id:'openrouter/free',name:'Free Models Router',pricing:{prompt:'0',completion:'0'}},
      {...haiku,id:'anthropic/claude-haiku-5.5:free',pricing:{prompt:'0',completion:'0'}},
      {...haiku,id:'anthropic/claude-sonnet-5.5',pricing:{prompt:'0',completion:'0'}},
      {...haiku,id:'qwen/qwen3-coder-plus'},
      haiku]});
    assert.equal(JSON.parse(opts.body).model,'anthropic/claude-haiku-5.5');
    return new Response('data: {"choices":[{"delta":{"content":"Teste"}}]}\n\ndata: [DONE]\n\n');
  });
  const {routes,keys}=await listModels();
  assert.equal(routes.length,1);assert.equal(routes[0].id,'openrouter/anthropic/claude-haiku-5.5');assert.equal(routes[0].vendor,'Anthropic');
  assert.equal(routes[0].name,'Claude Haiku 5.5');assert.equal(routes[0].paid,true);assert.deepEqual(routes[0].price,{input:0.1,output:0.5});
  assert.deepEqual(keys.openrouter,{limit:10,limitRemaining:7.5,usage:2.5});
  let result='';const events=[];for await(const ev of generate({model:routes[0].id,messages:[{role:'user',content:'Olá'}]})){events.push(ev.type);if(ev.type==='text')result+=ev.value;}
  assert.equal(result,'Teste');assert.equal(calls.length,3);assert.deepEqual(events,['text','finish']);
});
test('esforço, pesquisa na web e PDF viram os parâmetros certos do OpenRouter',async t=>{
  process.env.OPENROUTER_API_KEY='chave-ficticia-de-teste';
  const bodies=[];
  t.mock.method(globalThis,'fetch',async(url,opts)=>{bodies.push(JSON.parse(opts.body));
    return new Response('data: {"choices":[{"delta":{"reasoning":"Pensando"}}]}\n\ndata: {"choices":[{"delta":{"content":"Ok","annotations":[{"type":"url_citation","url_citation":{"url":"https://example.com/a","title":"A"}}]}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n');});
  const route={apiId:'x/modelo',vision:false,files:false,reasoning:true,temperature:true};
  const pdf={name:'a.pdf',data:'data:application/pdf;base64,JVBERi0xLjQK'};
  const events=[];for await(const ev of generate({route,maxTokens:1024,effort:'high',web:true,messages:[{role:'user',content:'Leia',pdfs:[pdf]}]}))events.push(ev);
  const body=bodies[0];
  assert.deepEqual(body.reasoning,{effort:'high'});assert.equal(body.max_tokens,1024+16384);assert.equal(body.temperature,undefined,'raciocínio dispensa temperatura');
  assert.deepEqual(body.tools,[{type:'openrouter:web_search',parameters:{max_results:5}}]);
  assert.deepEqual(body.plugins,[{id:'file-parser',pdf:{engine:'cloudflare-ai'}}]);
  assert.deepEqual(body.messages[0].content[1],{type:'file',file:{filename:'a.pdf',file_data:pdf.data}});
  assert.deepEqual(events.map(e=>e.type),['reasoning','text','sources','finish']);assert.equal(events.at(-1).value,'length');
  for await(const ev of generate({route:{...route,reasoning:false,files:true},maxTokens:512,effort:'low',messages:[{role:'user',content:'Oi',pdfs:[pdf]}]}));
  assert.equal(bodies[1].reasoning,undefined);assert.equal(bodies[1].max_tokens,512);assert.equal(bodies[1].plugins,undefined);assert.equal(bodies[1].temperature,0.7);
  await assert.rejects(async()=>{for await(const _ of generate({route,effort:'extremo',messages:[{role:'user',content:'Oi'}]}));},/esforço inválido/);
});
