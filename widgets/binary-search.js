// <sotto-binary-search> — бинарный поиск рядом с линейным на одном массиве.
//
//   <sotto-binary-search size="32"></sotto-binary-search>
//   <sotto-binary-search size="64" variant="lower-bound"></sotto-binary-search>
//
// Атрибуты: size (8–128), variant (exact|lower-bound), target (число), seed, step, theme.

import { BASE_STYLE, StepPlayer, el, rng, plural } from "./core.js";

/** Отсортированный массив с повторами (для lower bound) или без. */
function makeArray(size, seed, withDuplicates) {
  const rand = rng(seed);
  const a = [];
  let v = 1 + Math.floor(rand() * 4);
  for (let i = 0; i < size; i++) {
    a.push(v);
    v += withDuplicates ? (rand() < 0.3 ? 0 : 1 + Math.floor(rand() * 3)) : 1 + Math.floor(rand() * 4);
  }
  return a;
}

function linearTrace(a, target, variant) {
  const frames = [{ i: -1, cmp: 0, text: "Линейный поиск: смотрим элементы по очереди слева направо." }];
  for (let i = 0; i < a.length; i++) {
    const cmp = i + 1;
    if (variant === "exact" ? a[i] === target : a[i] >= target) {
      frames.push({ i, cmp, found: i, text: variant === "exact" ? `a[${i}] = ${a[i]} — нашли за ${cmp} ${plural(cmp, "сравнение", "сравнения", "сравнений")}.`
        : `a[${i}] = ${a[i]} ≥ ${target} — первое такое место, индекс ${i}.` });
      return frames;
    }
    frames.push({ i, cmp, text: `a[${i}] = ${a[i]} — ${variant === "exact" ? "не то" : `меньше ${target}`}, дальше.` });
  }
  frames.push({ i: -1, cmp: a.length, found: variant === "exact" ? -1 : a.length,
    text: variant === "exact" ? `Просмотрели все ${a.length} — значения ${target} нет.` : `Все элементы меньше ${target} — место вставки в конце, индекс ${a.length}.` });
  return frames;
}

function binaryTrace(a, target, variant) {
  const frames = [];
  let cmp = 0;
  if (variant === "exact") {
    let lo = 0, hi = a.length - 1;
    frames.push({ lo, hi, mid: -1, cmp, text: `Бинарный поиск: границы lo = 0, hi = ${hi}. Смотрим середину.` });
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      cmp++;
      if (a[mid] === target) {
        frames.push({ lo, hi, mid, cmp, found: mid, text: `a[${mid}] = ${a[mid]} — нашли за ${cmp} ${plural(cmp, "сравнение", "сравнения", "сравнений")}.` });
        return frames;
      }
      if (a[mid] < target) {
        frames.push({ lo, hi, mid, cmp, text: `a[${mid}] = ${a[mid]} < ${target}: искомое правее — отбрасываем левую половину, lo = ${mid + 1}.` });
        lo = mid + 1;
      } else {
        frames.push({ lo, hi, mid, cmp, text: `a[${mid}] = ${a[mid]} > ${target}: искомое левее — отбрасываем правую половину, hi = ${mid - 1}.` });
        hi = mid - 1;
      }
    }
    frames.push({ lo, hi, mid: -1, cmp, found: -1, text: `Границы сошлись (lo = ${lo} > hi = ${hi}) — значения ${target} нет. Сравнений: ${cmp}.` });
  } else {
    let lo = 0, hi = a.length;
    frames.push({ lo, hi: hi - 1, mid: -1, cmp, text: `Ищем первое место, где a[i] ≥ ${target}: полуинтервал [${lo}, ${hi}).` });
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      cmp++;
      if (a[mid] < target) {
        frames.push({ lo, hi: hi - 1, mid, cmp, text: `a[${mid}] = ${a[mid]} < ${target}: ответ правее, lo = ${mid + 1}.` });
        lo = mid + 1;
      } else {
        frames.push({ lo, hi: hi - 1, mid, cmp, text: `a[${mid}] = ${a[mid]} ≥ ${target}: ответ здесь или левее — не останавливаемся, hi = ${mid}.` });
        hi = mid;
      }
    }
    frames.push({ lo, hi: lo, mid: -1, cmp, found: lo,
      text: `lo = hi = ${lo}: ${lo < a.length ? `первое a[i] ≥ ${target} — индекс ${lo}` : "все меньше — место вставки в конце"}. Сравнений: ${cmp}.` });
  }
  return frames;
}

const STYLE = `
.lanes { display: grid; gap: 12px; margin-top: 12px; }
.lane { background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; padding: 10px 12px; min-width: 0; }
.lane h3 { margin: 0 0 8px; font-size: 14px; display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; }
.cells { display: grid; gap: 3px; }
.c { border-radius: 5px; background: var(--w-surface-2); border: 1px solid var(--w-line); text-align: center;
     font: 12px/1 "JetBrains Mono", ui-monospace, monospace; padding: 6px 0; position: relative; min-width: 0; overflow: hidden; }
.c.out { opacity: .25; }
.c.range { border-color: var(--w-line-2); }
.c.mid { background: var(--w-accent); color: #fff; border-color: transparent; }
.c.cur { background: var(--w-accent); color: #fff; border-color: transparent; }
.c.seen { opacity: .35; }
.c.found { background: var(--w-good); color: #10121f; border-color: transparent; font-weight: 700; }
.c.target { box-shadow: inset 0 -3px 0 var(--w-warm); }
.marks { display: grid; gap: 3px; font: 10px/1.2 "JetBrains Mono", ui-monospace, monospace; color: var(--w-muted); text-align: center; margin-top: 2px; min-height: 14px; }
.small .c { font-size: 0; padding: 7px 0; }
`;

class SottoBinarySearch extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.built = true;
    this.seed = Number(this.getAttribute("seed") || 3);
    this.#build();
    const target = this.getAttribute("target");
    this.#recompute(target == null ? null : Number(target));
    const step = this.getAttribute("step");
    if (step != null) this.player.go(Number(step));
  }

  #build() {
    this.sizeInput = el("input", { type: "range", min: "8", max: "128", value: this.getAttribute("size") || "32", "aria-label": "Размер массива" });
    this.sizeLabel = el("b", {}, this.sizeInput.value);
    this.sizeInput.addEventListener("input", () => { this.sizeLabel.textContent = this.sizeInput.value; this.#recompute(null); });
    this.variant = el("select", { "aria-label": "Задача", onchange: () => this.#recompute(null) },
      el("option", { value: "exact", selected: this.getAttribute("variant") !== "lower-bound" }, "найти значение"),
      el("option", { value: "lower-bound", selected: this.getAttribute("variant") === "lower-bound" }, "первое ≥ значения (lower bound)"));
    this.targetInput = el("input", { type: "number", "aria-label": "Искомое значение", style: "width:90px" });
    this.targetInput.addEventListener("change", () => this.#recompute(Number(this.targetInput.value)));
    const controls = el("div", { class: "row" },
      el("label", { class: "field" }, "задача", this.variant),
      el("label", { class: "field" }, "размер", this.sizeInput, this.sizeLabel),
      el("label", { class: "field" }, "ищем", this.targetInput),
      el("button", { onclick: () => this.#recompute("hit") }, "Есть в массиве"),
      el("button", { onclick: () => this.#recompute("miss") }, "Нет в массиве"),
      el("button", { onclick: () => { this.seed++; this.#recompute(null); } }, "🎲 Новый массив"));

    this.lanes = ["Линейный поиск — O(n)", "Бинарный поиск — O(log n)"].map((title) => {
      const lane = { title: el("span", {}, title), counter: el("span", { class: "counter" }), cells: el("div", { class: "cells", role: "img" }),
                     marks: el("div", { class: "marks" }), caption: el("div", { class: "caption", "aria-live": "polite" }) };
      lane.root = el("div", { class: "lane" }, el("h3", {}, lane.title, lane.counter), lane.cells, lane.marks, lane.caption);
      return lane;
    });
    this.bound = el("div", { class: "note" });
    const legend = el("div", { class: "legend" },
      el("span", {}, el("i", { style: "background:var(--w-accent)" }), "сравниваем сейчас (mid)"),
      el("span", {}, el("i", { style: "background:var(--w-surface-2);opacity:.3" }), "отброшено"),
      el("span", {}, el("i", { style: "background:var(--w-good)" }), "ответ"),
      el("span", {}, el("i", { style: "background:var(--w-surface-2);box-shadow:inset 0 -3px 0 var(--w-warm)" }), "искомое"));
    this.player = new StepPlayer(this, (i) => this.#render(i));
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE), controls,
      el("div", { class: "lanes" }, this.lanes.map((l) => l.root)), this.bound, legend, this.player.el);
  }

  #recompute(target) {
    const n = Number(this.sizeInput.value);
    const variant = this.variant.value;
    this.a = makeArray(n, this.seed, variant === "lower-bound");
    const rand = rng(this.seed * 7 + n);
    if (target === "miss" || (target == null && rand() < 0.2)) {
      // значение, которого нет: между соседними элементами или за краем
      const gaps = [];
      for (let i = 1; i < n; i++) if (this.a[i] - this.a[i - 1] > 1) gaps.push(this.a[i - 1] + 1);
      target = gaps.length ? gaps[Math.floor(rand() * gaps.length)] : this.a[n - 1] + 1;
    } else if (target === "hit" || target == null) {
      target = this.a[Math.floor(rand() * n)];
    }
    this.target = target;
    this.targetInput.value = String(target);
    this.linear = linearTrace(this.a, target, variant);
    this.binary = binaryTrace(this.a, target, variant);
    const bound = Math.ceil(Math.log2(n + 1));
    this.bound.textContent = `Для n = ${n} бинарный поиск делает не больше ⌈log₂(n+1)⌉ = ${bound} сравнений, линейный — до ${n}. ` +
      `Для миллиона элементов — 20 против миллиона.`;
    const cols = Math.min(n, 32);
    for (const lane of this.lanes) {
      lane.cells.style.gridTemplateColumns = lane.marks.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      lane.cells.classList.toggle("small", n > 64);
    }
    this.player.load(Math.max(this.linear.length, this.binary.length));
  }

  #render(index) {
    const n = this.a.length;
    const lf = this.linear[Math.min(index, this.linear.length - 1)];
    const bf = this.binary[Math.min(index, this.binary.length - 1)];
    const cell = (i, cls, lane) => el("div", { class: "c " + cls, title: `a[${i}] = ${this.a[i]}` }, String(this.a[i]));
    const isTarget = (i) => (this.variant.value === "exact" ? this.a[i] === this.target : false);

    this.lanes[0].cells.replaceChildren(...this.a.map((_, i) => {
      let cls = isTarget(i) ? "target" : "";
      if (lf.found === i) cls += " found";
      else if (i === lf.i) cls += " cur";
      else if (lf.i >= 0 && i < lf.i) cls += " seen";
      return cell(i, cls);
    }));
    this.lanes[0].counter.innerHTML = `сравнений <b>${lf.cmp}</b>`;
    this.lanes[0].caption.textContent = lf.text;
    this.lanes[0].marks.replaceChildren();

    this.lanes[1].cells.replaceChildren(...this.a.map((_, i) => {
      let cls = isTarget(i) ? "target" : "";
      if (bf.found === i) cls += " found";
      else if (i === bf.mid) cls += " mid";
      else if (i < bf.lo || i > bf.hi) cls += " out";
      else cls += " range";
      return cell(i, cls);
    }));
    const marks = new Array(Math.min(n, 32)).fill("");
    if (n <= 32) {
      if (bf.lo >= 0 && bf.lo < n) marks[bf.lo] += "lo ";
      if (bf.hi >= 0 && bf.hi < n) marks[bf.hi] += "hi ";
      if (bf.mid >= 0) marks[bf.mid] += "mid";
    }
    this.lanes[1].marks.replaceChildren(...marks.map((m) => el("span", {}, m.trim())));
    this.lanes[1].counter.innerHTML = `сравнений <b>${bf.cmp}</b>`;
    this.lanes[1].caption.textContent = bf.text;
  }
}

customElements.define("sotto-binary-search", SottoBinarySearch);
export { linearTrace, binaryTrace, makeArray };
