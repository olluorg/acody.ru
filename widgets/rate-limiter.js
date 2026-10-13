// <sotto-rate-limiter> — один поток запросов через пять алгоритмов ограничения
// частоты: token bucket, leaky bucket, фиксированное окно, скользящий журнал,
// скользящий счётчик. Видно, что пропущено, отклонено и задержано, и где
// фиксированное окно пропускает двойной всплеск на стыке.
//
//   <sotto-rate-limiter pattern="boundary"></sotto-rate-limiter>
//
// Атрибуты: pattern (steady|bursts|boundary|overload), limit (5–20 в секунду), step, seed, theme.

import { BASE_STYLE, StepPlayer, el, rng } from "./core.js";

export const DURATION = 6;          // секунд на шкале
const DT = 0.1;                     // шаг проигрывания

export const PATTERNS = {
  steady: "ровный поток чуть ниже лимита",
  bursts: "всплески раз в 2 секунды",
  boundary: "атака на стык окон",
  overload: "поток в 2 раза выше лимита",
};

export function makeArrivals(pattern, limit, seed = 1) {
  const rand = rng(seed);
  const out = [];
  const poisson = (rate, from = 0, to = DURATION) => { for (let t = from + -Math.log(1 - rand()) / rate; t < to; t += -Math.log(1 - rand()) / rate) out.push(t); };
  if (pattern === "steady") poisson(limit * 0.8);
  else if (pattern === "overload") poisson(limit * 2);
  else if (pattern === "bursts") {
    poisson(limit * 0.3);
    for (let b = 0.5; b < DURATION; b += 2) for (let i = 0; i < limit * 2.5; i++) out.push(b + rand() * 0.25);
  } else {
    // limit запросов перед границей секунды и столько же сразу после.
    poisson(limit * 0.15);
    for (const edge of [1, 3, 5]) for (let i = 0; i < limit; i++) { out.push(edge - 0.12 + rand() * 0.11); out.push(edge + 0.005 + rand() * 0.11); }
  }
  return out.filter((t) => t < DURATION).sort((a, b) => a - b);
}

/** Все алгоритмы на одном потоке. Лимит — limit запросов за 1 секунду. */
export function runAll(arrivals, limit) {
  const res = {};
  // Token bucket: ёмкость = limit, пополнение limit/с.
  {
    let tokens = limit, ts = 0;
    const level = [];
    res.token = arrivals.map((t) => {
      tokens = Math.min(limit, tokens + (t - ts) * limit); ts = t;
      const ok = tokens >= 1;
      if (ok) tokens -= 1;
      level.push([t, tokens]);
      return { t, ok, at: t };
    });
    res.token.level = level;
  }
  // Leaky bucket: очередь на limit запросов, выходит по одному каждые 1/limit секунды.
  {
    let nextFree = 0;
    const queue = [];             // время выхода запросов, ещё не вышедших
    res.leaky = arrivals.map((t) => {
      while (queue.length && queue[0] <= t) queue.shift();
      if (queue.length >= limit) return { t, ok: false, at: t };
      const at = Math.max(t, nextFree);
      nextFree = at + 1 / limit;
      queue.push(at);
      return { t, ok: true, at };
    });
  }
  // Фиксированное окно: счётчик на каждую календарную секунду.
  {
    const counts = new Map();
    res.fixed = arrivals.map((t) => {
      const w = Math.floor(t);
      const c = counts.get(w) || 0;
      const ok = c < limit;
      if (ok) counts.set(w, c + 1);
      return { t, ok, at: t };
    });
  }
  // Скользящий журнал: пропущенные за последнюю секунду.
  {
    const log = [];
    res.log = arrivals.map((t) => {
      while (log.length && log[0] <= t - 1) log.shift();
      const ok = log.length < limit;
      if (ok) log.push(t);
      return { t, ok, at: t };
    });
  }
  // Скользящий счётчик: текущее окно + предыдущее × доля перекрытия.
  {
    const counts = new Map();
    res.sliding = arrivals.map((t) => {
      const w = Math.floor(t), frac = t - w;
      const est = (counts.get(w) || 0) + (counts.get(w - 1) || 0) * (1 - frac);
      const ok = est < limit;
      if (ok) counts.set(w, (counts.get(w) || 0) + 1);
      return { t, ok, at: t };
    });
  }
  return res;
}

/** Наибольшее число пропущенных запросов в любом скользящем окне длиной 1 с. */
export function peakPerSecond(list) {
  const ts = list.filter((r) => r.ok).map((r) => r.at).sort((a, b) => a - b);
  let best = 0;
  for (let i = 0, j = 0; i < ts.length; i++) { while (ts[i] - ts[j] >= 1 - 1e-9) j++; best = Math.max(best, i - j + 1); }
  return best;
}

export const ALGOS = [
  ["token", "Token bucket", "ёмкость = лимиту, пополнение лимит/с"],
  ["leaky", "Leaky bucket", "очередь, выход с постоянной скоростью"],
  ["fixed", "Фиксированное окно", "счётчик на календарную секунду"],
  ["log", "Скользящий журнал", "время каждого запроса за последнюю секунду"],
  ["sliding", "Скользящий счётчик", "два окна с весом перекрытия"],
];

const STYLE = `
.view { margin-top: 12px; background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; padding: 6px; overflow-x: auto; }
svg { width: 100%; min-width: 560px; height: auto; display: block; }
.name { font: 600 12px "Manrope", system-ui, sans-serif; fill: var(--w-text); }
.sub { font: 10px "Manrope", system-ui, sans-serif; fill: var(--w-faint); }
.rowbg { fill: var(--w-bg); }
.sec { stroke: var(--w-line-2); stroke-width: 1; }
.sec.edge { stroke-dasharray: 3 3; }
.tick { stroke-width: 2; }
.ok { stroke: var(--w-good); }
.no { stroke: var(--w-bad); }
.in { stroke: var(--w-accent-2); }
.late { stroke: var(--w-warm); }
.delay { stroke: var(--w-warm); stroke-width: 1; opacity: .6; }
.lvl { fill: color-mix(in srgb, var(--w-accent) 25%, transparent); stroke: var(--w-accent); stroke-width: 1; }
.head { stroke: var(--w-text); stroke-width: 1.5; }
.axis { font: 10px "JetBrains Mono", ui-monospace, monospace; fill: var(--w-faint); text-anchor: middle; }
table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--w-line); }
th { color: var(--w-muted); font-weight: 600; }
td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
td.bad { color: var(--w-bad); font-weight: 700; }
select { max-width: 100%; }
`;

const NS = "http://www.w3.org/2000/svg";
const S = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};

class SottoRateLimiter extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.built = true;
    this.seed = Number(this.getAttribute("seed") || 1);
    const pattern = PATTERNS[this.getAttribute("pattern")] ? this.getAttribute("pattern") : "boundary";
    this.pattern = el("select", { "aria-label": "Нагрузка", onchange: () => this.#recompute() },
      ...Object.entries(PATTERNS).map(([k, v]) => el("option", { value: k, selected: k === pattern }, v)));
    const lim = Math.max(5, Math.min(20, Number(this.getAttribute("limit") || 10)));
    this.limit = el("select", { "aria-label": "Лимит", onchange: () => this.#recompute() },
      ...[5, 10, 20].map((v) => el("option", { value: String(v), selected: v === lim }, `${v} в секунду`)));
    this.svg = S("svg", { role: "img" });
    this.table = el("table");
    this.caption = el("div", { class: "caption", "aria-live": "polite" });
    this.player = new StepPlayer(this, (i) => this.#render(i));
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE),
      el("div", { class: "row" },
        el("label", { class: "field" }, "нагрузка", this.pattern),
        el("label", { class: "field" }, "лимит", this.limit),
        el("button", { onclick: () => { this.seed++; this.#recompute(); } }, "🎲 другой поток")),
      el("div", { class: "view" }, this.svg), this.table, this.caption,
      el("div", { class: "legend" },
        el("span", {}, el("i", { style: "background:var(--w-accent-2)" }), "пришёл запрос"),
        el("span", {}, el("i", { style: "background:var(--w-good)" }), "пропущен"),
        el("span", {}, el("i", { style: "background:var(--w-bad)" }), "отклонён (429)"),
        el("span", {}, el("i", { style: "background:var(--w-warm)" }), "задержан в очереди"),
        el("span", {}, el("i", { style: "background:color-mix(in srgb, var(--w-accent) 25%, transparent);outline:1px solid var(--w-accent)" }), "жетоны в ведре")),
      this.player.el);
    this.#recompute();
    const step = this.getAttribute("step");
    if (step != null) this.player.go(Number(step));
  }

  #recompute() {
    this.lim = Number(this.limit.value);
    this.arrivals = makeArrivals(this.pattern.value, this.lim, this.seed);
    this.res = runAll(this.arrivals, this.lim);
    this.player.load(Math.round(DURATION / DT) + 1, this.player.index ?? 0);
  }

  #render(index) {
    const now = index * DT;
    const W = 640, L = 130, R = 8, rowH = 34, top = 8;
    const rows = 1 + ALGOS.length;
    const H = top + rows * rowH + 22;
    const x = (t) => L + ((W - L - R) * t) / DURATION;
    this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const parts = [];
    for (let r = 0; r < rows; r++) parts.push(S("rect", { x: L, y: top + r * rowH + 3, width: W - L - R, height: rowH - 6, rx: 4, class: "rowbg" }));
    for (let s = 0; s <= DURATION; s++) {
      parts.push(S("line", { x1: x(s), y1: top, x2: x(s), y2: top + rows * rowH, class: "sec" + (this.pattern.value === "boundary" && [1, 3, 5].includes(s) ? " edge" : "") }));
      parts.push(S("text", { x: x(s), y: H - 6, class: "axis" }, `${s} с`));
    }
    const label = (r, a, b) => {
      parts.push(S("text", { x: 6, y: top + r * rowH + 15, class: "name" }, a));
      parts.push(S("text", { x: 6, y: top + r * rowH + 27, class: "sub" }, b));
    };
    label(0, "Входящие", `${this.arrivals.filter((t) => t <= now).length} запросов`);
    for (const t of this.arrivals) if (t <= now) parts.push(S("line", { x1: x(t), y1: top + 7, x2: x(t), y2: top + rowH - 7, class: "tick in" }));
    ALGOS.forEach(([key, name], i) => {
      const r = i + 1, y0 = top + r * rowH;
      const list = this.res[key];
      const seen = list.filter((q) => q.t <= now);
      label(r, name, `${seen.filter((q) => q.ok).length} пропущено, ${seen.filter((q) => !q.ok).length} отказ`);
      if (key === "token") {
        // Уровень жетонов: пополнение между запросами, ступенька вниз на каждом пропущенном.
        const pts = [[0, this.lim]];
        let prevT = 0, prev = this.lim;
        for (const [t, v] of list.level) {
          if (t > now) break;
          pts.push([t, Math.min(this.lim, prev + (t - prevT) * this.lim)]);
          pts.push([t, v]);
          prevT = t; prev = v;
        }
        pts.push([now, Math.min(this.lim, prev + (now - prevT) * this.lim)]);
        const yy = (v) => y0 + rowH - 4 - ((rowH - 8) * v) / this.lim;
        parts.push(S("path", { d: `M ${x(0)} ${y0 + rowH - 4} ` + pts.map(([t, v]) => `L ${x(t).toFixed(1)} ${yy(v).toFixed(1)}`).join(" ") + ` L ${x(now)} ${y0 + rowH - 4} Z`, class: "lvl" }));
      }
      for (const q of seen) {
        if (key === "leaky" && q.ok && q.at - q.t > 0.03) {
          if (q.at <= now) parts.push(S("line", { x1: x(q.t), y1: y0 + rowH / 2, x2: x(q.at), y2: y0 + rowH / 2, class: "delay" }));
          parts.push(S("line", { x1: x(Math.min(q.at, now)), y1: y0 + 7, x2: x(Math.min(q.at, now)), y2: y0 + rowH - 7, class: "tick " + (q.at <= now ? "late" : "in") }));
        } else parts.push(S("line", { x1: x(q.t), y1: y0 + 7, x2: x(q.t), y2: y0 + rowH - 7, class: "tick " + (q.ok ? "ok" : "no") }));
      }
    });
    parts.push(S("line", { x1: x(now), y1: top, x2: x(now), y2: top + rows * rowH, class: "head" }));
    this.svg.replaceChildren(...parts);
    this.svg.setAttribute("aria-label", `Ограничение частоты: ${PATTERNS[this.pattern.value]}`);
    // Таблица итогов — по всей шкале.
    const total = this.arrivals.length;
    this.table.replaceChildren(
      el("tr", {}, el("th", {}, "алгоритм"), el("th", { class: "n" }, "пропущено"), el("th", { class: "n" }, "отклонено"), el("th", { class: "n" }, "макс. за любую 1 с"), el("th", { class: "n" }, "макс. задержка")),
      ...ALGOS.map(([key, name]) => {
        const list = this.res[key], ok = list.filter((q) => q.ok).length, peak = peakPerSecond(list);
        const delay = Math.max(0, ...list.filter((q) => q.ok).map((q) => q.at - q.t));
        return el("tr", {}, el("td", {}, name), el("td", { class: "n" }, `${ok} из ${total}`), el("td", { class: "n" }, String(total - ok)),
          el("td", { class: "n" + (peak > this.lim && key !== "token" ? " bad" : "") }, `${peak}${peak > this.lim ? (key === "token" ? " — всплеск из ведра, так задумано" : ` (лимит ${this.lim})`) : ""}`),
          el("td", { class: "n" }, delay > 0.005 ? `${Math.round(delay * 1000)} мс` : "—"));
      }));
    const fixedPeak = peakPerSecond(this.res.fixed), tokenPeak = peakPerSecond(this.res.token);
    const p = this.pattern.value;
    this.caption.textContent = index === 0 ? `Лимит ${this.lim} запросов в секунду. Нажмите пуск — запросы пойдут по времени.` :
      p === "boundary" ? `Перед границей секунды приходит ${this.lim} запросов и сразу после — ещё ${this.lim}. Фиксированное окно пропускает оба пакета: ${fixedPeak} запросов за одну секунду при лимите ${this.lim}. Скользящий журнал этого не допускает, token bucket пропускает всплеск не больше ёмкости ведра, а скользящий счётчик — приближение: он резко снижает пик, но не до точного лимита (${peakPerSecond(this.res.sliding)}).`
      : p === "bursts" ? `Всплески: token bucket пропускает начало всплеска за счёт накопленных жетонов (ведро ${this.lim}), остальное отклоняет. Leaky bucket ничего не отклоняет, пока есть место в очереди, — но выпускает по одному, и запросы ждут до ${Math.round(Math.max(...this.res.leaky.filter((q) => q.ok).map((q) => q.at - q.t)) * 1000)} мс.`
      : p === "overload" ? `Поток вдвое выше лимита: все алгоритмы пропускают около ${this.lim} в секунду и отклоняют остальное. Различаются тем, как распределены отказы и задержки.`
      : `Поток ниже лимита: почти все алгоритмы пропускают всё. Случайные сгущения иногда упираются в лимит — у token bucket реже: накопленные жетоны сглаживают. Пик за секунду у него ${tokenPeak}.`;
  }
}

customElements.define("sotto-rate-limiter", SottoRateLimiter);
