// <sotto-b-tree> — B-дерево по шагам: спуск, вставка в лист, переполнение,
// разделение узла и рост дерева от корня. Узел — «страница», счётчик
// показывает, сколько страниц прочитано.
//
//   <sotto-b-tree></sotto-b-tree>
//   <sotto-b-tree max-keys="4" preset="ascending"></sotto-b-tree>
//
// Атрибуты: max-keys (2–6, ключей в узле), preset (random|ascending), seed, step, theme.

import { BASE_STYLE, StepPlayer, el, rng } from "./core.js";

const MAX_KEYS_TOTAL = 60;

const clone = (n) => ({ id: n.id, keys: n.keys.slice(), children: n.children.map(clone) });

export class BTree {
  constructor(maxKeys) {
    this.M = maxKeys;
    this.nextId = 1;
    this.root = { id: 0, keys: [], children: [] };
    this.size = 0;
    this.reads = 0;
    this.splits = 0;
    this.frames = [];
    this.frame({ text: `Пустое B-дерево: в узле до ${maxKeys} ключей. Узел — это страница на диске. Здесь классическое B-дерево: ключи есть и во внутренних узлах.` });
  }

  height() {
    let h = 0;
    for (let n = this.root; n; n = n.children[0]) h++;
    return this.size ? h : 0;
  }

  nodes() {
    let c = 0;
    const walk = (n) => { c++; n.children.forEach(walk); };
    walk(this.root);
    return this.size ? c : 0;
  }

  frame({ path = [], cur = null, over = null, promo = null, found = null, newIds = [], text }) {
    this.frames.push({ root: clone(this.root), path, cur, over, promo, found, newIds, text,
      size: this.size, height: this.height(), nodes: this.nodes(), reads: this.reads, splits: this.splits });
  }

  /** Спуск от корня к листу, где должен лежать ключ; возвращает путь узлов. */
  descend(k, verb) {
    const path = [];
    let n = this.root;
    for (;;) {
      path.push(n);
      this.reads++;
      if (n.keys.includes(k)) return { path, hit: n };
      if (!n.children.length) return { path, hit: null };
      const i = n.keys.findIndex((x) => k < x);
      const idx = i < 0 ? n.keys.length : i;
      const where = idx === 0 ? `меньше ${n.keys[0]}` : idx === n.keys.length ? `больше ${n.keys.at(-1)}` : `между ${n.keys[idx - 1]} и ${n.keys[idx]}`;
      this.frame({ path: path.map((p) => p.id), cur: n.id, text: `${verb} ${k}: страница [${n.keys.join(" ")}] прочитана (${this.reads}). ${k} ${where} — идём в ${idx + 1}-го потомка.` });
      n = n.children[idx];
    }
  }

  insert(k) {
    if (this.size >= MAX_KEYS_TOTAL) { this.frame({ text: `В демонстрации не больше ${MAX_KEYS_TOTAL} ключей.` }); return; }
    this.reads = 0;
    const { path, hit } = this.descend(k, "Вставка");
    const ids = () => path.map((p) => p.id);
    if (hit) { this.frame({ path: ids(), cur: hit.id, found: k, text: `${k} уже есть в дереве — ключи уникальны.` }); return; }
    let n = path.at(-1);
    n.keys.push(k);
    n.keys.sort((a, b) => a - b);
    this.size++;
    const overflow = n.keys.length > this.M;
    this.frame({ path: ids(), cur: n.id, over: overflow ? n.id : null, found: k,
      text: overflow ? `Кладём ${k} в лист — в нём ${n.keys.length} ключей, больше ${this.M}: страница переполнена, её нужно разделить.`
        : `Кладём ${k} в лист [${n.keys.join(" ")}]. Место есть — готово, прочитано страниц: ${this.reads}.` });
    let level = path.length - 1;
    while (n.keys.length > this.M) {
      const mid = Math.floor(n.keys.length / 2);
      const up = n.keys[mid];
      const right = { id: this.nextId++, keys: n.keys.slice(mid + 1), children: n.children.slice(mid + 1) };
      n.keys = n.keys.slice(0, mid);
      n.children = n.children.slice(0, mid + 1);
      this.splits++;
      if (level === 0) {
        this.root = { id: this.nextId++, keys: [up], children: [n, right] };
        this.frame({ cur: this.root.id, promo: up, newIds: [this.root.id, right.id],
          text: `Делим корень: [${n.keys.join(" ")}] | ${up} | [${right.keys.join(" ")}]. ${up} становится новым корнем — дерево выросло на уровень сразу для всех листьев, поэтому оно всегда сбалансировано.` });
        break;
      }
      const parent = path[level - 1];
      const pos = parent.children.indexOf(n);
      parent.keys.splice(pos, 0, up);
      parent.children.splice(pos + 1, 0, right);
      const pOver = parent.keys.length > this.M;
      this.frame({ path: ids().slice(0, level), cur: parent.id, over: pOver ? parent.id : null, promo: up, newIds: [right.id],
        text: `Делим страницу пополам: [${n.keys.join(" ")}] и [${right.keys.join(" ")}], средний ключ ${up} поднимается в родителя.` +
          (pOver ? ` Теперь переполнен родитель — делим и его.` : ` В родителе место есть — готово.`) });
      n = parent;
      level--;
    }
  }

  find(k) {
    this.reads = 0;
    const { path, hit } = this.descend(k, "Поиск");
    const ids = path.map((p) => p.id);
    if (hit) this.frame({ path: ids, cur: hit.id, found: k, text: `Нашли ${k}, прочитав ${this.reads} ${this.reads === 1 ? "страницу" : this.reads < 5 ? "страницы" : "страниц"} — не больше высоты дерева. В B+-дереве базы данных поиск всегда доходит до листа: там лежат строки.` });
    else this.frame({ path: ids, cur: path.at(-1).id, text: `Дошли до листа [${path.at(-1).keys.join(" ")}] — ${k} нет. Прочитано страниц: ${this.reads}.` });
  }
}

/** Ключи в порядке обхода — для проверки. */
export function inorder(n, out = []) {
  if (!n.children.length) { out.push(...n.keys); return out; }
  n.keys.forEach((k, i) => { inorder(n.children[i], out); out.push(k); });
  inorder(n.children.at(-1), out);
  return out;
}

const STYLE = `
svg { width: 100%; height: auto; display: block; }
.view { margin-top: 12px; background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; overflow-x: auto; }
.page { fill: var(--w-surface-2); stroke: var(--w-line-2); stroke-width: 1.5; }
.page.path { stroke: var(--w-accent); stroke-width: 2; }
.page.cur { fill: color-mix(in srgb, var(--w-accent) 30%, var(--w-surface-2)); stroke: var(--w-accent); stroke-width: 2.5; }
.page.over { fill: color-mix(in srgb, var(--w-bad) 30%, var(--w-surface-2)); stroke: var(--w-bad); stroke-width: 2.5; }
.page.new { stroke: var(--w-teal); stroke-width: 2.5; }
.sep { stroke: var(--w-line-2); }
.key { font: 600 13px "JetBrains Mono", ui-monospace, monospace; fill: var(--w-text); text-anchor: middle; dominant-baseline: central; }
.key.found { fill: var(--w-good); }
.key.promo { fill: var(--w-warm); }
.edge { stroke: var(--w-line-2); stroke-width: 1.5; fill: none; }
.edge.path { stroke: var(--w-accent); stroke-width: 2.5; }
.lvl { font: 10px "JetBrains Mono", ui-monospace, monospace; fill: var(--w-faint); }
.counts { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 8px; }
.ops input { width: 80px; }
`;

class SottoBTree extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.built = true;
    this.seed = Number(this.getAttribute("seed") || 3);
    const mk = Math.max(2, Math.min(6, Number(this.getAttribute("max-keys") || 3)));
    this.maxKeys = el("select", { "aria-label": "Ключей в узле", onchange: () => this.#replay(false) },
      ...[2, 3, 4, 5, 6].map((v) => el("option", { value: String(v), selected: v === mk }, `до ${v}`)));
    this.preset = el("select", { "aria-label": "Начальные ключи", onchange: () => this.#reset() },
      el("option", { value: "random", selected: this.getAttribute("preset") !== "ascending" }, "случайные"),
      el("option", { value: "ascending", selected: this.getAttribute("preset") === "ascending" }, "по возрастанию"));
    this.count = el("select", { "aria-label": "Сколько ключей", onchange: () => this.#reset() },
      ...[8, 16, 30, 50].map((v) => el("option", { value: String(v), selected: v === Number(this.getAttribute("count") || 16) }, String(v))));
    this.valueInput = el("input", { type: "number", "aria-label": "Ключ", placeholder: "ключ" });
    const op = (kind) => () => {
      const v = Number(this.valueInput.value);
      if (this.valueInput.value === "" || !Number.isFinite(v)) return this.valueInput.focus();
      this.ops.push([kind, Math.round(v)]);
      this.#replay(true);
    };
    this.valueInput.addEventListener("keydown", (e) => { if (e.key === "Enter") op("insert")(); });
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.setAttribute("role", "img");
    this.counts = el("div", { class: "counts" });
    this.caption = el("div", { class: "caption", "aria-live": "polite" });
    const legend = el("div", { class: "legend" },
      el("span", {}, el("i", { style: "background:var(--w-accent)" }), "путь, текущая страница"),
      el("span", {}, el("i", { style: "background:var(--w-bad)" }), "переполнение"),
      el("span", {}, el("i", { style: "background:var(--w-warm)" }), "ключ поднимается в родителя"),
      el("span", {}, el("i", { style: "background:var(--w-teal)" }), "новая страница"),
      el("span", {}, el("i", { style: "background:var(--w-good)" }), "найденный или вставленный ключ"));
    this.player = new StepPlayer(this, (i) => this.#render(i));
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE),
      el("div", { class: "row" },
        el("label", { class: "field" }, "ключей в узле", this.maxKeys),
        el("label", { class: "field" }, "начальные", this.preset),
        el("label", { class: "field" }, "сколько", this.count),
        el("button", { onclick: () => { this.seed++; this.#reset(); } }, "🎲 Другие ключи")),
      el("div", { class: "row ops", style: "margin-top:8px" }, this.valueInput,
        el("button", { onclick: op("insert") }, "Вставить"),
        el("button", { onclick: op("find") }, "Найти"),
        el("button", { onclick: () => this.#reset() }, "Сбросить")),
      el("div", { class: "view" }, this.svg), this.counts, this.caption, legend, this.player.el);
    this.#reset();
    const step = this.getAttribute("step");
    if (step != null) this.player.go(Number(step));
  }

  #reset() {
    const rand = rng(this.seed);
    const n = Number(this.count.value);
    let keys;
    if (this.preset.value === "ascending") keys = Array.from({ length: n }, (_, i) => i + 1);
    else {
      const pool = Array.from({ length: 99 }, (_, i) => i + 1);
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      keys = pool.slice(0, n);
    }
    this.ops = keys.map((k) => ["insert", k]);
    this.#replay(false);
  }

  #replay(jumpToLast) {
    const tree = new BTree(Number(this.maxKeys.value));
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
    const KW = 30, PAD = 6, GAP = 14, ROW = 78;
    const width = (n) => Math.max(1, n.keys.length) * KW + PAD * 2;
    // Раскладка: листья слева направо, родитель — над серединой своих детей.
    let x = 64, depth = 0;            // слева — место под подписи уровней
    const pos = new Map();
    const lay = (n, d) => {
      depth = Math.max(depth, d);
      if (!n.children.length) {
        const w = width(n);
        pos.set(n.id, { x: x + w / 2, y: 20 + d * ROW, w, n });
        x += w + GAP;
        return;
      }
      n.children.forEach((c) => lay(c, d + 1));
      const a = pos.get(n.children[0].id), b = pos.get(n.children.at(-1).id);
      pos.set(n.id, { x: (a.x + b.x) / 2, y: 20 + d * ROW, w: width(n), n });
    };
    lay(f.root, 0);
    const W = Math.max(640, x), H = 20 + depth * ROW + 50;
    this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    this.svg.style.minWidth = W > 640 ? `${Math.round(W * 0.8)}px` : "";
    const S = (tag, attrs, text) => {
      const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      if (text != null) e.textContent = text;
      return e;
    };
    const onPath = new Set(f.path);
    const parts = [];
    for (const { n, x: px, y: py, w } of pos.values()) {
      n.children.forEach((c, i) => {
        const cp = pos.get(c.id);
        const sx = px - w / 2 + PAD + i * KW;
        parts.push(S("path", { d: `M ${sx} ${py + 28} C ${sx} ${py + 52}, ${cp.x} ${cp.y - 24}, ${cp.x} ${cp.y}`, class: "edge" + (onPath.has(n.id) && (onPath.has(c.id) || f.cur === c.id) ? " path" : "") }));
      });
    }
    for (const { n, x: px, y: py, w } of pos.values()) {
      const cls = f.over === n.id ? "over" : f.cur === n.id ? "cur" : onPath.has(n.id) ? "path" : f.newIds.includes(n.id) ? "new" : "";
      parts.push(S("rect", { x: px - w / 2, y: py, width: w, height: 28, rx: 7, class: "page " + cls }));
      n.keys.forEach((k, i) => {
        const kx = px - w / 2 + PAD + i * KW + KW / 2;
        if (i) parts.push(S("line", { x1: kx - KW / 2, y1: py + 5, x2: kx - KW / 2, y2: py + 23, class: "sep" }));
        parts.push(S("text", { x: kx, y: py + 14, class: "key" + (k === f.found ? " found" : k === f.promo ? " promo" : "") }, String(k)));
      });
    }
    if (f.size) for (let d = 0; d <= depth; d++) parts.push(S("text", { x: 6, y: 20 + d * ROW + 18, class: "lvl" }, `ур. ${d + 1}`));
    this.svg.replaceChildren(...parts);
    this.svg.setAttribute("aria-label", `B-дерево: ${f.size} ключей, высота ${f.height}`);
    const bst = f.size ? Math.ceil(Math.log2(f.size + 1)) : 0;
    this.counts.innerHTML = `<span class="counter">ключей <b>${f.size}</b></span>` +
      `<span class="counter">страниц <b>${f.nodes}</b></span>` +
      `<span class="counter">высота <b>${f.height}</b></span>` +
      `<span class="counter">у двоичного дерева было бы не меньше <b>${bst}</b></span>` +
      `<span class="counter">прочитано страниц в операции <b>${f.reads}</b></span>` +
      `<span class="counter">разделений <b>${f.splits}</b></span>`;
    this.caption.textContent = f.text;
  }
}

customElements.define("sotto-b-tree", SottoBTree);
