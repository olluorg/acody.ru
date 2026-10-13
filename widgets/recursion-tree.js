// <sotto-recursion-tree> — дерево рекурсивных вызовов fib(n) без кэша и с мемоизацией.
//
//   <sotto-recursion-tree n="6"></sotto-recursion-tree>
//   <sotto-recursion-tree n="7" memo></sotto-recursion-tree>
//
// Атрибуты: n (1–9), memo (с кэшем), compare (две дорожки: без кэша и с кэшем), step, theme.

import { BASE_STYLE, StepPlayer, el } from "./core.js";

/**
 * Строит дерево вызовов и кадры. Кадр — событие: вход в вызов (call) или
 * возврат значения (ret). С мемоизацией повторный вызов отвечает из кэша и
 * не порождает поддерево.
 */
function trace(n, memo) {
  const nodes = [];
  const frames = [];
  const cache = new Map();
  let calls = 0;
  const call = (k, parent, depth) => {
    const id = nodes.length;
    const node = { id, k, parent, depth, children: [], value: null, cached: false };
    nodes.push(node);
    if (parent != null) nodes[parent].children.push(id);
    calls++;
    if (memo && cache.has(k)) {
      node.cached = true;
      node.value = cache.get(k);
      frames.push({ type: "call", id, calls, text: `fib(${k}) уже посчитан — берём ${node.value} из кэша, без новых вызовов.` });
      frames.push({ type: "ret", id, calls, text: `fib(${k}) = ${node.value} (из кэша).` });
      return node.value;
    }
    frames.push({ type: "call", id, calls, text: k < 2 ? `fib(${k}) — базовый случай.` : `fib(${k}) = fib(${k - 1}) + fib(${k - 2}): сначала считаем fib(${k - 1}).` });
    let v;
    if (k < 2) v = k;
    else {
      const a = call(k - 1, id, depth + 1);
      frames.push({ type: "note", id, calls, text: `fib(${k - 1}) = ${a}; теперь fib(${k - 2}).` });
      const b = call(k - 2, id, depth + 1);
      v = a + b;
    }
    node.value = v;
    if (memo) cache.set(k, v);
    frames.push({ type: "ret", id, calls, text: `fib(${k}) = ${v}${memo && k >= 2 ? " — запоминаем в кэше" : ""}.` });
    return v;
  };
  const result = call(n, null, 0);
  frames.push({ type: "done", id: 0, calls, text: `Готово: fib(${n}) = ${result}, вызовов функции — ${calls}.` });
  return { nodes, frames, calls, result };
}

const STYLE = `
.lanes { display: grid; gap: 12px; margin-top: 12px; }
.lanes.two { grid-template-columns: var(--cols, 1fr 1fr); }
@container (max-width: 700px) { .lanes.two { grid-template-columns: 1fr; } }
.lane { background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; padding: 10px 12px; min-width: 0; }
.lane h3 { margin: 0 0 6px; font-size: 14px; display: flex; gap: 10px; flex-wrap: wrap; align-items: baseline; }
svg { width: 100%; height: auto; display: block; margin: 0 auto; }
svg line { stroke: var(--w-line-2); stroke-width: 1.2; }
svg rect { fill: var(--w-surface-2); stroke: var(--w-line-2); rx: 6; }
svg rect.wait { opacity: .18; }
svg rect.stack { fill: var(--w-accent); stroke: transparent; }
svg rect.top { fill: var(--w-warm); stroke: transparent; }
svg rect.done { fill: color-mix(in srgb, var(--w-good) 55%, var(--w-surface-2)); stroke: transparent; }
svg rect.cached { fill: var(--w-teal); stroke: transparent; }
svg text { font: 600 12px "JetBrains Mono", ui-monospace, monospace; text-anchor: middle; dominant-baseline: central; fill: var(--w-text); }
svg text.wait { opacity: .25; }
svg text.on { fill: #10121f; }
.stackline { margin-top: 6px; font: 12px "JetBrains Mono", ui-monospace, monospace; color: var(--w-muted); overflow-wrap: anywhere; }
`;

class SottoRecursionTree extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.built = true;
    this.nInput = el("input", { type: "range", min: "1", max: "9", value: String(Math.max(1, Math.min(9, Number(this.getAttribute("n") || 6)))), "aria-label": "n" });
    this.nLabel = el("b", {}, this.nInput.value);
    this.nInput.addEventListener("input", () => { this.nLabel.textContent = this.nInput.value; this.#recompute(); });
    const modes = this.hasAttribute("compare") ? [false, true] : [this.hasAttribute("memo")];
    this.lanes = modes.map((memo) => {
      const lane = { memo, title: el("span", {}, memo ? "С мемоизацией — O(n)" : "Без кэша — O(2ⁿ)"), counter: el("span", { class: "counter" }),
                     svg: document.createElementNS("http://www.w3.org/2000/svg", "svg"), stack: el("div", { class: "stackline" }),
                     caption: el("div", { class: "caption", "aria-live": "polite" }) };
      lane.svg.setAttribute("role", "img");
      lane.root = el("div", { class: "lane" }, el("h3", {}, lane.title, lane.counter), lane.svg, lane.stack, lane.caption);
      return lane;
    });
    const legend = el("div", { class: "legend" },
      el("span", {}, el("i", { style: "background:var(--w-warm)" }), "выполняется сейчас"),
      el("span", {}, el("i", { style: "background:var(--w-accent)" }), "ждёт результата (в стеке вызовов)"),
      el("span", {}, el("i", { style: "background:color-mix(in srgb, var(--w-good) 55%, var(--w-surface-2))" }), "вернул значение"),
      el("span", {}, el("i", { style: "background:var(--w-teal)" }), "ответ из кэша"));
    this.player = new StepPlayer(this, (i) => this.#render(i));
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE),
      el("div", { class: "row" }, el("label", { class: "field" }, "fib(n), n ="), this.nLabel, this.nInput),
      this.lanesEl = el("div", { class: "lanes" + (modes.length > 1 ? " two" : "") }, this.lanes.map((l) => l.root)),
      legend, this.player.el);
    this.#recompute();
    const step = this.getAttribute("step");
    if (step != null) this.player.go(Number(step));
  }

  #recompute() {
    const n = Number(this.nInput.value);
    for (const lane of this.lanes) {
      lane.t = trace(n, lane.memo);
      // Раскладка: листья по порядку слева направо, родитель — над серединой детей.
      let leaf = 0, maxDepth = 0;
      const pos = new Map();
      const lay = (id) => {
        const node = lane.t.nodes[id];
        maxDepth = Math.max(maxDepth, node.depth);
        if (!node.children.length) { pos.set(id, leaf++); return pos.get(id); }
        const xs = node.children.map(lay);
        pos.set(id, (xs[0] + xs.at(-1)) / 2);
        return pos.get(id);
      };
      lay(0);
      lane.layout = { pos, leaves: Math.max(1, leaf), maxDepth };
    }
    // Общий масштаб: дорожки делят ширину пропорционально числу листьев.
    if (this.lanes.length > 1) this.lanesEl.style.setProperty("--cols", this.lanes.map((l) => `${l.layout.leaves}fr`).join(" "));
    this.player.load(Math.max(...this.lanes.map((l) => l.t.frames.length)) + 1);
  }

  #render(index) {
    const ns = "http://www.w3.org/2000/svg";
    const node = (tag, attrs, text) => {
      const e = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      if (text != null) e.textContent = text;
      return e;
    };
    for (const lane of this.lanes) {
      const { nodes, frames } = lane.t;
      const upto = Math.min(index, frames.length);
      const entered = new Set(), returned = new Set();
      let last = null;
      for (let i = 0; i < upto; i++) {
        const f = frames[i];
        if (f.type === "call") entered.add(f.id);
        if (f.type === "ret") returned.add(f.id);
        last = f;
      }
      // Стек вызовов: вошли, но ещё не вернули.
      const stack = nodes.filter((nd) => entered.has(nd.id) && !returned.has(nd.id));
      const top = stack.at(-1);
      const { pos, leaves, maxDepth } = lane.layout;
      // Ширина под число листьев: подписи остаются читаемыми при любом n.
      const bw = 40, W = Math.max(280, leaves * (bw + 6) + 24), rowH = 40, H = 24 + (maxDepth + 1) * rowH;
      lane.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      lane.svg.style.maxWidth = `${Math.round(W * 1.15)}px`;
      const xy = (id) => ({ x: 12 + bw / 2 + ((W - 24 - bw) * pos.get(id)) / Math.max(1, leaves - 1), y: 20 + nodes[id].depth * rowH });
      const parts = [];
      for (const nd of nodes) if (nd.parent != null && entered.has(nd.id)) {
        const a = xy(nd.parent), b = xy(nd.id);
        parts.push(node("line", { x1: a.x, y1: a.y + 11, x2: b.x, y2: b.y - 11 }));
      }
      for (const nd of nodes) {
        const { x, y } = xy(nd.id);
        let cls = "wait";
        if (entered.has(nd.id)) cls = nd.cached ? "cached" : returned.has(nd.id) ? "done" : top && top.id === nd.id ? "top" : "stack";
        const label = returned.has(nd.id) || nd.cached && entered.has(nd.id) ? `${nd.k}→${nd.value}` : `f(${nd.k})`;
        parts.push(node("rect", { x: x - bw / 2, y: y - 11, width: bw, height: 22, class: cls }));
        parts.push(node("text", { x, y, class: cls === "wait" ? "wait" : ["top", "stack", "cached"].includes(cls) ? "on" : "" }, label));
      }
      lane.svg.replaceChildren(...parts);
      const calls = last ? last.calls : 0;
      lane.counter.innerHTML = `вызовов <b>${calls}</b> из <b>${lane.t.calls}</b>`;
      lane.stack.textContent = stack.length ? `стек вызовов: ${stack.map((s) => `fib(${s.k})`).join(" → ")}` : "стек вызовов пуст";
      lane.caption.textContent = last ? last.text : `Вызов fib(${this.nInput.value}). Каждый вызов кладёт кадр в стек; без кэша одни и те же значения считаются много раз.`;
    }
  }
}

customElements.define("sotto-recursion-tree", SottoRecursionTree);
export { trace };
