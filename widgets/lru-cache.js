// <sotto-lru-cache> — LRU-кэш изнутри: хеш-таблица указывает на узлы
// двусвязного списка, get переносит узел в голову, put при переполнении
// вытесняет хвост. Ниже — политики вытеснения на одной нагрузке.
//
//   <sotto-lru-cache></sotto-lru-cache>
//   <sotto-lru-cache capacity="4" workload="scan"></sotto-lru-cache>
//
// Атрибуты: capacity (3–6), workload (zipf|scan), step, seed, theme.

import { BASE_STYLE, StepPlayer, el, rng } from "./core.js";

const BUCKETS = 7;

/** Пошаговый LRU: кадры со списком (голова первой) и подсветкой. */
export class LRU {
  constructor(capacity) {
    this.cap = capacity;
    this.order = [];          // голова — самый свежий
    this.values = new Map();
    this.hits = 0;
    this.misses = 0;
    this.frames = [];
    this.frame({ text: `Пустой кэш на ${capacity} элемента: хеш-таблица ключ → узел и двусвязный список в порядке использования.` });
  }

  frame({ hl = null, hlTable = null, evicted = null, moved = false, text }) {
    this.frames.push({ order: this.order.slice(), values: new Map(this.values), hl, hlTable, evicted, moved, text, hits: this.hits, misses: this.misses });
  }

  get(k) {
    if (!this.values.has(k)) {
      this.misses++;
      this.frame({ hlTable: k, text: `get(${k}): в хеш-таблице ключа нет — промах, O(1). Дальше обычно идут в базу и делают put.` });
      return null;
    }
    this.hits++;
    this.frame({ hlTable: k, hl: k, text: `get(${k}): хеш-таблица сразу даёт узел — попадание, O(1).` });
    const i = this.order.indexOf(k);
    if (i > 0) {
      this.order.splice(i, 1);
      this.order.unshift(k);
      this.frame({ hl: k, moved: true, text: `Переносим узел ${k} в голову списка: поправить 4 указателя у соседей — O(1), без поиска.` });
    } else this.frame({ hl: k, text: `${k} уже в голове — ничего не двигаем.` });
    return this.values.get(k);
  }

  put(k, v) {
    if (this.values.has(k)) {
      this.values.set(k, v);
      this.order.splice(this.order.indexOf(k), 1);
      this.order.unshift(k);
      this.frame({ hl: k, hlTable: k, moved: true, text: `put(${k}): ключ уже есть — обновляем значение и переносим в голову.` });
      return;
    }
    if (this.order.length >= this.cap) {
      const old = this.order.at(-1);
      this.frame({ evicted: old, text: `Места нет (${this.cap} из ${this.cap}). Вытесняем хвост — ${old}: к нему дольше всех не обращались.` });
      this.order.pop();
      this.values.delete(old);
      this.frame({ text: `${old} удалён и из списка, и из хеш-таблицы — иначе таблица указывала бы на удалённый узел.` });
    }
    this.values.set(k, v);
    this.order.unshift(k);
    this.frame({ hl: k, hlTable: k, text: `put(${k}): новый узел в голову списка, запись в хеш-таблицу.` });
  }
}

/** Нагрузка: Ципф по 100 ключам; вариант со сканированием — каждые 50 запросов 30 одноразовых ключей. */
export function workload(kind, n = 3000, seed = 1) {
  const rand = rng(seed);
  const K = 100, s = 1.0;
  const w = Array.from({ length: K }, (_, i) => 1 / (i + 1) ** s);
  const total = w.reduce((a, b) => a + b, 0);
  const cdf = []; let acc = 0; for (const x of w) { acc += x / total; cdf.push(acc); }
  const zipf = () => { const r = rand(); let lo = 0, hi = K - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < r) lo = m + 1; else hi = m; } return lo + 1; };
  const out = [];
  for (let i = 0; i < n; i++) {
    if (kind === "scan" && i % 50 === 25) for (let j = 0; j < 30; j++) out.push(1000 + i * 30 + j);  // отчёт прошёл по таблице
    out.push(zipf());
  }
  return out;
}

/** Доля попаданий политики по обычным запросам (одноразовые ключи сканирования ≥ 1000 — всегда промах, их не считаем). */
export function hitRatio(policy, trace, cap) {
  let hits = 0;
  const regular = trace.filter((k) => k < 1000).length;
  const hit = (k) => { if (k < 1000) hits++; };
  if (policy === "belady") {
    // Оптимум: вытеснять ключ, который понадобится позже всех (знаем будущее).
    const next = new Array(trace.length);
    const last = new Map();
    for (let i = trace.length - 1; i >= 0; i--) { next[i] = last.get(trace[i]) ?? Infinity; last.set(trace[i], i); }
    const cache = new Map();   // ключ → следующее обращение
    trace.forEach((k, i) => {
      if (cache.has(k)) hit(k);
      else if (cache.size >= cap) {
        let victim = null, far = -1;
        for (const [ck, nx] of cache) if (nx > far) { far = nx; victim = ck; }
        if (next[i] < far) cache.delete(victim); else return;   // новый нужен позже всех — не кладём
      }
      cache.set(k, next[i]);
    });
    return hits / regular;
  }
  if (policy === "slru") {
    // Сегментированный LRU: новые — в испытательный сегмент (20%), повторно запрошенные — в защищённый.
    const probCap = Math.max(1, Math.round(cap * 0.2)), protCap = cap - probCap;
    const prob = new Map(), prot = new Map();
    for (const k of trace) {
      if (prot.has(k)) { hit(k); prot.delete(k); prot.set(k, 1); continue; }
      if (prob.has(k)) {
        hit(k); prob.delete(k);
        prot.set(k, 1);
        if (prot.size > protCap) { const d = prot.keys().next().value; prot.delete(d); prob.set(d, 1); if (prob.size > probCap) prob.delete(prob.keys().next().value); }
        continue;
      }
      prob.set(k, 1);
      if (prob.size > probCap) prob.delete(prob.keys().next().value);
    }
    return hits / regular;
  }
  const cache = new Map();
  const freq = new Map();
  for (const k of trace) {
    freq.set(k, (freq.get(k) || 0) + 1);
    if (cache.has(k)) {
      hit(k);
      if (policy === "lru") { cache.delete(k); cache.set(k, 1); }
      continue;
    }
    if (cache.size >= cap) {
      let victim;
      if (policy === "lfu") { let best = Infinity; for (const ck of cache.keys()) { const f = freq.get(ck); if (f < best) { best = f; victim = ck; } } }
      else victim = cache.keys().next().value;          // FIFO и LRU: самый старый в Map
      cache.delete(victim);
    }
    cache.set(k, 1);
  }
  return hits / regular;
}

export const POLICIES = [["fifo", "FIFO"], ["lru", "LRU"], ["lfu", "LFU"], ["slru", "SLRU"], ["belady", "Оптимум (знает будущее)"]];

const STYLE = `
.view { margin-top: 12px; background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; padding: 6px; overflow-x: auto; }
svg { width: 100%; min-width: 520px; height: auto; display: block; }
.bucket { fill: var(--w-bg); stroke: var(--w-line-2); }
.bidx { font: 10px "JetBrains Mono", ui-monospace, monospace; fill: var(--w-faint); text-anchor: end; dominant-baseline: central; }
.chip { fill: var(--w-surface-2); stroke: var(--w-line-2); }
.chip.hl { fill: var(--w-accent); stroke: transparent; }
.chip.miss { fill: transparent; stroke: var(--w-bad); stroke-dasharray: 3 2; }
.node { fill: var(--w-surface-2); stroke: var(--w-line-2); stroke-width: 1.5; }
.node.hl { fill: color-mix(in srgb, var(--w-good) 35%, var(--w-surface-2)); stroke: var(--w-good); }
.node.evict { fill: color-mix(in srgb, var(--w-bad) 35%, var(--w-surface-2)); stroke: var(--w-bad); }
.t { font: 600 12px "JetBrains Mono", ui-monospace, monospace; fill: var(--w-text); text-anchor: middle; dominant-baseline: central; }
.t.on { fill: #fff; }
.small { font: 10px "Manrope", system-ui, sans-serif; fill: var(--w-muted); text-anchor: middle; }
.ptr { stroke: var(--w-accent-2); stroke-width: 1.3; fill: none; opacity: .55; }
.ptr.hl { opacity: 1; stroke-width: 2; }
.link { stroke: var(--w-line-2); stroke-width: 1.5; fill: none; }
.ops input { width: 70px; }
.policies { margin-top: 14px; background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; padding: 10px 12px; }
.policies h4 { margin: 0 0 8px; font-size: 13px; color: var(--w-muted); font-weight: 600; }
.pbar { display: grid; grid-template-columns: 170px 1fr 48px; gap: 8px; align-items: center; font-size: 13px; margin: 4px 0; }
@container (max-width: 520px) { .pbar { grid-template-columns: 110px 1fr 44px; } }
.pbar .track { height: 12px; border-radius: 4px; background: var(--w-surface-2); overflow: hidden; }
.pbar .fill { height: 100%; background: var(--w-accent); border-radius: 4px; }
.pbar.opt .fill { background: var(--w-faint); }
.pbar .n { text-align: right; font-variant-numeric: tabular-nums; }
.counts { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 8px; }
`;

const NS = "http://www.w3.org/2000/svg";
const S = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};

class SottoLruCache extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.built = true;
    this.seed = Number(this.getAttribute("seed") || 1);
    const cap = Math.max(3, Math.min(6, Number(this.getAttribute("capacity") || 4)));
    this.cap = el("select", { "aria-label": "Ёмкость", onchange: () => this.#replay(false) },
      ...[3, 4, 5, 6].map((v) => el("option", { value: String(v), selected: v === cap }, String(v))));
    this.keyInput = el("input", { type: "number", min: "1", max: "99", placeholder: "ключ", "aria-label": "Ключ" });
    const op = (kind) => () => {
      const k = Math.round(Number(this.keyInput.value));
      if (this.keyInput.value === "" || !(k >= 1 && k <= 99)) return this.keyInput.focus();
      this.ops.push(kind === "get" ? ["get", k] : ["put", k, `v${k}`]);
      this.#replay(true);
    };
    this.keyInput.addEventListener("keydown", (e) => { if (e.key === "Enter") op("get")(); });
    this.svg = S("svg", { viewBox: "0 0 640 250", role: "img" });
    this.counts = el("div", { class: "counts" });
    this.caption = el("div", { class: "caption", "aria-live": "polite" });
    this.player = new StepPlayer(this, (i) => this.#render(i));
    const wl = this.getAttribute("workload") === "scan" ? "scan" : "zipf";
    this.workload = el("select", { "aria-label": "Нагрузка", onchange: () => this.#policies() },
      el("option", { value: "zipf", selected: wl === "zipf" }, "популярность по Ципфу"),
      el("option", { value: "scan", selected: wl === "scan" }, "Ципф + сканирование таблицы"));
    this.pcap = el("select", { "aria-label": "Ёмкость для сравнения", onchange: () => this.#policies() },
      ...[5, 10, 20, 40].map((v) => el("option", { value: String(v), selected: v === 20 }, `${v} ключей`)));
    this.pbars = el("div");
    this.pnote = el("div", { class: "note" });
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE),
      el("div", { class: "row ops" },
        el("label", { class: "field" }, "ёмкость", this.cap), this.keyInput,
        el("button", { onclick: op("get") }, "get"), el("button", { onclick: op("put") }, "put"),
        el("button", { onclick: () => { this.#reset(); } }, "Сначала")),
      el("div", { class: "view" }, this.svg), this.counts, this.caption, this.player.el,
      el("div", { class: "policies" },
        el("h4", {}, "Политики вытеснения на одной нагрузке — доля попаданий по обычным запросам"),
        el("div", { class: "row", style: "margin-bottom:8px" }, el("label", { class: "field" }, "нагрузка", this.workload), el("label", { class: "field" }, "кэш", this.pcap)),
        this.pbars, this.pnote));
    this.#reset();
    this.#policies();
    const step = this.getAttribute("step");
    if (step != null) this.player.go(Number(step));
  }

  #reset() {
    this.ops = [["put", 1, "v1"], ["put", 2, "v2"], ["put", 3, "v3"], ["get", 1], ["put", 4, "v4"], ["put", 5, "v5"], ["get", 2], ["get", 3], ["put", 6, "v6"], ["get", 1]];
    this.#replay(false);
  }

  #replay(jump) {
    const c = new LRU(Number(this.cap.value));
    let last = 0;
    for (const [op, k, v] of this.ops) { last = c.frames.length; c[op](k, v); }
    this.frames = c.frames;
    this.player.load(this.frames.length, jump ? last : 0);
    if (jump) this.player.play();
  }

  #render(index) {
    const f = this.frames[index];
    const parts = [];
    // Хеш-таблица слева: корзины по k mod 7.
    const bx = 70, by = 18, bh = 30, bw = 150;
    parts.push(S("text", { x: bx + bw / 2, y: 9, class: "small" }, "хеш-таблица: ключ → узел"));
    const chipPos = new Map();
    for (let b = 0; b < BUCKETS; b++) {
      const y = by + b * bh;
      parts.push(S("text", { x: bx - 8, y: y + bh / 2, class: "bidx" }, `${b}`));
      parts.push(S("rect", { x: bx, y: y + 3, width: bw, height: bh - 6, rx: 5, class: "bucket" }));
      const keys = [...f.values.keys()].filter((k) => k % BUCKETS === b).sort((a, c) => a - c);
      if (f.hlTable != null && f.hlTable % BUCKETS === b && !f.values.has(f.hlTable)) keys.push(-f.hlTable);
      keys.forEach((k, i) => {
        const x = bx + 6 + i * 44;
        const miss = k < 0;
        parts.push(S("rect", { x, y: y + 6, width: 38, height: bh - 12, rx: 4, class: "chip" + (miss ? " miss" : f.hlTable === k ? " hl" : "") }));
        parts.push(S("text", { x: x + 19, y: y + bh / 2, class: "t" + (f.hlTable === k ? " on" : "") }, miss ? `${-k}?` : String(k)));
        if (!miss) chipPos.set(k, [x + 38, y + bh / 2]);
      });
    }
    // Двусвязный список справа, сверху вниз: голова → хвост.
    const lx = 400, ly = 22, nh = 34;
    const show = f.evicted != null && !f.order.includes(f.evicted) ? [...f.order, f.evicted] : f.order;
    parts.push(S("text", { x: lx + 60, y: 9, class: "small" }, "двусвязный список"));
    show.forEach((k, i) => {
      const y = ly + i * (nh + 8);
      const cls = k === f.evicted ? "evict" : k === f.hl ? "hl" : "";
      parts.push(S("rect", { x: lx, y, width: 120, height: nh, rx: 7, class: "node " + cls }));
      parts.push(S("text", { x: lx + 34, y: y + nh / 2, class: "t" }, String(k)));
      parts.push(S("text", { x: lx + 82, y: y + nh / 2, class: "t" }, f.values.get(k) || "—"));
      parts.push(S("line", { x1: lx + 58, y1: y + 6, x2: lx + 58, y2: y + nh - 6, class: "link" }));
      if (i === 0) parts.push(S("text", { x: lx + 150, y: y + nh / 2, class: "small" }, "← голова"));
      if (i === show.length - 1) parts.push(S("text", { x: lx + 150, y: y + nh / 2, class: "small" }, "← хвост"));
      if (i > 0) {
        parts.push(S("path", { d: `M ${lx + 52} ${y - 8} L ${lx + 52} ${y}`, class: "link" }));
        parts.push(S("path", { d: `M ${lx + 68} ${y} L ${lx + 68} ${y - 8}`, class: "link" }));
      }
      const cp = chipPos.get(k);
      if (cp) parts.push(S("path", { d: `M ${cp[0]} ${cp[1]} C ${cp[0] + 80} ${cp[1]}, ${lx - 80} ${y + nh / 2}, ${lx} ${y + nh / 2}`, class: "ptr" + (k === f.hl || k === f.hlTable ? " hl" : "") }));
    });
    const H = Math.max(by + BUCKETS * bh + 6, ly + show.length * (nh + 8));
    this.svg.setAttribute("viewBox", `0 0 640 ${H}`);
    this.svg.replaceChildren(...parts);
    this.svg.setAttribute("aria-label", `LRU: ${f.order.join(", ") || "пусто"}`);
    this.counts.innerHTML = `<span class="counter">в кэше <b>${f.order.length}</b> из <b>${this.cap.value}</b></span><span class="counter">попаданий <b>${f.hits}</b></span><span class="counter">промахов <b>${f.misses}</b></span>`;
    this.caption.textContent = f.text;
  }

  #policies() {
    const trace = workload(this.workload.value, 3000, this.seed);
    const cap = Number(this.pcap.value);
    const res = POLICIES.map(([k, name]) => [k, name, hitRatio(k, trace, cap)]);
    this.pbars.replaceChildren(...res.map(([k, name, r]) => el("div", { class: "pbar" + (k === "belady" ? " opt" : "") },
      el("span", {}, name), el("div", { class: "track" }, el("div", { class: "fill", style: `width:${(r * 100).toFixed(1)}%` })), el("span", { class: "n" }, `${Math.round(r * 100)}%`))));
    const get = (k) => res.find((x) => x[0] === k)[2];
    const plain = workload("zipf", 3000, this.seed);
    const base = (k) => hitRatio(k, plain, cap);
    this.pnote.textContent = this.workload.value === "scan"
      ? `Каждые 50 запросов отчёт читает 30 ключей по одному разу. LRU кладёт их в голову и вытесняет горячие: ${Math.round(base("lru") * 100)}% → ${Math.round(get("lru") * 100)}%. SLRU пускает новые ключи только в маленький испытательный сегмент, и горячие данные остаются на месте: ${Math.round(base("slru") * 100)}% → ${Math.round(get("slru") * 100)}%.`
      : `100 ключей с популярностью по Ципфу: кэш на ${cap} ключей держит самые популярные. Популярность не меняется, поэтому LFU выигрывает, а LRU отстаёт. Оптимум Белади знает будущее — это верхняя граница, недостижимая на практике.`;
  }
}

customElements.define("sotto-lru-cache", SottoLruCache);
