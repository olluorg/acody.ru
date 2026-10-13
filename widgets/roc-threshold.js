// <sotto-roc-threshold> — порог классификатора: двигаете порог и видите
// матрицу ошибок, precision, recall, F1, точку на ROC- и PR-кривых. Ползунок
// дисбаланса показывает, почему при редком классе ROC-AUC выглядит хорошо, а
// precision проваливается.
//
//   <sotto-roc-threshold positive="5" threshold="0.5"></sotto-roc-threshold>
//
// Атрибуты: positive (доля положительного класса, %), separation (0.5–3),
// threshold (0–1), theme.

import { BASE_STYLE, el, rng } from "./core.js";

const N = 2000;

/** Детерминированная выборка: оценки модели для положительных и отрицательных. */
export function makeData(positiveShare = 0.05, separation = 1.5, seed = 7) {
  const r = rng(seed);
  const gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = r();
    v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const sigm = (z) => 1 / (1 + Math.exp(-z));
  const nPos = Math.max(1, Math.round(N * positiveShare));
  const items = [];
  for (let i = 0; i < N; i++) {
    const y = i < nPos ? 1 : 0;
    const z = (y ? separation / 2 : -separation / 2) + gauss();
    items.push({ y, s: sigm(z * 1.6) });
  }
  return items;
}

/** Матрица ошибок и метрики при пороге t (прогноз 1, если s >= t). */
export function confusion(items, t) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const { y, s } of items) {
    const p = s >= t;
    if (p && y) tp++; else if (p) fp++; else if (y) fn++; else tn++;
  }
  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const fpr = fp + tn ? fp / (fp + tn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = (tp + tn) / items.length;
  return { tp, fp, tn, fn, precision, recall, fpr, f1, accuracy };
}

/** Точки ROC и PR по всем порогам и площади под ними. */
export function curves(items) {
  const sorted = [...items].sort((a, b) => b.s - a.s);
  const P = items.filter((i) => i.y).length, Nn = items.length - P;
  let tp = 0, fp = 0;
  const roc = [{ x: 0, y: 0 }], pr = [];
  let auc = 0, ap = 0, prevRecall = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].y) tp++; else fp++;
    if (i < sorted.length - 1 && sorted[i + 1].s === sorted[i].s) continue;
    const x = fp / Nn, y = tp / P;
    auc += (x - roc.at(-1).x) * (y + roc.at(-1).y) / 2;
    roc.push({ x, y });
    const recall = tp / P, precision = tp / (tp + fp);
    ap += (recall - prevRecall) * precision;
    prevRecall = recall;
    pr.push({ x: recall, y: precision });
  }
  return { roc, pr, auc, ap, base: P / items.length };
}

const pct = (x) => (x * 100).toFixed(1).replace(".", ",") + "%";
const NS = "http://www.w3.org/2000/svg";
const S = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};

const STYLE = `
.controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px 16px; }
.controls label { display: grid; gap: 4px; color: var(--w-muted); font-size: 13px; }
.controls b { color: var(--w-text); font-variant-numeric: tabular-nums; }
.grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 12px; }
@container (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
.panel { background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; padding: 8px 10px; min-width: 0; }
.panel h4 { margin: 0 0 6px; font-size: 12px; color: var(--w-muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.cm { display: grid; grid-template-columns: auto 1fr 1fr; gap: 4px; font-size: 13px; }
.cm div { padding: 6px; border-radius: 8px; text-align: center; font-variant-numeric: tabular-nums; }
.cm .h { color: var(--w-muted); font-size: 11px; }
.cm .ok { background: color-mix(in srgb, var(--w-good) 22%, transparent); }
.cm .bad { background: color-mix(in srgb, var(--w-bad) 22%, transparent); }
.cm small { display: block; color: var(--w-muted); font-size: 11px; }
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 10px; font-size: 13px; }
.stats div { background: var(--w-surface-2); border-radius: 8px; padding: 5px 8px; }
.stats b { font-variant-numeric: tabular-nums; }
svg { width: 100%; height: auto; display: block; }
.axis { font: 10px "JetBrains Mono", ui-monospace, monospace; fill: var(--w-faint); }
`;

class SottoRocThreshold extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    this.built = true;
    const num = (a, d) => (this.hasAttribute(a) ? Number(this.getAttribute(a)) : d);
    this.pos = el("input", { type: "range", min: "1", max: "50", value: String(num("positive", 5)) });
    this.sep = el("input", { type: "range", min: "0.5", max: "3", step: "0.1", value: String(num("separation", 1.5)) });
    this.thr = el("input", { type: "range", min: "0", max: "1", step: "0.01", value: String(num("threshold", 0.5)) });
    this.posOut = el("b"); this.sepOut = el("b"); this.thrOut = el("b");
    for (const i of [this.pos, this.sep]) i.addEventListener("input", () => this.#data());
    this.thr.addEventListener("input", () => this.#render());
    this.cm = el("div", { class: "cm" });
    this.stats = el("div", { class: "stats" });
    this.roc = S("svg", { viewBox: "0 0 220 220", role: "img", "aria-label": "ROC-кривая" });
    this.pr = S("svg", { viewBox: "0 0 220 220", role: "img", "aria-label": "Кривая precision-recall" });
    this.caption = el("div", { class: "caption", "aria-live": "polite" });
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE),
      el("div", { class: "controls" },
        el("label", {}, el("span", {}, "доля положительного класса: ", this.posOut), this.pos),
        el("label", {}, el("span", {}, "качество модели (разделимость): ", this.sepOut), this.sep),
        el("label", {}, el("span", {}, "порог решения: ", this.thrOut), this.thr)),
      el("div", { class: "grid" },
        el("div", { class: "panel" }, el("h4", {}, "Матрица ошибок"), this.cm, this.stats),
        el("div", { class: "panel" }, el("h4", {}, "ROC-кривая"), this.roc),
        el("div", { class: "panel" }, el("h4", {}, "Precision — recall"), this.pr)),
      this.caption);
    this.#data();
  }

  #data() {
    this.items = makeData(Number(this.pos.value) / 100, Number(this.sep.value));
    this.c = curves(this.items);
    this.#render();
  }

  #plot(svg, pts, cur, xLabel, yLabel, base) {
    const L = 30, B = 26, T = 8, R = 8, W = 220, H = 220;
    const X = (v) => L + v * (W - L - R), Y = (v) => T + (1 - v) * (H - T - B);
    const parts = [S("rect", { x: L, y: T, width: W - L - R, height: H - T - B, fill: "none", stroke: "var(--w-line)" })];
    for (const v of [0, 0.5, 1]) {
      parts.push(S("text", { x: X(v), y: H - 12, class: "axis", "text-anchor": "middle" }, String(v).replace(".", ",")));
      parts.push(S("text", { x: L - 4, y: Y(v) + 3, class: "axis", "text-anchor": "end" }, String(v).replace(".", ",")));
    }
    parts.push(S("text", { x: (W + L) / 2, y: H - 1, class: "axis", "text-anchor": "middle" }, xLabel));
    parts.push(S("text", { x: 9, y: (H - B) / 2, class: "axis", "text-anchor": "middle", transform: `rotate(-90 9 ${(H - B) / 2})` }, yLabel));
    if (base != null) parts.push(S("line", { x1: X(0), y1: Y(base), x2: X(1), y2: Y(base), stroke: "var(--w-faint)", "stroke-dasharray": "3 3" }));
    else parts.push(S("line", { x1: X(0), y1: Y(0), x2: X(1), y2: Y(1), stroke: "var(--w-faint)", "stroke-dasharray": "3 3" }));
    parts.push(S("path", { d: pts.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(" "), fill: "none", stroke: "var(--w-accent-2)", "stroke-width": 2 }));
    parts.push(S("circle", { cx: X(cur.x), cy: Y(cur.y), r: 5, fill: "var(--w-warm)" }));
    svg.replaceChildren(...parts);
  }

  #render() {
    const t = Number(this.thr.value);
    this.posOut.textContent = this.pos.value + "%";
    this.sepOut.textContent = Number(this.sep.value).toFixed(1).replace(".", ",");
    this.thrOut.textContent = t.toFixed(2).replace(".", ",");
    const m = confusion(this.items, t);
    const cell = (cls, n, label) => el("div", { class: cls }, String(n), el("small", {}, label));
    this.cm.replaceChildren(
      el("div", { class: "h" }, ""), el("div", { class: "h" }, "прогноз 1"), el("div", { class: "h" }, "прогноз 0"),
      el("div", { class: "h" }, "факт 1"), cell("ok", m.tp, "TP"), cell("bad", m.fn, "FN — пропуск"),
      el("div", { class: "h" }, "факт 0"), cell("bad", m.fp, "FP — ложная тревога"), cell("ok", m.tn, "TN"));
    const st = (k, v) => el("div", {}, k + " ", el("b", {}, v));
    this.stats.replaceChildren(st("precision", pct(m.precision)), st("recall", pct(m.recall)),
      st("F1", pct(m.f1)), st("FPR", pct(m.fpr)), st("accuracy", pct(m.accuracy)),
      st("ROC-AUC", this.c.auc.toFixed(3).replace(".", ",")));
    this.#plot(this.roc, this.c.roc, { x: m.fpr, y: m.recall }, "FPR — доля ложных тревог", "recall (TPR)");
    this.#plot(this.pr, this.c.pr, { x: m.recall, y: m.precision }, "recall", "precision", this.c.base);
    const share = Number(this.pos.value);
    this.caption.textContent = share <= 10 && m.precision < 0.5 && m.fpr < 0.2
      ? `Класс редкий (${share}%): доля ложных тревог всего ${pct(m.fpr)}, но среди отмеченных моделью настоящих только ${pct(m.precision)}. ROC-AUC ${this.c.auc.toFixed(2).replace(".", ",")} выглядит хорошо, а PR-кривая показывает реальную картину. Accuracy ${pct(m.accuracy)} вообще ничего не говорит.`
      : `Порог ${t.toFixed(2).replace(".", ",")}: найдено ${m.tp} из ${m.tp + m.fn} положительных, ложных тревог ${m.fp}. Повышаете порог — растёт precision и падает recall; точка движется по обеим кривым. Площадь под кривыми от порога не зависит.`;
  }
}

customElements.define("sotto-roc-threshold", SottoRocThreshold);
