// <sotto-heap> — двоичная куча по шагам: дерево и массив одновременно.
//
//   <sotto-heap></sotto-heap>
//   <sotto-heap kind="max" start="build"></sotto-heap>
//
// Атрибуты: kind (min|max), start (inserts|build — как собрать начальную кучу),
// seed, step, theme. Вставка и извлечение корня — кнопками.

import { BASE_STYLE, StepPlayer, el, rng } from "./core.js";

const MAX_SIZE = 31;   // пять уровней — помещается на экране

/** Куча, которая пишет кадры: снимок массива + подсветка + пояснение. */
class Heap {
  constructor(kind) {
    this.kind = kind;
    this.a = [];
    this.frames = [];
    this.cmp = 0;
    this.swaps = 0;
    this.frame({ text: "Пустая куча." });
  }

  /** «Выше» в куче: меньше для min-кучи, больше для max-кучи. */
  better(x, y) { return this.kind === "min" ? x < y : x > y; }
  get word() { return this.kind === "min" ? "меньше" : "больше"; }

  frame({ hl = [], ok = [], text }) {
    this.frames.push({ a: this.a.slice(), hl, ok, text, cmp: this.cmp, swaps: this.swaps });
  }

  siftUp(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      this.cmp++;
      if (!this.better(this.a[i], this.a[p])) {
        this.frame({ hl: [i, p], ok: [i], text: `${this.a[i]} не ${this.word} родителя ${this.a[p]} (индекс ${p} = (${i}−1)/2) — на месте.` });
        return;
      }
      this.frame({ hl: [i, p], text: `${this.a[i]} ${this.word} родителя ${this.a[p]} — меняем местами, поднимаемся.` });
      [this.a[i], this.a[p]] = [this.a[p], this.a[i]];
      this.swaps++;
      this.frame({ hl: [p], text: `Теперь ${this.a[p]} на позиции ${p}.` });
      i = p;
    }
    this.frame({ ok: [0], text: `${this.a[0]} дошёл до корня.` });
  }

  siftDown(i, n = this.a.length) {
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      if (l >= n) {
        this.frame({ ok: [i], text: `У позиции ${i} нет потомков — ${this.a[i]} на месте.` });
        return;
      }
      let best = l;
      if (r < n) {
        this.cmp++;
        if (this.better(this.a[r], this.a[l])) best = r;
        this.frame({ hl: [l, r], text: `Потомки ${i}: ${this.a[l]} (индекс ${l} = 2·${i}+1) и ${this.a[r]} (индекс ${r}); ${this.kind === "min" ? "меньший" : "больший"} — ${this.a[best]}.` });
      }
      this.cmp++;
      if (!this.better(this.a[best], this.a[i])) {
        this.frame({ hl: [i, best], ok: [i], text: `${this.a[i]} не нарушает порядок с потомком ${this.a[best]} — на месте.` });
        return;
      }
      this.frame({ hl: [i, best], text: `${this.a[best]} ${this.word} ${this.a[i]} — меняем, ${this.a[i]} опускается.` });
      [this.a[i], this.a[best]] = [this.a[best], this.a[i]];
      this.swaps++;
      i = best;
    }
  }

  insert(v) {
    if (this.a.length >= MAX_SIZE) {
      this.frame({ text: `В демонстрации не больше ${MAX_SIZE} элементов.` });
      return;
    }
    this.a.push(v);
    this.frame({ hl: [this.a.length - 1], text: `Вставка ${v}: кладём в конец массива (позиция ${this.a.length - 1}) и поднимаем, пока ${this.word} родителя.` });
    this.siftUp(this.a.length - 1);
  }

  extract() {
    if (!this.a.length) {
      this.frame({ text: "Куча пуста — извлекать нечего." });
      return null;
    }
    const top = this.a[0];
    const last = this.a.pop();
    if (!this.a.length) {
      this.frame({ text: `Извлекли ${top} — куча пуста.` });
      return top;
    }
    this.a[0] = last;
    this.frame({ hl: [0], text: `Извлекли корень ${top} (${this.kind === "min" ? "минимум" : "максимум"}). На его место — последний элемент ${last}; опускаем его.` });
    this.siftDown(0);
    return top;
  }

  build(values) {
    this.a = values.slice(0, MAX_SIZE);
    this.frame({ text: `Построение из массива [${this.a.join(", ")}]: просеиваем вниз все узлы с потомками, от последнего к корню — это O(n).` });
    for (let i = (this.a.length >> 1) - 1; i >= 0; i--) {
      this.frame({ hl: [i], text: `Узел ${i} (${this.a[i]}): опускаем на место.` });
      this.siftDown(i);
    }
    this.frame({ ok: this.a.map((_, i) => i), text: `Куча построена: ${this.cmp} сравнений.` });
  }
}

/** Свойство кучи выполняется? — для теста. */
function isHeap(a, kind) {
  for (let i = 1; i < a.length; i++) {
    const p = (i - 1) >> 1;
    if (kind === "min" ? a[i] < a[p] : a[i] > a[p]) return false;
  }
  return true;
}

const STYLE = `
.view { display: grid; gap: 12px; margin-top: 12px; }
svg { width: 100%; height: auto; display: block; background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; }
svg line { stroke: var(--w-line-2); stroke-width: 1.5; }
svg circle { fill: var(--w-surface-2); stroke: var(--w-line-2); stroke-width: 1.5; }
svg circle.hl { fill: var(--w-accent); stroke: transparent; }
svg circle.ok { fill: var(--w-good); stroke: transparent; }
svg text.v { fill: var(--w-text); font: 600 13px "JetBrains Mono", ui-monospace, monospace; text-anchor: middle; dominant-baseline: central; }
svg text.v.on { fill: #10121f; }
svg text.i { fill: var(--w-faint); font: 10px "JetBrains Mono", ui-monospace, monospace; text-anchor: middle; }
@container (max-width: 520px) {
  /* На узком экране рисунок ужимается вдвое — крупнее узлы, индексы есть в массиве ниже. */
  svg circle { r: 25px; }
  svg text.v { font-size: 22px; }
  svg text.i { display: none; }
}
.arr { display: flex; flex-wrap: wrap; gap: 3px; }
.arr div { min-width: 34px; text-align: center; border-radius: 6px; padding: 4px 0 2px; background: var(--w-surface); border: 1px solid var(--w-line);
           font: 13px "JetBrains Mono", ui-monospace, monospace; }
.arr div small { display: block; color: var(--w-faint); font-size: 10px; }
.arr div.hl { background: var(--w-accent); color: #fff; border-color: transparent; }
.arr div.hl small { color: #e6e0ff; }
.arr div.ok { background: var(--w-good); color: #10121f; border-color: transparent; }
.counts { display: flex; gap: 14px; flex-wrap: wrap; }
.ops input { width: 80px; }
`;

class SottoHeap extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.built = true;
    this.seed = Number(this.getAttribute("seed") || 4);
    this.#build();
    this.#reset();
    const step = this.getAttribute("step");
    if (step != null) this.player.go(Number(step));
  }

  #build() {
    this.kind = el("select", { "aria-label": "Вид кучи", onchange: () => this.#replay(false) },
      el("option", { value: "min", selected: this.getAttribute("kind") !== "max" }, "min-куча (минимум в корне)"),
      el("option", { value: "max", selected: this.getAttribute("kind") === "max" }, "max-куча (максимум в корне)"));
    this.start = el("select", { "aria-label": "Начальная куча", onchange: () => this.#reset() },
      el("option", { value: "inserts", selected: this.getAttribute("start") !== "build" }, "вставками по одному"),
      el("option", { value: "build", selected: this.getAttribute("start") === "build" }, "построением из массива"));
    this.valueInput = el("input", { type: "number", "aria-label": "Значение", placeholder: "число" });
    const insert = () => {
      const v = Number(this.valueInput.value);
      if (this.valueInput.value === "" || !Number.isFinite(v)) return this.valueInput.focus();
      this.ops.push(["insert", Math.round(v)]);
      this.valueInput.value = "";
      this.#replay(true);
    };
    this.valueInput.addEventListener("keydown", (e) => { if (e.key === "Enter") insert(); });
    const controls = el("div", { class: "row" },
      el("label", { class: "field" }, "куча", this.kind),
      el("label", { class: "field" }, "начало", this.start),
      el("button", { onclick: () => { this.seed++; this.#reset(); } }, "🎲 Другие числа"));
    const ops = el("div", { class: "row ops", style: "margin-top:8px" }, this.valueInput,
      el("button", { onclick: insert }, "Вставить"),
      el("button", { onclick: () => { this.ops.push(["extract"]); this.#replay(true); } }, "Извлечь корень"),
      el("button", { onclick: () => this.#reset() }, "Сбросить"));
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.setAttribute("viewBox", "0 0 640 300");
    this.svg.setAttribute("role", "img");
    this.arr = el("div", { class: "arr" });
    this.counts = el("div", { class: "counts" });
    this.caption = el("div", { class: "caption", "aria-live": "polite" });
    const legend = el("div", { class: "legend" },
      el("span", {}, el("i", { style: "background:var(--w-accent)" }), "сравниваем / двигаем"),
      el("span", {}, el("i", { style: "background:var(--w-good)" }), "на месте"),
      el("span", {}, "потомки i — 2i+1 и 2i+2, родитель — (i−1)/2 с округлением вниз"));
    this.player = new StepPlayer(this, (i) => this.#render(i));
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE), controls, ops,
      el("div", { class: "view" }, this.svg, this.arr), this.counts, this.caption, legend, this.player.el);
  }

  #reset() {
    const rand = rng(this.seed);
    const values = Array.from({ length: 10 }, () => 1 + Math.floor(rand() * 99));
    this.ops = this.start.value === "build" ? [["build", values]] : values.map((v) => ["insert", v]);
    this.#replay(false);
  }

  #replay(jumpToLast) {
    const heap = new Heap(this.kind.value);
    let lastStart = 0;
    for (const [op, arg] of this.ops) {
      lastStart = heap.frames.length;
      heap[op](arg);
    }
    this.frames = heap.frames;
    // Высота рисунка — по самой большой куче за весь след, чтобы картинка не прыгала.
    const levels = Math.floor(Math.log2(Math.max(1, ...this.frames.map((f) => f.a.length)))) + 1;
    this.svg.setAttribute("viewBox", `0 0 640 ${28 + (levels - 1) * 60 + 44}`);
    this.player.load(this.frames.length, jumpToLast ? lastStart : 0);
    if (jumpToLast) this.player.play();
  }

  #render(index) {
    const f = this.frames[index];
    const hl = new Set(f.hl), ok = new Set(f.ok);
    const ns = "http://www.w3.org/2000/svg";
    const node = (tag, attrs, text) => {
      const e = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      if (text != null) e.textContent = text;
      return e;
    };
    const pos = (i) => {
      const level = Math.floor(Math.log2(i + 1));
      const first = 2 ** level - 1;
      return { x: 20 + (600 * (i - first + 0.5)) / 2 ** level, y: 28 + level * 60 };
    };
    const parts = [];
    for (let i = 1; i < f.a.length; i++) {
      const a = pos(i), b = pos((i - 1) >> 1);
      parts.push(node("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y }));
    }
    f.a.forEach((v, i) => {
      const { x, y } = pos(i);
      const cls = hl.has(i) ? "hl" : ok.has(i) ? "ok" : "";
      parts.push(node("circle", { cx: x, cy: y, r: 17, class: cls }));
      parts.push(node("text", { x, y, class: "v" + (cls ? " on" : "") }, String(v)));
      parts.push(node("text", { x, y: y + 29, class: "i" }, String(i)));
    });
    this.svg.replaceChildren(...parts);
    this.svg.setAttribute("aria-label", `Куча: ${f.a.join(", ") || "пусто"}`);
    this.arr.replaceChildren(...f.a.map((v, i) =>
      el("div", { class: hl.has(i) ? "hl" : ok.has(i) ? "ok" : "" }, String(v), el("small", {}, String(i)))));
    this.counts.innerHTML = `<span class="counter">элементов <b>${f.a.length}</b></span>` +
      `<span class="counter">${this.kind.value === "min" ? "минимум" : "максимум"} <b>${f.a.length ? f.a[0] : "—"}</b></span>` +
      `<span class="counter">сравнений <b>${f.cmp}</b></span><span class="counter">обменов <b>${f.swaps}</b></span>`;
    this.caption.textContent = f.text;
  }
}

customElements.define("sotto-heap", SottoHeap);
export { Heap, isHeap };
