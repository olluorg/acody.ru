// <sotto-load-balancer> — алгоритмы балансировки на одной и той же нагрузке:
// очереди на серверах в динамике и задержки (среднее, p99). Один сервер
// можно сделать медленным — видно, кто продолжает слать ему трафик.
//
//   <sotto-load-balancer></sotto-load-balancer>
//   <sotto-load-balancer a="round-robin" b="p2c" slow="1" load="0.85"></sotto-load-balancer>
//
// Атрибуты: a, b (round-robin|random|least|p2c), load (0.5–0.95), slow (0|1), work (const|exp|heavy), seed, theme.

import { BASE_STYLE, el, rng } from "./core.js";

export const SERVERS = 8;
export const SERVICE_MS = 20;
export const ALGOS = {
  "round-robin": "Round robin — по кругу",
  random: "Случайный сервер",
  least: "Least requests — где меньше в работе",
  p2c: "Power of two choices — лучший из двух случайных",
};
const WORK = { const: "одинаковые", exp: "разные (экспоненциальные)", heavy: "тяжёлый хвост: 5% в 10 раз дольше" };
const SLOW_FACTOR = 3;

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

/**
 * Симуляция: поток запросов, у каждого сервера один обработчик и очередь FIFO.
 * Балансировщик видит число запросов в работе на каждом сервере (least, p2c).
 * Время — в средних временах обработки.
 */
export function simulate({ algo, load = 0.85, slow = 1, work = "exp", n = 30000, seed = 1 }) {
  const rand = rng(seed), pick = rng(seed * 31 + 7);
  const speed = Array.from({ length: SERVERS }, (_, i) => (slow && i === 2 ? 1 / SLOW_FACTOR : 1));
  const capacity = speed.reduce((a, b) => a + b, 0);
  const lambda = load * capacity;
  const exp = (m) => -Math.log(1 - rand()) * m;
  const size = work === "const" ? () => 1 : work === "heavy" ? () => (rand() < 0.05 ? exp(10 / 1.45) : exp(1 / 1.45)) : () => exp(1);
  const free = new Array(SERVERS).fill(0);
  const ends = Array.from({ length: SERVERS }, () => []);      // время окончания, по возрастанию
  const heads = new Array(SERVERS).fill(0);
  const arrives = Array.from({ length: SERVERS }, () => []);
  const lat = [];
  const share = new Array(SERVERS).fill(0);
  let t = 0, rr = 0;
  const inFlight = (s) => { while (heads[s] < ends[s].length && ends[s][heads[s]] <= t) heads[s]++; return ends[s].length - heads[s]; };
  for (let i = 0; i < n; i++) {
    t += -Math.log(1 - rand()) / lambda;
    let s;
    if (algo === "round-robin") s = rr++ % SERVERS;
    else if (algo === "random") s = Math.floor(pick() * SERVERS);
    else if (algo === "least") {
      s = 0;
      let best = Infinity;
      const off = Math.floor(pick() * SERVERS);               // случайный порядок при равенстве
      for (let k = 0; k < SERVERS; k++) { const c = (k + off) % SERVERS, v = inFlight(c); if (v < best) { best = v; s = c; } }
    } else {
      const a = Math.floor(pick() * SERVERS);
      let b = Math.floor(pick() * (SERVERS - 1)); if (b >= a) b++;
      s = inFlight(a) <= inFlight(b) ? a : b;
    }
    const start = Math.max(t, free[s]);
    const end = start + size() / speed[s];
    free[s] = end;
    ends[s].push(end);
    arrives[s].push(t);
    share[s]++;
    if (i > n * 0.1) lat.push(end - t);
  }
  lat.sort((x, y) => x - y);
  const mean = lat.reduce((a, b) => a + b, 0) / lat.length;
  return { algo, arrives, ends, speed, share: share.map((c) => c / n), mean, p50: pct(lat, 0.5), p99: pct(lat, 0.99), duration: t };
}

/** Длина очереди (в работе + ждут) на сервере в момент t. */
export function queueAt(sim, s, t) {
  const count = (arr) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= t) lo = m + 1; else hi = m; } return lo; };
  return count(sim.arrives[s]) - count(sim.ends[s]);
}

const STYLE = `
.lanes { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
@container (max-width: 640px) { .lanes { grid-template-columns: 1fr; } }
.lane { background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; padding: 8px 10px; min-width: 0; }
.lane select { width: 100%; margin-bottom: 6px; }
svg { width: 100%; height: auto; display: block; }
.q { fill: var(--w-accent); }
.q.slow { fill: var(--w-warm); }
.q.hot { fill: var(--w-bad); }
.base { stroke: var(--w-line-2); }
.lbl { font: 11px "JetBrains Mono", ui-monospace, monospace; fill: var(--w-muted); text-anchor: middle; }
.num { font: 600 11px "JetBrains Mono", ui-monospace, monospace; fill: var(--w-text); text-anchor: middle; }
.st { display: flex; gap: 12px; flex-wrap: wrap; font-size: 13px; color: var(--w-muted); margin-top: 4px; }
.st b { color: var(--w-text); font-variant-numeric: tabular-nums; }
table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--w-line); }
th { color: var(--w-muted); font-weight: 600; }
td.n { font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
th.n { text-align: right; }
tr.best td { color: var(--w-good); }
tr.worst td { color: var(--w-bad); }
.barcell { width: 32%; }
.hbar { height: 8px; border-radius: 4px; background: var(--w-warm); }
select { max-width: 100%; }
`;

const NS = "http://www.w3.org/2000/svg";
const S = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};
const ms = (x) => (x * SERVICE_MS >= 1000 ? `${(x * SERVICE_MS / 1000).toFixed(1)} с` : `${Math.round(x * SERVICE_MS)} мс`);

class SottoLoadBalancer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    this.built = true;
    this.seed = Number(this.getAttribute("seed") || 2);
    const load = Math.max(0.5, Math.min(0.95, Number(this.getAttribute("load") || 0.85)));
    this.loadInput = el("input", { type: "range", min: "50", max: "95", value: String(Math.round(load * 100)), "aria-label": "Загрузка" });
    this.loadLabel = el("b", {});
    this.loadInput.addEventListener("input", () => this.#recompute());
    this.slow = el("select", { "aria-label": "Медленный сервер", onchange: () => this.#recompute() },
      el("option", { value: "1", selected: this.getAttribute("slow") !== "0" }, `один в ${SLOW_FACTOR} раза медленнее`),
      el("option", { value: "0", selected: this.getAttribute("slow") === "0" }, "все одинаковые"));
    const work = WORK[this.getAttribute("work")] ? this.getAttribute("work") : "exp";
    this.work = el("select", { "aria-label": "Запросы", onchange: () => this.#recompute() },
      ...Object.entries(WORK).map(([k, v]) => el("option", { value: k, selected: k === work }, v)));
    const mk = (initial) => {
      const lane = { sel: el("select", { "aria-label": "Алгоритм", onchange: () => this.#recompute() }, ...Object.entries(ALGOS).map(([k, v]) => el("option", { value: k, selected: k === initial }, v))),
                     svg: S("svg", { viewBox: "0 0 320 150", role: "img" }), st: el("div", { class: "st" }) };
      lane.root = el("div", { class: "lane" }, lane.sel, lane.svg, lane.st);
      return lane;
    };
    this.lanes = [mk(ALGOS[this.getAttribute("a")] ? this.getAttribute("a") : "round-robin"), mk(ALGOS[this.getAttribute("b")] ? this.getAttribute("b") : "p2c")];
    this.playBtn = el("button", { onclick: () => { this.playing = !this.playing; this.playBtn.textContent = this.playing ? "⏸ пауза" : "▶ пуск"; } }, "⏸ пауза");
    this.table = el("table");
    this.caption = el("div", { class: "caption", "aria-live": "polite" });
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE),
      el("div", { class: "row" },
        el("label", { class: "field" }, "загрузка", this.loadInput, this.loadLabel),
        el("label", { class: "field" }, "серверы", this.slow),
        el("label", { class: "field" }, "запросы", this.work),
        this.playBtn),
      el("div", { class: "lanes" }, this.lanes.map((l) => l.root)),
      this.table, this.caption,
      el("div", { class: "legend" },
        el("span", {}, el("i", { style: "background:var(--w-accent)" }), "очередь на сервере"),
        el("span", {}, el("i", { style: "background:var(--w-warm)" }), "медленный сервер"),
        el("span", {}, el("i", { style: "background:var(--w-bad)" }), "очередь длиннее 8")));
    this.reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.playing = !this.reduced;
    this.playBtn.textContent = this.playing ? "⏸ пауза" : "▶ пуск";
    this.t = 300;
    this.#recompute();
    let last = null;
    const tick = (now) => {
      if (!this.isConnected) return;
      if (this.playing && last != null) {
        this.t += ((now - last) / 1000) * 4;
        if (this.t > this.sims.a.duration - 1) this.t = 300;
        this.#draw();
      }
      last = now;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  disconnectedCallback() { cancelAnimationFrame(this.raf); }

  #recompute() {
    const load = Number(this.loadInput.value) / 100, slow = Number(this.slow.value), work = this.work.value;
    this.loadLabel.textContent = `${Math.round(load * 100)}%`;
    const all = {};
    for (const algo of Object.keys(ALGOS)) all[algo] = simulate({ algo, load, slow, work, seed: this.seed });
    this.all = all;
    this.sims = { a: all[this.lanes[0].sel.value], b: all[this.lanes[1].sel.value] };
    // Таблица всех алгоритмов.
    const rows = Object.values(all);
    const p99s = rows.map((r) => r.p99);
    const best = Math.min(...p99s), worst = Math.max(...p99s);
    this.table.replaceChildren(
      el("tr", {}, el("th", {}, "алгоритм"), el("th", { class: "n" }, "среднее"), el("th", { class: "n" }, "p99"), el("th", { class: "barcell" }, "p99")),
      ...rows.map((r) => el("tr", { class: r.p99 === best ? "best" : r.p99 === worst ? "worst" : "" },
        el("td", {}, ALGOS[r.algo].split(" — ")[0]), el("td", { class: "n" }, ms(r.mean)), el("td", { class: "n" }, ms(r.p99)),
        el("td", { class: "barcell" }, el("div", { class: "hbar", style: `width:${Math.max(3, (100 * r.p99) / worst)}%` })))));
    const rr = all["round-robin"], p2c = all.p2c, least = all.least;
    this.caption.textContent = slow
      ? `Медленный сервер (🐢) способен обработать лишь ~${Math.round(100 * rr.speed[2] / rr.speed.reduce((a, b) => a + b, 0))}% общего потока, а round robin и случайный выбор отдают ему ту же долю, что и остальным, — ${Math.round(rr.share[2] * 100)}%. Он перегружен, его очередь растёт без предела, и каждый восьмой запрос ждёт в ней. Least requests и power of two choices отправляют ему меньше (${Math.round(p2c.share[2] * 100)}%), p99 — ${ms(p2c.p99)} против ${ms(rr.p99)}.`
      : `Серверы одинаковые. Round robin почти не уступает умным алгоритмам при одинаковых запросах, но со случайными длительностями очереди всё равно скапливаются. Power of two choices — ${ms(p2c.p99)} p99 без опроса всех серверов, least requests — ${ms(least.p99)}.`;
    this.#draw();
  }

  #draw() {
    this.lanes.forEach((lane, li) => {
      const sim = li ? this.sims.b : this.sims.a;
      const parts = [];
      const bw = 320 / SERVERS;
      const base = 118;
      parts.push(S("line", { x1: 4, y1: base, x2: 316, y2: base, class: "base" }));
      for (let s = 0; s < SERVERS; s++) {
        const q = queueAt(sim, s, this.t);
        const h = Math.min(100, q * 8);
        const x = s * bw + 6;
        const slowSrv = sim.speed[s] < 1;
        parts.push(S("rect", { x, y: base - h, width: bw - 12, height: h, rx: 4, class: "q" + (q > 8 ? " hot" : slowSrv ? " slow" : "") }));
        parts.push(S("text", { x: x + (bw - 12) / 2, y: base - h - 4, class: "num" }, String(q)));
        parts.push(S("text", { x: x + (bw - 12) / 2, y: base + 14, class: "lbl" }, slowSrv ? "🐢" : `с${s + 1}`));
        parts.push(S("text", { x: x + (bw - 12) / 2, y: base + 28, class: "lbl" }, `${Math.round(sim.share[s] * 100)}%`));
      }
      lane.svg.replaceChildren(...parts);
      lane.svg.setAttribute("aria-label", `Очереди на серверах: ${ALGOS[sim.algo]}`);
      lane.st.innerHTML = `<span>среднее <b>${ms(sim.mean)}</b></span><span>p50 <b>${ms(sim.p50)}</b></span><span>p99 <b>${ms(sim.p99)}</b></span>`;
    });
  }
}

customElements.define("sotto-load-balancer", SottoLoadBalancer);
