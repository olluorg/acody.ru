// Оболочка страницы: тема (светлая/тёмная), поиск в шапке, меню на узких экранах.
(() => {
  const root = document.documentElement;
  const dark = matchMedia("(prefers-color-scheme: dark)");

  // ---- тема ----
  // Выбор посетителя — в localStorage и data-theme; без выбора — тема системы.
  const theme = () => root.dataset.theme || (dark.matches ? "dark" : "light");

  // Виджеты (sotto-*) рисуют себя по атрибуту theme.
  function syncWidgets() {
    const t = theme();
    document.querySelectorAll(".w").forEach((w) => w.setAttribute("theme", t));
  }

  function setTheme(t) {
    root.dataset.theme = t;
    try { localStorage.setItem("theme", t); } catch (e) { /* приватный режим */ }
    syncWidgets();
  }

  document.querySelectorAll("[data-theme-toggle]").forEach((b) =>
    b.addEventListener("click", () => setTheme(theme() === "dark" ? "light" : "dark")));
  dark.addEventListener("change", () => { if (!root.dataset.theme) syncWidgets(); });
  syncWidgets();

  // ---- меню на узких экранах ----
  const side = (open) => document.body.classList.toggle("side-open", open);
  document.querySelectorAll("[data-open-side]").forEach((b) => b.addEventListener("click", () => side(true)));
  document.querySelectorAll("[data-close-side]").forEach((b) => b.addEventListener("click", () => side(false)));

  // ---- вкладки темы: подсветка раздела, который сейчас на экране ----
  const tabs = [...document.querySelectorAll(".page-tabs a")];
  if (tabs.length && "IntersectionObserver" in window) {
    const targets = tabs.map((a) => document.getElementById(a.hash.slice(1))).filter(Boolean);
    const seen = new Set();
    const pick = () => {
      const cur = targets.find((t) => seen.has(t)) || null;
      tabs.forEach((a) => a.classList.toggle("on", !!cur && a.hash === `#${cur.id}`));
    };
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) en.isIntersecting ? seen.add(en.target) : seen.delete(en.target);
      pick();
    }, { rootMargin: "-80px 0px -55% 0px" });
    targets.forEach((t) => io.observe(t));
  }

  // ---- поиск ----
  const input = document.getElementById("q");
  const out = document.getElementById("q-out");
  if (!input || !out) return;
  const kbd = input.parentElement.querySelector("kbd");
  if (kbd && /Mac|iPhone|iPad/.test(navigator.platform)) kbd.textContent = "⌘ K";

  let index = null;   // [[заголовок, адрес, раздел], …]
  let loading = null;
  let hits = [];
  let cur = -1;

  const norm = (s) => s.toLowerCase().replace(/ё/g, "е");

  function load() {
    loading = loading || fetch("/search.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => { index = rows.map((r) => [...r, norm(r[0])]); })
      .catch(() => { index = []; });
    return loading;
  }

  function find(q) {
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const res = [];
    for (const row of index) {
      const t = row[3];
      if (!words.every((w) => t.includes(w))) continue;
      // Выше — совпадение с начала заголовка, затем короткие заголовки.
      res.push([t.startsWith(words[0]) ? 0 : 1, t.length, row]);
    }
    return res.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, 8).map((r) => r[2]);
  }

  function mark(text, q) {
    const span = document.createElement("span");
    const w = norm(q).split(/\s+/).filter(Boolean)[0] || "";
    const i = w ? norm(text).indexOf(w) : -1;
    if (i < 0) { span.textContent = text; return span; }
    const b = document.createElement("mark");
    b.textContent = text.slice(i, i + w.length);
    span.append(text.slice(0, i), b, text.slice(i + w.length));
    return span;
  }

  function render() {
    const q = input.value.trim();
    if (!q) { out.hidden = true; return; }
    hits = find(q);
    cur = hits.length ? 0 : -1;
    out.replaceChildren(...(hits.length
      ? hits.map(([title, url, kind], n) => {
        const a = document.createElement("a");
        a.href = url;
        a.className = n === cur ? "on" : "";
        const k = document.createElement("small");
        k.textContent = kind;
        a.append(mark(title, q), k);
        return a;
      })
      : [Object.assign(document.createElement("p"), { textContent: "Ничего не нашлось" })]));
    out.hidden = false;
  }

  function move(d) {
    if (!hits.length) return;
    cur = (cur + d + hits.length) % hits.length;
    [...out.querySelectorAll("a")].forEach((a, n) => a.classList.toggle("on", n === cur));
  }

  input.addEventListener("focus", () => { load().then(render); });
  input.addEventListener("input", () => { if (index) render(); else load().then(render); });
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown") { ev.preventDefault(); move(1); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); move(-1); }
    else if (ev.key === "Enter" && cur >= 0) { ev.preventDefault(); location.href = hits[cur][1]; }
    else if (ev.key === "Escape") { input.value = ""; out.hidden = true; input.blur(); }
  });
  document.addEventListener("click", (ev) => { if (!ev.target.closest(".search")) out.hidden = true; });
  document.addEventListener("keydown", (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "k") { ev.preventDefault(); input.focus(); input.select(); }
    if (ev.key === "Escape") side(false);
  });
})();
