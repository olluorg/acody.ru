// <sotto-consistent-hashing> — кольцо хешей: серверы с виртуальными узлами,
// ключи и их владельцы. Добавьте или уберите сервер — видно, сколько ключей
// переехало, и как это выглядело бы при hash % N.
//
//   <sotto-consistent-hashing></sotto-consistent-hashing>
//   <sotto-consistent-hashing vnodes="1" mode="mod"></sotto-consistent-hashing>
//
// Атрибуты: vnodes (1|3|10|50|150), mode (ring|mod), servers (2–8), keys (50–400), add (сразу добавить сервер), theme.

import { BASE_STYLE, el } from "./core.js";

const COLORS = ["#9676ff", "#41c7b4", "#ff9f6b", "#5fcf8a", "#ff6b7d", "#5ea8ff", "#d9b53f", "#c77ee8"];
const NAMES = "ABCDEFGH";
const TWO32 = 2 ** 32;

/** FNV-1a, 32 бита, с перемешиванием — детерминированный хеш строки. */
export function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

export function buildRing(servers, vnodes) {
  const points = [];
  for (const s of servers) for (let i = 0; i < vnodes; i++) points.push({ h: fnv(`${s}#${i}`), s });
  points.sort((a, b) => a.h - b.h);
  return points;
}

/** Первый узел по часовой стрелке от хеша ключа. */
export function owner(ring, h) {
  let lo = 0, hi = ring.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (ring[m].h < h) lo = m + 1; else hi = m; }
  return ring[lo % ring.length].s;
}

export function assign(keys, servers, vnodes, mode) {
  if (mode === "mod") return keys.map((k) => servers[fnv(k) % servers.length]);
  const ring = buildRing(servers, vnodes);
  return keys.map((k) => owner(ring, fnv(k)));
}

export const makeKeys = (n) => Array.from({ length: n }, (_, i) => `user:${i + 1}`);

const STYLE = `
.grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; margin-top: 12px; align-items: start; }
@container (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
.panel { background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; padding: 8px; }
.panel h4 { margin: 2px 4px 6px; font-size: 13px; color: var(--w-muted); font-weight: 600; }
svg { width: 100%; height: auto; display: block; }
.ringline { fill: none; stroke: var(--w-line-2); stroke-width: 2; }
.key.moved { stroke: var(--w-text); stroke-width: 1.5; }
.lbl { font: 600 12px "Manrope", system-ui, sans-serif; fill: var(--w-text); text-anchor: middle; dominant-baseline: central; }
.small { font: 10px "JetBrains Mono", ui-monospace, monospace; fill: var(--w-faint); text-anchor: middle; }
.bars { display: grid; gap: 6px; }
.bar { display: grid; grid-template-columns: 26px 1fr 64px; gap: 8px; align-items: center; font-size: 13px; }
.bar .track { height: 14px; border-radius: 4px; background: var(--w-surface-2); position: relative; overflow: hidden; }
.bar .fill { height: 100%; border-radius: 4px; }
.bar .ideal { position: absolute; top: -2px; bottom: -2px; width: 2px; background: var(--w-text); opacity: .5; }
.bar .n { text-align: right; font-variant-numeric: tabular-nums; color: var(--w-muted); }
.bar b.name { font: 700 13px "JetBrains Mono", ui-monospace, monospace; }
.bar button { padding: 0 6px; min-width: 0; font-size: 11px; }
.facts { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 10px; font-size: 13px; color: var(--w-muted); }
.facts b { color: var(--w-text); }
.facts b.warm { color: var(--w-warm); }
`;

const NS = "http://www.w3.org/2000/svg";
const S = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};

class SottoConsistentHashing extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.built = true;
    const vn = Number(this.getAttribute("vnodes") || 50);
    this.vnodes = el("select", { "aria-label": "Виртуальных узлов", onchange: () => this.#update(null) },
      ...[1, 3, 10, 50, 150].map((v) => el("option", { value: String(v), selected: v === vn }, String(v))));
    this.mode = el("select", { "aria-label": "Способ", onchange: () => this.#update(null) },
      el("option", { value: "ring", selected: this.getAttribute("mode") !== "mod" }, "кольцо (consistent hashing)"),
      el("option", { value: "mod", selected: this.getAttribute("mode") === "mod" }, "hash(key) % N"));
    this.keys = makeKeys(Math.max(50, Math.min(400, Number(this.getAttribute("keys") || 240))));
    this.servers = NAMES.slice(0, Math.max(2, Math.min(8, Number(this.getAttribute("servers") || 4)))).split("");
    this.addBtn = el("button", { class: "primary", onclick: () => this.#add() }, "+ сервер");
    this.ringSvg = S("svg", { viewBox: "0 0 320 320", role: "img" });
    this.bars = el("div", { class: "bars" });
    this.facts = el("div", { class: "facts" });
    this.caption = el("div", { class: "caption", "aria-live": "polite" });
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE),
      el("div", { class: "row" },
        el("label", { class: "field" }, "способ", this.mode),
        el("label", { class: "field" }, "виртуальных узлов на сервер", this.vnodes),
        this.addBtn),
      el("div", { class: "grid" },
        el("div", { class: "panel" }, el("h4", {}, "Кольцо хешей"), this.ringSvg),
        el("div", { class: "panel" }, el("h4", {}, "Ключей на сервере (черта — поровну)"), this.bars, this.facts)),
      this.caption,
      el("div", { class: "legend" },
        el("span", {}, "штрихи — точки серверов на кольце, кружки внутри — ключи; ключ принадлежит первому серверу по часовой стрелке"),
        el("span", {}, el("i", { style: "outline:1.5px solid var(--w-text);background:transparent" }), "переехал после последнего изменения")));
    this.#update(null);
    if (this.hasAttribute("add")) this.#add();     // сразу показать добавление сервера
  }

  #add() {
    const next = NAMES.split("").find((n) => !this.servers.includes(n));
    if (!next) return;
    const before = this.servers.slice();
    this.servers.push(next);
    this.#update(before, `Добавили сервер ${next}.`);
  }

  #remove(s) {
    if (this.servers.length <= 2) return;
    const before = this.servers.slice();
    this.servers = this.servers.filter((x) => x !== s);
    this.#update(before, `Убрали сервер ${s}.`);
  }

  #update(before, what) {
    const vn = Number(this.vnodes.value), mode = this.mode.value;
    const now = assign(this.keys, this.servers, vn, mode);
    let moved = new Set(), movedMod = 0, movedRing = 0;
    if (before) {
      const prev = assign(this.keys, before, vn, mode);
      now.forEach((o, i) => { if (o !== prev[i]) moved.add(i); });
      const pm = assign(this.keys, before, vn, "mod"), nm = assign(this.keys, this.servers, vn, "mod");
      const pr = assign(this.keys, before, vn, "ring"), nr = assign(this.keys, this.servers, vn, "ring");
      movedMod = nm.filter((o, i) => o !== pm[i]).length;
      movedRing = nr.filter((o, i) => o !== pr[i]).length;
    }
    this.#drawRing(now, moved, vn, mode);
    // Распределение.
    const counts = Object.fromEntries(this.servers.map((s) => [s, 0]));
    now.forEach((o) => counts[o]++);
    const ideal = this.keys.length / this.servers.length;
    const max = Math.max(...Object.values(counts), ideal) * 1.1;
    this.bars.replaceChildren(...this.servers.map((s) => {
      const c = counts[s], color = COLORS[NAMES.indexOf(s)];
      return el("div", { class: "bar" },
        el("b", { class: "name", style: `color:${color}` }, s),
        el("div", { class: "track" }, el("div", { class: "fill", style: `width:${(100 * c) / max}%;background:${color}` }), el("div", { class: "ideal", style: `left:${(100 * ideal) / max}%` })),
        el("span", { class: "n" }, `${c} `, el("button", { title: `Убрать сервер ${s}`, onclick: () => this.#remove(s), disabled: this.servers.length <= 2 }, "✕")));
    }));
    const vals = Object.values(counts);
    const spread = Math.max(...vals) / ideal;
    this.addBtn.disabled = this.servers.length >= NAMES.length;
    this.facts.innerHTML = `<span>серверов <b>${this.servers.length}</b></span><span>ключей <b>${this.keys.length}</b></span>` +
      `<span>самый нагруженный: <b class="${spread > 1.3 ? "warm" : ""}">${Math.round(spread * 100)}%</b> от среднего</span>` +
      (before ? `<span>переехало <b class="warm">${moved.size}</b> (${Math.round((100 * moved.size) / this.keys.length)}%)</span>` : "");
    let text;
    if (!before) {
      text = mode === "mod"
        ? `hash % N: ключ идёт на сервер номер hash mod ${this.servers.length}. Распределение ровное — но добавьте сервер и посмотрите, сколько ключей переедет.`
        : vn === 1
          ? `Одна точка на сервер: дуги разной длины, и один сервер получает в разы больше ключей. Увеличьте число виртуальных узлов.`
          : `${vn} виртуальных узлов на сервер: дуги усредняются, разброс нагрузки — ${Math.round((spread - 1) * 100)}% сверх среднего. Добавьте или уберите сервер.`;
    } else {
      const ideal1 = Math.round((100 * Math.abs(this.servers.length - before.length)) / Math.max(this.servers.length, before.length));
      text = `${what} ` + (mode === "mod"
        ? `При hash % N переехало ${Math.round((100 * movedMod) / this.keys.length)}% ключей — почти все: для кэша это промах по всему подряд. На кольце переехало бы ${Math.round((100 * movedRing) / this.keys.length)}%.`
        : `На кольце переехало ${Math.round((100 * movedRing) / this.keys.length)}% ключей (в идеале ~${ideal1}%) — только те, что попали на дуги нового или ушедшего сервера. При hash % N было бы ${Math.round((100 * movedMod) / this.keys.length)}%.`);
    }
    this.caption.textContent = text;
  }

  #drawRing(now, moved, vn, mode) {
    const C = 160, R = 132, RK = 108;
    const parts = [S("circle", { cx: C, cy: C, r: R, class: "ringline" })];
    const angle = (h) => (h / TWO32) * 2 * Math.PI - Math.PI / 2;
    const at = (h, r) => [C + r * Math.cos(angle(h)), C + r * Math.sin(angle(h))];
    if (mode === "ring") {
      const ring = buildRing(this.servers, vn);
      const len = vn >= 50 ? 7 : 12;
      for (const p of ring) {
        const [x1, y1] = at(p.h, R - len), [x2, y2] = at(p.h, R + len);
        parts.push(S("line", { x1, y1, x2, y2, stroke: COLORS[NAMES.indexOf(p.s)], "stroke-width": vn >= 50 ? 1.5 : 3, "stroke-linecap": "round" }));
        if (vn <= 3) {
          const [lx, ly] = at(p.h, R + 22);
          parts.push(S("text", { x: lx, y: ly, class: "lbl", style: `fill:${COLORS[NAMES.indexOf(p.s)]}` }, vn === 1 ? p.s : `${p.s}${ring.filter((q) => q.s === p.s).indexOf(p) + 1}`));
        }
      }
    } else {
      parts.push(S("text", { x: C, y: C - 10, class: "lbl" }, `hash % ${this.servers.length}`));
      parts.push(S("text", { x: C, y: C + 10, class: "small" }, "позиция на кольце не важна"));
    }
    this.keys.forEach((k, i) => {
      const [x, y] = at(fnv(k), RK - (i % 4) * 7);
      parts.push(S("circle", { cx: x, cy: y, r: moved.has(i) ? 4 : 3, class: "key" + (moved.has(i) ? " moved" : ""), fill: COLORS[NAMES.indexOf(now[i])] }));
    });
    this.ringSvg.replaceChildren(...parts);
    this.ringSvg.setAttribute("aria-label", `Кольцо: ${this.servers.length} серверов, ${vn} виртуальных узлов`);
  }
}

customElements.define("sotto-consistent-hashing", SottoConsistentHashing);
