// Monta o catálogo exibido no chat e na Biblioteca a partir de uma única fonte
// (models.config.mjs) e da descoberta real no OpenRouter.
import {CATALOG_CHECKED, aliases, curated, profiles, vendorOrder} from './models.config.mjs';

const curatedById = new Map(curated.map(item => [item.id, item]));
// Dentro de cada fornecedor, a ordem do catálogo (mais capaz e mais recente primeiro).
const curatedRank = new Map(curated.map((item, i) => [item.id, i]));
const CHECK_TTL = 7 * 86400000;

export function settings(env = process.env) {
  return {
    disabled: new Set(String(env.JACK_DISABLED_MODELS || '').split(',').map(s => s.trim()).filter(Boolean)),
    checks: env.JACK_ROUTE_CHECKS !== 'off'
  };
}

const capabilityList = route => ({
  text: true,
  code: true,
  vision: !!route.vision,
  files: !!route.files,
  reasoning: !!route.reasoning,
  longContext: (route.context || 0) >= 200000
});

// Estado de uma rota descoberta (ou só conhecida pelo catálogo).
function routeState(route, {checks, providers, verify}) {
  const meta = curatedById.get(route.id);
  const check = checks.get(route.id);
  const base = {...route, paid: true};
  if (meta) Object.assign(base, {
    name: meta.name, vendor: meta.vendor, description: meta.description, tasks: meta.tasks, stage: meta.stage,
    released: meta.released, source: meta.source, docs: meta.docs, checkedDocs: meta.checked, curated: true, verifiedDocs: meta.verified
  });
  base.preview = base.stage === 'prévia' || /preview|-exp\b|:exp|beta|alpha/i.test(route.apiId || '');
  base.tasks ||= ['conversa'];
  base.verification = check ? {ok: check.ok, date: check.checked, detail: check.detail} : null;
  let available = route.listed && route.available;
  let reason = route.reason || null, status = 'Disponível';
  if (!route.listed) {
    available = false; status = 'Indisponível';
    const provider = providers.find(p => p.name === (route.provider || 'OpenRouter'));
    reason = !provider?.connected ? (provider?.status || 'Provedor não configurado.') : 'Esta conta do ' + route.provider + ' não lista esta rota no momento.';
  } else if (meta && verify) {
    if (!check) { available = false; status = 'Verificando rota'; reason = 'A rota será liberada após uma chamada mínima bem-sucedida.'; }
    else if (!check.ok) { available = false; status = 'Falha na verificação'; reason = 'A última chamada mínima falhou: ' + (check.detail || 'sem detalhes') + '.'; }
  }
  return {...base, kind: 'route', available, status, reason, capabilities: capabilityList(base)};
}

function candidates(profile, routes) {
  const usable = routes.filter(r => r.available);
  const out = [];
  for (const token of profile.routes) {
    if (token === 'largest:*') out.push(...[...usable].sort((a, b) => (b.context || 0) - (a.context || 0)));
    else { const hit = usable.find(r => r.id === token); if (hit) out.push(hit); }
  }
  return [...new Map(out.map(r => [r.id, r])).values()];
}

const snapshot = route => route && ({id: route.id, apiId: route.apiId, name: route.name, vendor: route.vendor, host: route.host, vision: route.vision, reasoning: !!route.reasoning, context: route.context, price: route.price || null});

export function buildCatalog({discovery, checks = new Map(), user = null, env = process.env}) {
  const conf = settings(env);
  const providers = discovery.providers || [];
  // Só rotas do catálogo entram, mesmo que a descoberta traga outras.
  const listed = discovery.routes.filter(r => curatedById.has(r.id) && !conf.disabled.has(r.id));
  const known = new Set(listed.map(r => r.id));
  const missing = curated.filter(c => c.enabled && !known.has(c.id) && !conf.disabled.has(c.id))
    .map(c => ({id: c.id, apiId: c.apiId, name: c.name, vendor: c.vendor, host: c.host, provider: c.provider, listed: false, available: false,
      vision: c.verified.inputs.includes('imagem'), files: c.verified.inputs.includes('arquivo'), context: c.verified.context, price: null}));
  const routes = [...listed, ...missing].filter(r => curatedById.get(r.id)?.enabled !== false)
    .map(r => routeState(r, {checks, providers, verify: conf.checks}));

  const signedIn = !!user?.email;
  const jack = profiles.filter(p => !conf.disabled.has(p.id)).map(profile => {
    const list = candidates(profile, routes);
    const route = list[0] || null;
    const vision = list.find(r => r.vision) || null;
    let available = !!route, reason = route ? null : 'Nenhuma rota compatível está disponível agora.';
    if (profile.access === 'account' && !signedIn) { available = false; reason = 'Entre na sua conta para usar o ' + profile.name + '.'; }
    return {
      id: profile.id, kind: 'profile', name: profile.name, vendor: 'Jack AI', when: profile.when, description: profile.description,
      tasks: profile.tasks, access: profile.access, controls: profile.controls || [], media: profile.media || null, available, reason,
      status: available ? 'Disponível' : 'Indisponível', route: snapshot(route), visionRoute: snapshot(vision),
      routes: list.map(r => r.id), host: route?.host || null, context: route?.context || null,
      capabilities: {text: true, code: true, vision: !!vision, files: !!route?.files, reasoning: !!route?.reasoning, longContext: (route?.context || 0) >= 200000},
      paid: true, preview: false
    };
  });

  const order = name => { const i = vendorOrder.indexOf(name); return i < 0 ? 100 : i; };
  const models = [...jack, ...routes.sort((a, b) => order(a.vendor) - order(b.vendor) || a.vendor.localeCompare(b.vendor, 'pt-BR')
    || Number(b.available) - Number(a.available) || (curatedRank.get(a.id) ?? 1000) - (curatedRank.get(b.id) ?? 1000) || a.name.localeCompare(b.name, 'pt-BR'))];
  const key = discovery.keys?.openrouter || null;
  return {
    checked: CATALOG_CHECKED,
    providers,
    signedIn,
    aliases: {...aliases},
    // Saldo real da chave do operador (GET /api/v1/key). Valores em dólares.
    limits: {
      openrouter: key && {limit: key.limit, limitRemaining: key.limitRemaining, usage: key.usage},
      jack: {generationsPerMinute: 20}
    },
    models
  };
}

export const canonicalId = id => aliases[id] || id;

// Escolhe a rota real para um pedido. Lança erro com alternativas quando não há rota.
export function resolveEntry(catalog, requested, needs = {}) {
  const id = canonicalId(requested);
  const entry = catalog.models.find(m => m.id === id);
  const alternatives = () => catalog.models.filter(m => m.available && m.id !== id && (!needs.vision || m.capabilities.vision)).slice(0, 3).map(m => ({id: m.id, name: m.name}));
  const fail = (message, status = 400) => { throw Object.assign(new Error(message), {status, extra: {alternatives: alternatives()}}); };
  if (!entry) fail('Este modelo não está mais no catálogo. Escolha outro para continuar.', 404);
  if (!entry.available) fail(entry.reason || 'Este modelo está indisponível agora.', entry.access === 'account' && !catalog.signedIn ? 403 : 409);
  if (entry.kind === 'profile') {
    const routeId = needs.vision ? entry.visionRoute?.id : entry.route?.id;
    if (!routeId) fail('O ' + entry.name + ' não tem uma rota com análise de imagens disponível agora.');
    const route = catalog.models.find(m => m.id === routeId);
    return {entry, route};
  }
  if (needs.vision && !entry.vision) fail('O modelo ' + entry.name + ' não aceita imagens.');
  return {entry, route: entry};
}

// Rotas do catálogo que precisam de uma chamada mínima antes da liberação.
export function pendingChecks(discovery, checks, env = process.env) {
  const conf = settings(env);
  if (!conf.checks) return [];
  const now = Date.now();
  return discovery.routes.filter(route => {
    if (!route.listed || !curatedById.has(route.id) || conf.disabled.has(route.id)) return false;
    const check = checks.get(route.id);
    if (!check) return true;
    if (check.ok) return now - check.checked > CHECK_TTL;
    return check.retryAt ? now > check.retryAt : now - check.checked > 6 * 3600000;
  });
}

export {snapshot as routeSnapshot};
