// <sotto-big-o> — как растут функции сложности.
//
//   <sotto-big-o n="1000"></sotto-big-o>
//
// Атрибуты: n (1–10⁹), scale (log|linear — ось Y), speed (операций в секунду, по умолчанию 10⁸), theme.

import { BASE_STYLE, el } from "./core.js";

/** ln(n!): точно для n ≤ 20, по Стирлингу дальше — n! не помещается в число. */
const lnFactorial = (n) => {
  if (Number.isInteger(n) && n <= 20) { let s = 0; for (let k = 2; k <= n; k++) s += Math.log(k); return s; }
  if (n < 1) return 0;
  return n * Math.log(n) - n + 0.5 * Math.log(2 * Math.PI * n) + 1 / (12 * n);
};

/** Каждая функция умеет считать log10 числа операций — чтобы не переполняться на 2ⁿ и n!. */
const CLASSES = [
  { id: "1", label: "O(1)", log10: () => 0, example: "доступ к элементу массива, поиск в хеш-таблице", color: "var(--w-good)" },
  { id: "log", label: "O(log n)", log10: (n) => Math.log10(Math.max(1, Math.log2(Math.max(n, 2)))), example: "бинарный поиск, операции с кучей и сбалансированным деревом", color: "var(--w-teal)" },
  { id: "n", label: "O(n)", log10: (n) => Math.log10(n), example: "один проход по данным, линейный поиск", color: "var(--w-accent-2)" },
  { id: "nlogn", label: "O(n log n)", log10: (n) => Math.log10(n * Math.max(1, Math.log2(Math.max(n, 2)))), example: "сортировки слиянием, пирамидальная, быстрая в среднем", color: "var(--w-accent)" },
  { id: "n2", label: "O(n²)", log10: (n) => 2 * Math.log10(n), example: "вложенный цикл по парам, сортировка пузырьком", color: "var(--w-warm)" },
  { id: "n3", label: "O(n³)", log10: (n) => 3 * Math.log10(n), example: "наивное умножение матриц, Флойд — Уоршелл", color: "#e88b5c" },
  { id: "2n", label: "O(2ⁿ)", log10: (n) => n * Math.log10(2), example: "перебор всех подмножеств, наивный Фибоначчи", color: "var(--w-bad)" },
  { id: "fact", label: "O(n!)", log10: (n) => lnFactorial(n) / Math.LN10, example: "перебор всех перестановок, коммивояжёр полным перебором", color: "#c0395a" },
];

function formatCount(log10) {
  if (log10 < 6) return Math.round(10 ** log10).toLocaleString("ru-RU");
  if (log10 < 15) {
    const v = 10 ** log10;
    for (const [p, w] of [[12, "трлн"], [9, "млрд"], [6, "млн"]]) if (v >= 10 ** p) return `${(v / 10 ** p).toFixed(v / 10 ** p < 10 ? 1 : 0)} ${w}`;
  }
  return `10^${Math.floor(log10)}`;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds > 4.3e17) return "дольше возраста Вселенной";
  if (seconds < 1e-6) return "меньше микросекунды";
  if (seconds < 1e-3) return `${(seconds * 1e6).toFixed(0)} мкс`;
  if (seconds < 1) return `${(seconds * 1e3).toFixed(seconds < 0.01 ? 1 : 0)} мс`;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} с`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(0)} мин`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} ч`;
  if (seconds < 3.15e7) return `${(seconds / 86400).toFixed(0)} дн`;
  const years = seconds / 3.156e7;
  return years < 1e6 ? `${Math.round(years).toLocaleString("ru-RU")} лет` : `10^${Math.floor(Math.log10(years))} лет`;
}

const STYLE = `
svg { width: 100%; height: auto; display: block; margin-top: 10px; background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; }
svg text { fill: var(--w-muted); font: 11px "JetBrains Mono", ui-monospace, monospace; }
.grid line { stroke: var(--w-line); }
table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--w-line); vertical-align: top; }
th { color: var(--w-muted); font-weight: 600; }
td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
td.slow { color: var(--w-bad); font-weight: 700; }
td.ok { color: var(--w-good); }
.sw { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
td.ex { color: var(--w-faint); }
@container (max-width: 560px) { td.ex, th.ex { display: none; } }
`;

class SottoBigO extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.built = true;
    this.speed = Number(this.getAttribute("speed") || 1e8);
    const n = Math.max(1, Math.min(1e9, Number(this.getAttribute("n") || 1000)));
    // Ползунок по логарифму: 0..900 → 10^0..10^9.
    this.slider = el("input", { type: "range", min: "0", max: "900", value: String(Math.round(Math.log10(n) * 100)), class: "grow", "aria-label": "Размер входа n" });
    this.nLabel = el("b");
    this.slider.addEventListener("input", () => this.#render());
    this.scale = el("select", { "aria-label": "Ось Y", onchange: () => this.#render() },
      el("option", { value: "log", selected: this.getAttribute("scale") !== "linear" }, "логарифмическая"),
      el("option", { value: "linear", selected: this.getAttribute("scale") === "linear" }, "линейная"));
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.setAttribute("viewBox", "0 0 640 280");
    this.svg.setAttribute("role", "img");
    this.table = el("table");
    this.summary = el("div", { class: "caption", "aria-live": "polite" });
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE),
      el("div", { class: "row" }, el("label", { class: "field" }, "n ="), this.nLabel, this.slider,
        el("label", { class: "field" }, "ось Y", this.scale)),
      this.svg, this.summary, this.table,
      el("div", { class: "note" }, `Время — при ${formatCount(Math.log10(this.speed))} простых операций в секунду, без учёта констант.`));
    this.#render();
  }

  get n() {
    const v = Math.round(10 ** (Number(this.slider.value) / 100));
    return Math.max(1, v);
  }

  #render() {
    const n = this.n;
    this.nLabel.textContent = n.toLocaleString("ru-RU");
    this.#chart(n);
    const rows = CLASSES.map((c) => {
      const lg = c.log10(n);
      const seconds = 10 ** lg / this.speed;
      const cls = seconds > 1 ? "slow" : seconds < 1e-3 ? "ok" : "";
      return el("tr", {},
        el("td", {}, el("span", { class: "sw", style: `background:${c.color}` }), c.label),
        el("td", { class: "num" }, formatCount(lg)),
        el("td", { class: "num " + cls }, formatTime(seconds)),
        el("td", { class: "ex" }, c.example));
    });
    this.table.replaceChildren(el("tr", {}, el("th", {}, "класс"), el("th", {}, "операций"), el("th", {}, "время"), el("th", { class: "ex" }, "пример")), ...rows);
    const nlogn = 10 ** CLASSES[3].log10(n), n2 = 10 ** CLASSES[4].log10(n);
    this.summary.textContent = n < 4
      ? "При совсем маленьком n разница незаметна — двигайте ползунок вправо."
      : `При n = ${n.toLocaleString("ru-RU")} алгоритм O(n²) делает в ${formatCount(Math.log10(n2 / nlogn))} раз больше операций, чем O(n log n). ` +
        (n2 / this.speed > 1 ? `Это уже ${formatTime(n2 / this.speed)} против ${formatTime(nlogn / this.speed)}.` : "");
  }

  #chart(n) {
    const W = 640, H = 280, L = 48, R = 12, T = 12, B = 30;
    const log = this.scale.value === "log";
    const maxLog = log ? Math.max(1, CLASSES[3].log10(n) * 2.2, 2) : Math.max(0.5, CLASSES[4].log10(n) + 0.05);
    const maxY = log ? maxLog : 10 ** maxLog;
    const yOf = (lg) => {
      const v = log ? Math.min(lg, maxLog) : Math.min(10 ** lg, maxY);
      return T + (H - T - B) * (1 - v / maxY);
    };
    // В логарифмическом режиме обе оси логарифмические: степени n — прямые с разным наклоном.
    const xOf = (x) => L + (W - L - R) * (log ? Math.log10(x) / Math.max(1e-9, Math.log10(n)) : (x - 1) / Math.max(1, n - 1));
    const ns = "http://www.w3.org/2000/svg";
    const node = (tag, attrs, text) => {
      const e = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      if (text != null) e.textContent = text;
      return e;
    };
    const parts = [];
    const grid = node("g", { class: "grid" });
    for (let k = 0; k <= 4; k++) {
      const y = T + ((H - T - B) * k) / 4;
      grid.append(node("line", { x1: L, x2: W - R, y1: y, y2: y }));
      const v = log ? maxLog * (1 - k / 4) : maxY * (1 - k / 4);
      grid.append(node("text", { x: 4, y: y + 4 }, log ? `10^${v.toFixed(0)}` : formatCount(Math.log10(Math.max(v, 1)))));
    }
    parts.push(grid);
    parts.push(node("text", { x: L, y: H - 8 }, "1"),
      node("text", { x: W - R, y: H - 8, "text-anchor": "end" }, `n = ${formatCount(Math.log10(n))}${log ? " (ось n тоже логарифмическая)" : ""}`));
    const samples = 120;
    for (const c of CLASSES) {
      let d = "";
      for (let s = 0; s <= samples; s++) {
        const x = log ? 10 ** ((Math.log10(n) * s) / samples) : 1 + ((n - 1) * s) / samples;
        d += `${s ? "L" : "M"}${xOf(x).toFixed(1)},${yOf(c.log10(x)).toFixed(1)}`;
      }
      parts.push(node("path", { d, fill: "none", stroke: c.color, "stroke-width": "2.2" }));
      const lastY = yOf(c.log10(n));
      if (lastY > T + 2) {
        parts.push(node("text", { x: W - R - 4, y: lastY - 4, "text-anchor": "end", style: `fill:${c.color}` }, c.label));
      } else {
        // Кривая ушла за верх графика — подписываем там, где она выходит за край.
        for (let s = 0; s <= samples; s++) {
          const x = log ? 10 ** ((Math.log10(n) * s) / samples) : 1 + ((n - 1) * s) / samples;
          if (yOf(c.log10(x)) <= T + 1) {
            parts.push(node("text", { x: Math.min(W - R - 40, xOf(x) + 6), y: T + 14 + 13 * (CLASSES.indexOf(c) - 5), style: `fill:${c.color}` }, c.label));
            break;
          }
        }
      }
    }
    this.svg.replaceChildren(...parts);
    this.svg.setAttribute("aria-label", `Рост функций сложности до n = ${n}`);
  }
}

customElements.define("sotto-big-o", SottoBigO);
export { CLASSES, formatTime, formatCount };
