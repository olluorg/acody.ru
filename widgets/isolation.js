// <sotto-isolation> — уровни изоляции транзакций в модели MVCC PostgreSQL:
// две транзакции по шагам, версии строк (xmin/xmax), снимки и ошибки
// сериализации. Видно, какие аномалии возможны на Read Committed,
// Repeatable Read и Serializable.
//
//   <sotto-isolation scenario="lost-update" level="rc"></sotto-isolation>
//
// Атрибуты: scenario (dirty | nonrepeatable | phantom | lost-update | write-skew),
// level (ru | rc | rr | ser), step, theme.
//
// Модель упрощена до двух транзакций, без блокировок-ожиданий: сценарии
// подобраны так, чтобы запись не ждала чужую незавершённую. Serializable —
// упрощённый SSI: откат, если у двух пересекающихся транзакций есть
// rw-зависимости в обе стороны.

import { BASE_STYLE, el, StepPlayer } from "./core.js";

export const LEVELS = {
  ru: { title: "Read Uncommitted", short: "RU" },
  rc: { title: "Read Committed", short: "RC" },
  rr: { title: "Repeatable Read", short: "RR" },
  ser: { title: "Serializable", short: "SER" },
};

// Строки: {id, name, v}. Шаги: {tx, begin} {tx, read: {ids|all|sum|count, where?}, as, sql}
// {tx, update: {id, set: (vars) => v}, sql} {tx, insert: {id, name, v}, sql} {tx, commit} {tx, rollback}
export const SCENARIOS = {
  dirty: {
    title: "Грязное чтение",
    rows: [{ id: 1, name: "счёт A", v: 100 }],
    steps: [
      { tx: 1, begin: true },
      { tx: 2, begin: true },
      { tx: 2, update: { id: 1, set: () => 50 }, sql: "UPDATE accounts SET balance = 50 WHERE id = 1" },
      { tx: 1, read: { ids: [1] }, as: "x", sql: "SELECT balance FROM accounts WHERE id = 1" },
      { tx: 2, rollback: true },
      { tx: 1, commit: true },
    ],
    moral: "PostgreSQL не показывает незафиксированные данные ни на одном уровне: Read Uncommitted в нём работает как Read Committed.",
  },
  nonrepeatable: {
    title: "Неповторяемое чтение",
    rows: [{ id: 1, name: "счёт A", v: 100 }],
    steps: [
      { tx: 1, begin: true },
      { tx: 2, begin: true },
      { tx: 1, read: { ids: [1] }, as: "x1", sql: "SELECT balance FROM accounts WHERE id = 1" },
      { tx: 2, update: { id: 1, set: () => 50 }, sql: "UPDATE accounts SET balance = 50 WHERE id = 1" },
      { tx: 2, commit: true },
      { tx: 1, read: { ids: [1] }, as: "x2", sql: "SELECT balance FROM accounts WHERE id = 1" },
      { tx: 1, commit: true },
    ],
    moral: "На Read Committed каждый запрос берёт новый снимок и видит зафиксированное к его началу; с Repeatable Read снимок один на транзакцию.",
  },
  phantom: {
    title: "Фантом",
    rows: [{ id: 1, name: "заказ 1", v: 120 }, { id: 2, name: "заказ 2", v: 80 }],
    steps: [
      { tx: 1, begin: true },
      { tx: 2, begin: true },
      { tx: 1, read: { count: true, where: (r) => r.v > 100 }, as: "n1", sql: "SELECT count(*) FROM orders WHERE amount > 100" },
      { tx: 2, insert: { id: 3, name: "заказ 3", v: 150 }, sql: "INSERT INTO orders VALUES (3, 150)" },
      { tx: 2, commit: true },
      { tx: 1, read: { count: true, where: (r) => r.v > 100 }, as: "n2", sql: "SELECT count(*) FROM orders WHERE amount > 100" },
      { tx: 1, commit: true },
    ],
    moral: "По стандарту SQL фантомы допустимы на Repeatable Read, но в PostgreSQL снимок защищает и от них.",
  },
  "lost-update": {
    title: "Потерянное обновление",
    rows: [{ id: 1, name: "счётчик", v: 100 }],
    steps: [
      { tx: 1, begin: true },
      { tx: 2, begin: true },
      { tx: 1, read: { ids: [1] }, as: "a", sql: "SELECT v FROM counters WHERE id = 1" },
      { tx: 2, read: { ids: [1] }, as: "b", sql: "SELECT v FROM counters WHERE id = 1" },
      { tx: 1, update: { id: 1, set: (vars) => vars.a + 10 }, sql: "UPDATE counters SET v = :a + 10 WHERE id = 1" },
      { tx: 1, commit: true },
      { tx: 2, update: { id: 1, set: (vars) => vars.b + 20 }, sql: "UPDATE counters SET v = :b + 20 WHERE id = 1" },
      { tx: 2, commit: true },
    ],
    moral: "Read-modify-write в приложении теряет обновления на Read Committed. Решения: UPDATE … SET v = v + 10 (атомарно в базе), SELECT … FOR UPDATE, оптимистическая версия или Repeatable Read с повтором.",
  },
  "write-skew": {
    title: "Write skew: дежурные врачи",
    rows: [{ id: 1, name: "Алиса на дежурстве", v: 1 }, { id: 2, name: "Борис на дежурстве", v: 1 }],
    steps: [
      { tx: 1, begin: true },
      { tx: 2, begin: true },
      { tx: 1, read: { sum: true }, as: "n", sql: "SELECT count(*) FROM doctors WHERE on_call" },
      { tx: 2, read: { sum: true }, as: "n", sql: "SELECT count(*) FROM doctors WHERE on_call" },
      { tx: 1, update: { id: 1, set: () => 0 }, sql: "UPDATE doctors SET on_call = false WHERE name = 'Алиса'  -- дежурных 2, можно уйти" },
      { tx: 2, update: { id: 2, set: () => 0 }, sql: "UPDATE doctors SET on_call = false WHERE name = 'Борис'  -- тоже видит 2" },
      { tx: 1, commit: true },
      { tx: 2, commit: true },
    ],
    moral: "Каждая транзакция проверила правило «хотя бы один дежурный» на своём снимке и изменила разные строки — конфликта записи нет. Защищает только Serializable (или явная блокировка проверяемых строк).",
  },
};

const fmt = (v) => (v == null ? "—" : String(v));

/** След выполнения сценария на уровне level. */
export function simulate(scenario, level) {
  const snapEachStatement = level === "ru" || level === "rc";
  const versions = new Map(scenario.rows.map((r) => [r.id, [{ name: r.name, v: r.v, xmin: 0, xmax: null }]]));
  const status = { 0: "committed", 1: "idle", 2: "idle" };
  const commitOrder = [0];
  const snapshot = {};         // tx → множество зафиксированных к моменту снимка
  const firstSnap = {};        // tx → снимок первого запроса: от него считаем «чужое параллельное» изменение
  const vars = { 1: {}, 2: {} };
  const log = { 1: [], 2: [] };
  const reads = { 1: new Set(), 2: new Set() }, writes = { 1: new Set(), 2: new Set() };
  const startedAt = {};        // tx → номер в commitOrder к началу (для пересечения)
  const frames = [];

  const committed = () => new Set(commitOrder);
  const visible = (ver, tx, snap) => (ver.xmin === tx || snap.has(ver.xmin)) && !(ver.xmax === tx || (ver.xmax != null && snap.has(ver.xmax)));
  const takeSnap = (tx) => {
    if (snapEachStatement || !snapshot[tx]) snapshot[tx] = committed();
    firstSnap[tx] ??= snapshot[tx];
    return snapshot[tx];
  };
  const visibleRows = (tx, snap) => [...versions].map(([id, chain]) => {
    const ver = chain.find((x) => visible(x, tx, snap));
    return ver ? { id, name: ver.name, v: ver.v } : null;
  }).filter(Boolean);
  const push = (tx, text, extra = {}) => frames.push({
    tx, text, ...extra,
    status: { 1: status[1], 2: status[2] },
    log: { 1: [...log[1]], 2: [...log[2]] },
    table: [...versions].map(([id, chain]) => ({ id, chain: chain.map((x) => ({ ...x })) })),
    txState: { ...status },
  });

  push(0, `Две транзакции на уровне ${LEVELS[level].title}. Каждая версия строки помнит, какая транзакция её создала (xmin) и какая заменила (xmax).`);
  for (const st of scenario.steps) {
    const tx = st.tx;
    if (status[tx] === "aborted") {
      if (st.commit || st.rollback) { log[tx].push({ sql: st.commit ? "COMMIT" : "ROLLBACK", res: "уже откачена", bad: true }); push(tx, `T${tx} уже откачена — дальше она ничего не делает.`); }
      continue;
    }
    if (st.begin) {
      status[tx] = "active";
      startedAt[tx] = commitOrder.length;
      log[tx].push({ sql: `BEGIN ISOLATION LEVEL ${LEVELS[level].title.toUpperCase()}` });
      push(tx, `T${tx} начинается. Снимок данных она возьмёт при первом запросе.`);
    } else if (st.read) {
      const snap = takeSnap(tx);
      const rows = visibleRows(tx, snap);
      let res;
      if (st.read.ids) res = rows.filter((r) => st.read.ids.includes(r.id)).map((r) => r.v)[0];
      else if (st.read.count) res = rows.filter(st.read.where).length;
      else if (st.read.sum) res = rows.reduce((s, r) => s + r.v, 0);
      for (const r of rows) reads[tx].add(r.id);
      reads[tx].add("table");
      vars[tx][st.as] = res;
      log[tx].push({ sql: st.sql, res: fmt(res) });
      push(tx, snapEachStatement
        ? `T${tx} читает со свежим снимком запроса: видит всё, что зафиксировано к этому моменту → ${fmt(res)}.`
        : `T${tx} читает из снимка транзакции: видит то, что было зафиксировано к её первому запросу → ${fmt(res)}.`,
      { hl: { tx, rows: rows.map((r) => r.id) } });
    } else if (st.update) {
      const snap = takeSnap(tx);
      const chain = versions.get(st.update.id);
      const latest = chain.find((x) => status[x.xmin] !== "aborted" && (x.xmax == null || status[x.xmax] === "aborted"));
      const author = latest.xmin;
      if (author !== tx && status[author] === "active") throw new Error("сценарий требует ожидания блокировки — в модели не поддерживается");
      const concurrent = author !== tx && !firstSnap[tx].has(author);
      if (concurrent && !snapEachStatement) {
        status[tx] = "aborted";
        log[tx].push({ sql: st.sql, res: "ERROR: could not serialize access due to concurrent update", bad: true });
        push(tx, `Строку уже изменила T${author}, зафиксированная после снимка T${tx}. На ${LEVELS[level].title} обновлять её поверх нельзя — T${tx} откачена, приложение должно повторить транзакцию.`);
        continue;
      }
      const value = st.update.set(vars[tx]);
      latest.xmax = tx;
      chain.unshift({ name: latest.name, v: value, xmin: tx, xmax: null });
      writes[tx].add(st.update.id);
      writes[tx].add("table");
      log[tx].push({ sql: st.sql.replace(/:(\w+)/g, (_, k) => fmt(vars[tx][k])), res: "UPDATE 1" });
      push(tx, concurrent
        ? `Строку уже изменила зафиксированная T${author}. На Read Committed UPDATE просто применяется к последней версии — значение ${value} посчитано приложением из старого чтения, и изменение T${author} затирается.`
        : `T${tx} создаёт новую версию строки (xmin = ${tx}) со значением ${value}; старую помечает xmax = ${tx}. Другие транзакции новую версию пока не видят.`,
      { hl: { tx, rows: [st.update.id] } });
    } else if (st.insert) {
      versions.set(st.insert.id, [{ name: st.insert.name, v: st.insert.v, xmin: tx, xmax: null }]);
      writes[tx].add(st.insert.id);
      writes[tx].add("table");
      log[tx].push({ sql: st.sql, res: "INSERT 1" });
      push(tx, `T${tx} вставляет новую строку — видна только ей, пока не зафиксирует.`, { hl: { tx, rows: [st.insert.id] } });
    } else if (st.commit) {
      if (level === "ser") {
        const other = tx === 1 ? 2 : 1;
        const overlap = status[other] === "committed" && commitOrder.indexOf(other) >= startedAt[tx];
        const inter = (a, b) => [...a].some((x) => b.has(x) && x !== "table") || (a.has("table") && [...b].some((x) => x !== "table"));
        if (overlap && inter(reads[tx], writes[other]) && inter(reads[other], writes[tx])) {
          status[tx] = "aborted";
          log[tx].push({ sql: "COMMIT", res: "ERROR: could not serialize access due to read/write dependencies", bad: true });
          push(tx, `Serializable находит цикл: T${tx} читала то, что изменила T${other}, а T${other} — то, что изменила T${tx}. Ни один последовательный порядок не дал бы такого результата — T${tx} откачена.`);
          continue;
        }
      }
      status[tx] = "committed";
      commitOrder.push(tx);
      log[tx].push({ sql: "COMMIT", res: "ok" });
      push(tx, `T${tx} фиксируется: её версии становятся видны новым снимкам.`);
    } else if (st.rollback) {
      status[tx] = "aborted";
      log[tx].push({ sql: "ROLLBACK", res: "ok" });
      push(tx, `T${tx} откатывается: её версии никогда не станут видимы.`);
    }
  }
  // Итог: что видит новый запрос после всех транзакций.
  const final = visibleRows(-1, committed());
  frames.push({ ...frames.at(-1), tx: 0, final, text: `Итог в базе: ${final.map((r) => `${r.name} = ${r.v}`).join(", ")}. ${scenario.moral}` });
  return frames;
}

const STYLE = `
.presets { display: flex; gap: 6px; flex-wrap: wrap; }
.presets button.on { background: var(--w-accent); color: #fff; border-color: transparent; }
.levels { margin-top: 8px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
@container (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
.panel { background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; padding: 8px 10px; min-width: 0; }
.panel.cur { border-color: var(--c); }
.panel h4 { margin: 0 0 6px; font-size: 12px; color: var(--w-muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; display: flex; gap: 8px; }
.panel h4 b { color: var(--c); }
.st { font-size: 11px; padding: 0 6px; border-radius: 999px; border: 1px solid var(--w-line-2); text-transform: none; letter-spacing: 0; }
.st.committed { border-color: var(--w-good); color: var(--w-good); }
.st.aborted { border-color: var(--w-bad); color: var(--w-bad); }
.q { font: 12px/1.5 "JetBrains Mono", ui-monospace, monospace; margin: 3px 0; overflow-wrap: anywhere; }
.q .r { color: var(--w-teal); }
.q .r.bad { color: var(--w-bad); }
table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px; }
td, th { padding: 4px 6px; border-bottom: 1px solid var(--w-line); text-align: left; font-variant-numeric: tabular-nums; }
th { color: var(--w-muted); font-weight: 600; font-size: 12px; }
.ver { display: inline-flex; gap: 6px; align-items: center; padding: 2px 8px; margin: 2px 4px 2px 0; border-radius: 8px;
       border: 1px solid var(--w-line-2); font: 12px "JetBrains Mono", ui-monospace, monospace; }
.ver.dead { opacity: .45; text-decoration: line-through; }
.ver.unc { border-style: dashed; }
.ver small { color: var(--w-faint); }
`;
const TXC = { 1: "var(--w-accent-2)", 2: "var(--w-teal)" };

class SottoIsolation extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    this.built = true;
    this.key = SCENARIOS[this.getAttribute("scenario")] ? this.getAttribute("scenario") : "nonrepeatable";
    this.level = LEVELS[this.getAttribute("level")] ? this.getAttribute("level") : "rc";
    this.presets = el("div", { class: "presets" }, ...Object.entries(SCENARIOS).map(([k, s]) =>
      el("button", { "data-k": k, onclick: () => { this.key = k; this.#load(); } }, s.title)));
    this.levels = el("div", { class: "presets levels" }, ...Object.entries(LEVELS).map(([k, l]) =>
      el("button", { "data-k": k, title: l.title, onclick: () => { this.level = k; this.#load(this.player.index); } }, l.title)));
    this.tx = { 1: el("div", { class: "panel", style: `--c:${TXC[1]}` }), 2: el("div", { class: "panel", style: `--c:${TXC[2]}` }) };
    this.table = el("table");
    this.caption = el("div", { class: "caption", "aria-live": "polite" });
    this.player = new StepPlayer(this, (i) => this.#frame(i));
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE), this.presets, this.levels,
      el("div", { class: "grid" }, this.tx[1], this.tx[2]), this.table, this.caption, this.player.el);
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.#load(Number(this.getAttribute("step") || 0));
  }

  #load(start = 0) {
    for (const b of this.presets.children) b.classList.toggle("on", b.dataset.k === this.key);
    for (const b of this.levels.children) b.classList.toggle("on", b.dataset.k === this.level);
    this.frames = simulate(SCENARIOS[this.key], this.level);
    this.player.load(this.frames.length, Math.min(start, this.frames.length - 1));
  }

  #frame(i) {
    const f = this.frames[i];
    const ST = { idle: "не начата", active: "активна", committed: "зафиксирована", aborted: "откачена" };
    for (const t of [1, 2]) {
      this.tx[t].classList.toggle("cur", f.tx === t);
      this.tx[t].replaceChildren(
        el("h4", {}, el("b", {}, `T${t}`), el("span", { class: `st ${f.status[t]}` }, ST[f.status[t]])),
        ...f.log[t].map((q) => el("div", { class: "q" }, q.sql, q.res != null ? el("span", { class: "r" + (q.bad ? " bad" : "") }, `  → ${q.res}`) : null)));
    }
    const hl = new Set(f.hl?.rows || []);
    this.table.replaceChildren(el("tr", {}, el("th", {}, "строка"), el("th", {}, "версии: новая → старая")),
      ...f.table.map((r) => el("tr", { style: hl.has(r.id) ? `background:color-mix(in srgb, ${TXC[f.hl.tx]} 14%, transparent)` : "" },
        el("td", {}, r.chain.at(-1).name),
        el("td", {}, ...r.chain.map((v) => {
          const st = f.txState[v.xmin];
          const dead = st === "aborted" || (v.xmax != null && f.txState[v.xmax] === "committed");
          return el("span", { class: "ver" + (dead ? " dead" : "") + (st === "active" ? " unc" : "") },
            String(v.v), el("small", {}, `xmin ${v.xmin ? "T" + v.xmin : "—"}${v.xmax ? ` · xmax T${v.xmax}` : ""}`));
        })))));
    this.caption.textContent = f.text;
  }
}

customElements.define("sotto-isolation", SottoIsolation);
