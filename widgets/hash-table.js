// <sotto-hash-table> — хеш-таблица по шагам.
//
//   <sotto-hash-table></sotto-hash-table>
//   <sotto-hash-table mode="probing" hash="bad" preset="collisions"></sotto-hash-table>
//
// Атрибуты: mode (chaining|probing), hash (good|bad), capacity (4|8|16),
// preset (fruits|cities|collisions), step, theme.
// Вставка, поиск и удаление — кнопками; таблица растёт вдвое при загрузке > 0,75.

import { BASE_STYLE, StepPlayer, el } from "./core.js";

const LOAD_LIMIT = 0.75;

const HASHES = {
  good: {
    name: "полиномиальная (×31)",
    // Как String.hashCode в Java, но беззнаковая: h = h·31 + код символа (mod 2³²).
    fn: (key) => { let h = 0; for (const ch of key) h = (Math.imul(h, 31) + ch.codePointAt(0)) >>> 0; return h; },
    formula: "h = h·31 + код символа",
  },
  bad: {
    name: "плохая: длина строки",
    fn: (key) => [...key].length,
    formula: "h = длина ключа",
  },
};

const PRESETS = {
  fruits: { name: "фрукты", keys: ["apple", "banana", "cherry", "kiwi", "lemon", "mango"] },
  cities: { name: "города", keys: ["Москва", "Казань", "Сочи", "Омск", "Тула", "Пермь", "Самара"] },
  collisions: { name: "одинаковой длины", keys: ["cat", "dog", "owl", "fox", "bee", "ant"] },
};

/**
 * Модель таблицы. Все операции пишут кадры: снимок корзин + что подсветить +
 * пояснение. chaining — список ключей в корзине; probing — один ключ в ячейке,
 * удалённые помечаются надгробием (tombstone), чтобы не рвать цепочку поиска.
 */
class Table {
  constructor(mode, hash, capacity) {
    this.mode = mode;
    this.hash = HASHES[hash];
    this.capacity = capacity;
    this.size = 0;
    this.slots = this.#empty(capacity);
    this.frames = [];
    this.frame({ text: "Пустая таблица. Вставьте ключ или запустите заготовленные операции." });
  }

  #empty(n) { return this.mode === "chaining" ? Array.from({ length: n }, () => []) : new Array(n).fill(null); }

  frame({ bucket = -1, probe = [], hit = null, collide = null, text, op = null }) {
    this.frames.push({
      slots: this.slots.map((s) => (Array.isArray(s) ? s.slice() : s && { ...s })),
      capacity: this.capacity, size: this.size, bucket, probe, hit, collide, text, op,
    });
  }

  index(key) {
    const h = this.hash.fn(key);
    return { h, i: h % this.capacity };
  }

  #hashText(key, h, i) {
    return `hash("${key}") = ${h} (${this.hash.formula}); ${h} mod ${this.capacity} = ${i}.`;
  }

  insert(key, op) {
    const { h, i } = this.index(key);
    this.frame({ bucket: i, op, text: `Вставка «${key}». ${this.#hashText(key, h, i)}` });
    if (this.mode === "chaining") {
      const chain = this.slots[i];
      if (chain.includes(key)) {
        this.frame({ bucket: i, hit: key, text: `«${key}» уже есть в корзине ${i} — значение обновляется, размер не меняется.` });
        return;
      }
      if (chain.length) {
        this.frame({ bucket: i, collide: chain.slice(), text: `Коллизия: в корзине ${i} уже ${chain.join(", ")}. Добавляем в конец цепочки.` });
      }
      chain.push(key);
      this.size++;
      this.frame({ bucket: i, hit: key, text: `«${key}» в корзине ${i}. Загрузка ${this.size}/${this.capacity} = ${(this.size / this.capacity).toFixed(2)}.` });
    } else {
      const probe = [];
      let tomb = -1;
      for (let k = 0; k < this.capacity; k++) {
        const j = (i + k) % this.capacity;
        probe.push(j);
        const s = this.slots[j];
        if (s && !s.tomb && s.key === key) {
          this.frame({ bucket: j, probe: probe.slice(), hit: key, text: `«${key}» уже лежит в ячейке ${j} — обновляем значение.` });
          return;
        }
        if (s && s.tomb && tomb < 0) tomb = j;
        if (!s) {
          const place = tomb >= 0 ? tomb : j;
          this.slots[place] = { key };
          this.size++;
          this.frame({ bucket: place, probe: probe.slice(), hit: key,
            text: (tomb >= 0 ? `Кладём «${key}» на место надгробия в ячейке ${place}.` : `Ячейка ${j} свободна — кладём «${key}».`) +
              ` Загрузка ${this.size}/${this.capacity} = ${(this.size / this.capacity).toFixed(2)}.` });
          break;
        }
        this.frame({ bucket: j, probe: probe.slice(), collide: [s.tomb ? "надгробие" : s.key],
          text: s.tomb ? `Ячейка ${j} — надгробие удалённого ключа: запомним её и проверим дальше, нет ли «${key}».`
                       : `Ячейка ${j} занята «${s.key}» — коллизия, линейное пробирование: смотрим ${(j + 1) % this.capacity}.` });
        if (k === this.capacity - 1 && tomb >= 0) {
          // Свободных нет, но было надгробие — занимаем его.
          this.slots[tomb] = { key };
          this.size++;
          this.frame({ bucket: tomb, probe: probe.slice(), hit: key, text: `Свободных ячеек нет — кладём «${key}» на место надгробия ${tomb}.` });
        }
      }
    }
    if (this.size / this.capacity > LOAD_LIMIT) this.#resize();
  }

  #resize() {
    const keys = this.mode === "chaining" ? this.slots.flat() : this.slots.filter((s) => s && !s.tomb).map((s) => s.key);
    this.frame({ text: `Загрузка ${(this.size / this.capacity).toFixed(2)} > ${LOAD_LIMIT}: таблица слишком плотная — удваиваем до ${this.capacity * 2} корзин и переносим все ключи.` });
    this.capacity *= 2;
    this.slots = this.#empty(this.capacity);
    this.size = 0;
    for (const key of keys) {
      const { h, i } = this.index(key);
      if (this.mode === "chaining") this.slots[i].push(key);
      else { let j = i; while (this.slots[j]) j = (j + 1) % this.capacity; this.slots[j] = { key }; }
      this.size++;
      this.frame({ bucket: this.mode === "chaining" ? i : this.slots.findIndex((s) => s && s.key === key), hit: key,
        text: `Переносим «${key}»: ${h} mod ${this.capacity} = ${i}. Индекс зависит от размера, поэтому ключи переезжают.` });
    }
    this.frame({ text: `Расширение закончено: ${this.size} ${this.size === 1 ? "ключ" : "ключей"} в ${this.capacity} корзинах, загрузка ${(this.size / this.capacity).toFixed(2)}. Дорого, но редко — поэтому вставка амортизированно O(1).` });
  }

  find(key, op) {
    const { h, i } = this.index(key);
    this.frame({ bucket: i, op, text: `Поиск «${key}». ${this.#hashText(key, h, i)}` });
    if (this.mode === "chaining") {
      const chain = this.slots[i];
      for (const k of chain) {
        if (k === key) { this.frame({ bucket: i, hit: key, text: `Нашли «${key}» в корзине ${i}: сравнили ключи по цепочке.` }); return; }
        this.frame({ bucket: i, collide: [k], text: `В корзине ${i}: «${k}» ≠ «${key}», идём дальше по цепочке.` });
      }
      this.frame({ bucket: i, text: `В корзине ${i} нет «${key}» — ключа в таблице нет. Другие корзины не смотрели.` });
    } else {
      const probe = [];
      for (let k = 0; k < this.capacity; k++) {
        const j = (i + k) % this.capacity;
        probe.push(j);
        const s = this.slots[j];
        if (!s) { this.frame({ bucket: j, probe: probe.slice(), text: `Ячейка ${j} пуста — дальше «${key}» быть не может: ключа нет.` }); return; }
        if (!s.tomb && s.key === key) { this.frame({ bucket: j, probe: probe.slice(), hit: key, text: `Нашли «${key}» в ячейке ${j}.` }); return; }
        this.frame({ bucket: j, probe: probe.slice(), collide: [s.tomb ? "надгробие" : s.key],
          text: s.tomb ? `Ячейка ${j} — надгробие: поиск не останавливается, идём дальше.` : `В ячейке ${j} «${s.key}» — не то, пробуем следующую.` });
      }
      this.frame({ text: `Обошли всю таблицу — «${key}» нет.` });
    }
  }

  remove(key, op) {
    const { h, i } = this.index(key);
    this.frame({ bucket: i, op, text: `Удаление «${key}». ${this.#hashText(key, h, i)}` });
    if (this.mode === "chaining") {
      const chain = this.slots[i];
      const at = chain.indexOf(key);
      if (at < 0) { this.frame({ bucket: i, text: `«${key}» в корзине ${i} нет — удалять нечего.` }); return; }
      chain.splice(at, 1);
      this.size--;
      this.frame({ bucket: i, text: `Убрали «${key}» из цепочки корзины ${i}.` });
    } else {
      const probe = [];
      for (let k = 0; k < this.capacity; k++) {
        const j = (i + k) % this.capacity;
        probe.push(j);
        const s = this.slots[j];
        if (!s) { this.frame({ bucket: j, probe: probe.slice(), text: `Дошли до пустой ячейки ${j} — «${key}» нет.` }); return; }
        if (!s.tomb && s.key === key) {
          this.slots[j] = { key, tomb: true };
          this.size--;
          this.frame({ bucket: j, probe: probe.slice(), text: `Ставим в ячейку ${j} надгробие вместо «${key}». Просто очистить нельзя: оборвётся цепочка поиска для ключей, лежащих дальше.` });
          return;
        }
        this.frame({ bucket: j, probe: probe.slice(), collide: [s.tomb ? "надгробие" : s.key], text: `В ячейке ${j} не «${key}» — идём дальше.` });
      }
    }
  }
}

const STYLE = `
.table { margin-top: 12px; display: grid; gap: 4px; }
.slot { display: grid; grid-template-columns: 34px 1fr; align-items: center; gap: 8px; min-height: 34px;
        padding: 3px 8px; border-radius: 8px; background: var(--w-surface); border: 1px solid var(--w-line); }
.slot.current { border-color: var(--w-accent); box-shadow: 0 0 0 1px var(--w-accent); }
.slot.probed { background: color-mix(in srgb, var(--w-teal) 14%, var(--w-surface)); }
.slot .idx { color: var(--w-faint); font: 12px/1 "JetBrains Mono", ui-monospace, monospace; text-align: right; }
.chain { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.key { font: 13px/1 "JetBrains Mono", ui-monospace, monospace; padding: 5px 9px; border-radius: 6px;
       background: var(--w-surface-2); border: 1px solid var(--w-line-2); }
.key.hit { background: var(--w-good); color: #10121f; border-color: transparent; font-weight: 700; }
.key.collide { background: var(--w-warm); color: #10121f; border-color: transparent; }
.key.tomb { color: var(--w-faint); border-style: dashed; text-decoration: line-through; }
.arrow { color: var(--w-faint); }
.empty { color: var(--w-faint); font-size: 12px; }
.meter { margin-top: 10px; display: grid; gap: 4px; }
.meter .track { height: 8px; border-radius: 99px; background: var(--w-surface-2); position: relative; overflow: hidden; }
.meter .fill { position: absolute; inset: 0 auto 0 0; background: var(--w-accent); border-radius: 99px; transition: width .15s; }
.meter .fill.high { background: var(--w-warm); }
.meter .limit { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--w-text); opacity: .6; left: 75%; }
.ops input { width: 140px; }
`;

class SottoHashTable extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.built = true;
    this.#build();
    this.#reset(true);
    const step = this.getAttribute("step");
    if (step != null) this.player.go(Number(step));
  }

  #build() {
    const select = (label, options, value, onchange) => el("label", { class: "field" }, label,
      el("select", { "aria-label": label, onchange },
        Object.entries(options).map(([k, v]) => el("option", { value: k, selected: k === value }, typeof v === "string" ? v : v.name))));
    this.modeField = select("коллизии", { chaining: "цепочки", probing: "открытая адресация" },
      this.getAttribute("mode") || "chaining", () => this.#reset(true));
    this.hashField = select("хеш", HASHES, this.getAttribute("hash") || "good", () => this.#reset(true));
    this.capField = select("начальный размер", { 4: "4", 8: "8", 16: "16" }, this.getAttribute("capacity") || "8", () => this.#reset(true));
    this.presetField = select("ключи", PRESETS, this.getAttribute("preset") || "fruits", () => this.#reset(true));

    this.keyInput = el("input", { type: "text", placeholder: "ключ, например pear", "aria-label": "Ключ", maxlength: "16" });
    const op = (kind) => () => {
      const key = this.keyInput.value.trim();
      if (!key) return this.keyInput.focus();
      this.ops.push([kind, key]);
      this.#replay(true);
    };
    this.keyInput.addEventListener("keydown", (e) => { if (e.key === "Enter") op("insert")(); });
    const controls = el("div", { class: "row" }, this.modeField, this.hashField, this.capField, this.presetField);
    const ops = el("div", { class: "row ops", style: "margin-top:8px" }, this.keyInput,
      el("button", { onclick: op("insert") }, "Вставить"),
      el("button", { onclick: op("find") }, "Найти"),
      el("button", { onclick: op("remove") }, "Удалить"),
      el("button", { title: "Только заготовленные вставки", onclick: () => this.#reset(true) }, "Сбросить"));

    this.tableEl = el("div", { class: "table", role: "img" });
    this.meterText = el("div", { class: "counter" });
    this.meterFill = el("div", { class: "fill" });
    const meter = el("div", { class: "meter" }, this.meterText, el("div", { class: "track" }, this.meterFill, el("div", { class: "limit", title: "порог 0,75" })));
    this.caption = el("div", { class: "caption", "aria-live": "polite" });
    const legend = el("div", { class: "legend" },
      el("span", {}, el("i", { style: "background:transparent;border:2px solid var(--w-accent)" }), "текущая корзина"),
      el("span", {}, el("i", { style: "background:color-mix(in srgb, var(--w-teal) 40%, var(--w-surface))" }), "просмотрена при пробировании"),
      el("span", {}, el("i", { style: "background:var(--w-warm)" }), "коллизия"),
      el("span", {}, el("i", { style: "background:var(--w-good)" }), "найден / вставлен"));

    this.player = new StepPlayer(this, (i) => this.#render(i));
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE), controls, ops, this.tableEl, meter, this.caption, legend, this.player.el);
  }

  #value(field) { return field.querySelector("select").value; }

  #reset() {
    this.ops = PRESETS[this.#value(this.presetField)].keys.map((k) => ["insert", k]);
    this.#replay(false);
  }

  /** Переигрывает все операции с нуля: шаги назад и смена настроек работают одинаково. */
  #replay(jumpToLast) {
    const table = new Table(this.#value(this.modeField), this.#value(this.hashField), Number(this.#value(this.capField)));
    let lastStart = 0;
    for (const [kind, key] of this.ops) {
      lastStart = table.frames.length;
      table[kind](key, kind);
    }
    this.frames = table.frames;
    this.player.load(this.frames.length, jumpToLast ? lastStart : 0);
    if (jumpToLast) this.player.play();
  }

  #render(index) {
    const f = this.frames[index];
    const probe = new Set(f.probe);
    const collide = new Set(f.collide || []);
    this.tableEl.replaceChildren(...f.slots.map((s, i) => {
      let cls = "slot";
      if (i === f.bucket) cls += " current";
      if (probe.has(i)) cls += " probed";
      let content;
      if (Array.isArray(s)) {
        content = s.length
          ? el("div", { class: "chain" }, s.flatMap((k, j) => [
              j ? el("span", { class: "arrow" }, "→") : null,
              el("span", { class: "key" + (k === f.hit && i === f.bucket ? " hit" : collide.has(k) && i === f.bucket ? " collide" : "") }, k)]))
          : el("span", { class: "empty" }, "пусто");
      } else if (s) {
        const cls2 = s.tomb ? " tomb" : s.key === f.hit && i === f.bucket ? " hit" : (collide.has(s.key) || (s.tomb && collide.has("надгробие"))) && i === f.bucket ? " collide" : "";
        content = el("div", { class: "chain" }, el("span", { class: "key" + cls2, title: s.tomb ? "надгробие удалённого ключа" : "" }, s.key));
      } else {
        content = el("span", { class: "empty" }, "пусто");
      }
      return el("div", { class: cls }, el("span", { class: "idx" }, String(i)), content);
    }));
    const load = f.size / f.capacity;
    this.meterText.innerHTML = `ключей <b>${f.size}</b> · корзин <b>${f.capacity}</b> · загрузка <b>${load.toFixed(2)}</b> · порог расширения <b>${LOAD_LIMIT}</b>`;
    this.meterFill.style.width = `${Math.min(100, load * 100)}%`;
    this.meterFill.classList.toggle("high", load > LOAD_LIMIT);
    this.caption.textContent = f.text;
    this.tableEl.setAttribute("aria-label", `Хеш-таблица: ${f.size} ключей в ${f.capacity} корзинах`);
  }
}

customElements.define("sotto-hash-table", SottoHashTable);
export { Table, HASHES, PRESETS };
