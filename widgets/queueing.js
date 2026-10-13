// <sotto-queueing> — очередь и утилизация: случайный поток запросов, N
// обработчиков, анимация очереди и кривая «задержка от загрузки».
// Показывает, почему при 90% загрузки задержка растёт в разы, и закон Литтла.
//
//   <sotto-queueing load="0.8"></sotto-queueing>
//   <sotto-queueing load="0.9" servers="4" dist="heavy"></sotto-queueing>
//
// Атрибуты: load (0.1–0.98), servers (1|2|4|8), dist (exp|const|heavy), seed, theme.

import { BASE_STYLE, el, rng } from "./core.js";

export const SERVICE_MS = 20;            // среднее время обработки одного запроса

const DISTS = {
  exp: "случайное (экспоненциальное)",
  const: "всегда одинаковое",
  heavy: "тяжёлый хвост: 5% запросов в 10 раз дольше",
};

/** Время обработки в долях среднего (среднее = 1). */
function serviceSampler(dist, rand) {
  const exp = (mean) => -Math.log(1 - rand()) * mean;
  if (dist === "const") return () => 1;
  if (dist === "heavy") { const a = 1 / 1.45; return () => (rand() < 0.05 ? exp(10 * a) : exp(a)); }
  return () => exp(1);
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

/**
 * Симуляция очереди с N обработчиками (FIFO). Время в средних временах обработки.
 * Возвращает запросы и статистику: среднее и перцентили времени в системе,
 * среднее число запросов в системе (по выборке моментов) — для закона Литтла.
 */
export function simulate({ load, servers = 1, dist = "exp", n = 20000, seed = 1 }) {
  const rand = rng(seed);
  const service = serviceSampler(dist, rand);
  const lambda = (load * servers);          // запросов на одно среднее время обработки
  const free = new Array(servers).fill(0);
  const jobs = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    t += -Math.log(1 - rand()) / lambda;
    let s = 0;
    for (let k = 1; k < servers; k++) if (free[k] < free[s]) s = k;
    const start = Math.max(t, free[s]);
    const end = start + service();
    free[s] = end;
    jobs.push({ arrive: t, start, end, server: s });
  }
  // Первые 10% — разгон, в статистику не берём.
  const warm = Math.floor(n * 0.1);
  const steady = jobs.slice(warm);
  const lat = steady.map((j) => j.end - j.arrive).sort((a, b) => a - b);
  const wait = steady.map((j) => j.start - j.arrive);
  const mean = lat.reduce((a, b) => a + b, 0) / lat.length;
  const t0 = steady[0].arrive, t1 = steady.at(-1).arrive;
  const lambdaMeasured = (steady.length - 1) / (t1 - t0);
  // L по выборке моментов: сколько запросов в системе (в очереди + в обработке).
  const ends = jobs.map((j) => j.end).sort((a, b) => a - b);
  const arrivals = jobs.map((j) => j.arrive);
  const count = (x, arr) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= x) lo = m + 1; else hi = m; } return lo; };
  let L = 0;
  const samples = 12000;
  for (let i = 0; i < samples; i++) {
    const x = t0 + ((t1 - t0) * (i + 0.5)) / samples;
    L += count(x, arrivals) - count(x, ends);
  }
  L /= samples;
  return {
    jobs, lambda: lambdaMeasured, mean, L,
    p50: pct(lat, 0.5), p90: pct(lat, 0.9), p99: pct(lat, 0.99),
    waitShare: wait.filter((w) => w > 1e-9).length / wait.length,
  };
}

export const LOADS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.93, 0.95];

/** Кривая задержки от загрузки для текущих обработчиков и распределения. */
export function curve({ servers, dist, seed = 7 }) {
  // У высокой загрузки дисперсия огромная — берём больше запросов и усредняем два прогона.
  return LOADS.map((load, i) => {
    const n = load >= 0.85 ? 50000 : 16000;
    const a = simulate({ load, servers, dist, n, seed: seed + i });
    const b = simulate({ load, servers, dist, n, seed: seed + 100 + i });
    return { load, mean: (a.mean + b.mean) / 2, p99: (a.p99 + b.p99) / 2 };
  });
}

const STYLE = `
.top { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
@container (max-width: 640px) { .top { grid-template-columns: 1fr; } }
.panel { background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; padding: 8px; min-width: 0; }
.panel h4 { margin: 2px 4px 6px; font-size: 13px; color: var(--w-muted); font-weight: 600; }
svg { width: 100%; height: auto; display: block; }
.load { width: 160px; }
select { max-width: 100%; }
.big { font: 700 15px "JetBrains Mono", ui-monospace, monospace; color: var(--w-warm); min-width: 3.2em; display: inline-block; }
.dot { fill: var(--w-accent-2); }
.dot.wait { fill: var(--w-warm); }
.srv { fill: var(--w-surface-2); stroke: var(--w-line-2); stroke-width: 1.5; }
.srv.busy { stroke: var(--w-good); }
.bar { fill: var(--w-good); opacity: .55; }
.lbl { font: 11px "Manrope", system-ui, sans-serif; fill: var(--w-muted); }
.lbl.num { font: 600 12px "JetBrains Mono", ui-monospace, monospace; fill: var(--w-text); }
.grid line { stroke: var(--w-line); }
.axis { font: 10px "JetBrains Mono", ui-monospace, monospace; fill: var(--w-faint); }
.mean { stroke: var(--w-accent-2); stroke-width: 2.5; fill: none; }
.p99 { stroke: var(--w-warm); stroke-width: 2.5; fill: none; }
.theory { stroke: var(--w-faint); stroke-width: 1.5; stroke-dasharray: 4 4; fill: none; }
.now { stroke: var(--w-text); stroke-width: 1.5; stroke-dasharray: 2 3; }
.pt { stroke: var(--w-bg); stroke-width: 2; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px 14px; margin-top: 10px; }
.stats div { color: var(--w-muted); font-size: 13px; }
.stats b { color: var(--w-text); font-variant-numeric: tabular-nums; }
.little { margin-top: 8px; font-size: 13px; color: var(--w-muted); }
.little b { color: var(--w-text); }
`;

const NS = "http://www.w3.org/2000/svg";
const S = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};
const ms = (x) => (x * SERVICE_MS >= 1000 ? `${(x * SERVICE_MS / 1000).toFixed(1)} с` : `${Math.round(x * SERVICE_MS)} мс`);

class SottoQueueing extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    this.built = true;
    this.seed = Number(this.getAttribute("seed") || 3);
    const load = Math.max(0.1, Math.min(0.95, Number(this.getAttribute("load") || 0.8)));
    this.loadInput = el("input", { type: "range", class: "load", min: "10", max: "95", step: "1", value: String(Math.round(load * 100)), "aria-label": "Загрузка" });
    this.loadLabel = el("span", { class: "big" });
    this.loadInput.addEventListener("input", () => this.#recompute(false));
    const sv = Number(this.getAttribute("servers") || 1);
    this.servers = el("select", { "aria-label": "Обработчиков", onchange: () => this.#recompute(true) },
      ...[1, 2, 4, 8].map((v) => el("option", { value: String(v), selected: v === sv }, String(v))));
    const dist = DISTS[this.getAttribute("dist")] ? this.getAttribute("dist") : "exp";
    this.dist = el("select", { "aria-label": "Время обработки", onchange: () => this.#recompute(true) },
      ...Object.entries(DISTS).map(([k, t]) => el("option", { value: k, selected: k === dist }, t)));
    this.playBtn = el("button", { onclick: () => this.#toggle() }, "⏸");
    this.queueSvg = S("svg", { viewBox: "0 0 360 200", role: "img", "aria-label": "Очередь запросов" });
    this.chart = S("svg", { viewBox: "0 0 360 220", role: "img", "aria-label": "Задержка от загрузки" });
    this.stats = el("div", { class: "stats" });
    this.little = el("div", { class: "little" });
    this.caption = el("div", { class: "caption", "aria-live": "polite" });
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE),
      el("div", { class: "row" },
        el("label", { class: "field" }, "загрузка", this.loadInput, this.loadLabel),
        el("label", { class: "field" }, "обработчиков", this.servers),
        el("label", { class: "field" }, "время обработки", this.dist)),
      el("div", { class: "top" },
        el("div", { class: "panel" }, el("h4", {}, "Очередь сейчас ", this.playBtn), this.queueSvg),
        el("div", { class: "panel" }, el("h4", {}, "Время ответа от загрузки"), this.chart)),
      this.stats, this.little, this.caption,
      el("div", { class: "legend" },
        el("span", {}, el("i", { style: "background:var(--w-warm)" }), "ждёт в очереди / p99"),
        el("span", {}, el("i", { style: "background:var(--w-accent-2)" }), "среднее время ответа"),
        el("span", {}, el("i", { style: "background:var(--w-good)" }), "обработчик занят")));
    this.reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.playing = !this.reduced;
    this.#recompute(true);
    this.simT = 40;
    this.#drawQueue();
    this.last = null;
    const tick = (now) => {
      if (!this.isConnected) return;
      if (this.playing && this.last != null) {
        this.simT += ((now - this.last) / 1000) * 3;     // 3 средних обработки в секунду
        if (this.simT > this.sim.jobs.at(-1).arrive) this.simT = 40;
        this.#drawQueue();
      }
      this.last = now;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    this.playBtn.textContent = this.playing ? "⏸" : "▶";
  }

  disconnectedCallback() { cancelAnimationFrame(this.raf); }

  #toggle() {
    this.playing = !this.playing;
    this.playBtn.textContent = this.playing ? "⏸" : "▶";
  }

  #recompute(curveToo) {
    const load = Number(this.loadInput.value) / 100;
    const servers = Number(this.servers.value), dist = this.dist.value;
    this.loadLabel.textContent = `${Math.round(load * 100)}%`;
    this.sim = simulate({ load, servers, dist, n: 12000, seed: this.seed });
    if (curveToo || !this.curve) this.curve = curve({ servers, dist });
    this.#drawChart(load);
    const s = this.sim;
    const rps = Math.round((s.lambda * 1000) / SERVICE_MS);
    this.stats.innerHTML =
      `<div>поток <b>${rps} RPS</b></div><div>предел <b>${Math.round((servers * 1000) / SERVICE_MS)} RPS</b></div>` +
      `<div>среднее <b>${ms(s.mean)}</b></div><div>p50 <b>${ms(s.p50)}</b></div><div>p99 <b>${ms(s.p99)}</b></div>` +
      `<div>ждали в очереди <b>${Math.round(s.waitShare * 100)}%</b> запросов</div>`;
    this.little.innerHTML = `Закон Литтла: в системе в среднем <b>${s.L.toFixed(2)}</b> запроса; поток × время = ${rps} RPS × ${ms(s.mean)} = <b>${(s.lambda * s.mean).toFixed(2)}</b> — совпадает.`;
    const ratio = s.mean;
    this.caption.textContent = load < 0.5
      ? `Загрузка ${Math.round(load * 100)}%: очередь почти не образуется, время ответа близко к времени обработки (${SERVICE_MS} мс). Двигайте загрузку вправо.`
      : load < 0.8
        ? `Загрузка ${Math.round(load * 100)}%: запросы уже ждут — среднее в ${ratio.toFixed(1)} раза больше времени обработки. Рост пока плавный.`
        : `Загрузка ${Math.round(load * 100)}%: сервер ещё не на 100%, но очередь не успевает рассасываться между всплесками. Среднее — в ${ratio.toFixed(1)} раз больше обработки, p99 — в ${s.p99.toFixed(0)}. Каждый следующий процент загрузки стоит всё дороже.`;
  }

  #drawChart(load) {
    const W = 360, H = 220, L = 42, R = 10, T = 10, B = 30;
    const xs = (v) => L + ((W - L - R) * (v - 0.1)) / (0.95 - 0.1);
    const maxY = 200;
    const ys = (v) => T + (H - T - B) * (1 - Math.log10(Math.max(1, v)) / Math.log10(maxY));
    const parts = [S("g", { class: "grid" })];
    for (const v of [1, 2, 5, 10, 20, 50, 100, 200]) {
      parts.push(S("line", { x1: L, y1: ys(v), x2: W - R, y2: ys(v), stroke: "var(--w-line)" }));
      parts.push(S("text", { x: L - 4, y: ys(v) + 3, class: "axis", "text-anchor": "end" }, ms(v)));
    }
    for (const v of [0.1, 0.3, 0.5, 0.7, 0.9]) parts.push(S("text", { x: xs(v), y: H - 12, class: "axis", "text-anchor": "middle" }, `${Math.round(v * 100)}%`));
    parts.push(S("text", { x: W - R, y: H - 1, class: "axis", "text-anchor": "end" }, "загрузка →"));
    const path = (key) => this.curve.map((p, i) => `${i ? "L" : "M"} ${xs(p.load).toFixed(1)} ${ys(p[key]).toFixed(1)}`).join(" ");
    if (Number(this.servers.value) === 1 && this.dist.value === "exp") {
      const th = [];
      for (let v = 0.1; v <= 0.951; v += 0.01) th.push(`${th.length ? "L" : "M"} ${xs(v).toFixed(1)} ${ys(1 / (1 - v)).toFixed(1)}`);
      parts.push(S("path", { d: th.join(" "), class: "theory" }));
    }
    parts.push(S("path", { d: path("p99"), class: "p99" }), S("path", { d: path("mean"), class: "mean" }));
    const x = xs(Math.min(0.95, load));
    parts.push(S("line", { x1: x, y1: T, x2: x, y2: H - B, class: "now" }));
    parts.push(S("circle", { cx: x, cy: ys(this.sim.mean), r: 5, class: "pt", style: "fill: var(--w-accent-2)" }));
    parts.push(S("circle", { cx: x, cy: ys(this.sim.p99), r: 5, class: "pt", style: "fill: var(--w-warm)" }));
    this.chart.replaceChildren(...parts);
  }

  #drawQueue() {
    const t = this.simT, jobs = this.sim.jobs, servers = Number(this.servers.value);
    // Найти запросы вокруг момента t: бинарный поиск по времени прихода.
    let lo = 0, hi = jobs.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (jobs[m].arrive <= t) lo = m + 1; else hi = m; }
    const waiting = [], busy = new Array(servers).fill(null);
    for (let i = lo - 1; i >= 0 && i > lo - 600; i--) {
      const j = jobs[i];
      if (j.end <= t) continue;
      if (j.start > t) waiting.push(j); else busy[j.server] = j;
    }
    const parts = [];
    const qx = 18, qy = 100;
    parts.push(S("text", { x: qx, y: 22, class: "lbl" }, "очередь"));
    parts.push(S("text", { x: 250, y: 22, class: "lbl" }, "обработчики"));
    // Очередь: точки справа налево к обработчикам.
    const shown = waiting.slice(-48);
    shown.forEach((j, i) => {
      const k = shown.length - 1 - i;
      const col = k % 12, row = Math.floor(k / 12);
      parts.push(S("circle", { cx: 222 - col * 17, cy: qy - 27 + row * 18, r: 6, class: "dot wait" }));
    });
    if (waiting.length > shown.length) parts.push(S("text", { x: qx, y: qy + 52, class: "lbl" }, `+ ещё ${waiting.length - shown.length}`));
    parts.push(S("text", { x: qx, y: 186, class: "lbl num" }, `ждут: ${waiting.length}`));
    const h = Math.min(30, 150 / servers - 4);
    busy.forEach((j, s) => {
      const y = 36 + s * ((150) / servers);
      parts.push(S("rect", { x: 248, y, width: 96, height: h, rx: 6, class: "srv" + (j ? " busy" : "") }));
      if (j) {
        const p = Math.min(1, (t - j.start) / (j.end - j.start));
        parts.push(S("rect", { x: 250, y: y + 2, width: 92 * p, height: h - 4, rx: 4, class: "bar" }));
        parts.push(S("circle", { cx: 262, cy: y + h / 2, r: 6, class: "dot" }));
      }
    });
    parts.push(S("text", { x: 248, y: 186, class: "lbl num" }, `заняты: ${busy.filter(Boolean).length} из ${servers}`));
    this.queueSvg.replaceChildren(...parts);
  }
}

customElements.define("sotto-queueing", SottoQueueing);
