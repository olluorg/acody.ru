// <sotto-deadlock> — два потока, общие данные и блокировки. Вы сами решаете,
// чей шаг следующий, и видите гонку count++ или взаимную блокировку с
// графом ожиданий.
//
//   <sotto-deadlock mode="deadlock"></sotto-deadlock>
//   <sotto-deadlock mode="race"></sotto-deadlock>
//
// Атрибуты: mode (race|race-locked|deadlock|ordered), seed, theme.

import { BASE_STYLE, el, rng } from "./core.js";

/*
 * Программа потока — список инструкций:
 *   lock X / unlock X — захват и освобождение блокировки;
 *   read — local = shared; inc — local + 1; write — shared = local;
 *   work — полезная работа под блокировками.
 */
const P = (s) => s.split(";").map((x) => x.trim()).filter(Boolean).map((x) => {
  const [op, arg] = x.split(" ");
  return { op, arg };
});

export const MODES = {
  race: {
    title: "Гонка: count++ без блокировки",
    intro: "Оба потока делают count++ — это три шага: прочитать, прибавить, записать. Попробуйте чередовать: оба читают, потом оба пишут.",
    threads: [P("read; inc; write"), P("read; inc; write")],
    locks: [],
    shared: 0,
  },
  "race-locked": {
    title: "count++ под блокировкой",
    intro: "Та же операция, но внутри критической секции: пока один поток держит L, второй ждёт. Обновление не теряется при любом порядке.",
    threads: [P("lock L; read; inc; write; unlock L"), P("lock L; read; inc; write; unlock L")],
    locks: ["L"],
    shared: 0,
  },
  deadlock: {
    title: "Перевод денег: разный порядок блокировок",
    intro: "Поток 1 переводит со счёта A на B и блокирует A, затем B. Поток 2 переводит с B на A — и блокирует в обратном порядке. Дайте каждому захватить по одной блокировке.",
    threads: [P("lock A; lock B; work; unlock B; unlock A"), P("lock B; lock A; work; unlock A; unlock B")],
    locks: ["A", "B"],
    shared: null,
  },
  ordered: {
    title: "Единый порядок блокировок",
    intro: "Оба потока захватывают сначала A, потом B — например, по возрастанию id счёта. Цикл ожидания невозможен при любом чередовании.",
    threads: [P("lock A; lock B; work; unlock B; unlock A"), P("lock A; lock B; work; unlock B; unlock A")],
    locks: ["A", "B"],
    shared: null,
  },
};

export function initial(mode) {
  const m = MODES[mode];
  return {
    mode,
    pc: m.threads.map(() => 0),
    local: m.threads.map(() => null),
    owner: Object.fromEntries(m.locks.map((l) => [l, null])),
    shared: m.shared,
    log: [],
  };
}

const program = (state, i) => MODES[state.mode].threads[i];
export const done = (state, i) => state.pc[i] >= program(state, i).length;

/** На какой блокировке ждёт поток i (null — может идти). */
export function waitsFor(state, i) {
  if (done(state, i)) return null;
  const ins = program(state, i)[state.pc[i]];
  return ins.op === "lock" && state.owner[ins.arg] != null && state.owner[ins.arg] !== i ? ins.arg : null;
}

export const canStep = (state, i) => !done(state, i) && waitsFor(state, i) == null;

/** Цикл в графе ожиданий: поток → блокировка, которую ждёт → её владелец → … */
export function deadlockCycle(state) {
  const n = state.pc.length;
  for (let start = 0; start < n; start++) {
    const path = [];
    let t = start;
    const seen = new Set();
    while (t != null && !seen.has(t)) {
      seen.add(t);
      const l = waitsFor(state, t);
      if (l == null) break;
      path.push({ thread: t, lock: l });
      t = state.owner[l];
      if (t === start) return path;
    }
  }
  return null;
}

/** Шаг потока i: новое состояние и пояснение. */
export function step(state, i) {
  if (!canStep(state, i)) return null;
  const s = { ...state, pc: state.pc.slice(), local: state.local.slice(), owner: { ...state.owner }, log: state.log.slice() };
  const ins = program(state, i)[state.pc[i]];
  const T = `Поток ${i + 1}`;
  let text;
  switch (ins.op) {
    case "lock":
      s.owner[ins.arg] = i;
      text = `${T} захватил блокировку ${ins.arg}.`;
      break;
    case "unlock":
      s.owner[ins.arg] = null;
      text = `${T} отпустил ${ins.arg}.`;
      break;
    case "read":
      s.local[i] = s.shared;
      text = `${T} прочитал count = ${s.shared} в свою локальную переменную.`;
      break;
    case "inc":
      s.local[i] += 1;
      text = `${T} прибавил единицу у себя: ${s.local[i]}. Общий count всё ещё ${s.shared}.`;
      break;
    case "write":
      text = `${T} записал count = ${s.local[i]}` + (s.shared !== s.local[i] - 1 ? ` — поверх значения ${s.shared}: чужое обновление потеряно.` : ".");
      s.shared = s.local[i];
      break;
    case "work":
      text = `${T} держит обе блокировки и переводит деньги.`;
      break;
  }
  s.pc[i]++;
  s.log.push(i);
  if (done(s, i)) text += ` ${T} закончил.`;
  const cyc = deadlockCycle(s);
  if (cyc) text += ` Взаимная блокировка: ${cyc.map((c) => `поток ${c.thread + 1} ждёт ${c.lock}`).join(", ")} — и каждую держит другой. Дальше никто не двинется.`;
  else if (s.pc.every((_, k) => done(s, k)) && s.shared != null) {
    const n = s.pc.length;
    text += s.shared === n ? ` Итог: count = ${s.shared}, как и должно быть.` : ` Итог: count = ${s.shared}, а должно быть ${n} — потерянное обновление.`;
  }
  return { state: s, text };
}

const OPS = { lock: "lock", unlock: "unlock", read: "tmp = count", inc: "tmp = tmp + 1", write: "count = tmp", work: "перевести деньги" };
const show = (ins) => (ins.op === "lock" ? `lock(${ins.arg})` : ins.op === "unlock" ? `unlock(${ins.arg})` : OPS[ins.op]);

const STYLE = `
.grid { display: grid; grid-template-columns: 1fr minmax(200px, 1.1fr) 1fr; gap: 12px; margin-top: 12px; align-items: start; }
@container (max-width: 640px) { .grid { grid-template-columns: 1fr 1fr; } .mid { grid-column: 1 / -1; order: -1; } }
.th { background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; padding: 10px 12px; }
.th.blocked { border-color: var(--w-bad); }
.th.dead { box-shadow: 0 0 0 2px var(--w-bad); }
.th h3 { margin: 0 0 6px; font-size: 14px; display: flex; justify-content: space-between; gap: 6px; align-items: baseline; flex-wrap: wrap; }
.badge { font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 999px; background: var(--w-surface-2); color: var(--w-muted); }
.badge.run { background: color-mix(in srgb, var(--w-good) 25%, transparent); color: var(--w-good); }
.badge.wait { background: color-mix(in srgb, var(--w-bad) 22%, transparent); color: var(--w-bad); }
ol { list-style: none; margin: 0 0 8px; padding: 0; font: 13px/1.7 "JetBrains Mono", ui-monospace, monospace; }
li { padding: 0 6px; border-radius: 6px; color: var(--w-muted); position: relative; }
li.done { color: var(--w-faint); text-decoration: line-through; text-decoration-color: var(--w-line-2); }
li.next { background: color-mix(in srgb, var(--w-accent) 22%, transparent); color: var(--w-text); }
li.next.stuck { background: color-mix(in srgb, var(--w-bad) 22%, transparent); }
li.next::before { content: "▶"; position: absolute; left: -12px; color: var(--w-accent-2); font-size: 10px; top: 1px; }
.local { font: 12px "JetBrains Mono", ui-monospace, monospace; color: var(--w-muted); margin-bottom: 8px; min-height: 1.2em; }
.th button { width: 100%; }
.mid { background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; padding: 8px; text-align: center; }
.shared { font: 600 15px "JetBrains Mono", ui-monospace, monospace; margin: 4px 0; }
.shared b { color: var(--w-warm); font-size: 20px; }
svg { width: 100%; max-width: 280px; height: auto; display: block; margin: 0 auto; }
.node { fill: var(--w-surface-2); stroke: var(--w-line-2); stroke-width: 1.5; }
.node.lock-held { fill: color-mix(in srgb, var(--w-accent) 35%, var(--w-surface-2)); }
.node.hot { stroke: var(--w-bad); stroke-width: 2.5; }
.ntext { font: 600 12px "Manrope", system-ui, sans-serif; fill: var(--w-text); text-anchor: middle; dominant-baseline: central; }
.edge { stroke: var(--w-accent-2); stroke-width: 2; fill: none; }
.edge.wait { stroke: var(--w-warm); stroke-dasharray: 5 4; }
.edge.cycle { stroke: var(--w-bad); }
.elabel { font: 10px "Manrope", system-ui, sans-serif; fill: var(--w-muted); text-anchor: middle; }
.ctrl { margin-top: 12px; }
`;

const NS = "http://www.w3.org/2000/svg";
const S = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};

class SottoDeadlock extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.built = true;
    this.seed = Number(this.getAttribute("seed") || 1);
    const initialMode = MODES[this.getAttribute("mode")] ? this.getAttribute("mode") : "deadlock";
    this.modeSel = el("select", { "aria-label": "Сценарий", onchange: () => this.#reset() },
      ...Object.entries(MODES).map(([k, m]) => el("option", { value: k, selected: k === initialMode }, m.title)));
    this.cols = [0, 1].map((i) => {
      const c = { list: el("ol"), badge: el("span", { class: "badge" }), local: el("div", { class: "local" }),
                  btn: el("button", { class: "primary", onclick: () => this.#do(i) }, `Шаг потока ${i + 1}`) };
      c.root = el("div", { class: "th" }, el("h3", {}, `Поток ${i + 1}`, c.badge), c.list, c.local, c.btn);
      return c;
    });
    this.sharedBox = el("div", { class: "shared" });
    this.svg = S("svg", { viewBox: "0 0 280 200", role: "img" });
    this.mid = el("div", { class: "mid" }, this.sharedBox, this.svg, el("div", { class: "note" }, "граф ожиданий: сплошная — держит, пунктир — ждёт"));
    this.caption = el("div", { class: "caption", "aria-live": "polite" });
    this.backBtn = el("button", { onclick: () => this.#back() }, "◀ назад");
    this.autoBtn = el("button", { onclick: () => this.#auto() }, "🎲 случайный порядок до конца");
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE),
      el("div", { class: "row" }, el("label", { class: "field" }, "сценарий", this.modeSel)),
      el("div", { class: "grid" }, this.cols[0].root, this.mid, this.cols[1].root),
      this.caption,
      el("div", { class: "row ctrl" }, this.backBtn, el("button", { onclick: () => this.#reset() }, "сначала"), this.autoBtn));
    this.addEventListener("keydown", (e) => {
      if (e.target !== this) return;
      if (e.key === "1" || e.key === "ArrowLeft") { e.preventDefault(); this.#do(0); }
      if (e.key === "2" || e.key === "ArrowRight") { e.preventDefault(); this.#do(1); }
      if (e.key === "Backspace") { e.preventDefault(); this.#back(); }
    });
    this.#reset();
    // Атрибут steps="0,1,1" — заранее проиграть чередование (для витрины и карточек).
    for (const i of (this.getAttribute("steps") || "").split(",").filter(Boolean)) this.#do(Number(i) - 1);
  }

  #reset() {
    clearInterval(this.timer);
    this.history = [{ state: initial(this.modeSel.value), text: MODES[this.modeSel.value].intro }];
    this.#render();
  }

  get #cur() { return this.history.at(-1); }

  #do(i) {
    const r = step(this.#cur.state, i);
    if (!r) return;
    this.history.push(r);
    this.#render();
  }

  #back() {
    clearInterval(this.timer);
    if (this.history.length > 1) this.history.pop();
    this.#render();
  }

  #auto() {
    clearInterval(this.timer);
    const rand = rng(this.seed++);
    this.timer = setInterval(() => {
      const s = this.#cur.state;
      const ready = [0, 1].filter((i) => canStep(s, i));
      if (!ready.length) { clearInterval(this.timer); return; }
      this.#do(ready[Math.floor(rand() * ready.length)]);
    }, 450);
  }

  #render() {
    const { state, text } = this.#cur;
    const cyc = deadlockCycle(state);
    const inCycle = new Set((cyc || []).map((c) => c.thread));
    this.cols.forEach((c, i) => {
      const prog = MODES[state.mode].threads[i];
      const w = waitsFor(state, i);
      c.list.replaceChildren(...prog.map((ins, k) => el("li", { class: k < state.pc[i] ? "done" : k === state.pc[i] ? "next" + (w ? " stuck" : "") : "" }, show(ins))));
      const fin = done(state, i);
      c.badge.className = "badge" + (fin ? "" : w ? " wait" : " run");
      c.badge.textContent = fin ? "закончил" : w ? `ждёт ${w}` : "готов";
      c.root.className = "th" + (w ? " blocked" : "") + (inCycle.has(i) ? " dead" : "");
      c.local.textContent = state.shared != null ? `tmp = ${state.local[i] ?? "—"}` : "";
      c.btn.disabled = !canStep(state, i);
    });
    this.backBtn.disabled = this.history.length < 2;
    this.autoBtn.disabled = [0, 1].every((i) => !canStep(state, i));
    this.sharedBox.innerHTML = state.shared != null ? `count = <b>${state.shared}</b>` : "счета A и B";
    this.#graph(state, cyc);
    this.caption.textContent = text;
  }

  #graph(state, cyc) {
    const locks = MODES[state.mode].locks;
    const T = [{ x: 46, y: 100 }, { x: 234, y: 100 }];
    const L = locks.length === 1 ? { [locks[0]]: { x: 140, y: 100 } } : { [locks[0]]: { x: 140, y: 34 }, [locks[1]]: { x: 140, y: 166 } };
    const parts = [S("defs", {}), ];
    const defs = parts[0];
    for (const [id, color] of [["h", "--w-accent-2"], ["w", "--w-warm"], ["c", "--w-bad"]]) {
      const m = S("marker", { id: "m" + id, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
      m.append(S("path", { d: "M 0 0 L 10 5 L 0 10 z", style: `fill: var(${color})` }));
      defs.append(m);
    }
    if (!locks.length) {
      parts.push(S("text", { x: 140, y: 160, class: "elabel" }, "блокировок нет — потоки не ждут друг друга"));
      parts.push(S("rect", { x: 104, y: 76, width: 72, height: 48, rx: 10, class: "node lock-held" }), S("text", { x: 140, y: 100, class: "ntext" }, "count"));
      for (const i of [0, 1]) if (state.pc[i] > 0 && !done(state, i) || state.local[i] != null && !done(state, i))
        parts.push(S("line", { x1: T[i].x + (i ? -24 : 24), y1: 100, x2: i ? 178 : 102, y2: 100, class: "edge wait" }));
      for (const [i, p] of T.entries()) {
        parts.push(S("circle", { cx: p.x, cy: p.y, r: 24, class: "node" }), S("text", { x: p.x, y: p.y, class: "ntext" }, `П${i + 1}`));
      }
      this.svg.replaceChildren(...parts);
      return;
    }
    const cycleEdges = new Set((cyc || []).flatMap((c) => [`w${c.thread}${c.lock}`, `h${c.lock}${state.owner[c.lock]}`]));
    const edge = (a, b, r1, r2, cls, key) => {
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
      const hot = cycleEdges.has(key);
      parts.push(S("line", { x1: a.x + ux * r1, y1: a.y + uy * r1, x2: b.x - ux * r2, y2: b.y - uy * r2, class: `edge ${cls}${hot ? " cycle" : ""}`, "marker-end": `url(#m${hot ? "c" : cls === "wait" ? "w" : "h"})` }));
    };
    for (const l of locks) {
      const o = state.owner[l];
      if (o != null) edge(L[l], T[o], 18, 26, "hold", `h${l}${o}`);
    }
    [0, 1].forEach((i) => {
      const w = waitsFor(state, i);
      if (w) edge(T[i], L[w], 26, 18, "wait", `w${i}${w}`);
    });
    for (const l of locks) {
      const p = L[l];
      parts.push(S("rect", { x: p.x - 18, y: p.y - 18, width: 36, height: 36, rx: 8, class: "node" + (state.owner[l] != null ? " lock-held" : "") + (cyc && cyc.some((c) => c.lock === l) ? " hot" : "") }));
      parts.push(S("text", { x: p.x, y: p.y, class: "ntext" }, "🔒" + l));
    }
    T.forEach((p, i) => {
      parts.push(S("circle", { cx: p.x, cy: p.y, r: 24, class: "node" + (cyc && cyc.some((c) => c.thread === i) ? " hot" : "") }));
      parts.push(S("text", { x: p.x, y: p.y, class: "ntext" }, `П${i + 1}`));
    });
    this.svg.replaceChildren(...parts);
    this.svg.setAttribute("aria-label", cyc ? "Граф ожиданий с циклом — взаимная блокировка" : "Граф ожиданий");
  }
}

customElements.define("sotto-deadlock", SottoDeadlock);
