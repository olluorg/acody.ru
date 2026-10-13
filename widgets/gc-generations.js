// <sotto-gc-generations> — поколения сборщика мусора по шагам: выделение в
// Eden, малая сборка копированием в Survivor, возраст и продвижение в Old,
// преждевременное продвижение при переполнении Survivor, мусор в Old и полная
// сборка с долгой паузой.
//
//   <sotto-gc-generations></sotto-gc-generations>
//   <sotto-gc-generations scenario="cache"></sotto-gc-generations>
//
// Атрибуты: scenario (default|young|cache), step, theme. Перенесено из bkdojo и расширено.

import { BASE_STYLE, StepPlayer, el } from "./core.js";

export const EDEN = 8, SURVIVOR = 3, OLD = 12, TENURE = 3;

/** Пачки выделений: сколько малых сборок проживёт каждый объект (99 — «навсегда»). */
export const SCENARIOS = {
  default: { title: "обычная нагрузка", batches: [[0, 0, 0, 0, 0, 1, 3, 5], [0, 0, 0, 0, 0, 0, 2, 4], [0, 0, 0, 0, 0, 0, 0, 6], [0, 0, 0, 0, 0, 0, 1, 2], [0, 0, 0, 0, 0, 0, 0, 0]] },
  young: { title: "почти всё умирает молодым", batches: [[0, 0, 0, 0, 0, 0, 0, 1], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 1, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]] },
  cache: { title: "кэш в куче: много живут долго", batches: [[4, 4, 4, 0, 0, 0, 2, 2], [6, 5, 4, 2, 0, 0, 0, 0], [99, 5, 6, 0, 0, 0, 0, 0], [4, 4, 4, 0, 0, 0, 0, 0], [5, 4, 4, 0, 0, 0, 0, 0], [99, 4, 6, 0, 0, 0, 0, 0]] },
};

const LETTERS = "abcdefghij";

/**
 * Симуляция. Объект: id, survives — сколько малых сборок переживёт, age —
 * сколько уже пережил. После survives сборок объект недостижим (мусор), но
 * в Old его уберёт только полная сборка.
 */
export const isDead = (o, phase) => (phase === "between" ? o.age >= o.survives : o.age > o.survives);

export function simulate(batches) {
  let eden = [], surv = [], old = [], active = "S0";
  let gcs = 0, copied = 0, minorPause = 0, majorPause = 0;
  const frames = [];
  const snap = (extra) => frames.push({ eden: eden.map((o) => ({ ...o })), surv: surv.map((o) => ({ ...o })), old: old.map((o) => ({ ...o })), active, gcs, copied, minorPause, majorPause, ...extra });
  // Объект переживает сборку, если возраст до неё меньше survives. Сразу после
  // сборки объект с age == survives ещё жив — он умрёт до следующей.
  const alive = (o) => o.age < o.survives;                 // доживёт ли до текущей сборки
  const aliveNow = (o) => o.age <= o.survives;             // жив в момент сразу после сборки
  snap({ phase: "gc", action: "init", text: `Пустая куча. Eden на ${EDEN} объектов, каждое Survivor-пространство — на ${SURVIVOR}, Old — на ${OLD}. Порог продвижения — возраст ${TENURE}.` });
  batches.forEach((batch, bi) => {
    eden = batch.map((s, i) => ({ id: `${LETTERS[bi]}${i + 1}`, survives: s, age: 0 }));
    snap({ phase: "between", action: "alloc", hl: eden.map((o) => o.id), text: `Eden заполнен: ${eden.length} новых объектов выделены простым сдвигом указателя — это почти бесплатно. Места нет — малая сборка.` });
    // Малая сборка: живые из Eden и активного Survivor копируются, остальное освобождается целиком.
    const live = [...surv, ...eden].filter(alive);
    const dead = surv.length + eden.length - live.length;
    for (const o of live) o.age++;
    for (const o of old) o.age++;                       // время идёт и для старых — некоторые умирают
    live.sort((a, b) => b.age - a.age);
    const tenured = live.filter((o) => o.age >= TENURE);
    const staying = live.filter((o) => o.age < TENURE);
    const fits = staying.slice(0, SURVIVOR), overflow = staying.slice(SURVIVOR);
    old.push(...tenured.map((o) => ({ ...o, tenured: "age" })), ...overflow.map((o) => ({ ...o, tenured: "early" })));
    surv = fits;
    eden = [];
    active = active === "S0" ? "S1" : "S0";
    gcs++;
    copied += live.length;
    const pause = 1 + live.length;                      // условные мс: пропорционально живым, а не мусору
    minorPause += pause;
    const parts = [`Малая сборка №${gcs}: живых ${live.length}, мусора ${dead}. Копируем только живых в ${active} (≈${pause} мс паузы — цена зависит от числа живых, а не от размера Eden). Eden и прежнее Survivor освобождаются целиком.`];
    if (tenured.length) parts.push(`Возраст ${TENURE}: ${tenured.map((o) => o.id).join(", ")} → Old.`);
    if (overflow.length) parts.push(`Survivor вмещает ${SURVIVOR}, живых больше — ${overflow.map((o) => o.id).join(", ")} уезжают в Old досрочно: преждевременное продвижение, будущий мусор в Old.`);
    snap({ phase: "gc", action: "minor", hl: [...tenured, ...overflow].map((o) => o.id), text: parts.join(" ") });
    if (old.length > OLD) {
      const garbage = old.filter((o) => !aliveNow(o)).length;
      const pauseMajor = 10 + old.length * 3;
      snap({ phase: "gc", action: "major-before", text: `Old переполнен: ${old.length} из ${OLD}, из них ${garbage} уже мусор — малые сборки Old не чистят. Нужна полная сборка (major / full GC): пометить живое во всей куче и уплотнить.` });
      old = old.filter(aliveNow);
      majorPause += pauseMajor;
      snap({ phase: "gc", action: "major", text: old.length > OLD
        ? `Полная сборка убрала ${garbage}, но живых в Old ${old.length} — больше ёмкости. Реальная JVM увеличила бы кучу до -Xmx, а дальше — OutOfMemoryError. Пауза ≈${pauseMajor} мс.`
        : `Полная сборка: убрано ${garbage}, в Old осталось ${old.length}. Пауза ≈${pauseMajor} мс — во много раз дольше малой. Частые полные сборки — признак утечки или преждевременного продвижения.` });
    }
  });
  snap({ phase: "between", action: "done", text: `Итого: ${gcs} малых сборок, скопировано ${copied} объектов, паузы малых ≈${minorPause} мс, полных ≈${majorPause} мс. Слабая гипотеза поколений: большинство объектов умирает молодыми — поэтому молодое поколение собирают часто и дёшево.` });
  return frames;
}

const STYLE = `
.heap { display: grid; grid-template-columns: 2fr 1fr 1fr 3fr; gap: 8px; margin-top: 12px; }
@container (max-width: 640px) { .heap { grid-template-columns: 1fr 1fr; } }
.space { background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; padding: 8px; min-width: 0; }
.space.on { border-color: var(--w-teal); }
.space.full { border-color: var(--w-bad); }
.space h4 { margin: 0 0 6px; font-size: 13px; display: flex; justify-content: space-between; gap: 6px; }
.space h4 small { color: var(--w-faint); font-weight: 400; }
.slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(42px, 1fr)); gap: 4px; }
.o { height: 38px; border-radius: 7px; display: grid; place-items: center; font: 600 11px/1.1 "JetBrains Mono", ui-monospace, monospace; text-align: center;
     background: color-mix(in srgb, var(--w-accent) 30%, var(--w-surface-2)); border: 1px solid transparent; }
.o small { display: block; font-weight: 400; font-size: 9px; color: var(--w-muted); }
.o.dead { background: transparent; border: 1px dashed var(--w-line-2); color: var(--w-faint); text-decoration: line-through; }
.o.hl { box-shadow: 0 0 0 2px var(--w-warm); }
.o.early { background: color-mix(in srgb, var(--w-bad) 30%, var(--w-surface-2)); }
.o.slot { background: var(--w-bg); border: 1px dashed var(--w-line); }
.counts { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 8px; }
`;

class SottoGcGenerations extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.built = true;
    const sc = SCENARIOS[this.getAttribute("scenario")] ? this.getAttribute("scenario") : "default";
    this.sel = el("select", { "aria-label": "Сценарий", onchange: () => this.#load() },
      ...Object.entries(SCENARIOS).map(([k, v]) => el("option", { value: k, selected: k === sc }, v.title)));
    this.heap = el("div", { class: "heap" });
    this.counts = el("div", { class: "counts" });
    this.caption = el("div", { class: "caption", "aria-live": "polite" });
    this.player = new StepPlayer(this, (i) => this.#render(i));
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE),
      el("div", { class: "row" }, el("label", { class: "field" }, "нагрузка", this.sel)),
      this.heap, this.counts, this.caption,
      el("div", { class: "legend" },
        el("span", {}, el("i", { style: "background:color-mix(in srgb, var(--w-accent) 30%, var(--w-surface-2))" }), "живой объект, под ним — возраст"),
        el("span", {}, el("i", { style: "border:1px dashed var(--w-line-2);background:transparent" }), "мусор"),
        el("span", {}, el("i", { style: "background:color-mix(in srgb, var(--w-bad) 30%, var(--w-surface-2))" }), "продвинут досрочно"),
        el("span", {}, el("i", { style: "outline:2px solid var(--w-warm);background:transparent" }), "изменился на этом шаге")),
      this.player.el);
    this.#load();
    const step = this.getAttribute("step");
    if (step != null) this.player.go(Number(step));
  }

  #load() {
    this.frames = simulate(SCENARIOS[this.sel.value].batches);
    this.player.load(this.frames.length);
  }

  #render(index) {
    const f = this.frames[index];
    const hl = new Set(f.hl || []);
    const obj = (o) => {
      const dead = f.phase === "between" ? o.age >= o.survives : o.age > o.survives;
      return el("div", { class: "o" + (dead ? " dead" : "") + (o.tenured === "early" && !dead ? " early" : "") + (hl.has(o.id) ? " hl" : ""), title: dead ? "недостижим" : `возраст ${o.age}` },
        el("span", {}, o.id, el("small", {}, dead ? "мусор" : `age ${o.age}`)));
    };
    const space = (title, sub, list, cap, cls = "") => el("div", { class: "space " + cls },
      el("h4", {}, title, el("small", {}, sub)),
      el("div", { class: "slots" }, ...list.map(obj), ...Array.from({ length: Math.max(0, cap - list.length) }, () => el("div", { class: "o slot" }))));
    const s0 = f.active === "S0" ? f.surv : [], s1 = f.active === "S1" ? f.surv : [];
    this.heap.replaceChildren(
      space("Eden", `${f.eden.length}/${EDEN}`, f.eden, EDEN, f.eden.length >= EDEN ? "full" : ""),
      space("S0", f.active === "S0" ? "активно" : "пусто", s0, SURVIVOR, f.active === "S0" ? "on" : ""),
      space("S1", f.active === "S1" ? "активно" : "пусто", s1, SURVIVOR, f.active === "S1" ? "on" : ""),
      space("Old", `${f.old.length}/${OLD}`, f.old, OLD, f.old.length > OLD ? "full" : ""));
    this.counts.innerHTML = `<span class="counter">малых сборок <b>${f.gcs}</b></span><span class="counter">скопировано объектов <b>${f.copied}</b></span>` +
      `<span class="counter">паузы малых ≈<b>${f.minorPause} мс</b></span><span class="counter">паузы полных ≈<b>${f.majorPause} мс</b></span>`;
    this.caption.textContent = f.text;
  }
}

customElements.define("sotto-gc-generations", SottoGcGenerations);
