import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog,conversionCount,searchKey} from '../public/studio/catalog.js';

test('todas as conversões têm ID próprio e inversa executável',()=>{
  assert.equal(conversionCount,1098);assert.equal(catalog.length,1110);
  const lookup=new Map(catalog.map(t=>[t.group+'/'+t.title,t]));
  assert.equal(lookup.size,catalog.length);
  catalog.slice(0,conversionCount).forEach((tool,index)=>{
    assert.equal(tool.id,index);
    const [a,b]=tool.title.split(' → ');
    const inverse=lookup.get(tool.group+'/'+b+' → '+a);
    const converted=tool.run('1,25').split(' · ')[0];
    const original=Number(inverse.run(converted).split(' · ')[0].replace(',','.'));
    assert.ok(Math.abs(original-1.25)<1e-9,tool.title);
  });
  assert.equal(lookup.get('Comprimento/polegada → centímetro').run('1'),'2,54 · centímetro');
  assert.equal(lookup.get('Armazenamento/kibibyte (KiB) → byte').run('1'),'1024 · byte');
  assert.throws(()=>catalog[0].run('1,2.3'));assert.equal(searchKey('Pressão'),'pressao');
});
test('as doze ferramentas de texto produzem os resultados esperados',()=>{
 const examples=[['Olá mundo','2'],['e\u0301','1'],['á','2'],['a\na','a'],['b\na','a\nb'],['a\n \nb','a\nb'],['Olá, mundo!','ola-mundo'],['a\nb','1. a\n2. b'],['a b','a%20b'],['a%20b','a b'],['{"x":1}','{\n  "x": 1\n}'],['{ "x": 1 }','{"x":1}']];
 const text=catalog.slice(conversionCount);assert.equal(text.length,examples.length);
 text.forEach((tool,i)=>assert.equal(tool.run(examples[i][0]),examples[i][1],tool.title));
});

import {parseCSV, sortRows, toMarkdown, detectDelimiter} from '../public/studio/data.js';
import {textStats, formatJson} from '../public/studio/text.js';
test('CSV com aspas, ponto e vírgula, ordenação numérica e Markdown', () => {
  const csv = 'nome;cidade;total\n"Silva, Ana";Recife;10\nBruno;"São ""Paulo""";2\nCarla;Natal;1,5\n';
  assert.equal(detectDelimiter(csv), ';');
  const {header, rows} = parseCSV(csv);
  assert.deepEqual(header, ['nome', 'cidade', 'total']);
  assert.equal(rows[0][0], 'Silva, Ana'); assert.equal(rows[1][1], 'São "Paulo"');
  assert.deepEqual(sortRows(rows, 2, 'asc'), [2, 1, 0]);
  assert.deepEqual(sortRows(rows, 0, 'desc'), [0, 2, 1]);
  assert.deepEqual(sortRows(rows, 0, ''), [0, 1, 2]);
  assert.equal(toMarkdown(['a|b'], [['1']]), '| a\\|b |\n| --- |\n| 1 |');
});
test('contagem de palavras e caracteres e erro de JSON com linha e coluna', () => {
  assert.deepEqual(textStats('Olá mundo\nsegunda-feira'), {words: 3, chars: 23, charsNoSpaces: 21, lines: 2});
  assert.equal(formatJson('{"a":[1,2]}').output, '{\n  "a": [\n    1,\n    2\n  ]\n}');
  const bad = formatJson('{\n  "a": 1,\n  "b": [1, 2,]\n}');
  assert.equal(bad.ok, false); assert.equal(bad.error.line, 3); assert.equal(bad.error.column, 14);
  assert.match(bad.error.message, /Vírgula sobrando/);
  assert.equal(formatJson("{'x': 1}").error.column, 2);
  assert.match(formatJson('{"a": 1').error.message, /Esperava/);
});
