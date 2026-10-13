// <sotto-lsm-tree> — LSM-дерево по шагам: запись в журнал и memtable, сброс
// в неизменяемые SSTable, чтение с фильтрами Блума и слияние (compaction).
//
//   <sotto-lsm-tree></sotto-lsm-tree>
//
// Атрибуты: memtable (2–8 записей), seed, step, theme.

import { BASE_STYLE, StepPlayer, el, rng } from "./core.js";

const TOMB = "✝";
const BLOOM_BITS = 16;
const L0_LIMIT = 3;           // столько файлов на L0 — и запускаем слияние
const TABLE_MAX = 6;          // ключей в одном файле L1

/** Две «хеш-функции» фильтра Блума — детерминированные, чтобы ложные срабатывания воспроизводились. */
export const bloomHashes = (k) => [(k * 7 + 3) % BLOOM_BITS, (k * 11 + 5) % BLOOM_BITS];

let tableSeq = 0;
function makeTable(entries, level) {
  const bits = new Array(BLOOM_BITS).fill(0);
  for (const [k] of entries) for (const h of bloomHashes(k)) bits[h] = 1;
  return { id: ++tableSeq, level, entries, bits };
}

export class LSM {
  constructor(memLimit = 4) {
    tableSeq = 0;
    this.memLimit = memLimit;
    this.wal = [];
    this.mem = new Map();
    this.l0 = [];               // новые первыми
    this.l1 = [];               // не пересекаются, по порядку ключей
    this.userWrites = 0;
    this.diskWrites = 0;        // записей, физически записанных в SSTable
    this.lastReads = 0;
    this.version = 0;
    this.frames = [];
    this.frame({ text: "Пустое хранилище. Запись идёт в журнал и в memtable в памяти; на диске — неизменяемые отсортированные файлы SSTable." });
  }

  snapshot() {
    const t = (x) => ({ id: x.id, entries: x.entries.map((e) => e.slice()), bits: x.bits.slice() });
    return { wal: this.wal.slice(), mem: [...this.mem].sort((a, b) => a[0] - b[0]), l0: this.l0.map(t), l1: this.l1.map(t) };
  }

  frame({ hl = {}, text }) {
    this.frames.push({ ...this.snapshot(), hl, text, userWrites: this.userWrites, diskWrites: this.diskWrites, reads: this.lastReads });
  }

  write(k, v, verb) {
    this.userWrites++;
    this.wal.push([k, v]);
    this.frame({ hl: { wal: this.wal.length - 1 }, text: `${verb} ${k}: сначала дописываем в конец журнала (WAL) — последовательная запись, переживёт сбой.` });
    this.mem.set(k, v);
    this.frame({ hl: { mem: k }, text: v === TOMB
      ? `Удаление — это тоже запись: в memtable кладём надгробие ✝ для ${k}. Старые значения в файлах остаются до слияния.`
      : `Кладём ${k}=${v} в memtable — отсортированную структуру в памяти. Ответ клиенту уже можно отдавать.` });
    if (this.mem.size >= this.memLimit) this.flush();
  }

  put(k) { this.write(k, `v${++this.version}`, "Запись"); }
  del(k) { this.write(k, TOMB, "Удаление"); }

  flush() {
    const entries = [...this.mem].sort((a, b) => a[0] - b[0]);
    const t = makeTable(entries, 0);
    this.l0.unshift(t);
    this.diskWrites += entries.length;
    this.mem = new Map();
    this.wal = [];
    this.frame({ hl: { table: t.id }, text: `memtable заполнилась (${entries.length}) — сбрасываем её на диск целиком: новый SSTable №${t.id}, ключи уже отсортированы, запись одна и последовательная. Журнал больше не нужен — очищаем.` });
    if (this.l0.length >= L0_LIMIT) this.compact();
  }

  compact() {
    const inputs = [...this.l0, ...this.l1];
    const ids = inputs.map((t) => t.id);
    this.frame({ hl: { merging: ids }, text: `На уровне L0 ${this.l0.length} файла — их ключи пересекаются, и чтение проверяет каждый. Сливаем L0 с L1: это слияние отсортированных списков, как в сортировке слиянием.` });
    // Новое побеждает: L0 от новых к старым, потом L1.
    const merged = new Map();
    let dropped = 0, tombs = 0;
    for (const t of inputs) for (const [k, v] of t.entries) {
      if (merged.has(k)) { dropped++; continue; }
      merged.set(k, v);
    }
    const live = [...merged].filter(([, v]) => { if (v === TOMB) { tombs++; return false; } return true; }).sort((a, b) => a[0] - b[0]);
    this.l0 = [];
    this.l1 = [];
    for (let i = 0; i < live.length; i += TABLE_MAX) this.l1.push(makeTable(live.slice(i, i + TABLE_MAX), 1));
    this.diskWrites += live.length;
    this.frame({ hl: { tables: this.l1.map((t) => t.id) }, text: `Слияние готово: устаревших версий выброшено ${dropped}, надгробий вместе с удалёнными ключами — ${tombs}. На L1 файлы не пересекаются по ключам. Перезаписано ${live.length} записей — это и есть усиление записи.` });
  }

  get(k) {
    this.lastReads = 0;
    if (this.mem.has(k)) {
      const v = this.mem.get(k);
      this.frame({ hl: { mem: k, found: k }, text: v === TOMB ? `Чтение ${k}: в memtable надгробие — ключ удалён. Файлы на диске не трогаем.` : `Чтение ${k}: нашли в memtable — ${v}. Диск не понадобился.` });
      return v === TOMB ? null : v;
    }
    this.frame({ hl: { memMiss: true }, text: `Чтение ${k}: в memtable нет. Идём по файлам от новых к старым.` });
    for (const t of [...this.l0, ...this.l1]) {
      if (this.l1.includes(t) && !(t.entries[0][0] <= k && k <= t.entries.at(-1)[0])) continue;
      const maybe = bloomHashes(k).every((h) => t.bits[h]);
      if (!maybe) {
        this.frame({ hl: { bloomNo: t.id, bits: bloomHashes(k) }, text: `Файл №${t.id}: фильтр Блума — бит ${bloomHashes(k).find((h) => !t.bits[h])} не установлен, значит ${k} здесь точно нет. Файл не читаем.` });
        continue;
      }
      this.lastReads++;
      const e = t.entries.find(([x]) => x === k);
      if (!e) {
        this.frame({ hl: { bloomFalse: t.id, bits: bloomHashes(k) }, text: `Файл №${t.id}: фильтр сказал «возможно», прочитали — а ключа нет. Ложное срабатывание: биты ${bloomHashes(k).join(" и ")} выставили другие ключи.` });
        continue;
      }
      const [, v] = e;
      this.frame({ hl: { table: t.id, found: k, bits: bloomHashes(k) }, text: v === TOMB
        ? `Файл №${t.id}: надгробие — ключ ${k} удалён. Более старые файлы не смотрим. Прочитано файлов: ${this.lastReads}.`
        : `Файл №${t.id}: ${k}=${v}. Это самая свежая версия — старые файлы не смотрим. Прочитано файлов: ${this.lastReads}.` });
      return v === TOMB ? null : v;
    }
    this.frame({ hl: {}, text: `Ключа ${k} нет нигде. Прочитано файлов: ${this.lastReads} — остальные отсекли фильтры Блума и диапазоны ключей L1.` });
    return null;
  }
}

const STYLE = `
.layers { display: grid; gap: 8px; margin-top: 12px; }
.layer { display: grid; grid-template-columns: 110px 1fr; gap: 10px; align-items: start; background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; padding: 8px 10px; }
@container (max-width: 520px) { .layer { grid-template-columns: 1fr; } }
.layer h4 { margin: 2px 0 0; font-size: 13px; }
.layer h4 small { display: block; color: var(--w-faint); font-weight: 400; font-size: 11px; }
.items { display: flex; flex-wrap: wrap; gap: 6px; align-items: flex-start; min-height: 28px; }
.chip { font: 600 12px "JetBrains Mono", ui-monospace, monospace; padding: 3px 7px; border-radius: 6px; background: var(--w-surface-2); border: 1px solid var(--w-line-2); white-space: nowrap; }
.chip.tomb { color: var(--w-bad); }
.chip.hl { background: var(--w-accent); color: #fff; border-color: transparent; }
.chip.found { background: var(--w-good); color: #10121f; border-color: transparent; }
.table { border: 1px solid var(--w-line-2); border-radius: 9px; padding: 5px; background: var(--w-bg); display: grid; gap: 4px; }
.table .head { font-size: 11px; color: var(--w-muted); display: flex; justify-content: space-between; gap: 8px; }
.table .kv { display: flex; flex-wrap: wrap; gap: 3px; }
.table .kv .chip { padding: 1px 5px; font-size: 11px; }
.table.new { border-color: var(--w-teal); box-shadow: 0 0 0 1px var(--w-teal); }
.table.merging { border-color: var(--w-warm); box-shadow: 0 0 0 1px var(--w-warm); }
.table.skip { opacity: .45; }
.table.false { border-color: var(--w-bad); box-shadow: 0 0 0 1px var(--w-bad); }
.table.read { border-color: var(--w-good); box-shadow: 0 0 0 1px var(--w-good); }
.bits { display: flex; gap: 1px; }
.bits i { width: 6px; height: 8px; border-radius: 1px; background: var(--w-surface-2); }
.bits i.on { background: var(--w-accent-2); }
.bits i.q { outline: 1px solid var(--w-warm); }
.bits i.q.off { background: var(--w-bad); }
.counts { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 8px; }
.ops input { width: 70px; }
.empty { color: var(--w-faint); font-size: 12px; padding-top: 4px; }
`;

class SottoLsmTree extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.built = true;
    this.seed = Number(this.getAttribute("seed") || 4);
    this.memLimit = Math.max(2, Math.min(8, Number(this.getAttribute("memtable") || 4)));
    this.keyInput = el("input", { type: "number", min: "1", max: "40", placeholder: "ключ", "aria-label": "Ключ" });
    const op = (kind) => () => {
      const k = Math.round(Number(this.keyInput.value));
      if (this.keyInput.value === "" || !(k >= 1 && k <= 99)) return this.keyInput.focus();
      this.ops.push([kind, k]);
      this.#replay(true);
    };
    this.keyInput.addEventListener("keydown", (e) => { if (e.key === "Enter") op("put")(); });
    this.walBox = el("div", { class: "items" });
    this.memBox = el("div", { class: "items" });
    this.l0Box = el("div", { class: "items" });
    this.l1Box = el("div", { class: "items" });
    const layer = (title, sub, box) => el("div", { class: "layer" }, el("h4", {}, title, el("small", {}, sub)), box);
    this.counts = el("div", { class: "counts" });
    this.caption = el("div", { class: "caption", "aria-live": "polite" });
    this.player = new StepPlayer(this, (i) => this.#render(i));
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE),
      el("div", { class: "row ops" }, this.keyInput,
        el("button", { onclick: op("put") }, "Записать"),
        el("button", { onclick: op("del") }, "Удалить"),
        el("button", { onclick: op("get") }, "Прочитать"),
        el("button", { onclick: () => { this.seed++; this.#reset(); } }, "🎲 Другая нагрузка"),
        el("button", { onclick: () => { this.ops = []; this.#replay(false); } }, "Очистить")),
      el("div", { class: "layers" },
        layer("WAL", "журнал на диске", this.walBox),
        layer("memtable", `в памяти, до ${this.memLimit}`, this.memBox),
        layer("L0", "свежие SSTable, пересекаются", this.l0Box),
        layer("L1", "после слияния, не пересекаются", this.l1Box)),
      this.counts, this.caption,
      el("div", { class: "legend" },
        el("span", {}, el("i", { style: "background:var(--w-accent-2)" }), "бит фильтра Блума"),
        el("span", {}, el("i", { style: "outline:1px solid var(--w-warm);background:transparent" }), "биты проверяемого ключа"),
        el("span", {}, el("i", { style: "background:var(--w-teal)" }), "новый файл"),
        el("span", {}, el("i", { style: "background:var(--w-warm)" }), "сливаются"),
        el("span", {}, el("i", { style: "background:var(--w-bad)" }), "ложное срабатывание")),
      this.player.el);
    this.#reset();
    const step = this.getAttribute("step");
    if (step != null) this.player.go(Number(step));
  }

  #reset() {
    const rand = rng(this.seed);
    const key = () => 1 + Math.floor(rand() * 20);
    this.ops = [];
    for (let i = 0; i < 19; i++) this.ops.push([rand() < 0.15 && i > 3 ? "del" : "put", key()]);
    this.ops.push(["get", this.ops[2][1]], ["get", 33]);
    this.#replay(false);
  }

  #replay(jumpToLast) {
    const lsm = new LSM(this.memLimit);
    let lastStart = 0;
    for (const [op, k] of this.ops) {
      lastStart = lsm.frames.length;
      lsm[op](k);
    }
    this.frames = lsm.frames;
    this.player.load(this.frames.length, jumpToLast ? lastStart : 0);
    if (jumpToLast) this.player.play();
  }

  #render(index) {
    const f = this.frames[index];
    const hl = f.hl;
    const chip = (k, v, cls = "") => el("span", { class: `chip ${v === TOMB ? "tomb " : ""}${cls}` }, `${k}${v != null ? "=" + v : ""}`);
    this.walBox.replaceChildren(...(f.wal.length ? f.wal.map(([k, v], i) => chip(k, v, hl.wal === i ? "hl" : "")) : [el("span", { class: "empty" }, "пусто")]));
    this.memBox.replaceChildren(...(f.mem.length ? f.mem.map(([k, v]) => chip(k, v, hl.found === k && hl.mem === k ? "found" : hl.mem === k ? "hl" : "")) : [el("span", { class: "empty" }, "пусто")]));
    const table = (t) => {
      let cls = "table";
      if (hl.table === t.id && hl.found == null) cls += " new";
      if ((hl.tables || []).includes(t.id)) cls += " new";
      if ((hl.merging || []).includes(t.id)) cls += " merging";
      if (hl.bloomNo === t.id) cls += " skip";
      if (hl.bloomFalse === t.id) cls += " false";
      if (hl.table === t.id && hl.found != null) cls += " read";
      const q = hl.bits && (hl.bloomNo === t.id || hl.bloomFalse === t.id || (hl.table === t.id && hl.found != null)) ? new Set(hl.bits) : new Set();
      return el("div", { class: cls },
        el("div", { class: "head" }, el("span", {}, `SSTable №${t.id}`), el("span", { class: "bits", title: "фильтр Блума" }, ...t.bits.map((b, i) => el("i", { class: (b ? "on" : "") + (q.has(i) ? " q" + (b ? "" : " off") : "") })))),
        el("div", { class: "kv" }, ...t.entries.map(([k, v]) => chip(k, v, hl.table === t.id && hl.found === k ? "found" : ""))));
    };
    this.l0Box.replaceChildren(...(f.l0.length ? f.l0.map(table) : [el("span", { class: "empty" }, "нет файлов")]));
    this.l1Box.replaceChildren(...(f.l1.length ? f.l1.map(table) : [el("span", { class: "empty" }, "нет файлов")]));
    const amp = f.userWrites ? ((f.userWrites + f.diskWrites) / f.userWrites).toFixed(2) : "—";
    this.counts.innerHTML = `<span class="counter">записей от клиента <b>${f.userWrites}</b></span>` +
      `<span class="counter">записано в журнал и файлы <b>${f.userWrites + f.diskWrites}</b></span>` +
      `<span class="counter">усиление записи <b>${amp}×</b></span>` +
      `<span class="counter">файлов прочитано при последнем чтении <b>${f.reads}</b></span>`;
    this.caption.textContent = f.text;
  }
}

customElements.define("sotto-lsm-tree", SottoLsmTree);
