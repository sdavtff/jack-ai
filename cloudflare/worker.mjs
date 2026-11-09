const error = (message, status) => Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    let backend;
    try {
      backend = new URL(env.BACKEND_ORIGIN);
      if (backend.protocol !== 'https:' || backend.host === url.host || backend.href !== backend.origin + '/') throw Error();
    } catch {
      return error('Configure BACKEND_ORIGIN com a origem HTTPS do servidor Jack AI.',503);
    }
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return error('Origem inválida.',403);
    const headers = new Headers({'Content-Type':'application/json'});
    // Forward only the Jack session cookie to the configured origin.
    const cookie = request.headers.get('Cookie')?.match(/(?:^|;\s*)(jack=[a-f0-9]+)(?:;|$)/);
    if (cookie) headers.set('Cookie',cookie[1]);
    if (origin) headers.set('Origin',backend.origin);
    backend.pathname = url.pathname;
    backend.search = url.search;
    try {
      const upstream = await fetch(backend,{method:request.method,headers,body:request.body,redirect:'manual',signal:request.signal});
      if (upstream.status >= 300 && upstream.status < 400) return error('A origem da API redirecionou a solicitação. Confira BACKEND_ORIGIN.',502);
      return upstream;
    } catch {
      return error('O Worker não conseguiu alcançar o backend Jack AI.',502);
    }
  }
};
