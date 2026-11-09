import test from 'node:test';
import assert from 'node:assert/strict';
import {extractFiles, projectFiles, cleanPath, parseInfo, zipName} from '../public/files.js';
import {crc32, makeZip} from '../public/zip.js';

test('blocos de código viram arquivos com o nome certo', () => {
  const md = [
    'Projeto:', '', '**main.lua**', '```lua', 'print(1)', '```', '',
    '```js src/app.js', 'console.log(1)', '```', '',
    '```python title="tools/run.py"', 'print(2)', '```', '',
    '```css', '/* arquivo: estilos/base.css */', 'body{}', '```', '',
    '```html', '<p></p>', '```', '',
    '```lua', 'return 1', '```', '',
    '```lua', 'return 2', '```', '',
    'Rode:', '```bash', 'lua main.lua', '```', '',
    '```main.lua', 'print(3)', '```'
  ].join('\n');
  const all = extractFiles(md);
  assert.equal(all.length, 9);
  assert.deepEqual(projectFiles(md).map(f => f.path), ['main.lua', 'src/app.js', 'tools/run.py', 'estilos/base.css', 'index.html', 'arquivo-2.lua', 'arquivo-3.lua', 'main-2.lua']);
  assert.equal(all.find(b => b.lang === 'bash').skip, true, 'comando curto de terminal não vira arquivo');
  assert.equal(projectFiles(md)[0].code, 'print(1)');
  assert.equal(projectFiles(md).at(-1).lang, 'lua', 'linguagem vem da extensão quando a abertura só traz o nome');
});

test('resposta cortada marca o arquivo como incompleto; caminhos perigosos são limpos', () => {
  const files = projectFiles('```lua main.lua\nprint(1)\nprint(2');
  assert.equal(files[0].incomplete, true); assert.equal(files[0].lines, 2);
  assert.equal(cleanPath('../../etc/passwd'), 'etc/passwd');
  assert.equal(cleanPath('C:\\Users\\a\\app.js'), 'Users/a/app.js');
  assert.equal(cleanPath('/abs/x<y>.js'), 'abs/xy.js');
  assert.deepEqual(parseInfo('ts file=./lib/a.ts'), {lang: 'ts', path: 'lib/a.ts'});
  assert.deepEqual(parseInfo('Dockerfile'), {lang: 'dockerfile', path: ''});
  assert.equal(projectFiles('```Dockerfile\nFROM node:24\n```')[0].path, 'Dockerfile');
  assert.equal(projectFiles('```\n\n```').length, 0, 'bloco vazio não vira arquivo');
  assert.equal(zipName('Crie um pequeno script Lua!'), 'crie-um-pequeno-script-lua.zip');
  assert.equal(zipName(''), 'jack-ai-arquivos.zip');
});

test('o .zip gerado é válido e devolve os arquivos intactos', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
  const files = [{path: 'main.lua', data: 'print("olá")\n'}, {path: 'utils/texto.lua', data: 'return {}\n'}];
  const zip = makeZip(files, new Date(2026, 10, 9, 17, 30, 10));
  const view = new DataView(zip.buffer), dec = new TextDecoder();
  const end = zip.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054B50);
  assert.equal(view.getUint16(end + 10, true), 2);
  let at = view.getUint32(end + 16, true);
  const out = [];
  for (let n = 0; n < 2; n++) {
    assert.equal(view.getUint32(at, true), 0x02014B50);
    const size = view.getUint32(at + 24, true), nameLen = view.getUint16(at + 28, true), local = view.getUint32(at + 42, true), crc = view.getUint32(at + 16, true);
    const name = dec.decode(zip.subarray(at + 46, at + 46 + nameLen));
    const localName = view.getUint16(local + 26, true), data = zip.subarray(local + 30 + localName, local + 30 + localName + size);
    assert.equal(crc32(data), crc);
    out.push([name, dec.decode(data)]);
    at += 46 + nameLen;
  }
  assert.deepEqual(out, files.map(f => [f.path, f.data]));
});
