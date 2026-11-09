// Factors are expressed in one base unit per category. Decimal and IEC storage
// prefixes are deliberately distinct. US liquid units use the US liquid gallon.
const groups = {
  Comprimento: { 'milímetro':.001, 'centímetro':.01, 'decímetro':.1, 'metro':1, 'decâmetro':10, 'hectômetro':100, 'quilômetro':1000, 'micrômetro':1e-6, 'nanômetro':1e-9, 'polegada':.0254, 'pé':.3048, 'jarda':.9144, 'milha terrestre':1609.344, 'milha náutica':1852 },
  Massa: {'micrograma':1e-6,'miligrama':.001,'centigrama':.01,'decigrama':.1,'grama':1,'decagrama':10,'hectograma':100,'quilograma':1000,'tonelada métrica':1e6,'libra avoirdupois':453.59237,'onça avoirdupois':453.59237/16,'quilate métrico':.2,'stone':453.59237*14},
  Tempo: {'nanossegundo':1e-9,'microssegundo':1e-6,'milissegundo':.001,'segundo':1,'minuto':60,'hora':3600,'dia de 24 h':86400,'semana':604800,'quinzena de 15 dias':1296000,'ano juliano (365,25 dias)':31557600},
  Área: {'milímetro quadrado':1e-6,'centímetro quadrado':.0001,'decímetro quadrado':.01,'metro quadrado':1,'are':100,'hectare':10000,'quilômetro quadrado':1e6,'polegada quadrada':.0254**2,'pé quadrado':.3048**2,'jarda quadrada':.9144**2,'acre internacional':4046.8564224,'milha quadrada':1609.344**2},
  Volume: {'microlitro':1e-6,'mililitro':.001,'centilitro':.01,'decilitro':.1,'litro':1,'decalitro':10,'hectolitro':100,'metro cúbico':1000,'polegada cúbica':.016387064,'pé cúbico':28.316846592,'galão líquido EUA':3.785411784,'onça fluida EUA':3.785411784/128,'pinta líquida EUA':3.785411784/8},
  Armazenamento: {'bit':.125,'byte':1,'kilobyte (kB)':1e3,'megabyte (MB)':1e6,'gigabyte (GB)':1e9,'terabyte (TB)':1e12,'kibibyte (KiB)':1024,'mebibyte (MiB)':1024**2,'gibibyte (GiB)':1024**3,'tebibyte (TiB)':1024**4,'kilobit (kbit)':125,'megabit (Mbit)':125000,'gigabit (Gbit)':125000000},
  Velocidade: {'metro por segundo':1,'quilômetro por hora':1/3.6,'milha por hora':.44704,'nó náutico':1852/3600,'pé por segundo':.3048,'centímetro por segundo':.01,'quilômetro por segundo':1000,'metro por minuto':1/60},
  Frequência: {'hertz':1,'quilohertz':1000,'megahertz':1e6,'gigahertz':1e9,'terahertz':1e12,'ciclo por minuto':1/60,'ciclo por hora':1/3600},
  Energia: {'joule':1,'quilojoule':1000,'megajoule':1e6,'watt-hora':3600,'quilowatt-hora':3.6e6,'megawatt-hora':3.6e9,'caloria termoquímica':4.184,'quilocaloria termoquímica':4184,'erg':1e-7},
  Pressão: {'pascal':1,'hectopascal':100,'quilopascal':1000,'megapascal':1e6,'bar':100000,'atmosfera padrão':101325,'torr':101325/760,'libra-força por polegada quadrada':.45359237*9.80665/.0254**2}
};

const format = new Intl.NumberFormat('pt-BR',{maximumSignificantDigits:12,useGrouping:false});
function number(input) {
  const raw=input.trim();
  if(!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(raw)) throw Error('Digite um número sem separador de milhares. Use vírgula ou ponto para os decimais.');
  const value=Number(raw.replace(',','.'));
  if(!Number.isFinite(value))throw Error('O valor excede o intervalo numérico.');
  return value;
}

export const catalog=[];
function add(group,title,hint,run){
  catalog.push({id:catalog.length,group,title,hint,run});
}
for(const [group,units] of Object.entries(groups)){
  for(const [from,a] of Object.entries(units)){
    for(const [to,b] of Object.entries(units)){
      if(from===to)continue;
      add(group,from+' → '+to,'Valor em '+from+' (sem separador de milhares)',input=>{
        const result=number(input)*(a/b);
        if(!Number.isFinite(result))throw Error('Resultado fora do intervalo.');
        return format.format(result)+' · '+to;
      });
    }
  }
}
export const conversionCount=catalog.length;
function textTool(title,run){add('Texto e código',title,'Texto de entrada',run)}
textTool('Contar palavras',s=>String((s.match(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu)||[]).length));
textTool('Contar caracteres visíveis (grafemas)',s=>String([...new Intl.Segmenter('pt-BR').segment(s)].length));
textTool('Contar bytes UTF-8',s=>String(new TextEncoder().encode(s).length));
textTool('Remover linhas repetidas',s=>[...new Set(s.split(/\r?\n/))].join('\n'));
textTool('Ordenar linhas em português',s=>s.split(/\r?\n/).sort(new Intl.Collator('pt-BR',{numeric:true}).compare).join('\n'));
textTool('Remover linhas em branco',s=>s.split(/\r?\n/).filter(line=>line.trim()).join('\n'));
textTool('Criar slug para URL',s=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''));
textTool('Numerar linhas',s=>s.split(/\r?\n/).map((line,i)=>(i+1)+'. '+line).join('\n'));
textTool('Codificar componente de URL',encodeURIComponent);
textTool('Decodificar componente de URL',s=>{try{return decodeURIComponent(s)}catch{throw Error('A sequência de caracteres da URL é inválida.')}});
function json(input){try{return JSON.parse(input)}catch{throw Error('Confira a sintaxe do JSON. Use aspas duplas nas chaves e nos textos.')}}
textTool('Formatar JSON',s=>JSON.stringify(json(s),null,2));
textTool('Compactar JSON',s=>JSON.stringify(json(s)));
export function searchKey(text){return text.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase()}
// Unidades por categoria, na ordem do catálogo, para a tela Medidas do Estúdio.
export const unitGroups=Object.fromEntries(Object.entries(groups).map(([group,units])=>[group,Object.keys(units)]));
