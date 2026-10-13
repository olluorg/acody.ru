// <sotto-go-slices> — срезы Go по шагам: базовые массивы, у каждого среза
// указатель, длина и ёмкость. Видно, когда append пишет в общий массив, а
// когда выделяет новый, и как растёт ёмкость (правило Go 1.20+ с
// округлением до классов размеров аллокатора, элементы int по 8 байт).
//
//   <sotto-go-slices scenario="shared"></sotto-go-slices>
//
// Атрибуты: scenario (shared | growth | func), step, theme.

import { BASE_STYLE, el, StepPlayer } from "./core.js";

// Классы размеров аллокатора Go (байты), runtime/sizeclasses.go.
const SIZE_CLASSES = [8, 16, 24, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256, 288, 320, 352,
  384, 416, 448, 480, 512, 576, 640, 704, 768, 896, 1024, 1152, 1280, 1408, 1536, 1792, 2048, 2304, 2688, 3072, 3200,
  3456, 4096, 4864, 5376, 6144, 6528, 6784, 6912, 8192, 9472, 9728, 10240, 10880, 12288, 13568, 14336, 16384, 18432,
  19072, 20480, 21760, 24576, 27264, 28672, 32768];
const PAGE = 8192;

/** Новая ёмкость при append (runtime.growslice, Go 1.20+), elem — размер элемента в байтах. */
export function growCap(oldCap, newLen, elem = 8) {
  let cap = oldCap;
  const double = cap + cap;
  if (newLen > double) cap = newLen;
  else if (oldCap < 256) cap = double;
  else {
    while (cap < newLen) cap += (cap + 3 * 256) >> 2;
  }
  const bytes = cap * elem;
  const rounded = bytes <= 32768 ? SIZE_CLASSES.find((c) => c >= bytes) : Math.ceil(bytes / PAGE) * PAGE;
  return Math.floor(rounded / elem);
}

// Сценарий — строки кода и операции:
//   {line, make: [name, len, cap]}  {line, lit: [name, ...values]}  {line, nil: name}
//   {line, slice: [name, src, lo, hi, max?]}  {line, append: [dst, src, ...values]}
//   {line, set: [name, index, value]}  {line, alias: [name, src]} — копия заголовка (передача в функцию)
export const SCENARIOS = {
  shared: {
    title: "Общий массив",
    source: [
      "a := make([]int, 3, 5)",
      "b := a[:2]",
      "b = append(b, 99)      // места хватает — пишет в a[2]",
      "c := a[:2:2]           // ёмкость ограничена",
      "c = append(c, 7)       // новый массив",
      "a[0] = 1               // видно в b, но не в c",
    ],
    ops: [
      { line: 0, make: ["a", 3, 5] },
      { line: 1, slice: ["b", "a", 0, 2] },
      { line: 2, append: ["b", "b", 99] },
      { line: 3, slice: ["c", "a", 0, 2, 2] },
      { line: 4, append: ["c", "c", 7] },
      { line: 5, set: ["a", 0, 1] },
    ],
  },
  growth: {
    title: "Рост ёмкости",
    source: [
      "var s []int",
      "for i := 1; i <= 9; i++ {",
      "    s = append(s, i)",
      "}",
      "t := []int{1, 2}",
      "t = append(t, 3, 4, 5)  // нужно 5 > 2×2 → cap 5 → округление до 6",
    ],
    ops: [
      { line: 0, nil: "s" },
      ...Array.from({ length: 9 }, (_, i) => ({ line: 2, append: ["s", "s", i + 1] })),
      { line: 4, lit: ["t", 1, 2] },
      { line: 5, append: ["t", "t", 3, 4, 5] },
    ],
  },
  func: {
    title: "append в функции",
    source: [
      "func add(s []int) { s = append(s, 4) }",
      "",
      "x := []int{1, 2, 3}        // cap 3",
      "add(x)                     // s — копия заголовка",
      "                           // массив новый, x не изменился",
      "y := make([]int, 3, 10)",
      "add(y)                     // запись в общий массив,",
      "                           // но len(y) по-прежнему 3",
      "y = y[:4]                  // четвёртый элемент «появился»",
    ],
    ops: [
      { line: 2, lit: ["x", 1, 2, 3] },
      { line: 3, alias: ["s", "x"] },
      { line: 0, append: ["s", "s", 4] },
      { line: 4, drop: "s" },
      { line: 5, make: ["y", 3, 10] },
      { line: 6, alias: ["s", "y"] },
      { line: 0, append: ["s", "s", 4] },
      { line: 7, drop: "s" },
      { line: 8, slice: ["y", "y", 0, 4] },
    ],
  },
};

const hdr = (v) => (v.arr == null ? "nil" : `len ${v.len}, cap ${v.cap}`);

/** След: кадры {arrays: [{id, cells}], vars: {name: {arr, off, len, cap}}, touched, line, text}. */
export function simulate(scenario) {
  const arrays = [];
  const vars = {};
  const frames = [];
  const newArray = (cap) => { arrays.push({ id: arrays.length, cells: Array(cap).fill(0) }); return arrays.length - 1; };
  const snap = (line, text, touched = []) => frames.push({
    arrays: arrays.map((a) => ({ id: a.id, cells: [...a.cells] })),
    vars: JSON.parse(JSON.stringify(vars)), touched, line, text,
  });

  snap(-1, "Срез — заголовок из трёх полей: указатель на базовый массив, длина и ёмкость.");
  for (const op of scenario.ops) {
    if (op.make) {
      const [n, len, cap] = op.make;
      vars[n] = { arr: newArray(cap), off: 0, len, cap };
      snap(op.line, `make выделяет массив на ${cap} элементов; ${n}: ${hdr(vars[n])}.`);
    } else if (op.lit) {
      const [n, ...vals] = op.lit;
      const id = newArray(vals.length);
      vals.forEach((v, i) => { arrays[id].cells[i] = v; });
      vars[n] = { arr: id, off: 0, len: vals.length, cap: vals.length };
      snap(op.line, `Литерал создаёт массив ровно под элементы: ${n}: ${hdr(vars[n])}.`);
    } else if (op.nil) {
      vars[op.nil] = { arr: null, off: 0, len: 0, cap: 0 };
      snap(op.line, `${op.nil} — nil-срез: массива нет, len и cap равны 0, append работает.`);
    } else if (op.alias) {
      const [n, src] = op.alias;
      vars[n] = { ...vars[src] };
      snap(op.line, `Аргумент передаётся по значению: ${n} — копия заголовка ${src}, указывает на тот же массив.`);
    } else if (op.drop) {
      delete vars[op.drop];
      snap(op.line, `Функция вернулась — её копия заголовка исчезла.`);
    } else if (op.slice) {
      const [n, src, lo, hi, max] = op.slice;
      const s = vars[src];
      const cap = (max ?? s.cap) - lo;
      vars[n] = { arr: s.arr, off: s.off + lo, len: hi - lo, cap };
      snap(op.line, max != null
        ? `${n} := ${src}[${lo}:${hi}:${max}] — третий индекс ограничил ёмкость до ${cap}: следующий append обязан выделить новый массив.`
        : `${n} := ${src}[${lo}:${hi}] — новый заголовок над тем же массивом: len ${hi - lo}, ёмкость унаследована — ${cap}.`);
    } else if (op.append) {
      const [dst, src, ...vals] = op.append;
      const s = vars[src];
      const need = s.len + vals.length;
      if (s.arr != null && need <= s.cap) {
        const touched = vals.map((v, i) => { arrays[s.arr].cells[s.off + s.len + i] = v; return [s.arr, s.off + s.len + i]; });
        vars[dst] = { arr: s.arr, off: s.off, len: need, cap: s.cap };
        const others = Object.keys(vars).filter((k) => k !== dst && vars[k].arr === s.arr);
        snap(op.line, `Ёмкости хватает (${need} ≤ ${s.cap}): append пишет прямо в тот же массив${others.length ? ` — это видно всем срезам над ним (${others.join(", ")})` : ""}.`, touched);
      } else {
        const cap = growCap(s.cap, need);
        const id = newArray(cap);
        for (let i = 0; i < s.len; i++) arrays[id].cells[i] = arrays[s.arr].cells[s.off + i];
        vals.forEach((v, i) => { arrays[id].cells[s.len + i] = v; });
        vars[dst] = { arr: id, off: 0, len: need, cap };
        const why = s.cap === 0 ? "массива нет" : need > 2 * s.cap ? `нужно ${need} > 2×${s.cap}` : s.cap < 256 ? `ёмкость удваивается: ${s.cap} → ${2 * s.cap}` : "рост на ~25%";
        snap(op.line, `Ёмкости не хватает (${need} > ${s.cap}): новый массив, ${why}${cap !== Math.max(need, 2 * s.cap) && s.cap < 256 ? `, с округлением до класса размера — ${cap}` : ""}; скопировано ${s.len}. ${dst}: ${hdr(vars[dst])}.`,
          vals.map((_, i) => [id, s.len + i]));
      }
    } else if (op.set) {
      const [n, i, v] = op.set;
      const s = vars[n];
      arrays[s.arr].cells[s.off + i] = v;
      const sees = Object.keys(vars).filter((k) => vars[k].arr === s.arr && s.off + i >= vars[k].off && s.off + i < vars[k].off + vars[k].len);
      snap(op.line, `Запись в общий массив видна через все срезы, чья длина её покрывает: ${sees.join(", ")}.`, [[s.arr, s.off + i]]);
    }
  }
  return frames;
}

const STYLE = `
.presets { display: flex; gap: 6px; flex-wrap: wrap; }
.presets button.on { background: var(--w-accent); color: #fff; border-color: transparent; }
.grid { display: grid; gap: 12px; margin-top: 12px; }
.panel { background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; padding: 8px 10px; min-width: 0; overflow-x: auto; }
.panel h4 { margin: 0 0 6px; font-size: 12px; color: var(--w-muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
pre { margin: 0; font: 13px/1.6 "JetBrains Mono", ui-monospace, monospace; white-space: pre; }
pre .ln { display: block; padding: 0 6px; border-radius: 6px; }
pre .ln.cur { background: color-mix(in srgb, var(--w-accent) 28%, transparent); }
.arr { margin-bottom: 14px; }
.arr .tag { font-size: 12px; color: var(--w-faint); margin-bottom: 3px; }
.cells { display: grid; grid-auto-flow: column; grid-auto-columns: 34px; gap: 3px; }
.cell { height: 30px; border-radius: 6px; display: grid; place-items: center; font: 13px "JetBrains Mono", ui-monospace, monospace;
        background: var(--w-surface-2); border: 1px solid var(--w-line); }
.cell.hot { border-color: var(--w-warm); box-shadow: 0 0 0 1px var(--w-warm) inset; }
.cell.idx { background: none; border: none; height: 14px; font-size: 10px; color: var(--w-faint); }
.bar { height: 18px; position: relative; margin-top: 3px; }
.bar .len, .bar .cap { position: absolute; top: 0; height: 18px; border-radius: 5px; font-size: 11px; line-height: 18px; padding: 0 5px; white-space: nowrap; }
.bar .len { background: color-mix(in srgb, var(--c) 35%, transparent); border: 1px solid var(--c); color: var(--w-text); }
.bar .cap { border: 1px dashed var(--c); }
.dead { color: var(--w-faint); font-size: 12px; }
`;
const COLORS = ["var(--w-accent-2)", "var(--w-teal)", "var(--w-warm)", "var(--w-good)", "var(--w-bad)"];
const CELL = 37;

class SottoGoSlices extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    this.built = true;
    this.key = SCENARIOS[this.getAttribute("scenario")] ? this.getAttribute("scenario") : "shared";
    this.presets = el("div", { class: "presets" }, ...Object.entries(SCENARIOS).map(([k, s]) =>
      el("button", { "data-k": k, onclick: () => this.#load(k) }, s.title)));
    this.code = el("pre");
    this.mem = el("div");
    this.caption = el("div", { class: "caption", "aria-live": "polite" });
    this.player = new StepPlayer(this, (i) => this.#frame(i));
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE), this.presets,
      el("div", { class: "grid" },
        el("div", { class: "panel" }, el("h4", {}, "Код"), this.code),
        el("div", { class: "panel" }, el("h4", {}, "Память"), this.mem)),
      this.caption, this.player.el);
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.#load(this.key, Number(this.getAttribute("step") || 0));
  }

  #load(k, start = 0) {
    this.key = k;
    for (const b of this.presets.children) b.classList.toggle("on", b.dataset.k === k);
    this.frames = simulate(SCENARIOS[k]);
    this.colors = {};
    for (const op of SCENARIOS[k].ops) for (const n of [op.make?.[0], op.lit?.[0], op.nil, op.slice?.[0], op.alias?.[0]])
      if (n && !(n in this.colors)) this.colors[n] = COLORS[Object.keys(this.colors).length % COLORS.length];
    this.player.load(this.frames.length, Math.min(start, this.frames.length - 1));
  }

  #frame(i) {
    const f = this.frames[i];
    this.code.replaceChildren(...SCENARIOS[this.key].source.map((s, n) => el("span", { class: "ln" + (n === f.line ? " cur" : "") }, s || " ")));
    const hot = new Set(f.touched.map(([a, c]) => `${a}:${c}`));
    const blocks = [];
    for (const a of f.arrays) {
      const users = Object.entries(f.vars).filter(([, v]) => v.arr === a.id);
      // Массив, на который не ссылается ни один срез, — мусор: показываем бледно.
      blocks.push(el("div", { class: "arr", style: users.length ? "" : "opacity:.35" },
        el("div", { class: "tag" }, `массив #${a.id + 1}${users.length ? "" : " — на него никто не ссылается, его соберёт GC"}`),
        el("div", { class: "cells" }, ...a.cells.map((_, c) => el("div", { class: "cell idx" }, String(c)))),
        el("div", { class: "cells" }, ...a.cells.map((v, c) => el("div", { class: "cell" + (hot.has(`${a.id}:${c}`) ? " hot" : "") }, String(v)))),
        ...users.map(([n, v]) => el("div", { class: "bar", style: `--c:${this.colors[n]}` },
          el("span", { class: "cap", style: `left:${v.off * CELL}px;width:${v.cap * CELL - 3}px` }),
          el("span", { class: "len", style: `left:${v.off * CELL}px;width:${Math.max(v.len * CELL - 3, 0)}px;min-width:${v.len ? 0 : 52}px` }, `${n}: ${v.len}/${v.cap}`)))));
    }
    const nils = Object.entries(f.vars).filter(([, v]) => v.arr == null).map(([n]) => n);
    if (nils.length) blocks.push(el("div", { class: "dead" }, `${nils.join(", ")} — nil-срез, массива нет`));
    this.mem.replaceChildren(...blocks);
    this.caption.textContent = f.text;
  }
}

customElements.define("sotto-go-slices", SottoGoSlices);
