// <sotto-ab-simulator> — сотни A/B-тестов за секунду: доля «значимых»
// результатов при анализе в конце и при ежедневном подглядывании, мощность
// при реальном эффекте, траектория p-value одного теста. Эффект 0 — это A/A-тест:
// всё «значимое» в нём — ложные срабатывания.
//
//   <sotto-ab-simulator base="5" lift="0" users="2000" days="14"></sotto-ab-simulator>
//
// Атрибуты: base (конверсия, %), lift (относительный эффект, %), users (в день
// на группу), days, theme.

import { BASE_STYLE, el, rng } from "./core.js";

export const RUNS = 400;
const ALPHA = 0.05;

// Нормальное распределение: функция распределения через erf (Abramowitz–Stegun 7.1.26).
export function normCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** p-value двустороннего z-теста для двух долей. */
export function pValue(x1, n1, x2, n2) {
  if (!n1 || !n2) return 1;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (se === 0) return 1;
  const z = (x2 / n2 - x1 / n1) / se;
  return 2 * (1 - normCdf(Math.abs(z)));
}

/** Число успехов из n с вероятностью p: нормальное приближение биномиального (n·p достаточно велико). */
function binom(r, n, p) {
  const g = Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  return Math.max(0, Math.min(n, Math.round(n * p + g * Math.sqrt(n * p * (1 - p)))));
}

/** Симуляция: доли значимых при анализе в конце и с подглядыванием, траектории p-value. */
export function simulate({ base = 0.05, lift = 0, users = 2000, days = 14, runs = RUNS, seed = 11 } = {}) {
  const r = rng(seed);
  const pB = base * (1 + lift);
  let atEnd = 0, everPeek = 0;
  const finals = [], paths = [];
  for (let k = 0; k < runs; k++) {
    let xA = 0, xB = 0, n = 0, peeked = false;
    const path = [];
    for (let d = 1; d <= days; d++) {
      xA += binom(r, users, base);
      xB += binom(r, users, pB);
      n += users;
      const pv = pValue(xA, n, xB, n);
      path.push(pv);
      if (pv < ALPHA) peeked = true;
    }
    const last = path.at(-1);
    if (last < ALPHA) atEnd++;
    if (peeked) everPeek++;
    finals.push(last);
    if (k < 20) paths.push(path);
  }
  return { atEnd: atEnd / runs, everPeek: everPeek / runs, finals, paths };
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
.controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px 16px; }
.controls label { display: grid; gap: 4px; color: var(--w-muted); font-size: 13px; }
.controls b { color: var(--w-text); font-variant-numeric: tabular-nums; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; margin-top: 12px; }
.stat { background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 10px; padding: 8px 10px; }
.stat b { display: block; font: 700 20px "JetBrains Mono", ui-monospace, monospace; }
.stat.bad b { color: var(--w-bad); }
.stat.good b { color: var(--w-good); }
.stat small { color: var(--w-muted); }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
@container (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
.panel { background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; padding: 8px 10px; min-width: 0; }
.panel h4 { margin: 0 0 6px; font-size: 12px; color: var(--w-muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
svg { width: 100%; height: auto; display: block; }
.axis { font: 10px "JetBrains Mono", ui-monospace, monospace; fill: var(--w-faint); }
`;

class SottoAbSimulator extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    this.built = true;
    const a = (k, d) => (this.hasAttribute(k) ? this.getAttribute(k) : d);
    const slider = (min, max, step, val) => el("input", { type: "range", min, max, step, value: val });
    this.base = slider("1", "30", "1", a("base", "5"));
    this.lift = slider("0", "20", "1", a("lift", "0"));
    this.users = slider("1000", "20000", "500", a("users", "2000"));
    this.days = slider("7", "28", "7", a("days", "14"));
    this.outs = [el("b"), el("b"), el("b"), el("b")];
    for (const i of [this.base, this.lift, this.users, this.days]) i.addEventListener("input", () => this.#render());
    this.stats = el("div", { class: "stats" });
    this.hist = S("svg", { viewBox: "0 0 260 160", role: "img", "aria-label": "Распределение p-value в конце теста" });
    this.traj = S("svg", { viewBox: "0 0 260 160", role: "img", "aria-label": "p-value по дням для нескольких тестов" });
    this.caption = el("div", { class: "caption", "aria-live": "polite" });
    const lab = (t, inp, out) => el("label", {}, el("span", {}, t, out), inp);
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE),
      el("div", { class: "controls" },
        lab("базовая конверсия: ", this.base, this.outs[0]),
        lab("реальный эффект: ", this.lift, this.outs[1]),
        lab("пользователей в день на группу: ", this.users, this.outs[2]),
        lab("длительность: ", this.days, this.outs[3])),
      this.stats,
      el("div", { class: "grid" },
        el("div", { class: "panel" }, el("h4", {}, `p-value в конце (${RUNS} тестов)`), this.hist),
        el("div", { class: "panel" }, el("h4", {}, "p-value по дням (20 тестов)"), this.traj)),
      this.caption);
    this.#render();
  }

  #render() {
    const base = Number(this.base.value) / 100, lift = Number(this.lift.value) / 100;
    const users = Number(this.users.value), days = Number(this.days.value);
    this.outs[0].textContent = this.base.value + "%";
    this.outs[1].textContent = lift ? "+" + this.lift.value + "% (относительно)" : "нет (A/A-тест)";
    this.outs[2].textContent = users.toLocaleString("ru-RU");
    this.outs[3].textContent = days + " дн.";
    const r = simulate({ base, lift, users, days });
    const aa = lift === 0;
    const stat = (cls, v, t) => el("div", { class: "stat " + cls }, el("b", {}, v), el("small", {}, t));
    this.stats.replaceChildren(
      stat(aa ? (r.atEnd > 0.08 ? "bad" : "") : (r.atEnd >= 0.8 ? "good" : "bad"), pct(r.atEnd),
        aa ? "ложных срабатываний при анализе в конце (ожидается около 5%)" : "мощность: тест нашёл эффект при анализе в конце"),
      stat(aa ? "bad" : "", pct(r.everPeek),
        aa ? "«значимо» хотя бы в один день при ежедневном подглядывании" : "«значимо» хотя бы в один день — но в A/A так же завышено"));
    // гистограмма p-value
    const W = 260, H = 160, L = 26, B = 20, T = 6, R = 6, bins = 20;
    const counts = Array(bins).fill(0);
    for (const p of r.finals) counts[Math.min(bins - 1, Math.floor(p * bins))]++;
    const max = Math.max(...counts, 1);
    const bw = (W - L - R) / bins;
    const h = [];
    counts.forEach((c, i) => h.push(S("rect", { x: L + i * bw + 1, y: T + (H - T - B) * (1 - c / max), width: bw - 2, height: (H - T - B) * (c / max),
      fill: i === 0 ? "var(--w-warm)" : "var(--w-accent-2)", opacity: i === 0 ? 1 : 0.7 })));
    for (const v of [0, 0.5, 1]) h.push(S("text", { x: L + v * (W - L - R), y: H - 5, class: "axis", "text-anchor": "middle" }, String(v).replace(".", ",")));
    h.push(S("text", { x: L - 4, y: T + 8, class: "axis", "text-anchor": "end" }, String(max)));
    this.hist.replaceChildren(...h);
    // траектории
    const X = (d) => L + ((d - 1) / Math.max(1, days - 1)) * (W - L - R);
    const Y = (p) => T + (1 - p) * (H - T - B);
    const t = [S("line", { x1: L, x2: W - R, y1: Y(ALPHA), y2: Y(ALPHA), stroke: "var(--w-bad)", "stroke-dasharray": "3 3" }),
      S("text", { x: W - R, y: Y(ALPHA) - 3, class: "axis", "text-anchor": "end" }, "0,05")];
    for (const p of r.paths) t.push(S("path", { d: p.map((v, i) => `${i ? "L" : "M"}${X(i + 1).toFixed(1)} ${Y(v).toFixed(1)}`).join(" "),
      fill: "none", stroke: p.some((v) => v < ALPHA) ? "var(--w-warm)" : "var(--w-line-2)", "stroke-width": 1.2 }));
    t.push(S("text", { x: L, y: H - 5, class: "axis" }, "день 1"), S("text", { x: W - R, y: H - 5, class: "axis", "text-anchor": "end" }, `день ${days}`));
    this.traj.replaceChildren(...t);
    this.caption.textContent = aa
      ? `Варианты одинаковые, эффекта нет. При одном анализе в конце «значимы» ${pct(r.atEnd)} тестов — это α (5%) с поправкой на случайность 400 повторов. Если смотреть каждый день и останавливаться при p < 0,05, «победителя» найдут ${pct(r.everPeek)} тестов. Оранжевые линии — тесты, которые хоть раз пересекли порог.`
      : `Эффект есть. Мощность ${pct(r.atEnd)}${r.atEnd < 0.8 ? " — меньше 80%: увеличьте трафик или длительность, иначе тест чаще будет «ничего не показывать»" : ""}. При эффекте p-value в конце сдвинуты к нулю; при A/A они распределены равномерно.`;
  }
}

customElements.define("sotto-ab-simulator", SottoAbSimulator);
