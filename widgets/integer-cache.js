// <sotto-integer-cache> — песочница: == против equals у Integer и кэш
// Integer.valueOf. Введите два значения и двигайте AutoBoxCacheMax — видно,
// когда переменные ссылаются на один объект, а когда на разные.
//
//   <sotto-integer-cache a="127" b="127"></sotto-integer-cache>
//   <sotto-integer-cache a="128" b="128"></sotto-integer-cache>
//
// Атрибуты: a, b, type (Integer|Long), theme. Перенесено из bkdojo.

import { BASE_STYLE, el } from "./core.js";

export const CACHE_LOW = -128;

/**
 * Как сравнятся два автоупакованных значения. Integer.valueOf кэширует
 * [-128, cacheMax] (верх меняется -XX:AutoBoxCacheMax, только у Integer),
 * Long.valueOf — всегда [-128, 127]. new Integer(...) — всегда новый объект.
 */
export function compare(a, b, { cacheMax = 127, type = "Integer", how = "auto" } = {}) {
  const max = type === "Long" ? 127 : Math.max(127, cacheMax);
  const cached = (v) => how === "auto" && v >= CACHE_LOW && v <= max;
  const aCached = cached(a), bCached = cached(b);
  const valueEqual = a === b;
  return { aCached, bCached, valueEqual, refEqual: valueEqual && aCached && bCached, max };
}

const STYLE = `
.inputs { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; }
.inputs input[type="number"] { width: 96px; font-family: "JetBrains Mono", ui-monospace, monospace; }
.slider { display: flex; gap: 10px; align-items: center; margin-top: 10px; color: var(--w-muted); font-size: 13px; flex-wrap: wrap; }
.slider input { width: 220px; }
.slider b { color: var(--w-text); font-family: "JetBrains Mono", ui-monospace, monospace; }
.grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 12px; margin-top: 12px; }
@container (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
.panel { background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; padding: 8px 10px; min-width: 0; }
svg { width: 100%; height: auto; display: block; }
.box { fill: var(--w-surface-2); stroke: var(--w-line-2); stroke-width: 1.5; }
.box.cache { stroke: var(--w-teal); }
.box.fresh { stroke: var(--w-warm); }
.cap { font: 600 11px "Manrope", system-ui, sans-serif; fill: var(--w-muted); text-anchor: middle; }
.v { font: 600 13px "JetBrains Mono", ui-monospace, monospace; fill: var(--w-text); text-anchor: middle; dominant-baseline: central; }
.tag { font: 10px "Manrope", system-ui, sans-serif; fill: var(--w-muted); text-anchor: middle; }
.ref { fill: none; stroke-width: 2; }
.ref.a { stroke: var(--w-accent-2); }
.ref.b { stroke: var(--w-teal); }
.line { position: relative; height: 34px; margin: 12px 6px 0; border-radius: 6px; background: var(--w-surface-2); }
.zone { position: absolute; top: 0; bottom: 0; border-radius: 6px;
        background: repeating-linear-gradient(45deg, color-mix(in srgb, var(--w-teal) 35%, transparent) 0 6px, color-mix(in srgb, var(--w-teal) 15%, transparent) 6px 12px); }
.mark { position: absolute; top: -4px; bottom: -4px; width: 3px; border-radius: 2px; transform: translateX(-1px); }
.mark span { position: absolute; top: 100%; left: 50%; transform: translateX(-50%); font: 11px "JetBrains Mono", monospace; white-space: nowrap; margin-top: 2px; }
.mark.a { background: var(--w-accent-2); } .mark.a span { color: var(--w-accent-2); }
.mark.b { background: var(--w-teal); } .mark.b span { color: var(--w-teal); top: auto; bottom: 100%; margin: 0 0 2px; }
pre { margin: 0; font: 14px/1.9 "JetBrains Mono", ui-monospace, monospace; white-space: pre-wrap; }
.t { color: var(--w-good); } .f { color: var(--w-bad); }
.code { color: var(--w-muted); }
`;

const NS = "http://www.w3.org/2000/svg";
const S = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};

class SottoIntegerCache extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    this.built = true;
    const num = (name, def) => { const v = Number(this.getAttribute(name)); return Number.isFinite(v) && this.hasAttribute(name) ? Math.round(v) : def; };
    this.aIn = el("input", { type: "number", value: String(num("a", 127)), "aria-label": "a" });
    this.bIn = el("input", { type: "number", value: String(num("b", 127)), "aria-label": "b" });
    this.type = el("select", { "aria-label": "Тип" },
      el("option", { value: "Integer", selected: this.getAttribute("type") !== "Long" }, "Integer"),
      el("option", { value: "Long", selected: this.getAttribute("type") === "Long" }, "Long"));
    this.how = el("select", { "aria-label": "Как создаём" },
      el("option", { value: "auto" }, "автоупаковка / valueOf"),
      el("option", { value: "new" }, "new Integer(...) — устарело"));
    this.max = el("input", { type: "range", min: "127", max: "1000", value: "127", "aria-label": "AutoBoxCacheMax" });
    this.maxLabel = el("b");
    this.svg = S("svg", { viewBox: "0 0 340 150", role: "img" });
    this.line = el("div", { class: "line", "aria-hidden": "true" });
    this.out = el("pre");
    this.caption = el("div", { class: "caption", "aria-live": "polite" });
    for (const i of [this.aIn, this.bIn, this.max]) i.addEventListener("input", () => this.#render());
    for (const s of [this.type, this.how]) s.addEventListener("change", () => this.#render());
    this.maxRow = el("label", { class: "slider" }, "-XX:AutoBoxCacheMax =", this.maxLabel, this.max);
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE),
      el("div", { class: "inputs" },
        el("label", { class: "field" }, "тип", this.type),
        el("label", { class: "field" }, "a =", this.aIn), el("label", { class: "field" }, "b =", this.bIn),
        el("label", { class: "field" }, "создаём", this.how)),
      this.maxRow, this.line,
      el("div", { class: "grid" }, el("div", { class: "panel" }, this.svg), el("div", { class: "panel" }, this.out)),
      this.caption);
    this.#render();
  }

  #render() {
    const a = Math.round(Number(this.aIn.value) || 0), b = Math.round(Number(this.bIn.value) || 0);
    const type = this.type.value, how = this.how.value;
    this.how.options[1].textContent = `new ${type}(...) — устарело`;
    this.maxRow.style.display = type === "Long" ? "none" : "";
    const r = compare(a, b, { cacheMax: Number(this.max.value), type, how });
    this.maxLabel.textContent = String(r.max);
    // Числовая прямая с зоной кэша.
    const lo = Math.min(CACHE_LOW, a, b) - 20, hi = Math.max(r.max, a, b) + 20;
    const pct = (x) => `${((x - lo) / (hi - lo)) * 100}%`;
    this.line.replaceChildren(
      el("div", { class: "zone", style: `left:${pct(CACHE_LOW)};width:calc(${pct(r.max)} - ${pct(CACHE_LOW)})`, title: `кэш [${CACHE_LOW}, ${r.max}]` }),
      el("div", { class: "mark a", style: `left:${pct(a)}` }, el("span", {}, `a=${a}`)),
      el("div", { class: "mark b", style: `left:${pct(b)}` }, el("span", {}, `b=${b}`)));
    // Стек и куча.
    const p = [S("text", { x: 60, y: 12, class: "cap" }, "стек"), S("text", { x: 274, y: 12, class: "cap" }, "куча")];
    p.push(S("rect", { x: 8, y: 20, width: 104, height: 42, rx: 8, class: "box" }), S("text", { x: 60, y: 41, class: "v" }, `${type} a`));
    p.push(S("rect", { x: 8, y: 88, width: 104, height: 42, rx: 8, class: "box" }), S("text", { x: 60, y: 109, class: "v" }, `${type} b`));
    const obj = (y, v, cached, label) => {
      p.push(S("rect", { x: 216, y, width: 116, height: 42, rx: 8, class: "box " + (cached ? "cache" : "fresh") }));
      p.push(S("text", { x: 274, y: y + 17, class: "v" }, String(v)), S("text", { x: 274, y: y + 33, class: "tag" }, label));
    };
    if (r.refEqual) {
      obj(54, a, true, "из кэша · один объект");
      p.push(S("path", { d: "M112,41 C170,41 170,75 214,75", class: "ref a" }), S("path", { d: "M112,109 C170,109 170,75 214,75", class: "ref b" }));
    } else {
      obj(20, a, r.aCached, r.aCached ? "из кэша" : "новый объект");
      obj(88, b, r.bCached, r.bCached ? "из кэша" : "новый объект");
      p.push(S("path", { d: "M112,41 L214,41", class: "ref a" }), S("path", { d: "M112,109 L214,109", class: "ref b" }));
    }
    this.svg.replaceChildren(...p);
    this.svg.setAttribute("aria-label", r.refEqual ? "a и b указывают на один объект" : "a и b указывают на разные объекты");
    const lit = type === "Long" ? "L" : "";
    const line = (code, val, note = "") => [el("span", { class: "code" }, code.padEnd(22)), el("span", { class: val ? "t" : "f" }, `→ ${val}`), note ? el("span", { class: "code" }, `  ${note}`) : "", "\n"];
    this.out.replaceChildren(
      ...line("a == b", r.refEqual, "ссылки"),
      ...line("a.equals(b)", r.valueEqual, "значения"),
      ...line(`a == ${a}${lit}`, true, "распаковка"),
      ...line("Objects.equals(a, b)", r.valueEqual));
    this.caption.textContent = how === "new"
      ? `new ${type}(...) всегда создаёт новый объект, кэш не используется: a == b — false даже для маленьких чисел. Конструктор помечен устаревшим с Java 9 и подлежит удалению — используют valueOf или автоупаковку.`
      : r.refEqual
        ? `Оба значения равны и лежат в кэше [${CACHE_LOW}, ${r.max}] — valueOf вернул один и тот же объект, поэтому == совпало. Это деталь реализации: на неё нельзя опираться.`
        : r.valueEqual
          ? `Значения равны, но ${!r.aCached && !r.bCached ? "оба вне кэша" : "одно вне кэша"} — это разные объекты, и == сравнивает ссылки: false. Обёртки сравнивают через equals. А a == ${a}${lit} с примитивом — true: обёртка распаковывается.`
          : `Значения разные — false и для ==, и для equals.`;
  }
}

customElements.define("sotto-integer-cache", SottoIntegerCache);
