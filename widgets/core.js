// Общее для интерактивных виджетов банка вопросов.
//
// Виджет — Web Component без фреймворков: работает на сайте, на странице
// вычитки и на втором экране. Алгоритм заранее раскладывается в «след» —
// массив кадров (состояние + подсветка + счётчики + текст шага), а
// StepPlayer показывает кадры: вперёд и назад, проигрывание, скорость.
// Одинаковый вход всегда даёт одинаковый след — виджет можно описать в
// тексте карточки и проверить тестом.

export const BASE_STYLE = `
:host {
  --w-bg: #0f1222; --w-surface: #151a2e; --w-surface-2: #1b2140;
  --w-line: rgba(255,255,255,.10); --w-line-2: rgba(255,255,255,.18);
  --w-text: #eceffa; --w-muted: #a3abc6; --w-faint: #6f789a;
  --w-accent: #9676ff; --w-accent-2: #b8a4ff; --w-teal: #5ad1c0;
  --w-warm: #ffb38a; --w-good: #7fe0a6; --w-bad: #ff7b8a; --w-bar: #4a5480;
  display: block; color: var(--w-text); background: var(--w-bg);
  border: 1px solid var(--w-line); border-radius: 16px; padding: 16px;
  font: 14px/1.45 "Manrope", system-ui, -apple-system, "Segoe UI", sans-serif;
  outline: none; container-type: inline-size;
}
@media (prefers-color-scheme: light) {
  :host(:not([theme="dark"])) {
    --w-bg: #f7f8fc; --w-surface: #ffffff; --w-surface-2: #eef0f8;
    --w-line: rgba(20,24,48,.10); --w-line-2: rgba(20,24,48,.20);
    --w-text: #171a2e; --w-muted: #4b5272; --w-faint: #7a809c;
    --w-accent: #6d4ff2; --w-accent-2: #5a3fd6; --w-teal: #11998a;
    --w-warm: #e2793a; --w-good: #22a05a; --w-bad: #d6334a; --w-bar: #b3b9d6;
  }
}
:host([theme="light"]) {
  --w-bg: #f7f8fc; --w-surface: #ffffff; --w-surface-2: #eef0f8;
  --w-line: rgba(20,24,48,.10); --w-line-2: rgba(20,24,48,.20);
  --w-text: #171a2e; --w-muted: #4b5272; --w-faint: #7a809c;
  --w-accent: #6d4ff2; --w-accent-2: #5a3fd6; --w-teal: #11998a;
  --w-warm: #e2793a; --w-good: #22a05a; --w-bad: #d6334a; --w-bar: #b3b9d6;
}
:host(:focus-visible) { box-shadow: 0 0 0 2px var(--w-accent); }
* { box-sizing: border-box; }
.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.grow { flex: 1; }
label.field { display: inline-flex; align-items: center; gap: 6px; color: var(--w-muted); font-size: 13px; }
select, input[type="text"], input[type="number"] {
  font: inherit; color: var(--w-text); background: var(--w-surface); border: 1px solid var(--w-line-2);
  border-radius: 8px; padding: 5px 8px; min-width: 0;
}
input[type="range"] { accent-color: var(--w-accent); }
button {
  font: inherit; color: var(--w-text); background: var(--w-surface-2); border: 1px solid var(--w-line-2);
  border-radius: 8px; padding: 5px 11px; cursor: pointer; min-width: 36px;
}
button:hover:not(:disabled) { border-color: var(--w-accent); }
button:disabled { opacity: .4; cursor: default; }
button.primary { background: var(--w-accent); border-color: transparent; color: #fff; }
.player { margin-top: 12px; }
.counter { color: var(--w-muted); font-size: 13px; }
.counter b { color: var(--w-text); font-variant-numeric: tabular-nums; }
.caption { min-height: 2.9em; margin-top: 10px; padding: 8px 12px; border-radius: 10px;
           background: var(--w-surface); border: 1px solid var(--w-line); color: var(--w-text); }
.caption small { color: var(--w-muted); }
.legend { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; color: var(--w-muted); font-size: 12px; }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
.note { color: var(--w-faint); font-size: 12px; margin-top: 6px; }
`;

/** Детерминированный генератор случайных чисел (mulberry32) — одинаковый seed, одинаковые данные. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Создать элемент: el("button", {class: "x", onclick: f}, "текст", child). */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
}

/**
 * Проигрыватель следа. Владеет кнопками и клавиатурой; виджет передаёт
 * render(index) — нарисовать кадр с номером index — и число кадров.
 * Скорость — шагов в секунду; меняется ползунком, без перезапуска.
 */
export class StepPlayer {
  constructor(host, render) {
    this.host = host;
    this.render = render;
    this.length = 0;
    this.index = 0;
    this.timer = null;
    this.speed = 6;
    this.el = this.#build();
    host.addEventListener("keydown", (e) => this.#key(e));
  }

  #build() {
    this.btnReset = el("button", { title: "В начало (Home)", "aria-label": "В начало", onclick: () => this.go(0) }, "⏮");
    this.btnBack = el("button", { title: "Шаг назад (←)", "aria-label": "Шаг назад", onclick: () => this.step(-1) }, "◀");
    this.btnPlay = el("button", { class: "primary", title: "Пуск / пауза (пробел)", "aria-label": "Пуск", onclick: () => this.toggle() }, "▶");
    this.btnFwd = el("button", { title: "Шаг вперёд (→)", "aria-label": "Шаг вперёд", onclick: () => this.step(1) }, "▶|");
    this.btnEnd = el("button", { title: "В конец (End)", "aria-label": "В конец", onclick: () => this.go(this.length - 1) }, "⏭");
    this.speedInput = el("input", { type: "range", min: "1", max: "60", value: String(this.speed), "aria-label": "Скорость" });
    this.speedInput.addEventListener("input", () => {
      this.speed = Number(this.speedInput.value);
      if (this.timer) { this.pause(); this.play(); }
    });
    this.position = el("span", { class: "counter" });
    this.scrub = el("input", { type: "range", min: "0", max: "0", value: "0", class: "grow", "aria-label": "Шаг" });
    this.scrub.addEventListener("input", () => { this.pause(); this.go(Number(this.scrub.value)); });
    return el("div", { class: "player" },
      el("div", { class: "row" }, this.btnReset, this.btnBack, this.btnPlay, this.btnFwd, this.btnEnd,
        el("label", { class: "field" }, "скорость", this.speedInput), this.position),
      el("div", { class: "row", style: "margin-top:6px" }, this.scrub));
  }

  #key(e) {
    // В поле ввода и списке стрелки и пробел нужны им самим.
    const origin = e.composedPath()[0];
    if (origin?.matches?.("input, select, textarea")) return;
    // Пробел и Enter на кнопке — её собственный щелчок, второй раз не переключаем.
    if (origin?.matches?.("button") && (e.key === " " || e.key === "Enter")) return;
    const map = { ArrowRight: () => this.step(1), ArrowLeft: () => this.step(-1), " ": () => this.toggle(),
                  Home: () => this.go(0), End: () => this.go(this.length - 1) };
    if (map[e.key]) { e.preventDefault(); map[e.key](); }
  }

  /** Новый след: длина и (по желанию) начальный кадр. */
  load(length, start = 0) {
    this.pause();
    this.length = length;
    this.scrub.max = String(Math.max(0, length - 1));
    this.go(start);
  }

  go(i) {
    this.index = Math.max(0, Math.min(this.length - 1, i));
    this.scrub.value = String(this.index);
    this.position.innerHTML = `шаг <b>${this.index}</b> из <b>${Math.max(0, this.length - 1)}</b>`;
    this.btnBack.disabled = this.btnReset.disabled = this.index === 0;
    this.btnFwd.disabled = this.btnEnd.disabled = this.index >= this.length - 1;
    this.render(this.index);
  }

  step(d) { this.pause(); this.go(this.index + d); }

  play() {
    if (this.index >= this.length - 1) this.go(0);
    this.btnPlay.textContent = "⏸";
    this.btnPlay.setAttribute("aria-label", "Пауза");
    this.timer = setInterval(() => {
      if (this.index >= this.length - 1) return this.pause();
      this.go(this.index + 1);
    }, 1000 / this.speed);
  }

  pause() {
    clearInterval(this.timer);
    this.timer = null;
    this.btnPlay.textContent = "▶";
    this.btnPlay.setAttribute("aria-label", "Пуск");
  }

  toggle() { this.timer ? this.pause() : this.play(); }
}

/** Склонение: plural(3, "сравнение", "сравнения", "сравнений"). */
export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
