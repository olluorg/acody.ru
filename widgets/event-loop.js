// <sotto-event-loop> — цикл событий JavaScript по шагам: стек, очередь
// макрозадач (скрипт, таймеры), очередь микрозадач (then, await,
// queueMicrotask) и вывод console.log. Видно, почему Promise.then
// выполняется раньше setTimeout(…, 0) и где продолжается async-функция.
//
//   <sotto-event-loop program="basic"></sotto-event-loop>
//
// Атрибуты: program (basic | async | nested), step (начальный кадр), theme.

import { BASE_STYLE, el, StepPlayer } from "./core.js";

// Программа — строки исходника и тело скрипта. Инструкции тела:
//   {line, log: "x"}                       — console.log
//   {line, timeout: [...], name}           — setTimeout(() => {...}) → макрозадача
//   {line, micro: [...], name}             — then / queueMicrotask → микрозадача
//   {line, call: [...], name}              — синхронный вызов функции (async до первого await)
//   {line, await: [...], name}             — await: остаток функции становится микрозадачей
// run(log) — та же программа настоящим кодом: тест сверяет порядок вывода.
export const PROGRAMS = {
  basic: {
    title: "setTimeout против Promise",
    source: [
      'console.log("1");',
      'setTimeout(() => console.log("2"));',
      'Promise.resolve().then(() => console.log("3"));',
      'queueMicrotask(() => console.log("4"));',
      'console.log("5");',
    ],
    body: [
      { line: 0, log: "1" },
      { line: 1, name: "таймер", timeout: [{ line: 1, log: "2" }] },
      { line: 2, name: "then", micro: [{ line: 2, log: "3" }] },
      { line: 3, name: "queueMicrotask", micro: [{ line: 3, log: "4" }] },
      { line: 4, log: "5" },
    ],
    run(log) {
      log("1");
      setTimeout(() => log("2"));
      Promise.resolve().then(() => log("3"));
      queueMicrotask(() => log("4"));
      log("5");
    },
  },
  async: {
    title: "async и await",
    source: [
      "async function load() {",
      '  console.log("A");',
      "  await null;",
      '  console.log("B");',
      "}",
      'console.log("start");',
      'setTimeout(() => console.log("T"));',
      "load();",
      'Promise.resolve().then(() => console.log("P"));',
      'console.log("end");',
    ],
    body: [
      { line: 5, log: "start" },
      { line: 6, name: "таймер", timeout: [{ line: 6, log: "T" }] },
      { line: 7, name: "load()", call: [
        { line: 1, log: "A" },
        { line: 2, name: "продолжение load", await: [{ line: 3, log: "B" }] },
      ] },
      { line: 8, name: "then", micro: [{ line: 8, log: "P" }] },
      { line: 9, log: "end" },
    ],
    run(log) {
      async function load() { log("A"); await null; log("B"); }
      log("start");
      setTimeout(() => log("T"));
      load();
      Promise.resolve().then(() => log("P"));
      log("end");
    },
  },
  nested: {
    title: "Вложенные задачи",
    source: [
      "setTimeout(() => {",
      '  console.log("t1");',
      '  Promise.resolve().then(() => console.log("p в t1"));',
      "});",
      'setTimeout(() => console.log("t2"));',
      "Promise.resolve().then(() => {",
      '  console.log("p1");',
      '  setTimeout(() => console.log("t3"));',
      "});",
    ],
    body: [
      { line: 0, name: "таймер t1", timeout: [
        { line: 1, log: "t1" },
        { line: 2, name: "then в t1", micro: [{ line: 2, log: "p в t1" }] },
      ] },
      { line: 4, name: "таймер t2", timeout: [{ line: 4, log: "t2" }] },
      { line: 5, name: "then p1", micro: [
        { line: 6, log: "p1" },
        { line: 7, name: "таймер t3", timeout: [{ line: 7, log: "t3" }] },
      ] },
    ],
    run(log) {
      setTimeout(() => { log("t1"); Promise.resolve().then(() => log("p в t1")); });
      setTimeout(() => log("t2"));
      Promise.resolve().then(() => { log("p1"); setTimeout(() => log("t3")); });
    },
  },
};

/** След выполнения: кадры {stack, micro, macro, out, line, text, phase}. */
export function simulate(program) {
  const macro = [{ name: "скрипт", body: program.body }];
  const micro = [];
  const out = [];
  const frames = [];
  let stack = [];
  const snap = (line, text, phase) => frames.push({
    stack: [...stack], micro: micro.map((t) => t.name), macro: macro.map((t) => t.name),
    out: [...out], line, text, phase,
  });

  // Выполнить тело синхронно; await прерывает тело — остаток уходит в микрозадачи.
  const exec = (body) => {
    for (const ins of body) {
      if (ins.log != null) {
        out.push(ins.log);
        snap(ins.line, `console.log выводит «${ins.log}».`, "run");
      } else if (ins.timeout) {
        macro.push({ name: ins.name, body: ins.timeout });
        snap(ins.line, `setTimeout передаёт колбэк браузеру; по таймеру он встанет в очередь макрозадач.`, "run");
      } else if (ins.micro) {
        micro.push({ name: ins.name, body: ins.micro });
        snap(ins.line, `Промис уже выполнен — колбэк сразу встаёт в очередь микрозадач.`, "run");
      } else if (ins.call) {
        stack.push(ins.name);
        snap(ins.line, `Вызов ${ins.name}: async-функция выполняется синхронно до первого await.`, "run");
        exec(ins.call);
        stack.pop();
      } else if (ins.await) {
        micro.push({ name: ins.name, body: ins.await });
        snap(ins.line, `await приостанавливает функцию: её продолжение — микрозадача. Управление возвращается вызвавшему коду.`, "run");
        return;
      }
    }
  };

  snap(-1, "Стек пуст. В очереди макрозадач — сам скрипт.", "idle");
  while (macro.length) {
    const task = macro.shift();
    stack = [task.name];
    snap(-1, `Цикл берёт одну макрозадачу: «${task.name}».`, "macro");
    exec(task.body);
    stack = [];
    snap(-1, micro.length ? `Макрозадача закончилась, стек пуст — выполняются все микрозадачи.` : `Макрозадача закончилась. Микрозадач нет.`, "drain");
    while (micro.length) {
      const m = micro.shift();
      stack = [m.name];
      snap(-1, `Микрозадача «${m.name}».`, "micro");
      exec(m.body);
      stack = [];
    }
    if (macro.length) snap(-1, "Очередь микрозадач пуста. Браузер может отрисовать кадр, затем — следующая макрозадача.", "render");
  }
  snap(-1, `Готово. Порядок вывода: ${out.join(", ")}.`, "done");
  return frames;
}

const STYLE = `
.presets { display: flex; gap: 6px; flex-wrap: wrap; }
.presets button.on { background: var(--w-accent); color: #fff; border-color: transparent; }
.grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 12px; margin-top: 12px; }
@container (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
.panel { background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; padding: 8px 10px; min-width: 0; }
.panel h4 { margin: 0 0 6px; font-size: 12px; color: var(--w-muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
pre { margin: 0; font: 13px/1.6 "JetBrains Mono", ui-monospace, monospace; white-space: pre-wrap; }
pre .ln { display: block; padding: 0 6px; border-radius: 6px; }
pre .ln.cur { background: color-mix(in srgb, var(--w-accent) 28%, transparent); }
.lanes { display: grid; gap: 8px; }
.lane { display: flex; flex-wrap: wrap; gap: 6px; min-height: 30px; align-items: center; }
.chip { padding: 3px 9px; border-radius: 999px; font-size: 12px; border: 1px solid var(--w-line-2); background: var(--w-surface-2); }
.chip.stack { border-color: var(--w-accent); }
.chip.micro { border-color: var(--w-teal); }
.chip.macro { border-color: var(--w-warm); }
.empty { color: var(--w-faint); font-size: 12px; }
.out { font: 13px "JetBrains Mono", ui-monospace, monospace; display: flex; flex-wrap: wrap; gap: 6px; }
.out span { padding: 2px 8px; border-radius: 6px; background: var(--w-surface-2); }
.out span:last-child { outline: 1px solid var(--w-good); }
`;

class SottoEventLoop extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    this.built = true;
    this.key = PROGRAMS[this.getAttribute("program")] ? this.getAttribute("program") : "basic";
    this.presets = el("div", { class: "presets" }, ...Object.entries(PROGRAMS).map(([k, p]) =>
      el("button", { "data-k": k, onclick: () => this.#load(k) }, p.title)));
    this.code = el("pre");
    this.stack = el("div", { class: "lane" });
    this.micro = el("div", { class: "lane" });
    this.macro = el("div", { class: "lane" });
    this.out = el("div", { class: "out", "aria-live": "polite" });
    this.caption = el("div", { class: "caption", "aria-live": "polite" });
    this.player = new StepPlayer(this, (i) => this.#frame(i));
    const lane = (title, node) => el("div", {}, el("h4", {}, title), node);
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE), this.presets,
      el("div", { class: "grid" },
        el("div", { class: "panel" }, el("h4", {}, "Код"), this.code),
        el("div", { class: "panel lanes" },
          lane("Стек вызовов", this.stack), lane("Микрозадачи", this.micro), lane("Макрозадачи", this.macro))),
      el("div", { class: "panel", style: "margin-top:12px" }, el("h4", {}, "Консоль"), this.out),
      this.caption, this.player.el);
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.#load(this.key, Number(this.getAttribute("step") || 0));
  }

  #load(k, start = 0) {
    this.key = k;
    for (const b of this.presets.children) b.classList.toggle("on", b.dataset.k === k);
    this.frames = simulate(PROGRAMS[k]);
    this.player.load(this.frames.length, Math.min(start, this.frames.length - 1));
  }

  #frame(i) {
    const f = this.frames[i], src = PROGRAMS[this.key].source;
    this.code.replaceChildren(...src.map((s, n) => el("span", { class: "ln" + (n === f.line ? " cur" : "") }, s)));
    const chips = (node, items, cls) => node.replaceChildren(...(items.length
      ? items.map((t) => el("span", { class: `chip ${cls}` }, t)) : [el("span", { class: "empty" }, "пусто")]));
    chips(this.stack, f.stack, "stack");
    chips(this.micro, f.micro, "micro");
    chips(this.macro, f.macro, "macro");
    this.out.replaceChildren(...(f.out.length ? f.out.map((o) => el("span", {}, o)) : [el("span", { class: "empty" }, "—")]));
    this.caption.textContent = f.text;
  }
}

customElements.define("sotto-event-loop", SottoEventLoop);
