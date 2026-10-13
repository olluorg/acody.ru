// <sotto-hashmap-put> — HashMap.put по шагам, как в JDK: String.hashCode,
// перемешивание h ^ (h >>> 16), индекс hash & (n − 1), цепочка при коллизии,
// удвоение таблицы после порога, превращение цепочки в дерево.
//
//   <sotto-hashmap-put></sotto-hashmap-put>
//   <sotto-hashmap-put keys="collide"></sotto-hashmap-put>
//
// Атрибуты: keys (colors|collide|attack), step, theme. Перенесено из bkdojo и уточнено по JDK.

import { BASE_STYLE, StepPlayer, el } from "./core.js";

export const TREEIFY_THRESHOLD = 8;
export const MIN_TREEIFY_CAPACITY = 64;
const LOAD_FACTOR = 0.75;

/** String.hashCode(): h = 31·h + c, 32-битное знаковое. */
export function stringHashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/** HashMap.hash(): старшие биты подмешиваются в младшие. */
export const spread = (h) => (h ^ (h >>> 16)) | 0;

const combos = (parts, len) => len === 0 ? [""] : combos(parts, len - 1).flatMap((p) => parts.map((x) => p + x));

export const KEY_SETS = {
  colors: { title: "обычные ключи", keys: ["red", "green", "blue", "cyan", "lime", "gold", "pink"] },
  collide: { title: "одинаковый hashCode: Aa и BB", keys: ["Aa", "BB", "AaAa", "BBBB", "AaBB", "BBAa", "Aa"] },
  attack: { title: "11 строк с одним хешем — дерево", keys: combos(["Aa", "BB"], 4).slice(0, 11) },
};

/**
 * Симуляция вставок. Кадр — снимок таблицы (корзины: {tree, entries:[{key, hash, value}]})
 * и пояснение. Порядок действий — как в putVal: вставка, затем treeifyBin
 * (при малой таблице — resize вместо дерева), затем resize по порогу.
 */
export function simulate(keys, initialCapacity = 4) {
  let cap = initialCapacity;
  let table = Array.from({ length: cap }, () => ({ tree: false, entries: [] }));
  let size = 0, version = 0;
  const frames = [];
  const snap = (extra) => frames.push({ cap, size, table: table.map((b) => ({ tree: b.tree, entries: b.entries.map((e) => ({ ...e })) })), ...extra });
  const resize = (why) => {
    const old = cap;
    cap *= 2;
    const next = Array.from({ length: cap }, () => ({ tree: false, entries: [] }));
    let moved = 0;
    for (let i = 0; i < old; i++) for (const e of table[i].entries) {
      const j = e.hash & (cap - 1);
      if (j !== i) moved++;
      next[j].entries.push(e);
    }
    // Деревья, ставшие маленькими, превращаются обратно в списки (UNTREEIFY_THRESHOLD = 6).
    for (const b of next) b.tree = b.entries.length > 6 && cap >= MIN_TREEIFY_CAPACITY && table.some((t) => t.tree);
    table = next;
    snap({ action: "resize", text: `${why} Таблица ${old} → ${cap}. Индекс считается по ещё одному биту хеша: каждый элемент либо остаётся на месте, либо переезжает ровно на +${old}. Переехало ${moved}.` });
  };
  snap({ action: "init", text: `Пустая таблица на ${cap} корзины. Порог увеличения = ${cap} × ${LOAD_FACTOR} = ${cap * LOAD_FACTOR}.` });
  for (const key of keys) {
    const h = stringHashCode(key), hash = spread(h), idx = hash & (cap - 1);
    const bucket = table[idx];
    const compute = { key, h, hash, idx, mask: cap - 1 };
    const existing = bucket.entries.find((e) => e.hash === hash && e.key === key);
    version++;
    if (existing) {
      existing.value = `v${version}`;
      snap({ action: "replace", compute, hl: idx, key, text: `«${key}»: в корзине ${idx} нашёлся ключ с тем же хешем и equals() = true — значение заменено, размер не меняется. put вернёт старое значение.` });
      continue;
    }
    const before = bucket.entries.length;
    const sameHash = bucket.entries.filter((e) => e.hash === hash).length;
    bucket.entries.push({ key, hash, value: `v${version}` });
    size++;
    snap({
      action: before ? "collision" : "place", compute, hl: idx, key,
      text: before
        ? `«${key}»: корзина ${idx} занята (${before}) — коллизия. ${sameHash ? "Хеш совпал полностью, equals() — нет: " : "Хеши разные, совпали младшие биты: "}${bucket.tree ? "добавляем в дерево." : "добавляем в конец цепочки."}`
        : `«${key}»: корзина ${idx} свободна — кладём узел.`,
    });
    if (!bucket.tree && before >= TREEIFY_THRESHOLD) {
      if (cap < MIN_TREEIFY_CAPACITY) resize(`В цепочке уже было ${before} узлов, но таблица меньше ${MIN_TREEIFY_CAPACITY} — вместо дерева HashMap увеличивает таблицу.`);
      else {
        const j = hash & (cap - 1);
        table[j].tree = true;
        snap({ action: "treeify", hl: j, text: `Цепочка длиннее ${TREEIFY_THRESHOLD} при таблице ≥ ${MIN_TREEIFY_CAPACITY} — превращаем её в красно-чёрное дерево: поиск в корзине O(log n) вместо O(n). Так HashMap защищается от атаки коллизиями.` });
      }
    }
    while (size > cap * LOAD_FACTOR) resize(`size ${size} > порога ${cap * LOAD_FACTOR}.`);
  }
  return frames;
}

const bin = (x, bits) => (x >>> 0).toString(2).padStart(32, "0").slice(-bits);

const STYLE = `
.keys { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.k { font: 12px "JetBrains Mono", ui-monospace, monospace; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--w-line-2); color: var(--w-muted); }
.k.done { color: var(--w-text); background: var(--w-surface-2); }
.k.cur { color: #fff; background: var(--w-accent); border-color: transparent; }
.pipe { display: flex; flex-wrap: wrap; gap: 6px; align-items: stretch; margin-top: 12px; font: 12px "JetBrains Mono", ui-monospace, monospace; }
.cell { background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 8px; padding: 4px 8px; display: grid; gap: 1px; min-width: 0; }
.cell small { color: var(--w-faint); font-size: 10px; }
.cell b { color: var(--w-text); }
.cell i { font-style: normal; color: var(--w-muted); letter-spacing: .5px; }
.cell i u { text-decoration: none; color: var(--w-warm); font-weight: 700; }
.cell.idx b { color: var(--w-warm); font-size: 16px; }
.op { align-self: center; color: var(--w-muted); }
.gauge { margin-top: 12px; display: grid; grid-template-columns: max-content 1fr max-content; gap: 10px; align-items: center; font-size: 13px; color: var(--w-muted); }
.bar { height: 10px; border-radius: 5px; background: var(--w-surface-2); position: relative; overflow: hidden; }
.fill { position: absolute; inset: 0 auto 0 0; background: var(--w-accent); border-radius: 5px; }
.thr { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--w-warm); }
.table { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 6px; margin-top: 12px; }
.bucket { background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 10px; padding: 6px; min-height: 70px; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.bucket.hl { border-color: var(--w-accent); box-shadow: 0 0 0 1px var(--w-accent); }
.bucket.tree { border-color: var(--w-good); }
.bucket h5 { margin: 0; font: 600 11px "JetBrains Mono", ui-monospace, monospace; color: var(--w-faint); display: flex; justify-content: space-between; }
.node { font: 12px "JetBrains Mono", ui-monospace, monospace; padding: 3px 6px; border-radius: 6px; background: var(--w-surface-2); border: 1px solid var(--w-line-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.node.new { background: var(--w-accent); color: #fff; border-color: transparent; }
.bucket.tree .node + .node::before { content: none; }
.node + .node::before { content: "↓"; display: block; text-align: center; color: var(--w-faint); font-size: 10px; margin: -4px 0 -2px; }
.empty { color: var(--w-faint); font-size: 11px; }
.ops input { width: 120px; }
`;

class SottoHashmapPut extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.built = true;
    const set = KEY_SETS[this.getAttribute("keys")] ? this.getAttribute("keys") : "colors";
    this.setSel = el("select", { "aria-label": "Ключи", onchange: () => { this.keys = KEY_SETS[this.setSel.value].keys.slice(); this.#replay(false); } },
      ...Object.entries(KEY_SETS).map(([k, v]) => el("option", { value: k, selected: k === set }, v.title)));
    this.keyInput = el("input", { type: "text", placeholder: "свой ключ", "aria-label": "Ключ" });
    const add = () => { const k = this.keyInput.value.trim(); if (!k) return this.keyInput.focus(); this.keys.push(k); this.keyInput.value = ""; this.#replay(true); };
    this.keyInput.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
    this.keysBox = el("div", { class: "keys" });
    this.pipe = el("div", { class: "pipe" });
    this.gauge = el("div", { class: "gauge" });
    this.tableBox = el("div", { class: "table" });
    this.caption = el("div", { class: "caption", "aria-live": "polite" });
    this.player = new StepPlayer(this, (i) => this.#render(i));
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE),
      el("div", { class: "row ops" }, el("label", { class: "field" }, "ключи", this.setSel), this.keyInput, el("button", { onclick: add }, "put")),
      this.keysBox, this.pipe, this.gauge, this.tableBox, this.caption,
      el("div", { class: "legend" },
        el("span", {}, el("i", { style: "background:var(--w-accent)" }), "текущая вставка"),
        el("span", {}, el("i", { style: "background:var(--w-warm)" }), "биты, которые дают индекс"),
        el("span", {}, el("i", { style: "outline:1px solid var(--w-good);background:transparent" }), "корзина-дерево")),
      this.player.el);
    this.keys = KEY_SETS[set].keys.slice();
    this.#replay(false);
    const step = this.getAttribute("step");
    if (step != null) this.player.go(Number(step));
  }

  #replay(jump) {
    this.frames = simulate(this.keys);
    this.player.load(this.frames.length, jump ? this.frames.length - 1 : 0);
  }

  #render(index) {
    const f = this.frames[index];
    // Ключи: вставленные, текущий, ожидающие.
    const inserted = new Set(f.table.flatMap((b) => b.entries.map((e) => e.key)));
    let curShown = false;
    this.keysBox.replaceChildren(...this.keys.map((k) => {
      const cur = k === f.key && !curShown;
      if (cur) curShown = true;
      return el("span", { class: "k" + (cur ? " cur" : inserted.has(k) ? " done" : "") }, k);
    }));
    // Как считается индекс.
    if (f.compute) {
      const c = f.compute, bits = Math.log2(f.cap);
      const tail = (x) => { const b = bin(x, 16); return el("i", {}, b.slice(0, 16 - bits), el("u", {}, b.slice(16 - bits))); };
      this.pipe.replaceChildren(
        el("div", { class: "cell" }, el("small", {}, `"${c.key}".hashCode()`), el("b", {}, String(c.h)), tail(c.h)),
        el("span", { class: "op" }, "^ (h >>> 16) →"),
        el("div", { class: "cell" }, el("small", {}, "hash"), el("b", {}, String(c.hash)), tail(c.hash)),
        el("span", { class: "op" }, `& ${c.mask} →`),
        el("div", { class: "cell idx" }, el("small", {}, "индекс"), el("b", {}, String(c.idx)), el("i", {}, `младшие ${bits} бит`)));
    } else this.pipe.replaceChildren(el("span", { class: "empty" }, f.action === "resize" ? "Перераспределение: индекс = hash & (новая ёмкость − 1)" : "Нажмите «вперёд» — ключи будут вставляться по одному"));
    const thr = f.cap * LOAD_FACTOR;
    this.gauge.replaceChildren(el("span", {}, `size ${f.size} / ёмкость ${f.cap}`),
      el("div", { class: "bar" }, el("div", { class: "fill", style: `width:${Math.min(100, (100 * f.size) / f.cap)}%` }), el("div", { class: "thr", style: `left:${LOAD_FACTOR * 100}%` })),
      el("span", {}, `порог ${thr}`));
    // Корзины: при большой таблице — только непустые.
    const show = f.cap <= 16 ? f.table.map((b, i) => [i, b]) : f.table.map((b, i) => [i, b]).filter(([, b]) => b.entries.length);
    this.tableBox.style.setProperty("--n", String(Math.min(8, Math.max(4, show.length))));
    this.tableBox.replaceChildren(...show.map(([i, b]) => el("div", { class: "bucket" + (i === f.hl ? " hl" : "") + (b.tree ? " tree" : "") },
      el("h5", {}, el("span", {}, `[${i}]`), b.tree ? el("span", {}, "🌳 дерево") : b.entries.length > 1 ? el("span", {}, `${b.entries.length}`) : null),
      ...(b.entries.length ? b.entries.map((e) => el("div", { class: "node" + (e.key === f.key && i === f.hl ? " new" : ""), title: `${e.key}=${e.value}, hash ${e.hash}` }, `${e.key}=${e.value}`)) : [el("span", { class: "empty" }, "null")]))),
      ...(f.cap > 16 ? [el("div", { class: "bucket" }, el("h5", {}, "остальные"), el("span", { class: "empty" }, `${f.cap - show.length} пустых корзин`))] : []));
    this.caption.textContent = f.text;
  }
}

customElements.define("sotto-hashmap-put", SottoHashmapPut);
