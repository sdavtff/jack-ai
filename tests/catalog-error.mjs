import test from 'node:test';
import assert from 'node:assert/strict';
import {readApiResponse} from '../public/api.js';
import worker from '../cloudflare/worker.mjs';
test('respostas vazias e HTML recebem diagnóstico em português',async()=>{
  for(const body of ['', '<html></html>']) await assert.rejects(readApiResponse(new Response(body)),/Verifique se \/api/);
  assert.deepEqual(await readApiResponse(Response.json([])),[]);
});
test('worker informa origem ausente e rejeita requisição externa',async()=>{
  const req=new Request('https://site.example/api/models');
  assert.equal((await worker.fetch(req,{})).status,503);
  assert.equal((await worker.fetch(new Request(req,{headers:{Origin:'https://untrusted.example'}}),{BACKEND_ORIGIN:'https://backend.example'})).status,403);
});
