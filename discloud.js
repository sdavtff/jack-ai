// Discloud invokes MAIN directly. Read the operator's secrets before loading providers.
import {existsSync} from 'node:fs';
if (Number(process.versions.node.split('.')[0]) < 24) {
  throw new Error('O Jack AI precisa de Node.js 24 ou superior com node:sqlite. Confira VERSION na Discloud.');
}
if (existsSync('.env')) process.loadEnvFile('.env');
process.env.HOST = '0.0.0.0';
process.env.PORT = '8080';
process.env.COOKIE_SECURE = 'true';
// Endereço público do site na Discloud (usado no retorno do login com Google).
process.env.PUBLIC_URL ??= 'https://jackai.discloud.app';
await import('./server.mjs');
