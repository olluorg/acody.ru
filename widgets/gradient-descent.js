// <sotto-gradient-descent> — градиентный спуск по шагам на двумерной функции
// потерь (вытянутая «долина»). Меняете learning rate и оптимизатор и видите
// сходимость, колебания поперёк долины или расхождение, и как ведут себя
// momentum и Adam при том же шаге.
//
//   <sotto-gradient-descent lr="0.1" optimizer="sgd"></sotto-gradient-descent>
//
// Атрибуты: lr, optimizer (sgd | momentum | adam), step, theme.

import { BASE_STYLE, el, StepPlayer } from "./core.js";

// Потери L(x, y) = 0.5·(a·x² + b·y²): долина, вытянутая вдоль x.
export const A = 1, B = 10;
export const loss = (x, y) => 0.5 * (A * x * x + B * y * y);
export const grad = (x, y) => [A * x, B * y];
export const START = [-4.5, 1.5];
export const STEPS = 60;

export const OPTIMIZERS = {
  sgd: "Градиентный спуск",
  momentum: "Momentum",
  adam: "Adam",
};

/** Траектория: массив точек {x, y, loss}. Расхождение обрезается при |loss| > 1e6. */
export function run(lr, optimizer = "sgd", steps = STEPS) {
  let [x, y] = START;
  let vx = 0, vy = 0, mx = 0, my = 0, sx = 0, sy = 0;
  const b1 = 0.9, b2 = 0.999, eps = 1e-8;
  const path = [{ x, y, loss: loss(x, y) }];
  for (let t = 1; t <= steps; t++) {
    const [gx, gy] = grad(x, y);
    if (optimizer === "momentum") {
      vx = 0.9 * vx + gx; vy = 0.9 * vy + gy;
      x -= lr * vx; y -= lr * vy;
    } else if (optimizer === "adam") {
      mx = b1 * mx + (1 - b1) * gx; my = b1 * my + (1 - b1) * gy;
      sx = b2 * sx + (1 - b2) * gx * gx; sy = b2 * sy + (1 - b2) * gy * gy;
      const mhx = mx / (1 - b1 ** t), mhy = my / (1 - b1 ** t);
      const shx = sx / (1 - b2 ** t), shy = sy / (1 - b2 ** t);
      x -= lr * mhx / (Math.sqrt(shx) + eps); y -= lr * mhy / (Math.sqrt(shy) + eps);
    } else {
      x -= lr * gx; y -= lr * gy;
    }
    const l = loss(x, y);
    path.push({ x, y, loss: l });
    if (!Number.isFinite(l) || l > 1e6) break;
  }
  return path;
}

/** Диагноз траектории для подписи. */
export function verdict(path) {
  const last = path.at(-1), first = path[0];
  if (!Number.isFinite(last.loss) || last.loss > first.loss * 10) return "diverge";
  if (last.loss < 1e-3) return "converged";
  // колебания: знак y много раз меняется
  let flips = 0;
  for (let i = 2; i < path.length; i++) if (Math.sign(path[i].y) !== Math.sign(path[i - 1].y)) flips++;
  if (flips > path.length / 3) return "oscillate";
  return "slow";
}

const NS = "http://www.w3.org/2000/svg";
const S = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};
const fmt = (v) => (Math.abs(v) >= 1000 ? v.toExponential(1) : v.toFixed(3)).replace(".", ",");

const STYLE = `
.controls { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; }
.controls label { display: inline-flex; gap: 6px; align-items: center; color: var(--w-muted); font-size: 13px; }
.controls b { color: var(--w-text); font-variant-numeric: tabular-nums; min-width: 3.5em; display: inline-block; }
.presets { display: flex; gap: 6px; flex-wrap: wrap; }
.presets button.on { background: var(--w-accent); color: #fff; border-color: transparent; }
.grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 12px; margin-top: 12px; }
@container (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
.panel { background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; padding: 8px 10px; min-width: 0; }
.panel h4 { margin: 0 0 6px; font-size: 12px; color: var(--w-muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
svg { width: 100%; height: auto; display: block; }
.axis { font: 10px "JetBrains Mono", ui-monospace, monospace; fill: var(--w-faint); }
`;

class SottoGradientDescent extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    this.built = true;
    this.opt = OPTIMIZERS[this.getAttribute("optimizer")] ? this.getAttribute("optimizer") : "sgd";
    this.lr = el("input", { type: "range", min: "0.005", max: "0.25", step: "0.005", value: this.getAttribute("lr") || "0.1", "aria-label": "Learning rate" });
    this.lrOut = el("b");
    this.lr.addEventListener("input", () => this.#load(this.player.index));
    this.opts = el("div", { class: "presets" }, ...Object.entries(OPTIMIZERS).map(([k, t]) =>
      el("button", { "data-k": k, onclick: () => { this.opt = k; this.#load(this.player.index); } }, t)));
    this.map = S("svg", { viewBox: "0 0 320 200", role: "img", "aria-label": "Траектория на линиях уровня функции потерь" });
    this.chart = S("svg", { viewBox: "0 0 220 200", role: "img", "aria-label": "Потери по шагам" });
    this.caption = el("div", { class: "caption", "aria-live": "polite" });
    this.player = new StepPlayer(this, (i) => this.#frame(i));
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE),
      el("div", { class: "controls" }, this.opts, el("label", {}, "learning rate", this.lr, this.lrOut)),
      el("div", { class: "grid" },
        el("div", { class: "panel" }, el("h4", {}, "Линии уровня потерь и путь"), this.map),
        el("div", { class: "panel" }, el("h4", {}, "Потери по шагам (лог. шкала)"), this.chart)),
      this.caption, this.player.el);
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.#load(Number(this.getAttribute("step") || STEPS));
  }

  #load(start = 0) {
    for (const b of this.opts.children) b.classList.toggle("on", b.dataset.k === this.opt);
    const lr = Number(this.lr.value);
    this.lrOut.textContent = lr.toFixed(3).replace(".", ",");
    this.path = run(lr, this.opt);
    this.player.load(this.path.length, Math.min(start, this.path.length - 1));
  }

  #frame(i) {
    const W = 320, H = 200, X = (x) => W / 2 + x * 32, Y = (y) => H / 2 - y * 32;
    const parts = [];
    for (const c of [0.5, 2, 5, 10, 20]) {
      const rx = Math.sqrt((2 * c) / A) * 32, ry = Math.sqrt((2 * c) / B) * 32;
      parts.push(S("ellipse", { cx: W / 2, cy: H / 2, rx, ry, fill: "none", stroke: "var(--w-line-2)" }));
    }
    parts.push(S("circle", { cx: W / 2, cy: H / 2, r: 3, fill: "var(--w-good)" }));
    const pts = this.path.slice(0, i + 1).map((p) => [Math.max(-20, Math.min(W + 20, X(p.x))), Math.max(-20, Math.min(H + 20, Y(p.y)))]);
    parts.push(S("path", { d: pts.map((p, k) => `${k ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" "), fill: "none", stroke: "var(--w-accent-2)", "stroke-width": 1.6 }));
    const cur = pts.at(-1);
    parts.push(S("circle", { cx: cur[0], cy: cur[1], r: 4.5, fill: "var(--w-warm)" }));
    this.map.replaceChildren(...parts);

    const L = 30, B2 = 18, T = 8, R = 6, CW = 220, CH = 200;
    const lg = (v) => Math.log10(Math.max(1e-6, Math.min(1e6, v)));
    const xs = (k) => L + (k / STEPS) * (CW - L - R), ys = (v) => T + (6 - lg(v)) / 12 * (CH - T - B2);
    const c = [];
    for (const v of [1e6, 1e3, 1, 1e-3, 1e-6]) {
      c.push(S("line", { x1: L, x2: CW - R, y1: ys(v), y2: ys(v), stroke: "var(--w-line)" }));
      c.push(S("text", { x: L - 3, y: ys(v) + 3, class: "axis", "text-anchor": "end" }, v >= 1 ? (v === 1 ? "1" : `1e${Math.log10(v)}`) : `1e${Math.log10(v)}`));
    }
    c.push(S("path", { d: this.path.slice(0, i + 1).map((p, k) => `${k ? "L" : "M"}${xs(k).toFixed(1)} ${ys(p.loss).toFixed(1)}`).join(" "), fill: "none", stroke: "var(--w-accent-2)", "stroke-width": 1.6 }));
    this.chart.replaceChildren(...c);

    const p = this.path[i], lr = Number(this.lr.value);
    const v = verdict(this.path);
    const tail = {
      diverge: `Шаг слишком большой: по крутому направлению (y) каждое обновление перелетает минимум всё дальше — потери растут. Для обычного спуска здесь нужен learning rate меньше 0,2.`,
      oscillate: `Путь мечется поперёк узкой долины: по крутому направлению (y) шаг на границе устойчивости (2/λ = 0,2), колебания затухают очень медленно или не затухают вовсе. Уменьшите шаг или сравните с Adam, который нормирует шаг по каждому направлению.`,
      converged: `Сошлось к минимуму. ${this.opt === "sgd" ? "Сравните с Momentum и Adam при том же шаге: момент разгоняет движение вдоль долины, но при большом шаге сам начинает раскачиваться." : "Сравните с обычным спуском при том же шаге."}`,
      slow: `За ${STEPS} шагов до минимума не дошли: ${this.opt === "adam" ? "у Adam шаг по каждой координате близок к learning rate, и при маленьком значении путь длинный." : "вдоль пологого направления (x) движение очень медленное. Momentum накапливает скорость и проходит это направление заметно быстрее."}`,
    }[v];
    this.caption.textContent = `Шаг ${i}: потери ${fmt(p.loss)}, x = ${fmt(p.x)}, y = ${fmt(p.y)}. ${this.opt === "sgd" ? `Обновление: w ← w − ${lr.toFixed(2).replace(".", ",")}·∇L.` : ""} ${tail}`;
  }
}

customElements.define("sotto-gradient-descent", SottoGradientDescent);
