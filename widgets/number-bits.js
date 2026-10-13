// <sotto-number-bits> — число изнутри: биты целого в дополнительном коде и
// числа с плавающей точкой IEEE 754. По битам можно щёлкать.
//
//   <sotto-number-bits type="int8" value="-5"></sotto-number-bits>
//   <sotto-number-bits type="float64" value="0.1"></sotto-number-bits>
//
// Атрибуты: type (int8|int16|int32|float32|float64), value, theme.

import { BASE_STYLE, el } from "./core.js";

export const TYPES = {
  int8: { int: true, n: 8, title: "int8 (byte)" },
  int16: { int: true, n: 16, title: "int16 (short)" },
  int32: { int: true, n: 32, title: "int32 (int)" },
  float32: { int: false, n: 32, exp: 8, man: 23, title: "float32 (float)" },
  float64: { int: false, n: 64, exp: 11, man: 52, title: "float64 (double)" },
};

/** Битовая строка из BigInt-шаблона: старший бит первый. */
const toBits = (pattern, n) => Array.from({ length: n }, (_, i) => Number((pattern >> BigInt(n - 1 - i)) & 1n));
const fromBits = (bits) => bits.reduce((acc, b) => (acc << 1n) | BigInt(b), 0n);

/** Шаблон бит целого: значение по модулю 2ⁿ в дополнительном коде. */
export function intPattern(value, n) {
  return BigInt.asUintN(n, BigInt(value));
}

/** Знаковое значение по шаблону. */
export function intValue(pattern, n) {
  return BigInt.asIntN(n, pattern);
}

/** Шаблон бит числа с плавающей точкой. */
export function floatPattern(x, type) {
  const view = new DataView(new ArrayBuffer(8));
  if (type === "float32") { view.setFloat32(0, x); return BigInt(view.getUint32(0)); }
  view.setFloat64(0, x);
  return view.getBigUint64(0);
}

export function floatFromPattern(pattern, type) {
  const view = new DataView(new ArrayBuffer(8));
  if (type === "float32") { view.setUint32(0, Number(pattern)); return view.getFloat32(0); }
  view.setBigUint64(0, pattern);
  return view.getFloat64(0);
}

/** Разбор полей: знак, порядок, мантисса, класс числа и точное значение десятичной строкой. */
export function decodeFloat(pattern, type) {
  const { exp, man, n } = TYPES[type];
  const bias = (1 << (exp - 1)) - 1;
  const sign = Number(pattern >> BigInt(n - 1));
  const e = Number((pattern >> BigInt(man)) & ((1n << BigInt(exp)) - 1n));
  const m = pattern & ((1n << BigInt(man)) - 1n);
  const maxE = (1 << exp) - 1;
  let kind, mant, power;
  if (e === maxE) kind = m === 0n ? "inf" : "nan";
  else if (e === 0) { kind = m === 0n ? "zero" : "subnormal"; mant = m; power = 1 - bias - man; }
  else { kind = "normal"; mant = (1n << BigInt(man)) | m; power = e - bias - man; }
  const exact = kind === "inf" ? (sign ? "−∞" : "+∞") : kind === "nan" ? "NaN"
    : (sign ? "−" : "") + exactDecimal(mant, power);
  return { sign, e, m, bias, kind, exact, unbiased: kind === "normal" ? e - bias : kind === "subnormal" ? 1 - bias : null };
}

/** Точная десятичная запись mant × 2^power: двоичная дробь всегда конечна в десятичной системе. */
export function exactDecimal(mant, power) {
  if (mant === 0n) return "0";
  if (power >= 0) return (mant << BigInt(power)).toString();
  const k = -power;
  const digits = (mant * 5n ** BigInt(k)).toString().padStart(k + 1, "0");
  const int = digits.slice(0, -k), frac = digits.slice(-k).replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

/** Соседнее представимое число вверх (dir = 1) или вниз (dir = −1). */
export function nextFloat(x, type, dir) {
  if (Number.isNaN(x) || x === dir * Infinity) return x;
  if (x === 0) return dir * floatFromPattern(1n, type);
  const p = floatPattern(x, type);
  return floatFromPattern((x > 0) === (dir > 0) ? p + 1n : p - 1n, type);
}

/** Каноническая запись десятичного числа: «1e3», «1000» и «1000.0» совпадают. */
export function canonDecimal(s) {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(s).trim().replace("−", "-"));
  if (!m || (m[2] === "" && !m[3])) return null;
  let digits = (m[2] + (m[3] || "")).replace(/^0+/, "");
  let exp = Number(m[4] || 0) - (m[3] || "").length;
  if (!digits) return "0";
  while (digits.endsWith("0")) { digits = digits.slice(0, -1); exp++; }
  return (m[1] === "-" ? "-" : "") + digits + "e" + exp;
}

const toFloat = (x, type) => (type === "float32" ? Math.fround(x) : x);
/** Кратчайшая десятичная запись, которая читается обратно в то же число данного типа. */
export function shortest(x, type) {
  if (type !== "float32" || !Number.isFinite(x) || x === 0) return String(x);
  for (let p = 1; p <= 9; p++) {
    const s = String(Number(x.toPrecision(p)));
    if (Math.fround(Number(s)) === x) return s;
  }
  return String(x);
}
const fmt = (x, type) => (Object.is(x, -0) ? "−0" : Number.isNaN(x) ? "NaN" : x === Infinity ? "+∞" : x === -Infinity ? "−∞" : shortest(x, type).replace("-", "−"));
const big = (v) => v.toString().replace("-", "−");

const STYLE = `
.bits { display: flex; flex-wrap: wrap; gap: 8px 10px; margin-top: 14px; }
.nib { display: inline-flex; gap: 2px; }
.bit { width: 24px; height: 32px; border-radius: 6px; border: 1px solid var(--w-line-2); background: var(--w-surface);
       font: 600 14px "JetBrains Mono", ui-monospace, monospace; color: var(--w-text); padding: 0; min-width: 0;
       display: grid; place-items: center; position: relative; transition: transform .15s; }
.bit.on { background: var(--w-surface-2); }
.bit.on::after { content: ""; position: absolute; inset: auto 4px 3px; height: 2px; border-radius: 1px; background: var(--w-accent-2); }
.bit.sign { border-color: var(--w-bad); }
.bit.sign.on { background: color-mix(in srgb, var(--w-bad) 28%, var(--w-surface)); }
.bit.exp { border-color: var(--w-teal); }
.bit.exp.on { background: color-mix(in srgb, var(--w-teal) 30%, var(--w-surface)); }
.bit.man.on { background: color-mix(in srgb, var(--w-accent) 30%, var(--w-surface)); }
.bit.changed { box-shadow: 0 0 0 2px var(--w-warm); }
.bit small { position: absolute; top: 100%; margin-top: 2px; font: 9px "JetBrains Mono", monospace; color: var(--w-faint); white-space: nowrap; }
.bits.weights { row-gap: 22px; }
.facts { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin-top: 16px; font-size: 14px; }
.facts dt { color: var(--w-muted); }
.facts dd { margin: 0; font: 13px/1.5 "JetBrains Mono", ui-monospace, monospace; overflow-wrap: anywhere; }
.facts dd b { color: var(--w-warm); font-weight: 600; }
.ops { margin-top: 12px; }
.ops .sep { width: 1px; align-self: stretch; background: var(--w-line); margin: 0 4px; }
@container (max-width: 520px) { .bit { width: 19px; height: 28px; font-size: 12px; } .bits { gap: 6px; } }
`;

class SottoNumberBits extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    this.built = true;
    const type = TYPES[this.getAttribute("type")] ? this.getAttribute("type") : "int8";
    this.typeSel = el("select", { "aria-label": "Тип", onchange: () => this.#setType() },
      ...Object.entries(TYPES).map(([k, t]) => el("option", { value: k, selected: k === type }, t.title)));
    this.input = el("input", { type: "text", "aria-label": "Значение", style: "width:150px", inputmode: "decimal" });
    this.input.addEventListener("change", () => this.#fromInput());
    this.input.addEventListener("keydown", (e) => { if (e.key === "Enter") this.#fromInput(); });
    this.bitsBox = el("div", { class: "bits" });
    this.facts = el("dl", { class: "facts" });
    this.ops = el("div", { class: "row ops" });
    this.caption = el("div", { class: "caption", "aria-live": "polite" });
    this.legend = el("div", { class: "legend" });
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE),
      el("div", { class: "row" }, el("label", { class: "field" }, "тип", this.typeSel), el("label", { class: "field" }, "значение", this.input)),
      this.bitsBox, this.facts, this.ops, this.caption, this.legend);
    this.#setType(this.getAttribute("value"));
  }

  get #t() { return TYPES[this.typeSel.value]; }

  #setType(initial) {
    const t = this.#t;
    this.prev = null;
    if (t.int) {
      const v = initial != null ? initial : this.pattern != null && this.wasInt ? intValue(this.pattern, this.n) : -5n;
      this.n = t.n;
      this.#setInt(BigInt.asIntN(t.n, BigInt(v)), `Целое ${t.n} бит в дополнительном коде. Щёлкните по биту, чтобы его переключить.`);
    } else {
      const v = initial != null ? Number(initial) : 0.1;
      this.#setFloat(toFloat(v, this.typeSel.value), `${t.title}: знак, ${t.exp} бит порядка и ${t.man} бит мантиссы. Щёлкните по биту, чтобы его переключить.`);
    }
    this.wasInt = t.int;
    this.#buildOps();
  }

  #setInt(value, text) {
    this.prev = this.pattern;
    this.pattern = intPattern(value, this.n);
    this.input.value = big(value);
    this.text = text;
    this.#render();
  }

  #setFloat(x, text) {
    this.prev = this.pattern;
    this.x = x;
    this.pattern = floatPattern(x, this.typeSel.value);
    this.input.value = fmt(x, this.typeSel.value);
    this.text = text;
    this.#render();
  }

  #fromInput() {
    const raw = this.input.value.trim().replace("−", "-").replace(",", ".");
    const t = this.#t;
    if (t.int) {
      let v;
      try { v = BigInt(raw); } catch { this.caption.textContent = `«${this.input.value}» — не целое число.`; return; }
      const stored = BigInt.asIntN(t.n, v);
      this.#setInt(stored, stored === v ? `Записали ${big(v)}.`
        : `${big(v)} не помещается в ${t.n} бит (диапазон ${big(-(1n << BigInt(t.n - 1)))} … ${big((1n << BigInt(t.n - 1)) - 1n)}). Лишние старшие биты отброшены — хранится ${big(stored)}.`);
    } else {
      const x = Number(raw);
      if (raw === "" || (Number.isNaN(x) && raw.toLowerCase() !== "nan")) { this.caption.textContent = `«${this.input.value}» — не число.`; return; }
      const stored = toFloat(x, this.typeSel.value);
      const d = decodeFloat(floatPattern(stored, this.typeSel.value), this.typeSel.value);
      this.#setFloat(stored, d.kind === "nan" || d.kind === "inf" ? `Особое значение ${d.exact}.` : canonDecimal(d.exact) === canonDecimal(raw)
        ? `${raw} представимо точно — это двоичная дробь конечной длины.`
        : `${raw} точно не представимо: хранится ближайшее число ${d.exact}.`);
    }
  }

  #buildOps() {
    const t = this.#t;
    const b = (label, fn, title) => el("button", { onclick: fn, title: title || "" }, label);
    const sep = () => el("span", { class: "sep" });
    if (t.int) {
      const n = BigInt(t.n), max = (1n << (n - 1n)) - 1n, min = -(1n << (n - 1n));
      const cur = () => intValue(this.pattern, t.n);
      const wrap = (v, what) => {
        const stored = BigInt.asIntN(t.n, v);
        this.#setInt(stored, stored === v ? what : `${what} Результат ${big(v)} не помещается — переполнение, по модулю 2^${t.n} получилось ${big(stored)}.`);
      };
      this.ops.replaceChildren(
        b("+1", () => wrap(cur() + 1n, `${big(cur())} + 1.`)),
        b("−1", () => wrap(cur() - 1n, `${big(cur())} − 1.`)),
        b("~x", () => this.#setInt(BigInt.asIntN(t.n, ~cur()), `Инверсия всех бит: ~${big(cur())} = ${big(~cur())}. В дополнительном коде ~x = −x − 1.`)),
        b("−x", () => {
          const x = cur(), stored = BigInt.asIntN(t.n, -x);
          this.#setInt(stored, `−x = инвертировать биты и прибавить 1: ~${big(x)} = ${big(~x)}, плюс 1 = ${big(stored)}.` +
            (x === min ? ` У минимального числа нет положительной пары: −(${big(min)}) не помещается, и результат снова ${big(min)}. Поэтому abs(MIN_VALUE) < 0.` : ""));
        }),
        b("x << 1", () => wrap(cur() * 2n, `Сдвиг влево на 1 — умножение на 2.`)),
        b("x >> 1", () => this.#setInt(cur() >> 1n, `Арифметический сдвиг вправо: деление на 2 с округлением вниз, знаковый бит копируется. ${big(cur())} >> 1 = ${big(cur() >> 1n)}.`)),
        sep(),
        b("MAX", () => this.#setInt(max, `Максимум: все биты, кроме знакового, единицы — 2^${t.n - 1} − 1 = ${big(max)}.`)),
        b("MIN", () => this.#setInt(min, `Минимум: только знаковый бит — его вес −2^${t.n - 1} = ${big(min)}.`)),
        b("0", () => this.#setInt(0n, "Ноль: все биты нулевые. В дополнительном коде он один.")),
        b("все единицы", () => this.#setInt(-1n, "−1: все биты единицы. −2^" + (t.n - 1) + " + (2^" + (t.n - 1) + " − 1) = −1.")));
    } else {
      const type = this.typeSel.value;
      const set = (x, text) => this.#setFloat(toFloat(x, type), text);
      const exact = (x) => decodeFloat(floatPattern(toFloat(x, type), type), type).exact;
      this.ops.replaceChildren(
        b("0.1", () => set(0.1, `0.1 = 1/10, в знаменателе пятёрка — в двоичной системе дробь бесконечная (0.000110011…). Хранится ближайшее число.`)),
        b("0.2", () => set(0.2, `0.2 тоже не представимо точно.`)),
        b("0.1 + 0.2", () => {
          const s = toFloat(toFloat(0.1, type) + toFloat(0.2, type), type);
          set(s, s === toFloat(0.3, type)
            ? `В ${type} сумма округлилась ровно в то же число, что и 0.3 — здесь повезло.`
            : `Сумма приближений: ${exact(s)} — это не то же число, что 0.3 (${exact(0.3)}). Поэтому 0.1 + 0.2 ≠ 0.3.`);
        }),
        b("0.3", () => set(0.3, `0.3 хранится как ${exact(0.3)}.`)),
        b("0.5", () => set(0.5, `0.5 = 2⁻¹ — представимо точно, мантисса нулевая.`)),
        b(type === "float32" ? "2²⁴ + 1" : "2⁵³ + 1", () => {
          const p = type === "float32" ? 24 : 53;
          set(2 ** p + 1, `2^${p} + 1 не помещается в ${p} значащих бит — округлилось до ${fmt(toFloat(2 ** p + 1, type), type)}. Дальше целые представимы через одно.`);
        }),
        sep(),
        b("◀ соседнее", () => set(nextFloat(this.x, type, -1), `Предыдущее представимое число. Между ними других ${type} нет.`), "Ближайшее меньшее представимое число"),
        b("соседнее ▶", () => set(nextFloat(this.x, type, 1), `Следующее представимое число: разница — одна единица последнего разряда (ulp).`), "Ближайшее большее представимое число"),
        sep(),
        b("−0", () => set(-0, `Отрицательный ноль: только знаковый бит. Равен +0, но 1 / −0 = −∞.`)),
        b("∞", () => set(Infinity, `Бесконечность: порядок из одних единиц, мантисса нулевая. Получается при переполнении или делении на 0.`)),
        b("NaN", () => set(NaN, `NaN: порядок из одних единиц, мантисса не нулевая. NaN не равен ничему, даже себе.`)),
        b("мин. денорм.", () => set(floatFromPattern(1n, type), `Самое маленькое положительное: порядок нулевой — денормализованное число без неявной единицы.`)));
    }
  }

  #render() {
    const t = this.#t, type = this.typeSel.value;
    const bits = toBits(this.pattern, t.n);
    const prev = this.prev != null && this.prevType === type ? toBits(this.prev, t.n) : null;
    this.prevType = type;
    const showWeights = t.int && t.n <= 16;
    const nibbles = [];
    for (let i = 0; i < t.n; i += 4) {
      nibbles.push(el("span", { class: "nib" }, ...bits.slice(i, i + 4).map((bit, j) => {
        const idx = i + j, pos = t.n - 1 - idx;
        let cls = "bit" + (bit ? " on" : "");
        if (idx === 0) cls += " sign";
        else if (!t.int) cls += idx <= t.exp ? " exp" : " man";
        if (prev && prev[idx] !== bit) cls += " changed";
        const weight = idx === 0 && t.int ? `−2^${pos}` : `2^${pos}`;
        const title = t.int ? `бит ${pos}, вес ${idx === 0 ? "−" : ""}${2n ** BigInt(pos)}` : idx === 0 ? "знак" : idx <= t.exp ? `порядок, бит ${t.exp - idx}` : `мантисса, 2^−${idx - t.exp}`;
        return el("button", { class: cls, title, "aria-label": `${title}: ${bit}`, onclick: () => this.#flip(idx) },
          String(bit), showWeights && (t.n === 8 || pos % 4 === 3 || idx === 0) ? el("small", {}, t.n === 8 ? String(idx === 0 ? -(2 ** pos) : 2 ** pos) : weight) : null);
      })));
    }
    this.bitsBox.className = "bits" + (showWeights ? " weights" : "");
    this.bitsBox.replaceChildren(...nibbles);
    const row = (k, v) => [el("dt", {}, k), el("dd", {}, ...[].concat(v))];
    const hex = "0x" + this.pattern.toString(16).toUpperCase().padStart(t.n / 4, "0");
    if (t.int) {
      const v = intValue(this.pattern, t.n);
      const terms = bits.map((bit, i) => (bit ? (i === 0 ? -(2n ** BigInt(t.n - 1)) : 2n ** BigInt(t.n - 1 - i)) : null)).filter((x) => x != null);
      const sum = terms.length ? terms.map((x, i) => (i === 0 ? big(x) : x < 0 ? " − " + big(-x) : " + " + big(x))).join("") : "0";
      this.facts.replaceChildren(
        ...row("со знаком", el("b", {}, big(v))),
        ...row("без знака", big(this.pattern)),
        ...row("hex", hex),
        ...row("сумма весов", terms.length > 12 ? `${terms.length} единиц, старший бит ${bits[0] ? "даёт " + big(-(2n ** BigInt(t.n - 1))) : "0"}` : `${sum} = ${big(v)}`));
      this.legend.replaceChildren(el("span", {}, el("i", { style: "background:color-mix(in srgb, var(--w-bad) 28%, var(--w-surface));outline:1px solid var(--w-bad)" }), `знаковый бит: вес −2^${t.n - 1}`),
        el("span", {}, el("i", { style: "outline:2px solid var(--w-warm)" }), "изменились после операции"));
    } else {
      const d = decodeFloat(this.pattern, type);
      const x = floatFromPattern(this.pattern, type);
      this.x = x;
      const manBits = this.pattern & ((1n << BigInt(t.man)) - 1n);
      const formula = d.kind === "normal" ? `(−1)^${d.sign} × 1.${manBits.toString(2).padStart(t.man, "0").replace(/0+$/, "") || "0"}₂ × 2^${String(d.unbiased).replace("-", "−")}`
        : d.kind === "subnormal" ? `(−1)^${d.sign} × 0.${manBits.toString(2).padStart(t.man, "0").replace(/0+$/, "")}₂ × 2^${String(d.unbiased).replace("-", "−")} — денормализованное`
        : d.kind === "zero" ? "ноль: порядок и мантисса нулевые" : d.kind === "inf" ? "бесконечность: порядок из единиц, мантисса 0" : "NaN: порядок из единиц, мантисса не 0";
      const short = fmt(x, type);
      const isExact = d.kind === "zero" || d.kind === "inf" || d.kind === "nan" || canonDecimal(d.exact) === canonDecimal(shortest(x, type));
      const ulp = Number.isFinite(x) ? Math.abs(nextFloat(x, type, 1) - x) : NaN;
      this.facts.replaceChildren(
        ...row("значение", el("b", {}, short)),
        ...row("хранится точно", d.exact),
        ...row("поля", `знак ${d.sign}, порядок ${d.e}${d.unbiased != null ? ` (${d.e} − ${d.bias} = ${d.unbiased})` : ""}, мантисса 0x${manBits.toString(16).toUpperCase()}`),
        ...row("формула", formula),
        ...row("шаг сетки (ulp)", Number.isFinite(ulp) ? `${ulp.toExponential(3).replace("-", "−")} — ${isExact ? "соседние числа отстоят на столько" : "ошибка хранения меньше половины шага"}` : "—"),
        ...row("hex", hex));
      this.legend.replaceChildren(
        el("span", {}, el("i", { style: "background:color-mix(in srgb, var(--w-bad) 28%, var(--w-surface));outline:1px solid var(--w-bad)" }), "знак"),
        el("span", {}, el("i", { style: "background:color-mix(in srgb, var(--w-teal) 30%, var(--w-surface));outline:1px solid var(--w-teal)" }), `порядок, ${t.exp} бит, смещение ${d.bias}`),
        el("span", {}, el("i", { style: "background:color-mix(in srgb, var(--w-accent) 30%, var(--w-surface))" }), `мантисса, ${t.man} бит + неявная 1`),
        el("span", {}, el("i", { style: "outline:2px solid var(--w-warm)" }), "изменились"));
    }
    this.caption.textContent = this.text;
  }

  #flip(idx) {
    const t = this.#t;
    const p = this.pattern ^ (1n << BigInt(t.n - 1 - idx));
    if (t.int) {
      const v = intValue(p, t.n);
      this.#setInt(v, idx === 0 ? `Переключили знаковый бит: значение сдвинулось на 2^${t.n - 1} — теперь ${big(v)}.` : `Переключили бит ${t.n - 1 - idx} (вес ${2n ** BigInt(t.n - 1 - idx)}): теперь ${big(v)}.`);
    } else {
      const x = floatFromPattern(p, this.typeSel.value);
      this.#setFloat(x, idx === 0 ? "Знак сменился — остальные поля те же." : idx <= t.exp ? `Бит порядка: число умножилось или разделилось на степень двойки — теперь ${fmt(x, this.typeSel.value)}.` : `Бит мантиссы 2^−${idx - t.exp}: значение сдвинулось на маленькую долю — теперь ${fmt(x, this.typeSel.value)}.`);
    }
  }
}

customElements.define("sotto-number-bits", SottoNumberBits);
