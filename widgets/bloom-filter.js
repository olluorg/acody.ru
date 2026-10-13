// <sotto-bloom-filter> — фильтр Блума: битовый массив и k хешей. Добавляйте
// слова и проверяйте: ответ «точно нет» или «возможно есть», ложные
// срабатывания видны и считаются; график — как они растут с заполнением.
//
//   <sotto-bloom-filter></sotto-bloom-filter>
//   <sotto-bloom-filter bits="64" k="3" fill="12"></sotto-bloom-filter>
//
// Атрибуты: bits (32|64|128|256), k (1–6), fill (сколько слов добавить сразу), check (слово для проверки), theme.

import { BASE_STYLE, el, rng } from "./core.js";

const WORDS = ["яблоко", "груша", "слива", "вишня", "персик", "абрикос", "лимон", "апельсин", "банан", "киви", "манго", "ананас",
  "арбуз", "дыня", "малина", "клубника", "черника", "смородина", "крыжовник", "виноград", "гранат", "инжир", "финик", "хурма",
  "айва", "лайм", "мандарин", "помело", "папайя", "кокос", "фейхоа", "голубика", "брусника", "клюква", "ежевика", "облепиха"];

const fnv = (s, seed) => {
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return h >>> 0;
};

/** Позиции k бит: двойное хеширование h1 + i·h2 (h2 нечётный). */
export function positions(word, m, k) {
  const h1 = fnv(word, 0), h2 = (fnv(word, 0x9e3779b9) | 1) >>> 0;   // | даёт знаковое число — возвращаем в беззнаковое
  return Array.from({ length: k }, (_, i) => (h1 + i * h2) % m);
}

export class Bloom {
  constructor(m, k) { this.m = m; this.k = k; this.bits = new Uint8Array(m); this.items = []; }
  add(w) { for (const p of positions(w, this.m, this.k)) this.bits[p] = 1; this.items.push(w); }
  has(w) { return positions(w, this.m, this.k).every((p) => this.bits[p]); }
}

export const theoryFP = (m, k, n) => (1 - Math.exp((-k * n) / m)) ** k;

/** Измеренная доля ложных срабатываний на словах, которых точно не добавляли. */
export function measuredFP(bloom, probes = 2000) {
  let fp = 0;
  for (let i = 0; i < probes; i++) if (bloom.has(`проба-${i}`)) fp++;
  return fp / probes;
}

const STYLE = `
.bits { display: grid; grid-template-columns: repeat(var(--cols, 32), minmax(0, 1fr)); gap: 2px; margin-top: 12px; }
.b { aspect-ratio: 1; border-radius: 3px; background: var(--w-surface-2); border: 1px solid var(--w-line); position: relative; min-width: 0; }
.b.on { background: var(--w-accent); border-color: transparent; }
.b.add { box-shadow: 0 0 0 2px var(--w-good); }
.b.hit { box-shadow: 0 0 0 2px var(--w-warm); }
.b.zero { box-shadow: 0 0 0 2px var(--w-bad); background: color-mix(in srgb, var(--w-bad) 25%, var(--w-surface-2)); }
.b small { position: absolute; inset: 0; display: grid; place-items: center; font: 8px "JetBrains Mono", monospace; color: var(--w-faint); }
.verdict { margin-top: 10px; padding: 8px 12px; border-radius: 10px; font-weight: 600; border: 1px solid var(--w-line); background: var(--w-surface); }
.verdict.no { color: var(--w-good); }
.verdict.maybe { color: var(--w-warm); }
.verdict.fp { color: var(--w-bad); }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
@container (max-width: 640px) { .grid2 { grid-template-columns: 1fr; } }
.panel { background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; padding: 8px 10px; min-width: 0; }
.panel h4 { margin: 0 0 6px; font-size: 13px; color: var(--w-muted); font-weight: 600; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { font-size: 12px; padding: 2px 7px; border-radius: 999px; background: var(--w-surface-2); border: 1px solid var(--w-line-2); cursor: pointer; }
.chip.in { background: color-mix(in srgb, var(--w-accent) 30%, var(--w-surface-2)); }
.stats { display: grid; grid-template-columns: max-content 1fr; gap: 3px 12px; font-size: 13px; }
.stats dt { color: var(--w-muted); }
.stats dd { margin: 0; font-variant-numeric: tabular-nums; }
svg { width: 100%; height: auto; display: block; }
.curve { fill: none; stroke: var(--w-accent-2); stroke-width: 2; }
.pt { fill: var(--w-warm); stroke: var(--w-bg); stroke-width: 2; }
.axis { font: 10px "JetBrains Mono", ui-monospace, monospace; fill: var(--w-faint); }
.gl { stroke: var(--w-line); }
.ops input { width: 140px; }
`;

const NS = "http://www.w3.org/2000/svg";
const S = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};
const pc = (x) => (x < 0.001 && x > 0 ? "<0,1%" : `${(x * 100).toFixed(1).replace(".", ",")}%`);

class SottoBloomFilter extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    this.built = true;
    const m = [32, 64, 128, 256].includes(Number(this.getAttribute("bits"))) ? Number(this.getAttribute("bits")) : 64;
    const k = Math.max(1, Math.min(6, Number(this.getAttribute("k") || 3)));
    this.mSel = el("select", { "aria-label": "Бит", onchange: () => this.#rebuild() }, ...[32, 64, 128, 256].map((v) => el("option", { value: String(v), selected: v === m }, String(v))));
    this.kSel = el("select", { "aria-label": "Хешей", onchange: () => this.#rebuild() }, ...[1, 2, 3, 4, 5, 6].map((v) => el("option", { value: String(v), selected: v === k }, String(v))));
    this.input = el("input", { type: "text", placeholder: "слово", "aria-label": "Слово" });
    this.input.addEventListener("keydown", (e) => { if (e.key === "Enter") this.#check(); });
    this.bitsBox = el("div", { class: "bits" });
    this.verdict = el("div", { class: "verdict", "aria-live": "polite" });
    this.chips = el("div", { class: "chips" });
    this.stats = el("dl", { class: "stats" });
    this.chart = S("svg", { viewBox: "0 0 300 150", role: "img", "aria-label": "Ложные срабатывания от числа элементов" });
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE),
      el("div", { class: "row" }, el("label", { class: "field" }, "бит", this.mSel), el("label", { class: "field" }, "хешей k", this.kSel),
        el("button", { onclick: () => this.#addRandom(5) }, "+5 слов"), el("button", { onclick: () => this.#rebuild(0) }, "очистить")),
      el("div", { class: "row ops", style: "margin-top:8px" }, this.input,
        el("button", { class: "primary", onclick: () => this.#add() }, "добавить"), el("button", { onclick: () => this.#check() }, "проверить")),
      this.bitsBox, this.verdict,
      el("div", { class: "grid2" },
        el("div", { class: "panel" }, el("h4", {}, "Добавлены (нажмите, чтобы проверить)"), this.chips, el("h4", { style: "margin-top:10px" }, "Не добавлены — проверьте их"),
          this.others = el("div", { class: "chips" })),
        el("div", { class: "panel" }, el("h4", {}, "Ложные срабатывания"), this.stats, this.chart)),
      el("div", { class: "legend" },
        el("span", {}, el("i", { style: "background:var(--w-accent)" }), "бит = 1"),
        el("span", {}, el("i", { style: "outline:2px solid var(--w-good)" }), "выставлены при добавлении"),
        el("span", {}, el("i", { style: "outline:2px solid var(--w-warm)" }), "проверены и равны 1"),
        el("span", {}, el("i", { style: "outline:2px solid var(--w-bad)" }), "проверен и равен 0 — точно нет")));
    this.#rebuild(Number(this.getAttribute("fill") ?? 10));
    if (this.getAttribute("check")) this.#check(this.getAttribute("check"));   // сразу показать проверку слова
  }

  #rebuild(fill) {
    const keep = fill == null ? (this.bloom ? this.bloom.items.slice() : []) : WORDS.slice(0, fill);
    this.bloom = new Bloom(Number(this.mSel.value), Number(this.kSel.value));
    keep.forEach((w) => this.bloom.add(w));
    this.last = null;
    this.#render(fill === 0 ? "Фильтр пуст. Добавьте слова и проверяйте любые другие." : `В фильтре ${this.bloom.items.length} слов: ${this.bloom.m} бит и ${this.bloom.k} хеш${this.bloom.k === 1 ? "" : this.bloom.k < 5 ? "а" : "ей"} на слово. Проверьте слово, которого нет в списке.`);
  }

  #addRandom(n) {
    const rand = rng(this.bloom.items.length + 7);
    for (let i = 0; i < n; i++) {
      const free = WORDS.filter((w) => !this.bloom.items.includes(w));
      const w = free.length ? free[Math.floor(rand() * free.length)] : `слово-${this.bloom.items.length}`;
      this.bloom.add(w);
    }
    this.last = null;
    this.#render(`Добавили ${n} слов — единиц в массиве стало больше, и ложные срабатывания чаще.`);
  }

  #add(word) {
    const w = (word ?? this.input.value).trim().toLowerCase();
    if (!w) return this.input.focus();
    const pos = positions(w, this.bloom.m, this.bloom.k);
    const already = pos.filter((p) => this.bloom.bits[p]).length;
    this.bloom.add(w);
    this.last = { w, pos, kind: "add" };
    this.#render(`«${w}»: хеши дали позиции ${pos.join(", ")} — выставили биты в 1${already ? ` (${already} из них уже были единицами из-за других слов)` : ""}. Сами слова фильтр не хранит.`);
  }

  #check(word) {
    const w = (word ?? this.input.value).trim().toLowerCase();
    if (!w) return this.input.focus();
    const pos = positions(w, this.bloom.m, this.bloom.k);
    const zeros = pos.filter((p) => !this.bloom.bits[p]);
    const truly = this.bloom.items.includes(w);
    this.last = { w, pos, kind: "check", zeros };
    if (zeros.length) this.#render(`«${w}»: бит ${zeros[0]} равен нулю — слова точно нет. Если бы его добавляли, этот бит был бы единицей.`, "no", `Точно нет`);
    else if (truly) this.#render(`«${w}»: все ${pos.length} бит — единицы. Возможно есть — и действительно добавлено.`, "maybe", "Возможно есть — и это правда");
    else this.#render(`«${w}»: все ${pos.length} бит — единицы, хотя слово не добавляли. Их выставили другие слова — ложное срабатывание. Цена — лишний поход в базу или на диск, но не ошибка в данных.`, "fp", "Возможно есть — ложное срабатывание");
  }

  #render(text, cls = "", head = "") {
    const { m, k, bits, items } = this.bloom;
    const cols = m <= 64 ? 32 : m <= 128 ? 32 : 32;
    this.bitsBox.style.setProperty("--cols", String(cols));
    const posSet = new Set(this.last ? this.last.pos : []);
    this.bitsBox.replaceChildren(...Array.from(bits, (b, i) => {
      let c = "b" + (b ? " on" : "");
      if (posSet.has(i)) c += this.last.kind === "add" ? " add" : b ? " hit" : " zero";
      return el("div", { class: c, title: `бит ${i}` }, m <= 64 ? el("small", {}, String(i)) : null);
    }));
    this.verdict.className = "verdict " + cls;
    this.verdict.textContent = head ? `${head}. ${text}` : text;
    this.chips.replaceChildren(...items.map((w) => el("span", { class: "chip in", onclick: () => this.#check(w) }, w)));
    this.others.replaceChildren(...WORDS.filter((w) => !items.includes(w)).slice(0, 14).map((w) => el("span", { class: "chip", onclick: () => this.#check(w) }, w)));
    const n = items.length, ones = bits.reduce((a, b) => a + b, 0);
    const th = theoryFP(m, k, n), me = measuredFP(this.bloom);
    const bestK = n ? Math.max(1, Math.round((m / n) * Math.LN2)) : k;
    this.stats.replaceChildren(
      el("dt", {}, "слов"), el("dd", {}, String(n)),
      el("dt", {}, "единиц в массиве"), el("dd", {}, `${ones} из ${m} (${Math.round((100 * ones) / m)}%)`),
      el("dt", {}, "по формуле"), el("dd", {}, pc(th)),
      el("dt", {}, "измерено на 2000 проб"), el("dd", {}, pc(me)),
      el("dt", {}, "лучшее k для n"), el("dd", {}, `${bestK}${bestK === k ? " — уже выбрано" : ""}`));
    // График: формула от n при текущих m и k, точка — сейчас.
    const W = 300, H = 150, L = 34, B = 22, T = 8, R = 6, maxN = Math.max(40, n + 5);
    const x = (v) => L + ((W - L - R) * v) / maxN, y = (p) => T + (H - T - B) * (1 - p);
    const parts = [];
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      parts.push(S("line", { x1: L, y1: y(p), x2: W - R, y2: y(p), class: "gl" }));
      parts.push(S("text", { x: L - 4, y: y(p) + 3, class: "axis", "text-anchor": "end" }, `${p * 100}%`));
    }
    for (let v = 0; v <= maxN; v += 10) parts.push(S("text", { x: x(v), y: H - 6, class: "axis", "text-anchor": "middle" }, String(v)));
    let d = "";
    for (let v = 0; v <= maxN; v += 0.5) d += `${v ? "L" : "M"} ${x(v).toFixed(1)} ${y(theoryFP(m, k, v)).toFixed(1)} `;
    parts.push(S("path", { d, class: "curve" }), S("circle", { cx: x(n), cy: y(me), r: 4.5, class: "pt" }));
    parts.push(S("text", { x: W - R, y: T + 10, class: "axis", "text-anchor": "end" }, "слов в фильтре →"));
    this.chart.replaceChildren(...parts);
  }
}

customElements.define("sotto-bloom-filter", SottoBloomFilter);
