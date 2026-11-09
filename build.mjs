import {readdir,cp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
async function check(dir){for(const item of await readdir(dir,{withFileTypes:true})){const file=dir+'/'+item.name;if(['data','dist','node_modules','.git'].includes(item.name)||item.name.startsWith('.'))continue;if(item.isDirectory())await check(file);else if(/\.(js|mjs)$/.test(file))execFileSync(process.execPath,['--check',file])}}
await check('.');await rm('dist',{recursive:true,force:true});for(const file of ['public','server.mjs','providers.mjs','catalog.mjs','models.config.mjs','migrations','package.json'])await cp(file,'dist/'+file,{recursive:true});console.log('Build de produção disponível em dist/.');
