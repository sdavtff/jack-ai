export async function readApiResponse(response) {
  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('A API do Jack AI devolveu uma resposta inválida (HTTP ' + response.status + '). Verifique se /api está conectado ao backend.');
  }
  if (!response.ok) throw Object.assign(new Error(data?.error || 'A API retornou HTTP ' + response.status + '.'), {status: response.status, data});
  return data;
}
