// <sotto-dp-table> — заполнение таблицы динамического программирования по шагам.
//
//   <sotto-dp-table problem="lcs" a="ABCBDAB" b="BDCABA"></sotto-dp-table>
//   <sotto-dp-table problem="knapsack" items="1:1, 3:4, 4:5, 5:7" capacity="7"></sotto-dp-table>
//
// Атрибуты: problem (lcs|knapsack), a, b (строки для LCS), items ("вес:ценность, …"),
// capacity (вместимость рюкзака), step, theme.

import { BASE_STYLE, StepPlayer, el } from "./core.js";

/** LCS: dp[i][j] — длина общей подпоследовательности префиксов a[0..i) и b[0..j). */
function lcs(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(null));
  const frames = [];
  for (let i = 0; i <= m; i++) dp[i][0] = 0;
  for (let j = 0; j <= n; j++) dp[0][j] = 0;
  const snap = (extra) => frames.push({ dp: dp.map((r) => r.slice()), ...extra });
  snap({ text: `База: пустой префикс с чем угодно даёт 0 — первая строка и первый столбец нули.` });
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    if (a[i - 1] === b[j - 1]) {
      dp[i][j] = dp[i - 1][j - 1] + 1;
      snap({ cell: [i, j], deps: [[i - 1, j - 1]], text: `«${a[i - 1]}» = «${b[j - 1]}» — символ входит в ответ: dp[${i}][${j}] = диагональ ${dp[i - 1][j - 1]} + 1 = ${dp[i][j]}.` });
    } else {
      dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      snap({ cell: [i, j], deps: [[i - 1, j], [i, j - 1]], text: `«${a[i - 1]}» ≠ «${b[j - 1]}» — берём лучшее без одного из символов: max(сверху ${dp[i - 1][j]}, слева ${dp[i][j - 1]}) = ${dp[i][j]}.` });
    }
  }
  // Восстановление ответа: идём от правого нижнего угла.
  const path = [];
  let i = m, j = n, res = "";
  while (i > 0 && j > 0) {
    path.push([i, j]);
    if (a[i - 1] === b[j - 1]) {
      res = a[i - 1] + res;
      snap({ path: path.slice(), pick: [i, j], answer: res, text: `«${a[i - 1]}» совпал — берём его в ответ и идём по диагонали. Ответ сейчас: «${res}».` });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      snap({ path: path.slice(), answer: res, text: `Значение пришло сверху — поднимаемся.` });
      i--;
    } else {
      snap({ path: path.slice(), answer: res, text: `Значение пришло слева — идём влево.` });
      j--;
    }
  }
  snap({ path: path.slice(), answer: res, text: `Наибольшая общая подпоследовательность: «${res}», длина ${dp[m][n]}. Таблица ${m + 1}×${n + 1} — O(m·n) времени.` });
  return { frames, rows: ["∅", ...a], cols: ["∅", ...b], result: dp[m][n], answer: res };
}

/** Рюкзак 0/1: dp[i][c] — лучшая ценность первых i предметов при вместимости c. */
function knapsack(items, W) {
  const k = items.length;
  const dp = Array.from({ length: k + 1 }, () => new Array(W + 1).fill(null));
  const frames = [];
  for (let c = 0; c <= W; c++) dp[0][c] = 0;
  const snap = (extra) => frames.push({ dp: dp.map((r) => r.slice()), ...extra });
  snap({ text: `База: без предметов ценность 0 при любой вместимости.` });
  for (let i = 1; i <= k; i++) {
    const [w, v] = items[i - 1];
    for (let c = 0; c <= W; c++) {
      const skip = dp[i - 1][c];
      if (w > c) {
        dp[i][c] = skip;
        snap({ cell: [i, c], deps: [[i - 1, c]], text: `Предмет ${i} (вес ${w}) не влезает в ${c} — значение сверху: ${skip}.` });
      } else {
        const take = dp[i - 1][c - w] + v;
        dp[i][c] = Math.max(skip, take);
        snap({ cell: [i, c], deps: [[i - 1, c], [i - 1, c - w]],
          text: `Вместимость ${c}: не брать предмет ${i} — ${skip}; взять — ${dp[i - 1][c - w]} (при ${c - w}) + ${v} = ${take}. Берём ${dp[i][c] === take && take > skip ? "с предметом" : "без него"}: ${dp[i][c]}.` });
      }
    }
  }
  const path = [];
  const chosen = [];
  let c = W;
  for (let i = k; i > 0; i--) {
    path.push([i, c]);
    if (dp[i][c] !== dp[i - 1][c]) {
      chosen.unshift(i);
      snap({ path: path.slice(), pick: [i, c], answer: chosen.join(", "), text: `dp[${i}][${c}] ≠ dp[${i - 1}][${c}] — предмет ${i} взят; вместимость уменьшается на его вес ${items[i - 1][0]}.` });
      c -= items[i - 1][0];
    } else {
      snap({ path: path.slice(), answer: chosen.join(", "), text: `dp[${i}][${c}] = dp[${i - 1}][${c}] — предмет ${i} не брали.` });
    }
  }
  const weight = chosen.reduce((s, i) => s + items[i - 1][0], 0);
  snap({ path: path.slice(), answer: chosen.join(", "), text: `Лучшая ценность ${dp[k][W]}: предметы ${chosen.join(", ") || "—"}, общий вес ${weight} из ${W}. Таблица (n+1)×(W+1) — O(n·W).` });
  return { frames, rows: ["—", ...items.map(([w, v], i) => `${i + 1}: ${w}кг/${v}`)], cols: Array.from({ length: W + 1 }, (_, c) => String(c)), result: dp[k][W], answer: chosen };
}

function parseItems(text) {
  return String(text).split(/[,;]/).map((s) => s.trim().split(/[:/x×\s]+/).map(Number))
    .filter((p) => p.length >= 2 && p[0] > 0 && p[1] >= 0 && p.every(Number.isFinite)).slice(0, 8).map(([w, v]) => [Math.round(w), Math.round(v)]);
}

const STYLE = `
.wrap { overflow-x: auto; margin-top: 12px; }
table { border-collapse: separate; border-spacing: 3px; font: 13px "JetBrains Mono", ui-monospace, monospace; }
th { color: var(--w-muted); font-weight: 600; padding: 2px 6px; white-space: nowrap; }
td { min-width: 30px; height: 30px; text-align: center; border-radius: 6px; background: var(--w-surface); border: 1px solid var(--w-line); }
td.empty { color: transparent; }
td.cur { background: var(--w-warm); color: #10121f; font-weight: 700; border-color: transparent; }
td.dep { background: var(--w-accent); color: #fff; border-color: transparent; }
td.path { background: color-mix(in srgb, var(--w-teal) 40%, var(--w-surface)); }
td.pick { background: var(--w-good); color: #10121f; font-weight: 700; border-color: transparent; }
.answer { margin-top: 8px; color: var(--w-muted); }
.answer b { color: var(--w-text); }
.inputs input { width: 130px; max-width: 100%; }
.inputs select { max-width: 100%; }
.inputs .field { min-width: 0; }
`;

class SottoDpTable extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.built = true;
    this.problem = el("select", { "aria-label": "Задача", onchange: () => { this.#toggle(); this.#recompute(); } },
      el("option", { value: "lcs", selected: this.getAttribute("problem") !== "knapsack" }, "общая подпоследовательность (LCS)"),
      el("option", { value: "knapsack", selected: this.getAttribute("problem") === "knapsack" }, "рюкзак 0/1"));
    this.aInput = el("input", { type: "text", value: this.getAttribute("a") || "ABCBDAB", maxlength: "10", "aria-label": "Первая строка" });
    this.bInput = el("input", { type: "text", value: this.getAttribute("b") || "BDCABA", maxlength: "10", "aria-label": "Вторая строка" });
    this.itemsInput = el("input", { type: "text", value: this.getAttribute("items") || "1:1, 3:4, 4:5, 5:7", "aria-label": "Предметы вес:ценность", style: "width:180px" });
    this.capInput = el("input", { type: "number", min: "1", max: "15", value: this.getAttribute("capacity") || "7", "aria-label": "Вместимость", style: "width:64px" });
    for (const i of [this.aInput, this.bInput, this.itemsInput, this.capInput]) i.addEventListener("change", () => this.#recompute());
    this.lcsFields = el("span", { class: "group" }, el("label", { class: "field" }, "строка A", this.aInput), el("label", { class: "field" }, "строка B", this.bInput));
    this.ksFields = el("span", { class: "group" }, el("label", { class: "field" }, "предметы вес:ценность", this.itemsInput), el("label", { class: "field" }, "вместимость", this.capInput));
    this.table = el("table", { role: "img" });
    this.answer = el("div", { class: "answer" });
    this.caption = el("div", { class: "caption", "aria-live": "polite" });
    const legend = el("div", { class: "legend" },
      el("span", {}, el("i", { style: "background:var(--w-warm)" }), "считаем сейчас"),
      el("span", {}, el("i", { style: "background:var(--w-accent)" }), "откуда берём значения"),
      el("span", {}, el("i", { style: "background:color-mix(in srgb, var(--w-teal) 40%, var(--w-surface))" }), "путь восстановления ответа"),
      el("span", {}, el("i", { style: "background:var(--w-good)" }), "входит в ответ"));
    this.player = new StepPlayer(this, (i) => this.#render(i));
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE),
      el("div", { class: "row inputs" }, el("label", { class: "field" }, "задача", this.problem), this.lcsFields, this.ksFields),
      el("div", { class: "wrap" }, this.table), this.answer, this.caption, legend, this.player.el);
    this.#toggle();
    this.#recompute();
    const step = this.getAttribute("step");
    if (step != null) this.player.go(Number(step));
  }

  #toggle() {
    const isLcs = this.problem.value === "lcs";
    this.lcsFields.style.display = isLcs ? "contents" : "none";
    this.ksFields.style.display = isLcs ? "none" : "contents";
  }

  #recompute() {
    if (this.problem.value === "lcs") {
      const a = (this.aInput.value || "A").slice(0, 10), b = (this.bInput.value || "B").slice(0, 10);
      this.t = lcs([...a], [...b]);
    } else {
      const items = parseItems(this.itemsInput.value);
      const W = Math.max(1, Math.min(15, Math.round(Number(this.capInput.value) || 7)));
      this.t = knapsack(items.length ? items : [[1, 1]], W);
    }
    this.player.load(this.t.frames.length);
  }

  #render(index) {
    const f = this.t.frames[index];
    const key = (r, c) => r + "," + c;
    const deps = new Set((f.deps || []).map(([r, c]) => key(r, c)));
    const path = new Set((f.path || []).map(([r, c]) => key(r, c)));
    const picks = new Set();
    // Все выбранные клетки до текущего кадра восстановления.
    for (let i = 0; i <= index; i++) if (this.t.frames[i].pick) picks.add(key(...this.t.frames[i].pick));
    const head = el("tr", {}, el("th"), ...this.t.cols.map((c) => el("th", {}, c)));
    const rows = f.dp.map((row, r) => el("tr", {}, el("th", {}, this.t.rows[r]), ...row.map((v, c) => {
      let cls = v == null ? "empty" : "";
      const k = key(r, c);
      if (f.cell && f.cell[0] === r && f.cell[1] === c) cls = "cur";
      else if (deps.has(k)) cls = "dep";
      else if (picks.has(k) && f.path) cls = "pick";
      else if (path.has(k)) cls = "path";
      return el("td", { class: cls }, v == null ? "·" : String(v));
    })));
    this.table.replaceChildren(head, ...rows);
    this.table.setAttribute("aria-label", this.problem.value === "lcs" ? "Таблица LCS" : "Таблица рюкзака");
    this.answer.innerHTML = f.answer != null && f.path
      ? (this.problem.value === "lcs" ? `ответ: <b>«${f.answer}»</b>` : `взятые предметы: <b>${f.answer || "—"}</b>`)
      : `ответ в правом нижнем углу: <b>${f.dp.at(-1).at(-1) ?? "…"}</b>`;
    this.caption.textContent = f.text;
  }
}

customElements.define("sotto-dp-table", SottoDpTable);
export { lcs, knapsack, parseItems };
