// Visualizador do próprio site: imagens (geradas, anexadas ou SVG) e arquivos de código.
// Abre num <dialog> modal; Esc fecha, setas trocam de item e o foco volta para quem abriu.
import { icon } from './icons.js';
import { highlightCode, saveFile, svgSource } from './render.js';

let dialog, state = {items: [], index: 0, trigger: null, zoom: false, code: false}, notify = () => {};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const extOf = type => ({'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg'}[type] || 'png');
const baseName = name => String(name || 'imagem').split('/').pop().replace(/\.[^.]+$/, '') || 'imagem';

export async function blobOf(src) { return (await fetch(src)).blob(); }

// Figurinha no formato do WhatsApp: 512 × 512, WebP de até 100 KB, fundo liso removido.
export async function toSticker(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const size = 512, pad = 16, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  const w = img.naturalWidth || size, h = img.naturalHeight || size, scale = Math.min((size - 2 * pad) / w, (size - 2 * pad) / h);
  const dw = Math.max(1, Math.round(w * scale)), dh = Math.max(1, Math.round(h * scale)), dx = Math.round((size - dw) / 2), dy = Math.round((size - dh) / 2);
  ctx.drawImage(img, dx, dy, dw, dh);
  const cut = removeBackground(ctx, dx, dy, dw, dh);
  for (const q of [0.92, 0.82, 0.72, 0.62, 0.5, 0.4]) {
    const blob = await new Promise(r => canvas.toBlob(r, 'image/webp', q));
    if (!blob || blob.type !== 'image/webp') break;
    if (blob.size <= 100 * 1024 || q === 0.4) return {blob, ext: 'webp', cut};
  }
  return {blob: await new Promise(r => canvas.toBlob(r, 'image/png')), ext: 'png', cut};
}

// Remove o fundo quando as quatro bordas têm a mesma cor sólida (preenchimento a partir das bordas).
export function removeBackground(ctx, x, y, w, h) {
  const data = ctx.getImageData(x, y, w, h), px = data.data, at = (i, j) => (j * w + i) * 4;
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].map(([i, j]) => Array.from(px.slice(at(i, j), at(i, j) + 4)));
  if (corners.some(c => c[3] < 250)) return false;
  const ref = corners[0], dist = o => Math.abs(px[o] - ref[0]) + Math.abs(px[o + 1] - ref[1]) + Math.abs(px[o + 2] - ref[2]);
  if (!corners.every(c => Math.abs(c[0] - ref[0]) + Math.abs(c[1] - ref[1]) + Math.abs(c[2] - ref[2]) < 60)) return false;
  const seen = new Uint8Array(w * h), stack = [];
  for (let i = 0; i < w; i++) stack.push(i, 0, i, h - 1);
  for (let j = 0; j < h; j++) stack.push(0, j, w - 1, j);
  while (stack.length) {
    const j = stack.pop(), i = stack.pop();
    if (i < 0 || j < 0 || i >= w || j >= h) continue;
    const k = j * w + i;
    if (seen[k]) continue;
    seen[k] = 1;
    if (dist(k * 4) > 54) continue;
    px[k * 4 + 3] = 0;
    stack.push(i + 1, j, i - 1, j, i, j + 1, i, j - 1);
  }
  ctx.putImageData(data, x, y);
  return true;
}

async function rasterPng(src, size = 1024) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const w = img.naturalWidth || size, h = img.naturalHeight || size, scale = size / Math.max(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise(r => canvas.toBlob(r, 'image/png'));
}

function build() {
  dialog = document.createElement('dialog');
  dialog.className = 'viewer';
  dialog.setAttribute('aria-labelledby', 'vtitle');
  dialog.innerHTML = '<header class="vhead"><div class="vtitle"><h2 id="vtitle"></h2><p id="vmeta"></p></div><div class="vactions"></div>' +
    '<button type="button" class="icon" data-v="close" aria-label="Fechar visualizador">' + icon('x') + '</button></header>' +
    '<nav class="vtabs" aria-label="Arquivos"></nav><div class="vstage" tabindex="-1"></div>' +
    '<footer class="vnav"><button type="button" class="icon" data-v="prev" aria-label="Item anterior">' + icon('left') + '</button><span class="vcount" aria-live="polite"></span>' +
    '<button type="button" class="icon" data-v="next" aria-label="Próximo item">' + icon('right') + '</button></footer>';
  document.body.append(dialog);
  dialog.addEventListener('click', e => {
    if (e.target === dialog) return dialog.close();
    const b = e.target.closest('[data-v]');
    if (b) act(b.dataset.v, b);
  });
  dialog.addEventListener('keydown', e => {
    if (e.target.closest('input,textarea')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); move(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
  });
  dialog.addEventListener('close', () => { dialog.querySelector('.vstage').replaceChildren(); state.trigger?.isConnected && state.trigger.focus(); });
}

function move(step) {
  if (state.items.length < 2) return;
  state.index = (state.index + step + state.items.length) % state.items.length;
  state.zoom = false; state.code = false;
  paint();
  dialog.querySelector('[data-v="' + (step > 0 ? 'next' : 'prev') + '"]').focus();
}

async function act(what, button) {
  const item = state.items[state.index];
  try {
    if (what === 'close') return dialog.close();
    if (what === 'prev') return move(-1);
    if (what === 'next') return move(1);
    if (what.startsWith('tab:')) { state.index = Number(what.slice(4)); state.zoom = false; state.code = false; paint(); return dialog.querySelector('[data-v="tab:' + state.index + '"]')?.focus(); }
    if (what === 'zoom') { state.zoom = !state.zoom; paint(); return dialog.querySelector('[data-v=zoom]')?.focus(); }
    if (what === 'svgcode') { state.code = !state.code; paint(); return dialog.querySelector('[data-v=svgcode]')?.focus(); }
    if (what === 'copy') { await navigator.clipboard.writeText(item.code); return notify('Código copiado.'); }
    if (what === 'file') { saveFile(item.path, item.code.endsWith('\n') ? item.code : item.code + '\n'); return notify(item.path.split('/').pop() + ' baixado.'); }
    if (what === 'image') {
      if (item.svg) { saveFile(baseName(item.name) + '.svg', item.svg, 'image/svg+xml'); return notify('SVG baixado.'); }
      const blob = await blobOf(item.src);
      saveFile(baseName(item.name) + '.' + extOf(blob.type), blob);
      return notify('Imagem baixada.');
    }
    if (what === 'png') { saveFile(baseName(item.name) + '.png', await rasterPng(item.src)); return notify('PNG baixado.'); }
    if (what === 'sticker') {
      button.disabled = true;
      const out = await toSticker(item.src);
      saveFile(baseName(item.name) + '-figurinha.' + out.ext, out.blob);
      notify(out.ext === 'webp' ? 'Figurinha baixada (512 × 512, WebP' + (out.cut ? ', fundo removido' : '') + ').' : 'Este navegador não gera WebP; a figurinha foi baixada em PNG.');
    }
  } catch { notify('Não foi possível concluir. Tente de novo.'); }
  finally { if (button?.isConnected) button.disabled = false; }
}

function paint() {
  const item = state.items[state.index], many = state.items.length > 1;
  dialog.querySelector('#vtitle').textContent = item.kind === 'code' ? item.path : item.name;
  dialog.querySelector('#vmeta').textContent = item.kind === 'code'
    ? [item.lang, item.code.split('\n').length + ' linhas', item.incomplete ? 'incompleto: a resposta foi cortada' : ''].filter(Boolean).join(' · ')
    : item.svg ? 'Imagem SVG criada na resposta' : item.caption || 'Imagem';
  const btn = (v, ic, label, primary) => '<button type="button" class="' + (primary ? 'primary' : 'secondary') + '" data-v="' + v + '">' + icon(ic) + esc(label) + '</button>';
  dialog.querySelector('.vactions').innerHTML = item.kind === 'code'
    ? btn('copy', 'copy', 'Copiar') + btn('file', 'download', 'Baixar', true)
    : (item.svg ? btn('svgcode', 'code', state.code ? 'Ver imagem' : 'Ver código') + btn('png', 'download', 'PNG') : btn('zoom', 'zoom', state.zoom ? 'Ajustar à tela' : 'Tamanho real')) +
      btn('sticker', 'sticker', 'Figurinha') + btn('image', 'download', item.svg ? 'SVG' : 'Baixar', true);
  const tabs = dialog.querySelector('.vtabs');
  tabs.hidden = !many || state.items.every(x => x.kind === 'image');
  tabs.innerHTML = state.items.map((x, k) => '<button type="button" data-v="tab:' + k + '"' + (k === state.index ? ' aria-current="true"' : '') + '>' + icon(x.kind === 'code' ? 'file' : 'image') + esc((x.path || x.name).split('/').pop()) + '</button>').join('');
  const stage = dialog.querySelector('.vstage');
  stage.className = 'vstage ' + (item.kind === 'code' || state.code ? 'code' : 'image') + (state.zoom ? ' zoomed' : '');
  if (item.kind === 'code' || state.code) {
    const pre = document.createElement('pre');
    pre.tabIndex = 0;
    pre.setAttribute('aria-label', 'Conteúdo de ' + (item.path || item.name));
    pre.append(highlightCode(item.code || item.svg));
    stage.replaceChildren(pre);
  } else {
    const img = document.createElement('img');
    img.src = item.src; img.alt = item.alt || item.name;
    img.addEventListener('click', () => act('zoom'));
    stage.replaceChildren(img);
  }
  const nav = dialog.querySelector('.vnav');
  nav.hidden = !many;
  dialog.querySelector('.vcount').textContent = (state.index + 1) + ' de ' + state.items.length;
}

// items: [{kind: 'image', src, name, alt, svg?} | {kind: 'code', path, lang, code, incomplete}]
export function openViewer(items, index = 0, trigger = document.activeElement, toast) {
  if (!items.length) return;
  if (!dialog) build();
  if (toast) notify = toast;
  state = {items: items.map(x => x.kind === 'code' && x.svg === undefined && /\.svg$/i.test(x.path) && /<svg[\s>]/i.test(x.code) && !x.incomplete
    ? {kind: 'image', src: svgSource(x.code), name: x.path, svg: x.code, alt: 'Imagem ' + x.path} : x), index: Math.max(0, Math.min(index, items.length - 1)), trigger, zoom: false, code: false};
  paint();
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('.vactions [data-v]')?.focus();
}
