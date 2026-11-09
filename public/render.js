import { Marked } from './vendor/marked/marked.js';
import { mathElement } from './math.js';

const md = new Marked();
const delimiters = /\$|\\[([]/;
md.use({extensions:[{
  name:"formula", level:"inline", start(src) { return src.search(delimiters); },
  tokenizer(src) {
    const m = /^(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d))/.exec(src);
    if (m) return {type:"formula", raw:m[0], text:m[1] ?? m[2] ?? m[3] ?? m[4], display: Boolean(m[1] ?? m[2])};
  }
}]});

const node = (tag, ...children) => {
  const element = document.createElement(tag);
  element.append(...children);
  return element;
};

const keyWords = /^(?:as|async|await|break|case|catch|class|const|continue|def|do|else|elif|except|export|extends|false|False|finally|for|from|function|if|import|in|interface|let|match|new|None|null|of|pass|print|private|public|raise|return|static|struct|switch|throw|true|True|try|type|var|while|with|yield|SELECT|FROM|WHERE|JOIN|ORDER|BY|LIMIT|INSERT|INTO|UPDATE|DELETE)$/;
const lexeme = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|[A-Za-z_$][\w$]*/g;

function codeBlock(text, language) {
  const code = node("code");
  let last = 0;
  for (const match of text.matchAll(lexeme)) {
    const s = match[0];
    let type = "";
    if (s.startsWith("//") || s.startsWith("/*") || s.startsWith("#")) type = "comment";
    else if (/^["'`]/.test(s)) type = "string";
    else if (/^\d/.test(s)) type = "number";
    else if (keyWords.test(s)) type = "keyword";
    if (!type) continue;
    code.append(text.slice(last, match.index));
    const span = node("span",s);
    span.className = "hl-" + type;
    code.append(span);
    last = match.index + s.length;
  }
  code.append(text.slice(last));
  const copy = node("button","Copiar");
  copy.type = "button";
  copy.setAttribute("aria-label","Copiar código");
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(text); copy.textContent = "Copiado"; }
    catch { copy.textContent = "Selecione e copie"; }
    setTimeout(() => { copy.textContent = "Copiar"; }, 2200);
  };
  // Rolagem horizontal acessível pelo teclado.
  const pre = node("pre",code);
  pre.tabIndex = 0;
  pre.setAttribute("aria-label","Código" + (language ? " em " + language : ""));
  const box = node("div",node("header",node("span",language || "Código"),copy),pre);
  box.className = "message-code";
  return box;
}

function safeLink(token) {
  let url;
  try { url = new URL(token.href); } catch { return token.text; }
  if (!["https:","http:","mailto:"].includes(url.protocol)) return token.text;
  const a = node("a", renderTokens(token.tokens || []));
  a.href = url.href;
  a.target = "_blank";
  a.rel = "noreferrer noopener";
  if (!a.textContent) a.textContent = url.href;
  return a;
}

function table(token) {
  const row = (cells, tag) => node("tr", ...cells.map(c => node(tag, renderTokens(c.tokens))));
  const wrap = node("div",node("table",node("thead",row(token.header,"th")),node("tbody",...token.rows.map(c => row(c,"td")))));
  wrap.className = "message-table";
  wrap.tabIndex = 0;
  wrap.setAttribute("role","region");
  wrap.setAttribute("aria-label","Tabela");
  return wrap;
}

// Construct only allowlisted DOM nodes. Raw HTML, remote embeds and unsafe URLs stay inert.
function renderTokens(tokens) {
  const fragment = document.createDocumentFragment();
  for (const t of tokens) {
    let item;
    switch (t.type) {
      case "space": continue;
      case "formula": item = mathElement(t.text,t.display); break;
      case "code": item = codeBlock(t.text,t.lang?.split(/\s/)[0].slice(0,40)); break;
      case "codespan": item = node("code",t.text); break;
      case "table": item = table(t); break;
      case "link": case "image": item = safeLink(t); break;
      case "hr": case "br": item = node(t.type); break;
      case "heading": item = node("h" + t.depth,renderTokens(t.tokens)); break;
      case "paragraph": item = node("p",renderTokens(t.tokens)); break;
      case "strong": case "em": case "del": case "blockquote": item = node(t.type,renderTokens(t.tokens)); break;
      case "list":
        item = node(t.ordered ? "ol" : "ul");
        if (t.ordered && Number.isInteger(t.start)) item.start = t.start;
        for (const entry of t.items) item.append(node("li",entry.task ? (entry.checked ? "☑ " : "☐ ") : "",renderTokens(entry.tokens)));
        break;
      default: item = t.tokens ? renderTokens(t.tokens) : t.text ?? t.raw ?? "";
    }
    fragment.append(item);
  }
  return fragment;
}

export function renderMessage(element, text) {
  element.classList.add("rendered-message");
  try { element.replaceChildren(renderTokens(md.lexer(String(text)))); }
  catch { element.textContent = String(text); }
}
