const namespace = "http://www.w3.org/1998/Math/MathML";
const symbols = Object.fromEntries(Object.entries({
  alpha:"α", beta:"β", gamma:"γ", delta:"δ", epsilon:"ε", theta:"θ", lambda:"λ",
  mu:"μ", pi:"π", rho:"ρ", sigma:"σ", tau:"τ", phi:"φ", omega:"ω", Gamma:"Γ",
  Delta:"Δ", Theta:"Θ", Lambda:"Λ", Sigma:"Σ", Omega:"Ω", infty:"∞", cdot:"·",
  times:"×", div:"÷", pm:"±", le:"≤", leq:"≤", ge:"≥", geq:"≥", ne:"≠", neq:"≠",
  approx:"≈", equiv:"≡", to:"→", rightarrow:"→", implies:"⇒", Rightarrow:"⇒",
  leftarrow:"←", sum:"∑", prod:"∏", int:"∫", partial:"∂", nabla:"∇",
  forall:"∀", exists:"∃", in:"∈", notin:"∉", subset:"⊂", cup:"∪", cap:"∩",
  ldots:"…", cdots:"⋯", sin:"sin", cos:"cos", tan:"tan", log:"log", ln:"ln",
  exp:"exp", lim:"lim", max:"max", min:"min"
}));
const el = (tag, ...children) => {
  const node = document.createElementNS(namespace, tag);
  node.append(...children);
  return node;
};

// Unsupported commands retain their original TeX source for readability.
export function mathElement(source, display) {
  try {
    if (source.length > 8192) throw Error();
    const tokens = source.match(/\\[A-Za-z]+|\\.|\d+(?:\.\d+)?|\s+|[^]/gu) || [];
    let pos = 0;
    const skipSpace = () => { while (/^\s+$/.test(tokens[pos] || "")) pos++; };
    function atom(depth) {
      skipSpace();
      if (depth > 48 || pos >= tokens.length) throw Error();
      const t = tokens[pos++];
      if (t === "{") {
        const row = sequence(depth + 1);
        if (tokens[pos++] !== "}") throw Error();
        return row;
      }
      if (t === "}" || t === "_" || t === "^") throw Error();
      if (t === "\\frac" || t === "\\dfrac" || t === "\\tfrac")
        return el("mfrac", atom(depth + 1), atom(depth + 1));
      if (t === "\\sqrt") return el("msqrt", atom(depth + 1));
      if (t === "\\left" || t === "\\right") return atom(depth + 1);
      if (t === "\\text" || t === "\\mathrm" || t === "\\operatorname") {
        skipSpace();
        if (tokens[pos++] !== "{") throw Error();
        let literal = "";
        while (pos < tokens.length && tokens[pos] !== "}") literal += tokens[pos++];
        if (tokens[pos++] !== "}") throw Error();
        return el("mtext", literal);
      }
      if (/^\\[A-Za-z]+$/.test(t) && !Object.hasOwn(symbols, t.slice(1))) throw Error();
      const value = t.startsWith("\\") ? symbols[t.slice(1)] || t.slice(1) : t;
      const tag = /^\d/.test(value) ? "mn" : /^\p{Letter}+$/u.test(value) ? "mi" : "mo";
      return el(tag, value);
    }
    function sequence(depth) {
      const row = el("mrow");
      skipSpace();
      while (pos < tokens.length && tokens[pos] !== "}") {
        const base = atom(depth);
        let sub, sup;
        skipSpace();
        while (tokens[pos] === "^" || tokens[pos] === "_") {
          const supFlag = tokens[pos++] === "^";
          if ((supFlag && sup) || (!supFlag && sub)) throw Error();
          const term = atom(depth + 1);
          if (supFlag) sup = term; else sub = term;
          skipSpace();
        }
        row.append(sub && sup ? el("msubsup",base,sub,sup) : sub ? el("msub",base,sub) : sup ? el("msup",base,sup) : base);
      }
      return row;
    }
    const node = el("math", sequence(0));
    if (pos !== tokens.length) throw Error();
    node.setAttribute("display", display ? "block" : "inline");
    node.setAttribute("aria-label", source);
    return node;
  } catch {
    const code = document.createElement("code");
    code.textContent = source;
    code.title = "Expressão em TeX";
    return code;
  }
}
