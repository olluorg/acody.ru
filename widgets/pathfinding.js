// <sotto-pathfinding> — поиск пути на сетке по шагам.
//
//   <sotto-pathfinding algorithm="astar"></sotto-pathfinding>
//   <sotto-pathfinding algorithm="bfs" compare-with="dfs" preset="trap"></sotto-pathfinding>
//
// Атрибуты: algorithm, compare-with (bfs|dfs|dijkstra|astar|greedy),
// preset (empty|walls|maze|mud|trap), rows (7–25), cols (9–41), seed, step, theme.
// На сетке: рисуйте стены и болото (клетка весом 5), перетаскивайте старт и финиш.

import { BASE_STYLE, StepPlayer, el, rng } from "./core.js";

const EMPTY = 0, WALL = 1, MUD = 2;
const MUD_COST = 5;
const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];   // вверх, вправо, вниз, влево — порядок фиксирован

/** Двоичная куча с устойчивым порядком при равных приоритетах — шаги детерминированы. */
class MinHeap {
  constructor() { this.items = []; this.seq = 0; }
  get size() { return this.items.length; }
  push(value, ...keys) {
    const item = { value, keys: [...keys, this.seq++] };
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(a[i], a[p])) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && less(a[l], a[m])) m = l;
        if (r < a.length && less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top.value;
  }
}
function less(x, y) {
  for (let k = 0; k < x.keys.length; k++) if (x.keys[k] !== y.keys[k]) return x.keys[k] < y.keys[k];
  return false;
}

/**
 * Поиск на сетке. Возвращает кадры: каждый — «раскрыли клетку, добавили
 * соседей в очередь». Последний кадр — найденный путь или «пути нет».
 */
function search(grid, start, goal, algorithm) {
  const rows = grid.length, cols = grid[0].length;
  const id = (r, c) => r * cols + c;
  const cost = (r, c) => (grid[r][c] === MUD ? MUD_COST : 1);
  const h = (r, c) => Math.abs(r - goal[0]) + Math.abs(c - goal[1]);
  const neighbors = (r, c) => DIRS.map(([dr, dc]) => [r + dr, c + dc])
    .filter(([nr, nc]) => nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] !== WALL);

  const parent = new Map([[id(...start), null]]);
  const dist = new Map([[id(...start), 0]]);
  const closed = new Set();
  const frames = [];
  const weighted = algorithm === "dijkstra" || algorithm === "astar";

  let open;
  if (algorithm === "bfs") open = { items: [start], take() { return this.items.shift(); }, get size() { return this.items.length; } };
  else if (algorithm === "dfs") open = { items: [start], take() { return this.items.pop(); }, get size() { return this.items.length; } };
  else {
    open = new MinHeap();
    const key = (r, c, g) => algorithm === "dijkstra" ? [g] : algorithm === "astar" ? [g + h(r, c), h(r, c)] : [h(r, c)];
    open.push(start, ...key(...start, 0));
    open.key = key;
    open.take = function () { return this.pop(); };
  }
  const inOpen = new Set([id(...start)]);

  let found = false;
  while (open.size) {
    const [r, c] = open.take();
    const k = id(r, c);
    if (closed.has(k)) continue;           // устаревшая запись (Дейкстра, A*, DFS)
    closed.add(k);
    inOpen.delete(k);
    const g = dist.get(k);
    if (r === goal[0] && c === goal[1]) {
      found = true;
      frames.push({ expand: k, add: [], text: `Финиш (${r}, ${c}) раскрыт — путь найден.` });
      break;
    }
    const add = [];
    for (const [nr, nc] of neighbors(r, c)) {
      const nk = id(nr, nc);
      if (closed.has(nk)) continue;
      if (algorithm === "bfs") {
        if (parent.has(nk)) continue;
        parent.set(nk, k); dist.set(nk, g + cost(nr, nc));
        open.items.push([nr, nc]); add.push(nk); inOpen.add(nk);
      } else if (algorithm === "dfs") {
        if (!parent.has(nk) || !closed.has(nk)) { parent.set(nk, k); dist.set(nk, g + cost(nr, nc)); }
        open.items.push([nr, nc]); add.push(nk); inOpen.add(nk);
      } else if (algorithm === "greedy") {
        // Жадный поиск запоминает путь при первом обнаружении клетки и не пересматривает его.
        if (parent.has(nk)) continue;
        parent.set(nk, k); dist.set(nk, g + 1);
        open.push([nr, nc], ...open.key(nr, nc, g + 1)); add.push(nk); inOpen.add(nk);
      } else {
        const ng = g + (weighted ? cost(nr, nc) : 1);
        if (ng < (dist.has(nk) ? dist.get(nk) : Infinity)) {
          dist.set(nk, ng); parent.set(nk, k);
          open.push([nr, nc], ...open.key(nr, nc, ng)); add.push(nk); inOpen.add(nk);
        }
      }
    }
    const what = {
      bfs: `Берём из очереди клетку (${r}, ${c}) — шаг ${countSteps(parent, k)} от старта; соседей ставим в конец очереди.`,
      dfs: `Снимаем со стека (${r}, ${c}) и идём вглубь — соседей кладём на стек.`,
      dijkstra: `Берём клетку с наименьшим расстоянием: (${r}, ${c}), g = ${g}; обновляем соседей.`,
      astar: `Берём клетку с наименьшим f = g + h: (${r}, ${c}), g = ${g}, h = ${h(r, c)}, f = ${g + h(r, c)}.`,
      greedy: `Берём клетку, которая кажется ближе всех к финишу: (${r}, ${c}), h = ${h(r, c)}.`,
    }[algorithm];
    frames.push({ expand: k, add, text: what });
  }

  const path = [];
  if (found) {
    for (let k = id(...goal); k != null; k = parent.get(k)) path.push(k);
    path.reverse();
  }
  const pathCost = path.slice(1).reduce((s, k) => s + cost(Math.floor(k / cols), k % cols), 0);
  frames.push({
    expand: -1, add: [], path,
    text: found
      ? `Путь: ${path.length - 1} шагов, стоимость ${pathCost}. Раскрыто клеток: ${closed.size}.`
      : `Финиш недостижим. Раскрыто клеток: ${closed.size}.`,
  });
  return { frames, found, steps: Math.max(0, path.length - 1), cost: pathCost, expanded: closed.size };
}

function countSteps(parent, k) {
  let n = 0;
  for (let p = parent.get(k); p != null; p = parent.get(p)) n++;
  return n;
}

const ALGORITHMS = {
  bfs: { name: "Обход в ширину (BFS)", note: "кратчайший по числу шагов, вес клеток не учитывает" },
  dfs: { name: "Обход в глубину (DFS)", note: "находит какой-то путь, обычно не кратчайший" },
  dijkstra: { name: "Дейкстра", note: "кратчайший с учётом веса клеток" },
  astar: { name: "A* (манхэттен)", note: "кратчайший с учётом веса, идёт к цели" },
  greedy: { name: "Жадный (только h)", note: "быстро, но путь может быть не кратчайшим" },
};

const PRESETS = { empty: "пусто", walls: "случайные стены", maze: "лабиринт", mud: "болото", trap: "ловушка" };

/** Карта, на которой путь от старта до финиша гарантированно есть. */
function makeGrid(preset, rows, cols, seed) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const map = buildGrid(preset, rows, cols, seed * 101 + attempt);
    if (search(map.grid, map.start, map.goal, "bfs").found) return map;
  }
  return buildGrid("empty", rows, cols, seed);
}

function buildGrid(preset, rows, cols, seed) {
  const rand = rng(seed);
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(EMPTY));
  const mid = rows >> 1;
  let start = [mid, 1], goal = [mid, cols - 2];
  if (preset === "walls") {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (rand() < 0.24) grid[r][c] = WALL;
  } else if (preset === "mud") {
    for (let k = 0; k < 4; k++) {
      const r0 = Math.floor(rand() * rows), c0 = 3 + Math.floor(rand() * (cols - 6));
      const rad = 2 + Math.floor(rand() * 3);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
        if ((r - r0) ** 2 + (c - c0) ** 2 <= rad * rad) grid[r][c] = MUD;
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (grid[r][c] === EMPTY && rand() < 0.08) grid[r][c] = WALL;
  } else if (preset === "trap") {
    // «Подкова» перед финишем, открытая в сторону от старта: жадный поиск и DFS лезут внутрь.
    const c1 = cols - 6, top = Math.max(1, mid - 4), bottom = Math.min(rows - 2, mid + 4);
    for (let r = top; r <= bottom; r++) grid[r][c1] = WALL;
    for (let c = c1 - 6; c <= c1; c++) { grid[top][c] = WALL; grid[bottom][c] = WALL; }
    start = [mid, 2];
    goal = [mid, cols - 2];
  } else if (preset === "maze") {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) grid[r][c] = WALL;
    const stack = [[1, 1]];
    grid[1][1] = EMPTY;
    while (stack.length) {
      const [r, c] = stack.at(-1);
      const options = DIRS.map(([dr, dc]) => [r + 2 * dr, c + 2 * dc, r + dr, c + dc])
        .filter(([nr, nc]) => nr > 0 && nr < rows - 1 && nc > 0 && nc < cols - 1 && grid[nr][nc] === WALL);
      if (!options.length) { stack.pop(); continue; }
      const [nr, nc, wr, wc] = options[Math.floor(rand() * options.length)];
      grid[wr][wc] = EMPTY; grid[nr][nc] = EMPTY;
      stack.push([nr, nc]);
    }
    // Несколько лишних проходов — чтобы у лабиринта было больше одного пути.
    for (let k = 0; k < (rows * cols) / 40; k++) {
      const r = 1 + Math.floor(rand() * (rows - 2)), c = 1 + Math.floor(rand() * (cols - 2));
      if (grid[r][c] === WALL && (r % 2 === 1) !== (c % 2 === 1)) grid[r][c] = EMPTY;
    }
    start = [1, 1];
    goal = [rows - 2 - ((rows - 2) % 2 === 0 ? 1 : 0), cols - 2 - ((cols - 2) % 2 === 0 ? 1 : 0)];
  }
  grid[start[0]][start[1]] = EMPTY;
  grid[goal[0]][goal[1]] = EMPTY;
  return { grid, start, goal };
}

const STYLE = `
.lanes { display: grid; gap: 14px; margin-top: 12px; }
.lanes.two { grid-template-columns: 1fr 1fr; }
@container (max-width: 700px) { .lanes.two { grid-template-columns: 1fr; } }
.lane { background: var(--w-surface); border: 1px solid var(--w-line); border-radius: 12px; padding: 10px 12px; min-width: 0; }
.lane-head { margin-bottom: 8px; }
.grid { display: grid; gap: 1px; background: var(--w-line); border: 1px solid var(--w-line); border-radius: 6px; overflow: hidden;
        touch-action: none; user-select: none; -webkit-user-select: none; }
.cell { aspect-ratio: 1; background: var(--w-bg); position: relative; cursor: crosshair; }
.cell.wall { background: var(--w-text); opacity: .82; }
.cell.mud { background: color-mix(in srgb, var(--w-warm) 30%, var(--w-bg)); }
.cell.visited { background: color-mix(in srgb, var(--w-accent) 34%, var(--w-bg)); }
.cell.mud.visited { background: color-mix(in srgb, var(--w-accent) 34%, color-mix(in srgb, var(--w-warm) 40%, var(--w-bg))); }
.cell.open { background: color-mix(in srgb, var(--w-teal) 45%, var(--w-bg)); }
.cell.current { background: var(--w-warm); }
.cell.path { background: var(--w-good); }
.cell.start, .cell.goal { cursor: grab; }
.cell.start::after, .cell.goal::after { content: ""; position: absolute; inset: 14%; border-radius: 50%; }
.cell.start::after { background: var(--w-good); box-shadow: 0 0 0 2px var(--w-bg); }
.cell.goal::after { background: var(--w-bad); box-shadow: 0 0 0 2px var(--w-bg); }
.cell.path.start::after, .cell.path.goal::after { box-shadow: 0 0 0 2px var(--w-text); }
.counts { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 8px; }
.note-algo { color: var(--w-faint); font-size: 12px; margin-top: 4px; }
.tools button[aria-pressed="true"] { border-color: var(--w-accent); background: color-mix(in srgb, var(--w-accent) 25%, var(--w-surface-2)); }
`;

class SottoPathfinding extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.built) return;
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.built = true;
    this.seed = Number(this.getAttribute("seed") || 5);
    this.rows = Math.max(7, Math.min(25, Number(this.getAttribute("rows") || 15)));
    this.cols = Math.max(9, Math.min(41, Number(this.getAttribute("cols") || 27)));
    this.tool = WALL;
    this.#build();
    this.#loadPreset(this.getAttribute("preset") || "walls");
    const step = this.getAttribute("step");
    this.#recompute(step == null ? 0 : Number(step));
  }

  #build() {
    const lanesConfig = [this.getAttribute("algorithm") || "astar"];
    if (this.hasAttribute("compare-with")) lanesConfig.push(this.getAttribute("compare-with"));

    this.presetSelect = el("select", { "aria-label": "Карта", onchange: () => { this.#loadPreset(this.presetSelect.value); this.#recompute(0); } },
      Object.entries(PRESETS).map(([k, name]) => el("option", { value: k, selected: k === (this.getAttribute("preset") || "walls") }, name)));
    const toolButton = (tool, label) => {
      const b = el("button", { "aria-pressed": String(this.tool === tool), onclick: () => {
        this.tool = tool;
        this.toolButtons.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      } }, label);
      return b;
    };
    this.toolButtons = [toolButton(WALL, "▦ Стены"), toolButton(MUD, "≈ Болото ×5"), toolButton(EMPTY, "⌫ Стереть")];
    const controls = el("div", { class: "row" },
      el("label", { class: "field" }, "карта", this.presetSelect),
      el("button", { title: "Новая карта того же вида", onclick: () => { this.seed++; this.#loadPreset(this.presetSelect.value); this.#recompute(0); } }, "🎲 Новая"),
      el("span", { class: "row tools" }, this.toolButtons),
      el("button", { title: "Убрать стены и болото", onclick: () => { this.#loadPreset("empty"); this.#recompute(0); } }, "Очистить"));

    this.lanesEl = el("div", { class: "lanes" + (lanesConfig.length > 1 ? " two" : "") });
    this.lanes = lanesConfig.map((algo) => {
      const lane = {
        algo: el("select", { "aria-label": "Алгоритм", onchange: () => this.#recompute(0) },
          Object.entries(ALGORITHMS).map(([k, a]) => el("option", { value: k, selected: k === algo }, a.name))),
        status: el("span", { class: "counter" }),
        grid: el("div", { class: "grid", role: "img" }),
        counts: el("div", { class: "counts" }),
        note: el("div", { class: "note-algo" }),
        caption: el("div", { class: "caption", "aria-live": "polite" }),
      };
      lane.root = el("div", { class: "lane" }, el("div", { class: "row lane-head" }, lane.algo, lane.status), lane.grid, lane.counts, lane.note, lane.caption);
      this.#bindGrid(lane.grid);
      this.lanesEl.append(lane.root);
      return lane;
    });

    const legend = el("div", { class: "legend" },
      el("span", {}, el("i", { style: "background:var(--w-good);border-radius:50%" }), "старт"),
      el("span", {}, el("i", { style: "background:var(--w-bad);border-radius:50%" }), "финиш"),
      el("span", {}, el("i", { style: "background:var(--w-text);opacity:.82" }), "стена"),
      el("span", {}, el("i", { style: "background:color-mix(in srgb, var(--w-warm) 30%, var(--w-bg))" }), "болото, шаг стоит 5"),
      el("span", {}, el("i", { style: "background:color-mix(in srgb, var(--w-teal) 45%, var(--w-bg))" }), "в очереди"),
      el("span", {}, el("i", { style: "background:color-mix(in srgb, var(--w-accent) 34%, var(--w-bg))" }), "раскрыта"),
      el("span", {}, el("i", { style: "background:var(--w-warm)" }), "раскрывается сейчас"),
      el("span", {}, el("i", { style: "background:var(--w-good)" }), "путь"));
    const hint = el("div", { class: "note" }, "Рисуйте на сетке стены и болото, перетаскивайте старт и финиш — результат пересчитается сразу.");

    this.player = new StepPlayer(this, (i) => this.#render(i));
    this.shadowRoot.append(el("style", {}, BASE_STYLE + STYLE), controls, this.lanesEl, legend, hint, this.player.el);
  }

  #loadPreset(preset) {
    const { grid, start, goal } = makeGrid(preset, this.rows, this.cols, this.seed);
    this.grid = grid;
    this.start = start;
    this.goal = goal;
  }

  /** Рисование мышью и пальцем: стены, болото, ластик; перетаскивание старта и финиша. */
  #bindGrid(gridEl) {
    let mode = null;
    const cellAt = (e) => {
      const target = this.shadowRoot.elementFromPoint?.(e.clientX, e.clientY) ?? e.target;
      const cell = target?.closest?.(".cell");
      return cell && gridEl.contains(cell) ? [Number(cell.dataset.r), Number(cell.dataset.c)] : null;
    };
    const apply = (rc) => {
      if (!rc) return;
      const [r, c] = rc;
      const same = (p) => p[0] === r && p[1] === c;
      if (mode === "start" || mode === "goal") {
        if (this.grid[r][c] === WALL || same(mode === "start" ? this.goal : this.start)) return;
        this[mode] = [r, c];
      } else {
        if (same(this.start) || same(this.goal)) return;
        this.grid[r][c] = mode;
      }
      this.#recompute("end");
    };
    gridEl.addEventListener("pointerdown", (e) => {
      const rc = cellAt(e);
      if (!rc) return;
      e.preventDefault();
      gridEl.setPointerCapture(e.pointerId);
      const [r, c] = rc;
      if (r === this.start[0] && c === this.start[1]) mode = "start";
      else if (r === this.goal[0] && c === this.goal[1]) mode = "goal";
      else mode = this.grid[r][c] === this.tool && this.tool !== EMPTY ? EMPTY : this.tool;   // повторный клик стирает
      apply(rc);
    });
    gridEl.addEventListener("pointermove", (e) => { if (mode != null) apply(cellAt(e)); });
    const stop = () => { mode = null; };
    gridEl.addEventListener("pointerup", stop);
    gridEl.addEventListener("pointercancel", stop);
  }

  #recompute(step) {
    this.traces = this.lanes.map((lane) => search(this.grid, this.start, this.goal, lane.algo.value));
    const length = Math.max(...this.traces.map((t) => t.frames.length)) + 1;   // +1 — нулевой кадр «до старта»
    this.player.load(length, step === "end" ? length - 1 : Math.min(Number(step) || 0, length - 1));
  }

  #render(index) {
    const cols = this.cols;
    this.traces.forEach((trace, k) => {
      const lane = this.lanes[k];
      const n = Math.min(index, trace.frames.length);          // сколько кадров применено
      const visited = new Set(), open = new Set();
      let current = -1, path = [];
      for (let i = 0; i < n; i++) {
        const f = trace.frames[i];
        if (f.expand >= 0) { visited.add(f.expand); open.delete(f.expand); }
        for (const a of f.add) if (!visited.has(a)) open.add(a);
        if (f.path) path = f.path;
        current = f.expand;
      }
      const onPath = new Set(path);
      const cells = [];
      for (let r = 0; r < this.rows; r++) for (let c = 0; c < cols; c++) {
        const id = r * cols + c;
        let cls = "cell";
        const v = this.grid[r][c];
        if (v === WALL) cls += " wall";
        else if (v === MUD) cls += " mud";
        if (onPath.has(id)) cls += " path";
        else if (id === current) cls += " current";
        else if (visited.has(id)) cls += " visited";
        else if (open.has(id)) cls += " open";
        if (r === this.start[0] && c === this.start[1]) cls += " start";
        if (r === this.goal[0] && c === this.goal[1]) cls += " goal";
        cells.push(cls);
      }
      if (!lane.cellEls || lane.cellEls.length !== cells.length) {
        lane.grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        lane.cellEls = cells.map((_, i) => el("div", { class: "cell", "data-r": String(Math.floor(i / cols)), "data-c": String(i % cols) }));
        lane.grid.replaceChildren(...lane.cellEls);
      }
      cells.forEach((cls, i) => { if (lane.cellEls[i].className !== cls) lane.cellEls[i].className = cls; });

      const done = n >= trace.frames.length;
      lane.status.textContent = done ? (trace.found ? "путь найден" : "пути нет") : "";
      lane.counts.innerHTML =
        `<span class="counter">раскрыто <b>${visited.size}</b></span>` +
        `<span class="counter">в очереди <b>${open.size}</b></span>` +
        (done && trace.found ? `<span class="counter">шагов пути <b>${trace.steps}</b></span><span class="counter">стоимость <b>${trace.cost}</b></span>` : "");
      lane.note.textContent = ALGORITHMS[lane.algo.value].note;
      lane.caption.textContent = n === 0 ? "Старт — зелёная точка, финиш — красная. Запустите или идите по шагам." : trace.frames[n - 1].text;
      lane.grid.setAttribute("aria-label", `${ALGORITHMS[lane.algo.value].name}: раскрыто ${visited.size} клеток`);
    });
  }
}

customElements.define("sotto-pathfinding", SottoPathfinding);
export { search, makeGrid, ALGORITHMS, MUD_COST };
