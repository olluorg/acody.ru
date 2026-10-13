// <sotto-arraylist-growth> — сколько раз ArrayList копирует массив: рост в 1,5
// раза (как в OpenJDK), сравнение с ×2 и с прибавлением константы. Видно,
// почему add — амортизированно O(1), а рост «+10» даёт O(n²).
//
//   <sotto-arraylist-growth n="100"></sotto-arraylist-growth>
//
// Атрибуты: n (число добавлений), presized, theme. Перенесено из bkdojo и расширено.

import { BASE_STYLE, el } from "./core.js";

export const DEFAULT_CAPACITY = 10;

export const STRATEGIES = {
  java: { title: "×1,5 — ArrayList", next: (c) => Math.max(c + 1, c + (c >> 1)) },
  double: { title: "×2 — vector в C++, slice в Go", next: (c) => Math.max(1, c * 2) },
  plus10: { title: "+10 — рост на константу", next: (c) => c + 10 },
};

/** n добавлений: события расширения, всего копирований, запас. initial — ёмкость конструктора (0 — ленивая, первый add даёт 10). */
export function simulate(n, { strategy = "java", initial = 0 } = {}) {
  const next = STRATEGIES[strategy].next;
  let cap = initial, copied = 0;
  const events = [];
  // Расширение происходит ровно когда size == capacity — прыгаем от одного к другому.
  if (n > 0 && cap === 0) { cap = DEFAULT_CAPACITY; events.push({ atSize: 0, from: 0, to: cap, copied: 0 }); }
  while (cap < n) {
    const to = next(cap);
    events.push({ atSize: cap, from: cap, to, copied: cap });
    copied += cap;
    cap = to;
  }
  return { cap, events, copied, slack: Math.max(0, cap - n), perAdd: n ? copied / n : 0 };
}

const fmt = (x) => Math.round(x).toLocaleString("ru-RU");

const STYLE = `
.presets { display: flex; gap: 6px; flex-wrap: wrap; }
.presets button.on { background: var(--w-accent); color: #fff; border-color: transparent; }
.inp { width: 120px; font-family: "JetBrains Mono", ui-monospace, monospace; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin-top: 12px; }
.stat { background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 10px; padding: 8px 10px; }
.stat b { display: block; font: 700 18px "JetBrains Mono", ui-monospace, monospace; }
.stat small { color: var(--w-muted); }
.cells { display: flex; flex-wrap: wrap; gap: 2px; margin-top: 12px; }
.c { width: 14px; height: 14px; border-radius: 3px; background: var(--w-surface-2); border: 1px solid var(--w-line); }
.c.on { background: var(--w-accent); border-color: transparent; }
.c.edge { margin-right: 6px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
@container (max-width: 640px) { .grid2 { grid-template-columns: 1fr; } }
.panel { background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; padding: 8px 10px; min-width: 0; }
.panel h4 { margin: 0 0 6px; font-size: 13px; color: var(--w-muted); font-weight: 600; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
td, th { padding: 3px 6px; border-bottom: 1px solid var(--w-line); text-align: right; font-variant-numeric: tabular-nums; }
th { color: var(--w-muted); font-weight: 600; }
td:first-child, th:first-child { text-align: left; }
td.bad { color: var(--w-bad); font-weight: 700; }
svg { width: 100%; height: auto; display: block; }
.axis { font: 10px "JetBrains Mono", ui-monospace, monospace; fill: var(--w-faint); }
.gl { stroke: var(--w-line); }
`;

const COLORS = { java: "var(--w-accent-2)", double: "var(--w-teal)", plus10: "var(--w-bad)" };
const NS = "http://www.w3.org/2000/svg";
const S = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};

class SottoArraylistGrowth extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    this.built = true;
    this.n = Math.max(0, Math.min(10_000_000, Number(this.getAttribute("n") || 100)));
    this.input = el("input", { type: "number", class: "inp", min: "0", max: "10000000", value: String(this.n), "aria-label": "Добавлено элементов" });
    this.input.addEventListener("input", () => { this.n = Math.max(0, Math.min(10_000_000, Math.round(Number(this.input.value) || 0))); this.#render(); });
    this.presets = el("div", { class: "presets" }, ...[10, 40, 100, 10_000, 1_000_000].map((v) => el("button", { onclick: () => { this.n = v; this.input.value = String(v); this.#render(); } }, fmt(v))));
    this.presized = el("input", { type: "checkbox", checked: this.hasAttribute("presized") });
    this.presized.addEventListener("change", () => this.#render());
    this.stats = el("div", { class: "stats" });
    this.cells = el("div", { class: "cells", "aria-hidden": "true" });
    this.events = el("table");
    this.compare = el("table");
    this.chart = S("svg", { viewBox: "0 0 320 170", role: "img", "aria-label": "Копирований на одно добавление" });
    this.caption = el("div", { class: "caption", "aria-live": "polite" });
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE),
      el("div", { class: "row" }, el("label", { class: "field" }, "добавлено элементов", this.input), this.presets),
      el("label", { class: "field", style: "margin-top:8px" }, this.presized, el("span", {}, "задать ёмкость заранее: ", this.code = el("code"))),
      this.stats, this.cells,
      el("div", { class: "grid2" },
        el("div", { class: "panel" }, el("h4", {}, "Расширения ArrayList"), this.events),
        el("div", { class: "panel" }, el("h4", {}, "Стратегии роста: копирований на одно добавление"), this.compare, this.chart)),
      this.caption);
    this.#render();
  }

  #render() {
    const n = this.n, pre = this.presized.checked;
    this.code.textContent = `new ArrayList<>(${fmt(n)})`;
    for (const b of this.presets.children) b.classList.toggle("on", Number(b.textContent.replace(/\s/g, "")) === n);
    const r = simulate(n, { initial: pre ? n : 0 });
    this.stats.replaceChildren(
      el("div", { class: "stat" }, el("b", {}, fmt(r.events.length)), el("small", {}, "расширений массива")),
      el("div", { class: "stat" }, el("b", {}, fmt(r.copied)), el("small", {}, "копирований элементов всего")),
      el("div", { class: "stat" }, el("b", {}, r.perAdd.toFixed(2).replace(".", ",")), el("small", {}, "копирований на один add")),
      el("div", { class: "stat" }, el("b", {}, fmt(r.cap)), el("small", {}, `ёмкость, свободно ${fmt(r.slack)}`)));
    // Массив для небольших n: ячейки и границы прежних ёмкостей.
    if (n <= 60) {
      const edges = new Set(r.events.map((e) => e.to));
      this.cells.style.display = "";
      this.cells.replaceChildren(...Array.from({ length: r.cap }, (_, i) => el("div", { class: "c" + (i < n ? " on" : "") + (edges.has(i + 1) && i + 1 < r.cap ? " edge" : ""), title: `ячейка ${i}` })));
    } else this.cells.style.display = "none";
    const shown = r.events.slice(0, 10);
    this.events.replaceChildren(el("tr", {}, el("th", {}, "при size"), el("th", {}, "ёмкость"), el("th", {}, "копий")),
      ...shown.map((e) => el("tr", {}, el("td", {}, fmt(e.atSize)), el("td", {}, `${fmt(e.from)} → ${fmt(e.to)}`), el("td", {}, fmt(e.copied)))),
      ...(r.events.length > shown.length ? [el("tr", {}, el("td", { colspan: "3" }, `… ещё ${r.events.length - shown.length}`))] : []));
    // Сравнение стратегий при этом n.
    const res = Object.fromEntries(Object.keys(STRATEGIES).map((k) => [k, simulate(n, { strategy: k })]));
    this.compare.replaceChildren(el("tr", {}, el("th", {}, "рост"), el("th", {}, "расширений"), el("th", {}, "копий на add")),
      ...Object.entries(STRATEGIES).map(([k, s]) => el("tr", {}, el("td", { style: `color:${COLORS[k]}` }, s.title), el("td", {}, fmt(res[k].events.length)),
        el("td", { class: k === "plus10" && res[k].perAdd > 10 ? "bad" : "" }, res[k].perAdd < 100 ? res[k].perAdd.toFixed(2).replace(".", ",") : fmt(res[k].perAdd)))));
    // График: копирований на add от n (обе оси логарифмические).
    const W = 320, H = 170, L = 36, B = 22, T = 8, R = 8;
    const xs = (v) => L + ((W - L - R) * Math.log10(v)) / 7, ys = (v) => T + (H - T - B) * (1 - Math.log10(Math.min(1e5, Math.max(0.1, v)) * 10) / 6);
    const parts = [];
    for (const v of [0.1, 1, 10, 100, 1000, 10000]) { parts.push(S("line", { x1: L, y1: ys(v), x2: W - R, y2: ys(v), class: "gl" })); parts.push(S("text", { x: L - 4, y: ys(v) + 3, class: "axis", "text-anchor": "end" }, v >= 1000 ? `${v / 1000}к` : String(v).replace(".", ","))); }
    for (let p = 0; p <= 7; p++) parts.push(S("text", { x: xs(10 ** p), y: H - 6, class: "axis", "text-anchor": "middle" }, p === 0 ? "1" : `10${"⁰¹²³⁴⁵⁶⁷"[p]}`));
    for (const k of Object.keys(STRATEGIES)) {
      let d = "";
      for (let p = 0; p <= 7; p += 0.1) {
        const m = Math.round(10 ** p);
        const v = k === "plus10" && m > 200000 ? (m / 20) : simulate(m, { strategy: k }).perAdd;   // для +10 при больших n — по формуле ≈ n/20
        d += `${d ? "L" : "M"} ${xs(m).toFixed(1)} ${ys(v).toFixed(1)} `;
      }
      parts.push(S("path", { d, fill: "none", stroke: COLORS[k], "stroke-width": 2 }));
    }
    if (n >= 1) parts.push(S("line", { x1: xs(n), y1: T, x2: xs(n), y2: H - B, stroke: "var(--w-text)", "stroke-dasharray": "2 3" }));
    this.chart.replaceChildren(...parts);
    this.caption.textContent = pre
      ? `Ёмкость задана заранее — ни одного расширения и копирования. Если размер известен, это самый дешёвый вариант.`
      : `${fmt(n)} добавлений: массив расширялся ${r.events.length} раз, но в сумме скопировано ${fmt(r.copied)} элементов — ${r.perAdd.toFixed(2).replace(".", ",")} на один add. При росте в разы это число ограничено константой (меньше 3 для ×1,5 и меньше 2 для ×2), поэтому add — амортизированно O(1). При росте на константу копирований на add растёт вместе с n — это O(n) на операцию и O(n²) в сумме: ${fmt(res.plus10.copied)} копий.`;
  }
}

customElements.define("sotto-arraylist-growth", SottoArraylistGrowth);
