// <sotto-sorting> — сортировки по шагам.
//
//   <sotto-sorting algorithm="quick" size="12" preset="random" seed="7"></sotto-sorting>
//   <sotto-sorting algorithm="bubble" compare-with="merge"></sotto-sorting>   — две дорожки на одних данных
//
// Атрибуты: algorithm (bubble|insertion|selection|merge|quick|heap),
// compare-with (вторая дорожка), size (4–48), preset (random|nearly|reversed|few),
// seed (число), input ("5, 3, 8" — свои данные), pivot и compare-pivot
// (last|middle — опорный у быстрой сортировки на каждой дорожке),
// step (с какого шага открыть), theme (light|dark).

import { BASE_STYLE, StepPlayer, el, rng, plural } from "./core.js";

/** Записывает ход алгоритма в кадры. Каждый кадр — полное состояние для показа. */
class Recorder {
  constructor(values) {
    this.a = values.slice();
    this.frames = [];
    this.cmp = 0;
    this.swaps = 0;
    this.writes = 0;
    this.sorted = new Set();
    this.range = null;     // [lo, hi] — активная часть массива
    this.marker = -1;      // опорный элемент или текущий минимум
    this.frame({ text: "Исходный массив. Запустите или идите по шагам." });
  }

  frame({ compare = [], swap = [], write = -1, text = "" }) {
    this.frames.push({
      a: this.a.slice(), compare, swap, write, text,
      sorted: [...this.sorted], range: this.range && this.range.slice(), marker: this.marker,
      cmp: this.cmp, swaps: this.swaps, writes: this.writes,
    });
  }

  /** a[i] > a[j]? — со счётом сравнения и кадром. */
  greater(i, j, text) {
    this.cmp++;
    const r = this.a[i] > this.a[j];
    this.frame({ compare: [i, j], text: text ?? `Сравниваем ${this.a[i]} и ${this.a[j]}: ${r ? `${this.a[i]} больше` : `${this.a[i]} не больше`}.` });
    return r;
  }

  swap(i, j, text) {
    if (i === j) return;
    [this.a[i], this.a[j]] = [this.a[j], this.a[i]];
    this.swaps++;
    this.frame({ swap: [i, j], text: text ?? `Меняем местами ${this.a[j]} и ${this.a[i]}.` });
  }

  write(k, value, text) {
    this.a[k] = value;
    this.writes++;
    this.frame({ write: k, text });
  }

  done(i) { this.sorted.add(i); }

  finish() {
    this.range = null;
    this.marker = -1;
    for (let i = 0; i < this.a.length; i++) this.sorted.add(i);
    this.frame({ text: `Готово: ${this.cmp} ${plural(this.cmp, "сравнение", "сравнения", "сравнений")}, ` +
      `${this.swaps} ${plural(this.swaps, "обмен", "обмена", "обменов")}` +
      (this.writes ? `, ${this.writes} ${plural(this.writes, "запись", "записи", "записей")}` : "") + "." });
    return this.frames;
  }
}

function bubble(r) {
  const n = r.a.length;
  for (let i = 0; i < n - 1; i++) {
    let swapped = false;
    r.range = [0, n - 1 - i];
    for (let j = 0; j < n - 1 - i; j++) {
      if (r.greater(j, j + 1)) { r.swap(j, j + 1); swapped = true; }
    }
    r.done(n - 1 - i);
    r.frame({ text: `Проход ${i + 1} окончен: ${r.a[n - 1 - i]} «всплыл» на своё место.` });
    if (!swapped) {
      r.frame({ text: "За проход не было ни одного обмена — массив уже отсортирован, выходим раньше." });
      break;
    }
  }
}

function insertion(r) {
  const n = r.a.length;
  r.done(0);
  for (let i = 1; i < n; i++) {
    r.range = [0, i];
    r.frame({ text: `Вставляем ${r.a[i]} в уже упорядоченную левую часть.` });
    let j = i;
    while (j > 0 && r.greater(j - 1, j)) {
      r.swap(j - 1, j, `${r.a[j - 1]} больше ${r.a[j]} — меняем их местами, ${r.a[j]} сдвигается влево.`);
      j--;
    }
  }
}

function selection(r) {
  const n = r.a.length;
  for (let i = 0; i < n - 1; i++) {
    r.range = [i, n - 1];
    let min = i;
    r.marker = min;
    r.frame({ text: `Ищем минимум в части с ${i}-й позиции. Пока минимум — ${r.a[min]}.` });
    for (let j = i + 1; j < n; j++) {
      if (r.greater(min, j, `Сравниваем текущий минимум ${r.a[min]} с ${r.a[j]}.`)) {
        min = j;
        r.marker = min;
        r.frame({ text: `Новый минимум — ${r.a[min]}.` });
      }
    }
    r.swap(i, min, `Ставим минимум ${r.a[min]} на позицию ${i}.`);
    r.done(i);
  }
  r.marker = -1;
}

function merge(r) {
  const sort = (lo, hi) => {
    if (lo >= hi) return;
    const mid = (lo + hi) >> 1;
    sort(lo, mid);
    sort(mid + 1, hi);
    r.range = [lo, hi];
    const aux = r.a.slice(lo, hi + 1);
    r.frame({ text: `Сливаем две упорядоченные половины: [${aux.slice(0, mid - lo + 1).join(", ")}] и [${aux.slice(mid - lo + 1).join(", ")}].` });
    let i = 0, j = mid - lo + 1;
    const leftEnd = mid - lo, rightEnd = hi - lo;
    for (let k = lo; k <= hi; k++) {
      if (i > leftEnd) {
        r.write(k, aux[j], `Левая половина кончилась — переносим ${aux[j]}.`); j++;
      } else if (j > rightEnd) {
        r.write(k, aux[i], `Правая половина кончилась — переносим ${aux[i]}.`); i++;
      } else {
        r.cmp++;
        if (aux[j] < aux[i]) {
          r.write(k, aux[j], `Сравниваем ${aux[i]} и ${aux[j]} — берём меньшее, ${aux[j]}.`); j++;
        } else {
          r.write(k, aux[i], `Сравниваем ${aux[i]} и ${aux[j]} — берём ${aux[i]} (при равенстве — из левой, поэтому сортировка устойчива).`); i++;
        }
      }
    }
  };
  sort(0, r.a.length - 1);
}

function quick(r, pivotRule) {
  const sort = (lo, hi) => {
    if (lo > hi) return;
    if (lo === hi) { r.done(lo); return; }
    r.range = [lo, hi];
    if (pivotRule === "middle") {
      const mid = (lo + hi) >> 1;
      r.swap(mid, hi, `Опорный — средний элемент ${r.a[mid]}; переносим его в конец.`);
    }
    const pivot = r.a[hi];
    r.marker = hi;
    r.frame({ text: `Разбиваем часть [${lo}..${hi}] вокруг опорного ${pivot}: меньшие и равные — влево.` });
    let i = lo - 1;
    for (let j = lo; j < hi; j++) {
      if (!r.greater(j, hi, `${r.a[j]} сравниваем с опорным ${pivot}.`)) {
        i++;
        r.swap(i, j, `${r.a[j]} не больше опорного — переносим в левую часть.`);
      }
    }
    r.swap(i + 1, hi, `Ставим опорный ${pivot} между частями — это его окончательное место.`);
    r.done(i + 1);
    r.marker = -1;
    sort(lo, i);
    sort(i + 2, hi);
  };
  sort(0, r.a.length - 1);
}

function heap(r) {
  const n = r.a.length;
  const sift = (i, size) => {
    for (;;) {
      let largest = i;
      const left = 2 * i + 1, right = 2 * i + 2;
      if (left < size && r.greater(left, largest, `Потомок ${r.a[left]} больше родителя ${r.a[largest]}?`)) largest = left;
      if (right < size && r.greater(right, largest, `Потомок ${r.a[right]} больше ${r.a[largest]}?`)) largest = right;
      if (largest === i) return;
      r.swap(i, largest, `Поднимаем больший потомок ${r.a[largest]} наверх, ${r.a[i]} опускается.`);
      i = largest;
    }
  };
  r.range = [0, n - 1];
  r.frame({ text: "Шаг 1: строим кучу — в корне (позиция 0) окажется максимум." });
  for (let i = (n >> 1) - 1; i >= 0; i--) sift(i, n);
  for (let end = n - 1; end > 0; end--) {
    r.range = [0, end];
    r.swap(0, end, `Максимум ${r.a[0]} уходит в конец на позицию ${end}.`);
    r.done(end);
    sift(0, end);
  }
}

const ALGORITHMS = {
  bubble: { name: "Пузырьком", run: bubble, best: "O(n)", avg: "O(n²)", worst: "O(n²)", memory: "O(1)", stable: true },
  insertion: { name: "Вставками", run: insertion, best: "O(n)", avg: "O(n²)", worst: "O(n²)", memory: "O(1)", stable: true },
  selection: { name: "Выбором", run: selection, best: "O(n²)", avg: "O(n²)", worst: "O(n²)", memory: "O(1)", stable: false },
  merge: { name: "Слиянием", run: merge, best: "O(n log n)", avg: "O(n log n)", worst: "O(n log n)", memory: "O(n)", stable: true },
  quick: { name: "Быстрая", run: quick, best: "O(n log n)", avg: "O(n log n)", worst: "O(n²)", memory: "O(log n)", stable: false },
  heap: { name: "Пирамидальная", run: heap, best: "O(n log n)", avg: "O(n log n)", worst: "O(n log n)", memory: "O(1)", stable: false },
};

const PRESETS = {
  random: "случайные",
  nearly: "почти отсортированные",
  reversed: "в обратном порядке",
  few: "мало разных значений",
};

function makeData(preset, size, seed) {
  const rand = rng(seed);
  const asc = Array.from({ length: size }, (_, i) => Math.round(((i + 1) * 99) / size));
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  if (preset === "nearly") {
    const a = asc.slice();
    for (let k = 0; k < Math.max(1, size >> 3); k++) {
      const i = Math.floor(rand() * (size - 1));
      [a[i], a[i + 1]] = [a[i + 1], a[i]];
    }
    return a;
  }
  if (preset === "reversed") return asc.slice().reverse();
  if (preset === "few") return Array.from({ length: size }, () => [25, 50, 75, 99][Math.floor(rand() * 4)]);
  return shuffle(asc.slice());
}

function parseInput(text) {
  const nums = String(text).split(/[\s,;]+/).filter(Boolean).map(Number).filter((x) => Number.isFinite(x));
  return nums.slice(0, 48).map((x) => Math.max(1, Math.min(999, Math.round(x))));
}

const STYLE = `
.lanes { display: grid; gap: 14px; margin-top: 12px; }
.lanes.two { grid-template-columns: 1fr 1fr; }
@container (max-width: 640px) { .lanes.two { grid-template-columns: 1fr; } }
.lane { background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; padding: 10px 12px; min-width: 0; }
.lane-head { margin-bottom: 6px; }
.stage { height: 190px; display: flex; align-items: flex-end; gap: 3px; padding: 4px 0; }
.bar { flex: 1; min-width: 3px; border-radius: 4px 4px 1px 1px; background: var(--w-bar); position: relative;
       transition: height .12s ease, background-color .12s ease; display: flex; align-items: flex-end; justify-content: center; }
.bar span { font-size: 11px; color: var(--w-text); padding-bottom: 3px; font-variant-numeric: tabular-nums; text-shadow: 0 1px 2px rgba(0,0,0,.4); }
.bar.out { opacity: .32; }
.bar.sorted { background: var(--w-good); }
.bar.compare { background: var(--w-accent); }
.bar.swap, .bar.write { background: var(--w-warm); }
.bar.marker { background: var(--w-teal); }
.bar.compare span, .bar.swap span, .bar.write span, .bar.marker span, .bar.sorted span { color: #10121f; text-shadow: none; font-weight: 700; }
.counts { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 6px; }
.complexity { margin-top: 6px; color: var(--w-faint); font-size: 12px; }
.complexity b { color: var(--w-muted); font-weight: 600; }
.inputs { gap: 10px; }
.custom { width: 150px; }
`;

class SottoSorting extends HTMLElement {
  static observedAttributes = ["algorithm", "compare-with", "size", "preset", "seed", "input", "pivot", "compare-pivot"];

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    // Атрибуты и tabindex — только здесь: в конструкторе их трогать нельзя.
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.seed = Number(this.getAttribute("seed") || 7);
    this.built = true;
    this.#build();
    this.#recompute();
  }

  attributeChangedCallback() {
    if (this.built) this.#syncFromAttributes();
  }

  #syncFromAttributes() {
    this.lanes[0].algo.value = this.getAttribute("algorithm") || "quick";
    this.lanes[0].pivot.value = this.getAttribute("pivot") === "middle" ? "middle" : "last";
    if (this.lanes[1]) {
      this.lanes[1].algo.value = this.getAttribute("compare-with");
      this.lanes[1].pivot.value = this.getAttribute("compare-pivot") === "middle" ? "middle" : "last";
    }
    this.#recompute();
  }

  #build() {
    const lanesConfig = [{ algo: this.getAttribute("algorithm") || "quick", pivot: this.getAttribute("pivot") }];
    if (this.hasAttribute("compare-with")) {
      lanesConfig.push({ algo: this.getAttribute("compare-with"), pivot: this.getAttribute("compare-pivot") });
    }

    this.presetSelect = el("select", { "aria-label": "Данные", onchange: () => { this.customData = null; this.#recompute(); } },
      Object.entries(PRESETS).map(([k, name]) => el("option", { value: k, selected: k === (this.getAttribute("preset") || "random") }, name)));
    this.sizeInput = el("input", { type: "range", min: "4", max: "48", value: this.getAttribute("size") || "12", "aria-label": "Размер массива" });
    this.sizeLabel = el("b", {}, this.sizeInput.value);
    this.sizeInput.addEventListener("input", () => { this.sizeLabel.textContent = this.sizeInput.value; this.customData = null; this.#recompute(); });
    this.customInput = el("input", { type: "text", class: "custom", placeholder: "свои: 5, 3, 8, 1", "aria-label": "Свои данные" });
    if (this.getAttribute("input")) {
      this.customInput.value = this.getAttribute("input");
      this.customData = parseInput(this.customInput.value);
    }
    const applyCustom = () => {
      const data = parseInput(this.customInput.value);
      if (data.length >= 2) { this.customData = data; this.#recompute(); }
    };
    this.customInput.addEventListener("keydown", (e) => { if (e.key === "Enter") applyCustom(); });

    const controls = el("div", { class: "row inputs" },
      el("label", { class: "field" }, "данные", this.presetSelect),
      el("label", { class: "field" }, "размер", this.sizeInput, this.sizeLabel),
      el("button", { title: "Новые случайные данные", onclick: () => { this.seed++; this.customData = null; this.#recompute(); } }, "🎲 Перемешать"),
      this.customInput,
      el("button", { onclick: applyCustom }, "Применить"));

    this.lanesEl = el("div", { class: "lanes" + (lanesConfig.length > 1 ? " two" : "") });
    this.lanes = lanesConfig.map((cfg) => {
      const lane = {
        algo: el("select", { "aria-label": "Алгоритм", onchange: () => this.#recompute() },
          Object.entries(ALGORITHMS).map(([k, a]) => el("option", { value: k, selected: k === cfg.algo }, a.name))),
        pivot: el("select", { "aria-label": "Опорный элемент", onchange: () => this.#recompute() },
          el("option", { value: "last", selected: cfg.pivot !== "middle" }, "опорный: последний"),
          el("option", { value: "middle", selected: cfg.pivot === "middle" }, "опорный: средний")),
        status: el("span", { class: "counter" }),
        stage: el("div", { class: "stage", role: "img" }),
        counts: el("div", { class: "counts" }),
        caption: el("div", { class: "caption", "aria-live": "polite" }),
        complexity: el("div", { class: "complexity" }),
      };
      lane.head = el("div", { class: "row lane-head" }, lane.algo, lane.pivot, lane.status);
      lane.root = el("div", { class: "lane" }, lane.head, lane.stage, lane.counts, lane.complexity, lane.caption);
      this.lanesEl.append(lane.root);
      return lane;
    });

    const legend = el("div", { class: "legend" },
      el("span", {}, el("i", { style: "background:var(--w-accent)" }), "сравнение"),
      el("span", {}, el("i", { style: "background:var(--w-warm)" }), "обмен / запись"),
      el("span", {}, el("i", { style: "background:var(--w-teal)" }), "опорный / текущий минимум"),
      el("span", {}, el("i", { style: "background:var(--w-good)" }), "на своём месте"),
      el("span", {}, el("i", { style: "background:var(--w-bar);opacity:.35" }), "вне текущей части"));

    this.player = new StepPlayer(this, (i) => this.#render(i));
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE), controls, this.lanesEl, legend, this.player.el);
  }

  #recompute() {
    const size = Number(this.sizeInput.value);
    const data = this.customData || makeData(this.presetSelect.value, size, this.seed);
    this.traces = this.lanes.map((lane) => {
      const algo = ALGORITHMS[lane.algo.value];
      lane.pivot.style.display = lane.algo.value === "quick" ? "" : "none";
      const r = new Recorder(data);
      algo.run(r, lane.pivot.value);
      return { algo, frames: r.finish() };
    });
    const length = Math.max(...this.traces.map((t) => t.frames.length));
    // step — открыть на заданном шаге (только при первом построении).
    const start = this.startStep ?? Number(this.getAttribute("step") || 0);
    this.startStep = 0;
    this.player.load(length, Math.min(start, length - 1));
  }

  #render(index) {
    this.traces.forEach((trace, k) => {
      const lane = this.lanes[k];
      const f = trace.frames[Math.min(index, trace.frames.length - 1)];
      const algo = trace.algo;
      lane.status.textContent = index >= trace.frames.length - 1 ? "готово" : "";
      const max = Math.max(...f.a);
      const sorted = new Set(f.sorted);
      const compare = new Set(f.compare);
      const swap = new Set(f.swap);
      const showValues = f.a.length <= 24;
      lane.stage.replaceChildren(...f.a.map((v, i) => {
        let cls = "bar";
        if (f.range && (i < f.range[0] || i > f.range[1]) && !sorted.has(i)) cls += " out";
        if (sorted.has(i)) cls += " sorted";
        if (i === f.marker) cls += " marker";
        if (compare.has(i)) cls += " compare";
        if (swap.has(i)) cls += " swap";
        if (i === f.write) cls += " write";
        return el("div", { class: cls, style: `height:${Math.max(4, (v / max) * 100)}%` }, showValues ? el("span", {}, String(v)) : null);
      }));
      lane.stage.setAttribute("aria-label", `${algo.name}: массив ${f.a.join(", ")}`);
      lane.counts.innerHTML =
        `<span class="counter">сравнений <b>${f.cmp}</b></span>` +
        `<span class="counter">${algo === ALGORITHMS.merge ? "записей" : "обменов"} <b>${algo === ALGORITHMS.merge ? f.writes : f.swaps}</b></span>`;
      lane.complexity.innerHTML =
        `лучший <b>${algo.best}</b> · средний <b>${algo.avg}</b> · худший <b>${algo.worst}</b> · память <b>${algo.memory}</b> · ` +
        (algo.stable ? "устойчивая" : "неустойчивая");
      lane.caption.textContent = f.text;
    });
  }
}

customElements.define("sotto-sorting", SottoSorting);

export { ALGORITHMS, Recorder, makeData };
