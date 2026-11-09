// Funções puras do workspace, testadas em tests/workspace.mjs.

// Rascunhos por conversa. A memória guarda tudo (inclusive imagens) enquanto a aba
// está aberta. O armazenamento local guarda só texto, arquivos de texto e o modo de
// edição, para retomar depois de recarregar. Conversas temporárias nunca entram aqui:
// quem chama não passa a chave delas.
export function createDrafts(storage = null, owner = 'anon') {
  const memory = new Map();
  const key = 'jack.drafts.v2.' + owner;
  const read = () => { try { return JSON.parse(storage?.getItem(key) || '{}'); } catch { return {}; } };
  const write = data => { try { storage?.setItem(key, JSON.stringify(data)); } catch { /* cota cheia ou armazenamento bloqueado */ } };
  const empty = d => !d || (!String(d.text || '').trim() && !d.files?.length && !d.images?.length && (d.edit === null || d.edit === undefined));
  const id = chat => chat || 'new';
  return {
    save(chat, draft) {
      const k = id(chat), stored = read();
      if (empty(draft)) { memory.delete(k); delete stored[k]; }
      else {
        memory.set(k, draft);
        stored[k] = {text: draft.text || '', files: (draft.files || []).filter(f => f.text !== undefined && f.text.length <= 82000).map(({name, size, text}) => ({name, size, text})), edit: draft.edit ?? null, options: draft.options || null, updated: Date.now()};
      }
      write(stored);
    },
    get(chat) { const k = id(chat); return memory.get(k) || read()[k] || null; },
    take(chat) { const d = this.get(chat); this.forget(chat); return d; },
    forget(chat) { const k = id(chat), stored = read(); memory.delete(k); if (k in stored) { delete stored[k]; write(stored); } },
    move(from, to) { const d = this.get(from); if (!d) return; this.forget(from); this.save(to, d); },
    has(chat) { return !empty(this.get(chat)); },
    clear() { memory.clear(); try { storage?.removeItem(key); } catch {} }
  };
}

export function matchesChat(chat, query) {
  const term = query.trim().toLocaleLowerCase('pt-BR');
  return !term || chat.title.toLocaleLowerCase('pt-BR').includes(term) ||
    chat.messages.some(message => message.content.toLocaleLowerCase('pt-BR').includes(term));
}

// Trecho com a primeira ocorrência do termo no conteúdo, para a lista de resultados.
export function matchSnippet(chat, query) {
  const term = query.trim().toLocaleLowerCase('pt-BR');
  if (!term || chat.title.toLocaleLowerCase('pt-BR').includes(term)) return '';
  for (const m of chat.messages) {
    const at = m.content.toLocaleLowerCase('pt-BR').indexOf(term);
    if (at >= 0) return (at > 24 ? '…' : '') + m.content.slice(Math.max(0, at - 24), at + term.length + 40).replace(/\s+/g, ' ').trim() + '…';
  }
  return '';
}

export function preferredModel(models, current) {
  const available = models.filter(model => model.available);
  return (available.find(model => model.id === current) || available.find(model => model.id === 'jack/flash') || available[0])?.id || '';
}

export const suggestions = [
  {id: 'code', icon: 'code', label: 'Escrever código', text: 'Ajude-me a implementar esta funcionalidade em …', select: '…'},
  {id: 'write', icon: 'pen', label: 'Lapidar um texto', text: 'Revise o texto abaixo mantendo meu tom de voz.\n\n', select: null},
  {id: 'ideas', icon: 'bulb', label: 'Explorar ideias', text: 'Sugira cinco ideias para …', select: '…'}
];

// Insere a sugestão sem apagar o rascunho e devolve onde posicionar o cursor.
export function applySuggestion(draft, suggestion) {
  const current = String(draft || '');
  const prefix = current.trim() ? current.replace(/\s+$/, '') + '\n\n' : '';
  const text = prefix + suggestion.text;
  if (suggestion.select) {
    const start = prefix.length + suggestion.text.lastIndexOf(suggestion.select);
    return {text, start, end: start + suggestion.select.length};
  }
  return {text, start: text.length, end: text.length};
}

export const isImage = file => !!file.image || /^image\//.test(file.type || '');

// Arquivos que impedem o uso de um modelo. Hoje, só imagens exigem análise de imagens.
export function incompatibleFiles(model, files) {
  if (!model) return [];
  return files.filter(f => isImage(f) && !model.capabilities?.vision).map(f => ({file: f, reason: 'precisa de um modelo com análise de imagens'}));
}

export function groupModels(models, {favorites = [], query = '', availableOnly = false, order = []} = {}) {
  const term = query.trim().toLocaleLowerCase('pt-BR');
  const visible = models.filter(m => (!availableOnly || m.available) &&
    (!term || [m.name, m.vendor, m.host, m.description, m.when].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(term)));
  const groups = [];
  const fav = visible.filter(m => favorites.includes(m.id));
  if (fav.length) groups.push({title: 'Favoritos', items: fav});
  const sections = new Map();
  for (const m of visible) { const t = m.kind === 'profile' ? 'Jack AI' : m.vendor; if (!sections.has(t)) sections.set(t, []); sections.get(t).push(m); }
  const rank = t => { const i = order.indexOf(t); return i < 0 ? 100 : i; };
  [...sections.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'pt-BR')).forEach(t => groups.push({title: t, items: sections.get(t)}));
  return groups;
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toLocaleString('pt-BR', {maximumFractionDigits: 1}) + ' KB';
  return (n / 1048576).toLocaleString('pt-BR', {maximumFractionDigits: 1}) + ' MB';
}

export function formatTokens(n) {
  if (!n) return '';
  if (n >= 1000000) return (n / 1000000).toLocaleString('pt-BR', {maximumFractionDigits: 2}) + ' mi de tokens';
  return Math.round(n / 1000).toLocaleString('pt-BR') + ' mil tokens';
}

// Nome legível para mensagens antigas, mesmo quando o modelo saiu do catálogo.
export function modelLabel(models, message) {
  const entry = models.find(m => m.id === message.model);
  const route = message.route;
  if (entry?.kind === 'profile' || /^jack\//.test(message.model || '')) {
    const name = entry?.name || 'Jack AI';
    return route ? name + ' · ' + route.name : name;
  }
  if (entry) return entry.name;
  if (route?.name) return route.name + (models.length ? ' (fora do catálogo)' : '');
  return message.model ? String(message.model).split('/').pop() + ' (descontinuado)' : '';
}
