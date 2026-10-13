// <sotto-tcp> — TCP по шагам: диаграмма обмена сегментами между клиентом и
// сервером с состояниями соединения, потерями и повторами; отдельно — рост
// окна перегрузки (slow start, избегание перегрузки, потери).
//
//   <sotto-tcp scenario="handshake"></sotto-tcp>
//   <sotto-tcp scenario="fast-retransmit" step="12"></sotto-tcp>
//
// Атрибуты: scenario (handshake|timeout|fast-retransmit|lost-ack|cwnd), step, theme.

import { BASE_STYLE, StepPlayer, el } from "./core.js";

/*
 * Сценарий — список событий во времени. Время в половинах RTT: сегмент идёт
 * от стороны к стороне 1 единицу. Сообщение: {at, from: "c"|"s", label, lost,
 * text, arrive (текст по приходу), set / setArrive — смена состояний}.
 * Заметка: {at, note, side, text, set}. Таймер: {timer, side, from, to, label}.
 */
export const SCENARIOS = {
  handshake: {
    title: "Установка, данные и закрытие",
    start: { c: "CLOSED", s: "LISTEN" },
    events: [
      { at: 0, from: "c", label: "SYN seq=1000", set: { c: "SYN_SENT" }, text: "Клиент вызывает connect(): шлёт SYN со случайным начальным номером 1000.", arrive: "Сервер получил SYN, запоминает номер клиента и кладёт соединение в очередь SYN.", setArrive: { s: "SYN_RCVD" } },
      { at: 1, from: "s", label: "SYN-ACK seq=5000 ack=1001", text: "Сервер отвечает SYN-ACK: свой номер 5000 и подтверждение номера клиента + 1.", arrive: "Клиент получил SYN-ACK — для него соединение установлено. Прошёл один RTT.", setArrive: { c: "ESTABLISHED" } },
      { at: 2, from: "c", label: "ACK ack=5001", text: "Клиент подтверждает номер сервера. Третий шаг рукопожатия.", arrive: "Сервер получил ACK — соединение установлено и с его стороны, accept() вернёт сокет.", setArrive: { s: "ESTABLISHED" } },
      { at: 2.5, from: "c", label: "GET / seq=1001, 100 Б", text: "Клиент сразу шлёт запрос: 100 байт, первый байт имеет номер 1001.", arrive: "Сервер получил 100 байт. Следующий ожидаемый — 1101." },
      { at: 3.5, from: "s", label: "200 OK seq=5001, 300 Б ack=1101", text: "Сервер отвечает: подтверждение 1101 едет в том же сегменте, что и данные ответа.", arrive: "Клиент получил ответ." },
      { at: 4.5, from: "c", label: "ACK ack=5301", text: "Клиент подтверждает 300 байт ответа.", arrive: "Сервер знает, что ответ дошёл, и может освободить буфер отправки." },
      { at: 5.4, from: "c", label: "FIN seq=1101", set: { c: "FIN_WAIT_1" }, text: "Клиент закрывает соединение: FIN — «я больше не буду писать».", arrive: "Сервер получил FIN: read() вернёт конец потока. Сервер ещё может дописать своё.", setArrive: { s: "CLOSE_WAIT" } },
      { at: 6.4, from: "s", label: "ACK ack=1102", text: "Сервер подтверждает FIN клиента.", arrive: "Половина клиента закрыта. Клиент ждёт FIN сервера.", setArrive: { c: "FIN_WAIT_2" } },
      { at: 6.9, from: "s", label: "FIN seq=5301", set: { s: "LAST_ACK" }, text: "Сервер вызывает close(): шлёт свой FIN.", arrive: "Клиент получил FIN сервера и переходит в TIME_WAIT.", setArrive: { c: "TIME_WAIT" } },
      { at: 7.9, from: "c", label: "ACK ack=5302", text: "Клиент подтверждает последний FIN.", arrive: "Сервер получил ACK — соединение для него закрыто.", setArrive: { s: "CLOSED" } },
      { at: 9.6, note: true, side: "c", set: { c: "CLOSED" }, text: "Клиент ждал 2×MSL (в Linux 60 секунд) в TIME_WAIT — на случай, если последний ACK потерялся и сервер повторит FIN. Теперь соединение закрыто." },
    ],
    timers: [{ side: "c", from: 7.8, to: 9.6, label: "2×MSL" }],
  },
  timeout: {
    title: "Потеря сегмента и повтор по таймауту",
    start: { c: "ESTABLISHED", s: "ESTABLISHED" },
    events: [
      { at: 0, from: "c", label: "seq=1001, 100 Б", lost: true, text: "Соединение установлено. Клиент шлёт 100 байт и запускает таймер повторной передачи (RTO).", arrive: "Сегмент потерялся в сети: сервер ничего не получил и ничего не подтвердит." },
      { at: 3, note: true, side: "c", text: "Таймер RTO истёк, подтверждения нет. Клиент считает сегмент потерянным и уменьшает окно перегрузки до минимума." },
      { at: 3.1, from: "c", label: "seq=1001, 100 Б (повтор)", text: "Повторная отправка того же сегмента. Следующий RTO будет вдвое длиннее — экспоненциальная отсрочка.", arrive: "Повтор дошёл." },
      { at: 4.1, from: "s", label: "ACK ack=1101", text: "Сервер подтверждает: ждёт байт 1101.", arrive: "Клиент получил подтверждение. Потеря стоила целый RTO — обычно от 200 мс, это намного дольше RTT." },
    ],
    timers: [{ side: "c", from: 0, to: 3, label: "RTO" }],
  },
  "fast-retransmit": {
    title: "Три повторных ACK и быстрый повтор",
    start: { c: "ESTABLISHED", s: "ESTABLISHED" },
    events: [
      { at: 0, from: "c", label: "#1 seq=1001", text: "Окно позволяет отправить 5 сегментов подряд, не дожидаясь подтверждений.", arrive: "Сегмент №1 дошёл." },
      { at: 0.4, from: "c", label: "#2 seq=1101", lost: true, text: "Сегмент №2 отправлен…", arrive: "…и потерялся." },
      { at: 0.8, from: "c", label: "#3 seq=1201", text: "Сегмент №3.", arrive: "№3 пришёл раньше №2 — дыра в потоке. Сервер кладёт его в буфер, но приложению отдать не может." },
      { at: 1.2, from: "c", label: "#4 seq=1301", text: "Сегмент №4.", arrive: "№4 тоже ждёт в буфере." },
      { at: 1.6, from: "c", label: "#5 seq=1401", text: "Сегмент №5.", arrive: "№5 тоже ждёт в буфере." },
      { at: 1.02, from: "s", label: "ACK 1101", text: "Сервер подтверждает №1: ждёт байт 1101.", arrive: "Клиент получил ACK 1101 — №1 доставлен." },
      { at: 1.82, from: "s", label: "ACK 1101 (повтор 1)", text: "На №3 сервер снова говорит «жду 1101» — подтверждение кумулятивное, дальше дыры двигаться нельзя.", arrive: "Первый повторный ACK. Может быть просто перестановка пакетов — клиент ждёт." },
      { at: 2.22, from: "s", label: "ACK 1101 (повтор 2)", text: "На №4 — снова «жду 1101».", arrive: "Второй повторный ACK." },
      { at: 2.62, from: "s", label: "ACK 1101 (повтор 3)", text: "На №5 — снова «жду 1101».", arrive: "Третий повторный ACK: сегмент 1101 почти наверняка потерян. Не дожидаясь таймера, клиент повторяет его и вдвое уменьшает окно." },
      { at: 3.64, from: "c", label: "#2 seq=1101 (повтор)", text: "Быстрый повтор (fast retransmit) — через один RTT после потери, а не через RTO.", arrive: "Дыра закрыта: в буфере сервера теперь №2–№5 подряд." },
      { at: 4.66, from: "s", label: "ACK 1501", text: "Одно подтверждение сразу на всё до байта 1501 — №3–№5 повторно слать не нужно.", arrive: "Все пять сегментов доставлены. Приложение сервера прочитает их по порядку." },
    ],
    timers: [],
  },
  "lost-ack": {
    title: "Потерян последний ACK — зачем TIME_WAIT",
    start: { c: "ESTABLISHED", s: "ESTABLISHED" },
    events: [
      { at: 0, from: "c", label: "FIN", set: { c: "FIN_WAIT_1" }, text: "Клиент закрывает соединение первым.", arrive: "Сервер получил FIN.", setArrive: { s: "CLOSE_WAIT" } },
      { at: 1, from: "s", label: "ACK", text: "Сервер подтверждает FIN.", arrive: "Клиент ждёт FIN сервера.", setArrive: { c: "FIN_WAIT_2" } },
      { at: 1.4, from: "s", label: "FIN", set: { s: "LAST_ACK" }, text: "Сервер закрывает свою половину.", arrive: "Клиент получил FIN, подтверждает и уходит в TIME_WAIT.", setArrive: { c: "TIME_WAIT" } },
      { at: 2.4, from: "c", label: "ACK", lost: true, text: "Последний ACK…", arrive: "…потерялся. Сервер не знает, дошёл ли его FIN." },
      { at: 4.6, note: true, side: "s", text: "У сервера истёк таймер: подтверждения FIN нет. Он повторяет FIN." },
      { at: 4.7, from: "s", label: "FIN (повтор)", text: "Повторный FIN.", arrive: "Клиент всё ещё в TIME_WAIT и помнит это соединение — он отвечает ACK. Если бы клиент уже забыл соединение, он ответил бы RST, и сервер увидел бы ошибку." },
      { at: 5.7, from: "c", label: "ACK", text: "Повторный ACK.", arrive: "Сервер корректно закрыл соединение.", setArrive: { s: "CLOSED" } },
      { at: 7.4, note: true, side: "c", set: { c: "CLOSED" }, text: "2×MSL истекли — клиент тоже закрыл соединение. Заодно за это время из сети исчезнут опоздавшие сегменты старого соединения, и они не попадут в новое с теми же портами." },
    ],
    timers: [{ side: "s", from: 1.4, to: 4.6, label: "RTO" }, { side: "c", from: 2.4, to: 7.4, label: "2×MSL" }],
  },
};

/** Раскладка сценария в кадры: каждое событие — отправка, приход или заметка. */
export function trace(name) {
  const sc = SCENARIOS[name];
  const msgs = [];
  const items = [];
  sc.events.forEach((e, i) => {
    if (e.note) { items.push({ t: e.at, order: 1, kind: "note", ev: e }); return; }
    const m = { id: msgs.length, ...e, to: e.from === "c" ? "s" : "c", end: e.at + 1 };
    msgs.push(m);
    items.push({ t: e.at, order: 2, kind: "send", msg: m });
    items.push({ t: e.lost ? e.at + 0.55 : e.at + 1, order: 0, kind: e.lost ? "lost" : "arrive", msg: m });
  });
  items.sort((a, b) => a.t - b.t || a.order - b.order);
  const state = { ...sc.start };
  const changes = [{ side: "c", state: state.c, t: -0.4, frame: -1 }, { side: "s", state: state.s, t: -0.4, frame: -1 }];
  const frames = items.map((it, idx) => {
    let set = null, text;
    if (it.kind === "note") { set = it.ev.set; text = it.ev.text; }
    else if (it.kind === "send") { set = it.msg.set; text = it.msg.text; it.msg.sendFrame = idx; }
    else { set = it.kind === "arrive" ? it.msg.setArrive : null; text = it.msg.arrive; it.msg.endFrame = idx; }
    for (const [side, st] of Object.entries(set || {})) {
      state[side] = st;
      changes.push({ side, state: st, t: it.t, frame: idx });
    }
    return { t: it.t, kind: it.kind, msg: it.msg ? it.msg.id : null, text, state: { ...state } };
  });
  return { title: sc.title, msgs, frames, changes, timers: sc.timers, maxT: Math.max(...items.map((i) => i.t)) };
}

/**
 * Окно перегрузки по RTT (в сегментах, Reno): slow start удваивает окно, после
 * порога — +1 за RTT; при потере (окно больше ёмкости канала) — вдвое; при
 * таймауте — снова начальное окно и slow start.
 */
export function cwndTrace({ rtts = 44, capacity = 100, initial = 10, timeoutAt = 32 } = {}) {
  let cwnd = initial, ssthresh = Infinity;
  const frames = [];
  for (let r = 0; r < rtts; r++) {
    let event, text;
    const shown = cwnd;               // столбик — окно, с которым прошёл этот RTT
    if (r === timeoutAt) {
      ssthresh = Math.max(2, Math.floor(cwnd / 2));
      event = "timeout";
      text = `RTT ${r}: таймаут (RTO) — подтверждения перестали приходить. Порог = половина окна (${ssthresh}), окно сбрасывается до ${initial}, дальше снова slow start.`;
      cwnd = initial;
    } else if (cwnd > capacity) {
      ssthresh = Math.max(2, Math.floor(cwnd / 2));
      event = "loss";
      text = `RTT ${r}: окно ${cwnd} больше, чем пропускает канал (${capacity}) — очередь в маршрутизаторе переполнилась, пакет потерян. Три повторных ACK: окно и порог — вдвое, до ${ssthresh}.`;
      cwnd = ssthresh;
    } else if (cwnd < ssthresh) {
      event = "slow-start";
      text = `RTT ${r}: slow start — каждый ACK увеличивает окно на сегмент, за RTT окно удваивается: ${cwnd} → ${Math.min(cwnd * 2, ssthresh)}.`;
    } else {
      event = "avoidance";
      text = `RTT ${r}: избегание перегрузки — окно растёт на 1 сегмент за RTT: ${cwnd} → ${cwnd + 1}. Осторожно нащупываем предел канала.`;
    }
    frames.push({ r, cwnd: shown, ssthresh, event, text });
    if (event === "slow-start") cwnd = Math.min(cwnd * 2, ssthresh);
    else if (event === "avoidance") cwnd += 1;
  }
  return { frames, capacity, initial };
}

const STYLE = `
.view { overflow-x: auto; margin-top: 12px; background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; padding: 6px; }
svg { width: 100%; min-width: 540px; height: auto; display: block; }
.lane { stroke: var(--w-line-2); stroke-width: 2; }
.who { font: 700 14px "Manrope", system-ui, sans-serif; fill: var(--w-text); text-anchor: middle; }
.st { font: 600 11px "JetBrains Mono", ui-monospace, monospace; fill: var(--w-teal); }
.st.cur { fill: var(--w-warm); }
.st-old { opacity: .55; }
.arrow { stroke: var(--w-accent-2); stroke-width: 2; fill: none; }
.arrow.reply { stroke: var(--w-teal); }
.arrow.fly { stroke-dasharray: 5 4; opacity: .8; }
.arrow.lost { stroke: var(--w-bad); stroke-dasharray: 5 4; }
.arrow.now { stroke-width: 3; }
.lbl { font: 600 11px "JetBrains Mono", ui-monospace, monospace; fill: var(--w-text); text-anchor: middle; }
.lblbg { fill: var(--w-surface); opacity: .92; }
.x { stroke: var(--w-bad); stroke-width: 3; }
.timer { stroke: var(--w-warm); stroke-width: 2; fill: none; }
.tlbl { font: 600 10px "JetBrains Mono", ui-monospace, monospace; fill: var(--w-warm); }
.note { fill: var(--w-warm); }
.bar { fill: var(--w-accent); }
.bar.loss { fill: var(--w-bad); }
.bar.timeout { fill: var(--w-warm); }
.bar.future { fill: var(--w-surface-2); }
.cap { stroke: var(--w-bad); stroke-dasharray: 6 4; stroke-width: 1.5; }
.thr { stroke: var(--w-teal); stroke-dasharray: 3 3; stroke-width: 1.5; }
.axis { font: 10px "JetBrains Mono", ui-monospace, monospace; fill: var(--w-faint); }
.states { display: flex; justify-content: space-between; gap: 8px; margin-top: 8px; font-size: 13px; color: var(--w-muted); }
.states b { color: var(--w-warm); font-family: "JetBrains Mono", ui-monospace, monospace; }
`;

const NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};

class SottoTcp extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.built = true;
    const initial = this.getAttribute("scenario") || "handshake";
    this.sel = el("select", { "aria-label": "Сценарий", onchange: () => this.#load() },
      ...Object.entries(SCENARIOS).map(([k, s]) => el("option", { value: k, selected: k === initial }, s.title)),
      el("option", { value: "cwnd", selected: initial === "cwnd" }, "Окно перегрузки: slow start и потери"));
    this.svg = svgEl("svg", { role: "img" });
    this.states = el("div", { class: "states" });
    this.caption = el("div", { class: "caption", "aria-live": "polite" });
    this.legend = el("div", { class: "legend" });
    this.player = new StepPlayer(this, (i) => this.#render(i));
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE),
      el("div", { class: "row" }, el("label", { class: "field" }, "сценарий", this.sel)),
      el("div", { class: "view" }, this.svg), this.states, this.caption, this.legend, this.player.el);
    this.#load();
    const step = this.getAttribute("step");
    if (step != null) this.player.go(Number(step));
  }

  #load() {
    const name = this.sel.value;
    if (name === "cwnd") {
      this.cw = cwndTrace();
      this.t = null;
      this.legend.replaceChildren(
        el("span", {}, el("i", { style: "background:var(--w-accent)" }), "окно перегрузки (сегментов в полёте)"),
        el("span", {}, el("i", { style: "background:var(--w-bad)" }), "потеря: три повторных ACK"),
        el("span", {}, el("i", { style: "background:var(--w-warm)" }), "таймаут"),
        el("span", {}, el("i", { style: "background:transparent;border-top:2px dashed var(--w-teal);border-radius:0;height:0;vertical-align:3px" }), "порог ssthresh"),
        el("span", {}, el("i", { style: "background:transparent;border-top:2px dashed var(--w-bad);border-radius:0;height:0;vertical-align:3px" }), "сколько пропускает канал"));
      this.player.load(this.cw.frames.length + 1);
    } else {
      this.t = trace(name);
      this.cw = null;
      this.legend.replaceChildren(
        el("span", {}, el("i", { style: "background:var(--w-accent-2)" }), "от клиента"),
        el("span", {}, el("i", { style: "background:var(--w-teal)" }), "от сервера"),
        el("span", {}, el("i", { style: "background:var(--w-bad)" }), "потерян"),
        el("span", {}, el("i", { style: "background:var(--w-warm)" }), "таймер и текущее состояние"),
        el("span", {}, "время идёт сверху вниз, наклон стрелки — задержка в сети"));
      this.player.load(this.t.frames.length + 1);
    }
  }

  #render(index) {
    if (this.cw) return this.#renderCwnd(index);
    const { msgs, frames, changes, timers, maxT } = this.t;
    const cur = index - 1;              // кадр 0 — до начала
    const f = frames[cur];
    const W = 640, cx = 150, sx = 490, top = 54, unit = 42;
    const y = (t) => top + (t + 0.4) * unit;
    const H = y(maxT + 0.6) + 10;
    this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const parts = [
      svgEl("text", { x: cx, y: 20, class: "who" }, "клиент"), svgEl("text", { x: sx, y: 20, class: "who" }, "сервер"),
      svgEl("line", { x1: cx, y1: 30, x2: cx, y2: H - 6, class: "lane" }), svgEl("line", { x1: sx, y1: 30, x2: sx, y2: H - 6, class: "lane" }),
    ];
    const tNow = f ? f.t : -1;
    // Таймеры: скобка сбоку от линии, растёт до текущего момента.
    for (const tm of timers) {
      if (tNow < tm.from) continue;
      const x = tm.side === "c" ? cx - 12 : sx + 12, end = Math.min(tm.to, tNow);
      parts.push(svgEl("path", { d: `M ${x + (tm.side === "c" ? 6 : -6)} ${y(tm.from)} H ${x} V ${y(end)} H ${x + (tm.side === "c" ? 6 : -6)}`, class: "timer" }));
      parts.push(svgEl("text", { x: tm.side === "c" ? x - 4 : x + 4, y: (y(tm.from) + y(end)) / 2 + 4, class: "tlbl", "text-anchor": tm.side === "c" ? "end" : "start" }, tm.label));
    }
    // Смены состояний: подписи снаружи от линий.
    const shown = changes.filter((c) => c.frame <= cur);
    for (const side of ["c", "s"]) {
      const list = shown.filter((c) => c.side === side);
      list.forEach((c, i) => {
        const last = i === list.length - 1;
        const x = side === "c" ? cx - (timers.some((t) => t.side === "c") ? 30 : 10) : sx + (timers.some((t) => t.side === "s") ? 30 : 10);
        parts.push(svgEl("circle", { cx: side === "c" ? cx : sx, cy: y(c.t), r: 3.5, class: "note" }));
        parts.push(svgEl("text", { x, y: y(c.t) + 4, class: "st" + (last ? " cur" : " st-old"), "text-anchor": side === "c" ? "end" : "start" }, c.state));
      });
    }
    // Сообщения.
    for (const m of msgs) {
      if (m.sendFrame > cur) continue;
      const x1 = m.from === "c" ? cx : sx, x2 = m.from === "c" ? sx : cx;
      const done = m.endFrame <= cur;
      const frac = m.lost ? (done ? 0.55 : 0.3) : done ? 1 : 0.45;
      const xe = x1 + (x2 - x1) * frac, ye = y(m.at) + (y(m.end) - y(m.at)) * frac;
      const now = f && f.msg === m.id;
      const cls = "arrow" + (m.from === "s" ? " reply" : "") + (m.lost ? " lost" : !done ? " fly" : "") + (now ? " now" : "");
      parts.push(svgEl("line", { x1, y1: y(m.at), x2: xe, y2: ye, class: cls }));
      if (done && !m.lost) {
        const dx = x2 - x1, dy = y(m.end) - y(m.at), len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
        parts.push(svgEl("path", { d: `M ${xe} ${ye} L ${xe - ux * 10 - uy * 5} ${ye - uy * 10 + ux * 5} L ${xe - ux * 10 + uy * 5} ${ye - uy * 10 - ux * 5} Z`, class: cls.replace(" fly", ""), style: `fill: var(${m.from === "s" ? "--w-teal" : "--w-accent-2"})` }));
      }
      if (m.lost && done) {
        parts.push(svgEl("line", { x1: xe - 7, y1: ye - 7, x2: xe + 7, y2: ye + 7, class: "x" }), svgEl("line", { x1: xe - 7, y1: ye + 7, x2: xe + 7, y2: ye - 7, class: "x" }));
      }
      // Подпись — у середины пути стрелки, на подложке.
      const lf = Math.min(frac, 0.36), mx = x1 + (x2 - x1) * lf, my = y(m.at) + (y(m.end) - y(m.at)) * lf - 5;
      const tw = m.label.length * 6.7 + 8;
      parts.push(svgEl("rect", { x: mx - tw / 2, y: my - 11, width: tw, height: 15, rx: 4, class: "lblbg" }));
      parts.push(svgEl("text", { x: mx, y: my, class: "lbl" }, m.label));
    }
    this.svg.replaceChildren(...parts);
    this.svg.setAttribute("aria-label", `Обмен TCP: ${this.t.title}`);
    const st = f ? f.state : SCENARIOS[this.sel.value].start;
    this.states.innerHTML = `<span>клиент: <b>${st.c}</b></span><span>сервер: <b>${st.s}</b></span>`;
    this.caption.textContent = f ? f.text : `${this.t.title}. Нажмите «вперёд» или пробел — сегменты пойдут по одному.`;
  }

  #renderCwnd(index) {
    const { frames, capacity } = this.cw;
    const cur = index - 1;
    const W = 640, H = 300, left = 40, bottom = 270, top = 16;
    const maxY = Math.max(capacity * 1.35, ...frames.map((f) => f.cwnd));
    const y = (v) => bottom - ((bottom - top) * v) / maxY;
    const bw = (W - left - 10) / frames.length;
    this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const parts = [];
    for (const v of [0, 50, 100, 150].filter((v) => v <= maxY)) {
      parts.push(svgEl("line", { x1: left, y1: y(v), x2: W - 6, y2: y(v), stroke: "var(--w-line)" }));
      parts.push(svgEl("text", { x: left - 6, y: y(v) + 3, class: "axis", "text-anchor": "end" }, String(v)));
    }
    frames.forEach((f, i) => {
      const cls = i > cur ? "bar future" : "bar" + (f.event === "loss" ? " loss" : f.event === "timeout" ? " timeout" : "");
      parts.push(svgEl("rect", { x: left + i * bw + 1, y: y(f.cwnd), width: Math.max(1, bw - 2), height: bottom - y(f.cwnd), rx: 2, class: cls }));
    });
    parts.push(svgEl("line", { x1: left, y1: y(capacity), x2: W - 6, y2: y(capacity), class: "cap" }));
    const thr = cur >= 0 ? frames[cur].ssthresh : Infinity;
    if (Number.isFinite(thr)) parts.push(svgEl("line", { x1: left, y1: y(thr), x2: W - 6, y2: y(thr), class: "thr" }));
    for (let r = 0; r < frames.length; r += 5) parts.push(svgEl("text", { x: left + r * bw + bw / 2, y: bottom + 14, class: "axis", "text-anchor": "middle" }, String(r)));
    parts.push(svgEl("text", { x: W - 8, y: bottom + 26, class: "axis", "text-anchor": "end" }, "RTT →"));
    this.svg.replaceChildren(...parts);
    this.svg.setAttribute("aria-label", "Окно перегрузки TCP по RTT");
    const f = frames[cur];
    this.states.innerHTML = f ? `<span>окно: <b>${f.cwnd}</b> сегм.</span><span>порог: <b>${Number.isFinite(f.ssthresh) ? f.ssthresh : "∞"}</b></span>` : "<span>окно: <b>—</b></span>";
    this.caption.textContent = f ? f.text : "Окно перегрузки — сколько сегментов отправитель держит в полёте без подтверждения. Скорость ≈ окно / RTT. Пустые столбики — будущее.";
  }
}

customElements.define("sotto-tcp", SottoTcp);
