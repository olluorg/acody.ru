// <sotto-bst> — двоичное дерево поиска и AVL по шагам.
//
//   <sotto-bst></sotto-bst>
//   <sotto-bst balance="avl" preset="ascending"></sotto-bst>
//
// Атрибуты: balance (none|avl), preset (random|ascending), seed, step, theme.
// Вставка, поиск и удаление — кнопками. На входе по возрастанию обычное
// дерево вырождается в цепочку, AVL — остаётся высотой O(log n).

import { BASE_STYLE, StepPlayer, el, rng } from "./core.js";

const MAX_NODES = 31;

const height = (n) => (n ? n.h : 0);
const fix = (n) => { n.h = 1 + Math.max(height(n.left), height(n.right)); return n; };
const balanceOf = (n) => height(n.left) - height(n.right);
const clone = (n) => (n ? { key: n.key, h: n.h, left: clone(n.left), right: clone(n.right) } : null);

class Tree {
  constructor(avl) {
    this.avl = avl;
    this.root = null;
    this.frames = [];
    this.cmp = 0;
    this.size = 0;
    this.frame({ text: "Пустое дерево." });
  }

  frame({ hl = [], ok = [], rot = [], text }) {
    this.frames.push({ root: clone(this.root), hl, ok, rot, text, cmp: this.cmp, size: this.size, height: height(this.root) });
  }

  rotateRight(y) {
    const x = y.left;
    y.left = x.right;
    x.right = y;
    fix(y);
    return fix(x);
  }

  rotateLeft(x) {
    const y = x.right;
    x.right = y.left;
    y.left = x;
    fix(x);
    return fix(y);
  }

  /** После изменения в поддереве: пересчитать высоту и, в AVL, выровнять поворотами. */
  rebalance(n, attach) {
    fix(n);
    if (!this.avl) return n;
    const b = balanceOf(n);
    if (b > 1) {
      if (balanceOf(n.left) < 0) {
        this.frame({ hl: [n.key], rot: [n.key, n.left.key], text: `Перекос в ${n.key}: баланс +${b}, левый потомок ${n.left.key} перекошен вправо — большой поворот (лево-правый): сначала левый поворот вокруг ${n.left.key}.` });
        n.left = this.rotateLeft(n.left);
        attach(n);
        this.frame({ hl: [n.key], rot: [n.left.key], text: `Теперь перекос простой — правый поворот вокруг ${n.key}.` });
      } else {
        this.frame({ hl: [n.key], rot: [n.key, n.left.key], text: `Перекос в ${n.key}: баланс +${b} (левое поддерево выше на ${b}) — правый поворот вокруг ${n.key}.` });
      }
      const r = this.rotateRight(n);
      attach(r);
      this.frame({ ok: [r.key], text: `После поворота ${r.key} — корень поддерева, баланс восстановлен.` });
      return r;
    }
    if (b < -1) {
      if (balanceOf(n.right) > 0) {
        this.frame({ hl: [n.key], rot: [n.key, n.right.key], text: `Перекос в ${n.key}: баланс ${b}, правый потомок ${n.right.key} перекошен влево — большой поворот (право-левый): сначала правый поворот вокруг ${n.right.key}.` });
        n.right = this.rotateRight(n.right);
        attach(n);
        this.frame({ hl: [n.key], rot: [n.right.key], text: `Теперь перекос простой — левый поворот вокруг ${n.key}.` });
      } else {
        this.frame({ hl: [n.key], rot: [n.key, n.right.key], text: `Перекос в ${n.key}: баланс ${b} (правое поддерево выше на ${-b}) — левый поворот вокруг ${n.key}.` });
      }
      const r = this.rotateLeft(n);
      attach(r);
      this.frame({ ok: [r.key], text: `После поворота ${r.key} — корень поддерева, баланс восстановлен.` });
      return r;
    }
    return n;
  }

  /**
   * Рекурсия с «прикреплением»: attach(newSubtree) вешает изменённое поддерево
   * на родителя сразу, чтобы промежуточные кадры показывали настоящее дерево.
   */
  insert(key) {
    if (this.size >= MAX_NODES) { this.frame({ text: `В демонстрации не больше ${MAX_NODES} узлов.` }); return; }
    this.frame({ text: `Вставка ${key}: спускаемся от корня — меньше налево, больше направо.` });
    const go = (n, attach) => {
      if (!n) {
        const leaf = fix({ key, left: null, right: null });
        attach(leaf);
        this.size++;
        this.frame({ ok: [key], text: `Свободное место найдено — ${key} становится листом.` });
        return leaf;
      }
      this.cmp++;
      if (key === n.key) { this.frame({ hl: [n.key], text: `${key} уже есть — дубликаты не храним.` }); return n; }
      const left = key < n.key;
      this.frame({ hl: [n.key], text: `${key} ${left ? "<" : ">"} ${n.key} — идём ${left ? "налево" : "направо"}.` });
      if (left) n.left = go(n.left, (c) => { n.left = c; });
      else n.right = go(n.right, (c) => { n.right = c; });
      return this.rebalance(n, attach);
    };
    this.root = go(this.root, (c) => { this.root = c; });
  }

  find(key) {
    this.frame({ text: `Поиск ${key}: идём от корня.` });
    let n = this.root, depth = 0;
    while (n) {
      this.cmp++;
      depth++;
      if (key === n.key) { this.frame({ ok: [n.key], text: `Нашли ${key} за ${depth} ${depth < 5 ? "сравнения" : "сравнений"} — это глубина узла.` }); return true; }
      this.frame({ hl: [n.key], text: `${key} ${key < n.key ? "<" : ">"} ${n.key} — ${key < n.key ? "налево" : "направо"}.` });
      n = key < n.key ? n.left : n.right;
    }
    this.frame({ text: `Дошли до пустого места — ${key} в дереве нет.` });
    return false;
  }

  remove(key) {
    this.frame({ text: `Удаление ${key}: сначала находим узел.` });
    const go = (n, k, attach) => {
      if (!n) { this.frame({ text: `${k} не найден — удалять нечего.` }); return null; }
      this.cmp++;
      if (k < n.key) { this.frame({ hl: [n.key], text: `${k} < ${n.key} — налево.` }); n.left = go(n.left, k, (c) => { n.left = c; }); return this.rebalance(n, attach); }
      if (k > n.key) { this.frame({ hl: [n.key], text: `${k} > ${n.key} — направо.` }); n.right = go(n.right, k, (c) => { n.right = c; }); return this.rebalance(n, attach); }
      if (!n.left || !n.right) {
        const child = n.left || n.right;
        this.frame({ hl: [n.key], text: child ? `У ${n.key} один потомок — ставим ${child.key} на его место.` : `${n.key} — лист, просто убираем.` });
        attach(child);
        this.size--;
        if (child) this.frame({ ok: [child.key], text: `Узел ${k} удалён.` });
        else this.frame({ text: `Узел ${k} удалён.` });
        return child;
      }
      let s = n.right;
      while (s.left) s = s.left;
      this.frame({ hl: [n.key, s.key], text: `У ${n.key} два потомка: заменяем ключ на следующий по порядку — минимум правого поддерева, ${s.key}, — и удаляем ${s.key} оттуда.` });
      n.key = s.key;
      n.right = go(n.right, s.key, (c) => { n.right = c; });
      return this.rebalance(n, attach);
    };
    this.root = go(this.root, key, (c) => { this.root = c; });
  }
}

function inorder(n, out = []) {
  if (n) { inorder(n.left, out); out.push(n.key); inorder(n.right, out); }
  return out;
}

const STYLE = `
svg { width: 100%; height: auto; display: block; margin-top: 12px; background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; }
svg line { stroke: var(--w-line-2); stroke-width: 1.5; }
svg circle { fill: var(--w-surface-2); stroke: var(--w-line-2); stroke-width: 1.5; }
svg circle.hl { fill: var(--w-accent); stroke: transparent; }
svg circle.rot { fill: var(--w-warm); stroke: transparent; }
svg circle.ok { fill: var(--w-good); stroke: transparent; }
svg text.v { fill: var(--w-text); font: 600 12px "JetBrains Mono", ui-monospace, monospace; text-anchor: middle; dominant-baseline: central; }
svg text.v.on { fill: #10121f; }
svg text.b { font: 10px "JetBrains Mono", ui-monospace, monospace; text-anchor: middle; fill: var(--w-faint); }
svg text.b.bad { fill: var(--w-bad); font-weight: 700; }
.counts { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 8px; }
.ops input { width: 80px; }
`;

class SottoBst extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.built = true;
    this.seed = Number(this.getAttribute("seed") || 2);
    this.#build();
    this.#reset();
    const step = this.getAttribute("step");
    if (step != null) this.player.go(Number(step));
  }

  #build() {
    this.balance = el("select", { "aria-label": "Балансировка", onchange: () => this.#replay(false) },
      el("option", { value: "none", selected: this.getAttribute("balance") !== "avl" }, "без балансировки"),
      el("option", { value: "avl", selected: this.getAttribute("balance") === "avl" }, "AVL"));
    this.preset = el("select", { "aria-label": "Начальные ключи", onchange: () => this.#reset() },
      el("option", { value: "random", selected: this.getAttribute("preset") !== "ascending" }, "случайные"),
      el("option", { value: "ascending", selected: this.getAttribute("preset") === "ascending" }, "по возрастанию"));
    this.valueInput = el("input", { type: "number", "aria-label": "Ключ", placeholder: "ключ" });
    const op = (kind) => () => {
      const v = Number(this.valueInput.value);
      if (this.valueInput.value === "" || !Number.isFinite(v)) return this.valueInput.focus();
      this.ops.push([kind, Math.round(v)]);
      this.#replay(true);
    };
    this.valueInput.addEventListener("keydown", (e) => { if (e.key === "Enter") op("insert")(); });
    const controls = el("div", { class: "row" },
      el("label", { class: "field" }, "дерево", this.balance),
      el("label", { class: "field" }, "ключи", this.preset),
      el("button", { onclick: () => { this.seed++; this.#reset(); } }, "🎲 Другие ключи"));
    const ops = el("div", { class: "row ops", style: "margin-top:8px" }, this.valueInput,
      el("button", { onclick: op("insert") }, "Вставить"),
      el("button", { onclick: op("find") }, "Найти"),
      el("button", { onclick: op("remove") }, "Удалить"),
      el("button", { onclick: () => this.#reset() }, "Сбросить"));
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.setAttribute("role", "img");
    this.counts = el("div", { class: "counts" });
    this.caption = el("div", { class: "caption", "aria-live": "polite" });
    const legend = el("div", { class: "legend" },
      el("span", {}, el("i", { style: "background:var(--w-accent)" }), "путь / текущий узел"),
      el("span", {}, el("i", { style: "background:var(--w-warm)" }), "поворот"),
      el("span", {}, el("i", { style: "background:var(--w-good)" }), "результат"),
      el("span", {}, "число под узлом — баланс: высота слева минус справа"));
    this.player = new StepPlayer(this, (i) => this.#render(i));
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE), controls, ops, this.svg, this.counts, this.caption, legend, this.player.el);
  }

  #reset() {
    const rand = rng(this.seed);
    let keys;
    if (this.preset.value === "ascending") keys = Array.from({ length: 10 }, (_, i) => 10 * (i + 1));
    else {
      const pool = Array.from({ length: 60 }, (_, i) => i + 1);
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      keys = pool.slice(0, 10);
    }
    this.ops = keys.map((k) => ["insert", k]);
    this.#replay(false);
  }

  #replay(jumpToLast) {
    const tree = new Tree(this.balance.value === "avl");
    let lastStart = 0;
    for (const [op, arg] of this.ops) {
      lastStart = tree.frames.length;
      tree[op](arg);
    }
    this.frames = tree.frames;
    this.player.load(this.frames.length, jumpToLast ? lastStart : 0);
    if (jumpToLast) this.player.play();
  }

  #render(index) {
    const f = this.frames[index];
    const hl = new Set(f.hl), ok = new Set(f.ok), rot = new Set(f.rot);
    // Раскладка: x — порядковый номер при обходе in-order, y — глубина.
    const placed = [];
    let order = 0, maxDepth = 0;
    const lay = (n, depth) => {
      if (!n) return;
      lay(n.left, depth + 1);
      placed.push({ n, i: order++, depth });
      maxDepth = Math.max(maxDepth, depth);
      lay(n.right, depth + 1);
    };
    lay(f.root, 0);
    const W = 640, step = 54, H = Math.max(120, 40 + (maxDepth + 1) * step);
    this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const at = new Map(placed.map((p) => [p.n, { x: 24 + ((W - 48) * (p.i + 0.5)) / Math.max(1, placed.length), y: 26 + p.depth * step }]));
    const ns = "http://www.w3.org/2000/svg";
    const node = (tag, attrs, text) => {
      const e = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      if (text != null) e.textContent = text;
      return e;
    };
    const parts = [];
    for (const { n } of placed) for (const c of [n.left, n.right]) if (c) {
      const a = at.get(n), b = at.get(c);
      parts.push(node("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y }));
    }
    for (const { n } of placed) {
      const { x, y } = at.get(n);
      const cls = rot.has(n.key) ? "rot" : hl.has(n.key) ? "hl" : ok.has(n.key) ? "ok" : "";
      parts.push(node("circle", { cx: x, cy: y, r: 16, class: cls }));
      parts.push(node("text", { x, y, class: "v" + (cls ? " on" : "") }, String(n.key)));
      const b = height(n.left) - height(n.right);
      parts.push(node("text", { x, y: y + 27, class: "b" + (Math.abs(b) > 1 ? " bad" : "") }, (b > 0 ? "+" : "") + b));
    }
    this.svg.replaceChildren(...parts);
    this.svg.setAttribute("aria-label", `Дерево: ${f.size} узлов, высота ${f.height}`);
    const ideal = f.size ? Math.floor(Math.log2(f.size)) + 1 : 0;
    this.counts.innerHTML = `<span class="counter">узлов <b>${f.size}</b></span>` +
      `<span class="counter">высота <b>${f.height}</b></span>` +
      `<span class="counter">минимально возможная <b>${ideal}</b></span>` +
      `<span class="counter">сравнений <b>${f.cmp}</b></span>`;
    this.caption.textContent = f.text;
  }
}

customElements.define("sotto-bst", SottoBst);
export { Tree, inorder };
