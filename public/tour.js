// Tutorial guiado: destaca cada ferramenta da interface, um passo por vez.
// Acessível pelo teclado (setas, Enter, Esc), com foco preso no cartão e o resto da página inerte.
import {icon} from './icons.js';

export const TOUR_VERSION = 1;

const art = {
  files: '<div class="tour-demo" aria-hidden="true">' +
    '<div class="tdchip">' + icon('file') + '<b>main.lua</b><small>lua · 12 linhas</small><span>' + icon('eye') + 'Ver</span></div>' +
    '<div class="tdchip">' + icon('file') + '<b>utils/texto.lua</b><small>lua · 9 linhas</small><span>' + icon('eye') + 'Ver</span></div>' +
    '<div class="tdzip"><i>' + icon('archive') + '</i><div><b>meu-projeto.zip</b><small>2 arquivos</small></div><em>' + icon('download') + '.zip</em></div></div>',
  image: '<div class="tour-demo pics" aria-hidden="true"><div class="tdpic"><span></span></div>' +
    '<div class="tdarrow">' + icon('right') + '</div><div class="tdpic sticker"><span></span></div>' +
    '<p>' + icon('sticker') + 'Figurinha WebP 512 × 512, fundo removido</p></div>'
};

// Cada passo: alvo (seletor), título, texto. "sidebar" abre a navegação no celular.
export function tourSteps({name = '', account = false} = {}) {
  const first = account ? String(name || '').trim().split(/\s+/)[0] : '';
  return [
    {title: 'Boas-vindas ao Jack AI' + (first ? ', ' + first : '') + '!', text: 'Este tutorial mostra, passo a passo, como usar cada ferramenta. Use os botões ou as setas do teclado. Você pode pular quando quiser e rever depois em Configurações.', welcome: true},
    {target: '#composer', title: 'Campo de mensagem', text: 'Escreva o que você precisa e envie. No computador, Enter envia e Shift + Enter quebra a linha; no celular, use o botão de enviar. Também dá para colar ou arrastar arquivos aqui.'},
    {target: '#modelbtn', title: 'Escolha o modelo', text: 'Os perfis Jack AI escolhem o melhor modelo para cada tarefa: Flash para o dia a dia, Pro para tarefas difíceis, Code para programar, Studio para textos criativos e Imagem para criar imagens. Você também pode escolher um modelo específico e marcar favoritos com a estrela.'},
    {target: '#effort', title: 'Nível de esforço', text: 'Defina quanto o modelo pensa antes de responder: Automático, Baixo, Médio ou Alto. Mais esforço ajuda em problemas difíceis, mas leva mais tempo. O raciocínio aparece recolhido acima da resposta.'},
    {target: '#web', title: 'Pesquisa na web', text: 'Ative para o Jack AI buscar informações atuais na internet. As fontes aparecem no fim da resposta, com links para conferir.'},
    {target: '#attach', title: 'Anexos', text: 'Envie até 4 arquivos por mensagem: imagem (PNG, JPEG ou WebP), PDF, texto, código ou planilha CSV. Se o modelo escolhido não aceitar algum arquivo, o Jack AI avisa antes de enviar.'},
    {target: '#tempchip', title: 'Chat temporário', text: 'Converse sem salvar: a conversa não entra no histórico e é descartada quando a página é recarregada.'},
    {target: '#mic', title: 'Ditado e leitura em voz alta', text: 'Toque no microfone e fale: o texto aparece no campo. Em cada resposta, “Ouvir” lê o texto em voz alta.'},
    {title: 'Arquivos e visualizador', text: 'Quando a IA cria código, cada arquivo aparece como um cartão na conversa. Um arquivo chega pronto para baixar; 2 ou mais chegam juntos num .zip. Toque em “Ver” para abrir no visualizador, trocar de arquivo, copiar ou baixar.', art: art.files},
    {title: 'Imagens e figurinhas', text: 'Escolha “Jack AI Imagem” no seletor para criar ilustrações, ícones e figurinhas. As imagens aparecem no próprio chat: toque para ampliar. No visualizador, “Figurinha” baixa um WebP 512 × 512 com o fundo liso removido. Peça ajustes e ele edita a última imagem.', art: art.image},
    {target: '#sidebar .search', sidebar: true, title: 'Histórico e busca', text: 'Encontre conversas pelo título ou pelo conteúdo (Ctrl + /). No menu ⋯ de cada conversa você renomeia, fixa, arquiva ou exclui.'},
    {target: '#sidebar .navlist [data-view=library]', sidebar: true, title: 'Biblioteca de modelos', text: 'Compare os modelos por tarefa e capacidade: análise de imagens, PDF, esforço ajustável e criação de imagens. Escolha um e use direto na conversa.'},
    {target: '#sidebar .navlist [data-view=studio]', sidebar: true, title: 'Estúdio de ferramentas', text: 'Ferramentas que funcionam sem IA: Medidas (conversão de unidades), Dados (abra um CSV, ordene e escolha linhas) e Texto e código (formatar JSON, contar palavras). “Usar na conversa” leva o resultado para o campo.'},
    {target: '#sidebar .foot [data-action=settings]', sidebar: true, title: 'Configurações', text: 'Ajuste o tamanho das respostas, as instruções personalizadas e a aparência, baixe seus dados e reveja este tutorial quando quiser.'},
    {target: '#sidebar .foot [data-action=account]', sidebar: true, title: 'Sua conta', text: account ? 'Suas conversas ficam salvas na conta e aparecem em qualquer dispositivo. Por aqui você também sai da conta.' : 'Entre com o Google ou com e-mail para guardar as conversas na conta, usar o Jack AI Pro e o Jack AI Imagem em qualquer dispositivo.'},
    {title: 'Tudo pronto!', text: 'Pressione ? a qualquer momento para ver os atalhos de teclado. Bom proveito!', last: true}
  ];
}

const visible = el => !!el && !el.hidden && !el.closest('[hidden]') && el.getClientRects().length > 0;

// hooks: {openSidebar(), closeSidebar(), mobile(), done(finished: boolean)}
export function startTour(steps, hooks) {
  document.querySelector('.tour')?.remove();
  const usable = steps.filter(s => !s.target || s.sidebar || visible(document.querySelector(s.target)));
  if (!usable.length) return;
  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = '<div class="tour-hole" aria-hidden="true"></div>' +
    '<section class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourtitle" aria-describedby="tourtext">' +
    '<div class="tour-top"><p class="tour-step" id="tourstep"></p><button type="button" class="icon" data-t="skip" aria-label="Fechar tutorial">' + icon('x') + '</button></div>' +
    '<div class="tour-bar" aria-hidden="true"><i></i></div>' +
    '<h2 id="tourtitle" tabindex="-1"></h2><div class="tour-art"></div><p id="tourtext"></p>' +
    '<div class="tour-actions"><button type="button" class="linkbtn" data-t="skip">Pular tutorial</button><span></span>' +
    '<button type="button" class="secondary" data-t="prev">' + icon('left') + 'Voltar</button><button type="button" class="primary" data-t="next">Próximo' + icon('right') + '</button></div></section>';
  const outside = [...document.body.children].filter(el => !el.inert && el.tagName !== 'SCRIPT');
  outside.forEach(el => { el.inert = true; });
  document.body.append(root);
  document.body.classList.add('touring');
  const hole = root.querySelector('.tour-hole'), card = root.querySelector('.tour-card');
  const opener = document.activeElement;
  let index = 0, frame = 0, sidebarOpened = false;

  function target() {
    const s = usable[index];
    return s.target ? document.querySelector(s.target) : null;
  }
  function place() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const el = target(), vw = innerWidth, vh = innerHeight, gap = 12;
      const narrow = hooks.mobile?.();
      card.style.removeProperty('left'); card.style.removeProperty('top');
      if (!el || !visible(el)) {
        hole.classList.add('none');
        root.classList.toggle('center', true);
        return;
      }
      root.classList.remove('center');
      const r = el.getBoundingClientRect(), pad = 6;
      const box = {left: Math.max(4, r.left - pad), top: Math.max(4, r.top - pad), right: Math.min(vw - 4, r.right + pad), bottom: Math.min(vh - 4, r.bottom + pad)};
      hole.classList.remove('none');
      Object.assign(hole.style, {left: box.left + 'px', top: box.top + 'px', width: (box.right - box.left) + 'px', height: (box.bottom - box.top) + 'px'});
      const cw = card.offsetWidth, ch = card.offsetHeight;
      let left, top;
      if (narrow) {
        // Celular: cartão ocupa a largura, do lado oposto ao destaque.
        left = 12; top = (box.top + box.bottom) / 2 > vh / 2 ? Math.max(12, box.top - ch - gap) : Math.min(vh - ch - 12, box.bottom + gap);
      } else if (vh - box.bottom >= ch + gap * 2) { top = box.bottom + gap; left = box.left; }
      else if (box.top >= ch + gap * 2) { top = box.top - ch - gap; left = box.left; }
      else if (vw - box.right >= cw + gap * 2) { left = box.right + gap; top = box.top; }
      else { left = box.left - cw - gap; top = box.top; }
      left = Math.min(Math.max(12, left), vw - cw - 12); top = Math.min(Math.max(12, top), vh - ch - 12);
      card.style.left = left + 'px'; card.style.top = top + 'px';
    });
  }
  function show(next) {
    index = Math.max(0, Math.min(usable.length - 1, next));
    const s = usable[index];
    if (s.sidebar && hooks.mobile?.()) { if (!sidebarOpened) { hooks.openSidebar?.(); sidebarOpened = true; } }
    else if (sidebarOpened) { hooks.closeSidebar?.(); sidebarOpened = false; }
    root.querySelector('#tourstep').textContent = 'Passo ' + (index + 1) + ' de ' + usable.length;
    root.querySelector('.tour-bar i').style.width = ((index + 1) / usable.length * 100) + '%';
    root.querySelector('#tourtitle').textContent = s.title;
    root.querySelector('#tourtext').textContent = s.welcome ? s.text.replace('passo a passo', 'em ' + usable.length + ' passos rápidos') : s.text;
    const artBox = root.querySelector('.tour-art'); artBox.innerHTML = s.art || ''; artBox.hidden = !s.art;
    const prev = root.querySelector('[data-t=prev]'), nextBtn = root.querySelector('[data-t=next]');
    prev.hidden = index === 0;
    nextBtn.innerHTML = s.last ? 'Começar a conversar' : s.welcome ? 'Começar o tutorial' + icon('right') : 'Próximo' + icon('right');
    root.querySelector('.tour-actions .linkbtn').hidden = !!s.last;
    root.dataset.step = String(index + 1);
    const el = target();
    if (el && visible(el)) el.scrollIntoView({block: 'nearest', inline: 'nearest'});
    place();
    // Gaveta do celular desliza: reposiciona quando a animação termina.
    setTimeout(place, 320);
    root.querySelector('#tourtitle').focus({preventScroll: true});
  }
  function finish(completed) {
    cancelAnimationFrame(frame);
    removeEventListener('keydown', keys, true); removeEventListener('resize', place); removeEventListener('scroll', place, true);
    outside.forEach(el => { el.inert = false; });
    root.remove(); document.body.classList.remove('touring');
    if (sidebarOpened) hooks.closeSidebar?.();
    hooks.done?.(completed);
    const back = completed ? hooks.focusAfter?.() : opener;
    (back?.isConnected ? back : document.querySelector('#prompt'))?.focus?.({preventScroll: true});
  }
  function keys(e) {
    // Durante o tutorial nenhum atalho da página dispara.
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { e.preventDefault(); return finish(false); }
    const onButton = e.target.closest?.('button');
    if (e.key === 'ArrowRight' || (e.key === 'Enter' && !onButton)) { e.preventDefault(); return usable[index].last ? finish(true) : show(index + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); return show(index - 1); }
    if (e.key === 'Tab') {
      const items = [...card.querySelectorAll('button:not([hidden])')].filter(b => b.offsetParent);
      const firstEl = items[0], lastEl = items.at(-1);
      if (e.shiftKey && (document.activeElement === firstEl || document.activeElement === root.querySelector('#tourtitle'))) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    }
  }
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    const t = b.dataset.t;
    if (t === 'skip') return finish(false);
    if (t === 'prev') return show(index - 1);
    if (t === 'next') return usable[index].last ? finish(true) : show(index + 1);
  });
  addEventListener('keydown', keys, true); addEventListener('resize', place); addEventListener('scroll', place, true);
  show(0);
  return {close: () => finish(false)};
}
