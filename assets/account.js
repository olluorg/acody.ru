// Личное на статическом сайте: вход, отметки «пройдено» на картах, тесты на
// страницах тем, учёт прогресса в ИПР и профиль. Всё — через API платформы
// (window.LEARN.api) с cookie входа; гость видит сайт как раньше.
(() => {
  const API = (window.LEARN && window.LEARN.api) || "";
  const GRADES = { junior: "Junior", middle: "Middle", senior: "Senior" };
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids.flat()) if (k != null) n.append(k);
    return n;
  }

  async function api(path, body) {
    const opts = { credentials: "include", headers: {} };
    if (body !== undefined) {
      opts.method = "POST";
      opts.headers["content-type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const r = await fetch(API + path, opts);
    let data = null;
    try { data = await r.json(); } catch { /* 204 без тела */ }
    if (!r.ok) throw new Error((data && data.error) || `ошибка ${r.status}`);
    return data;
  }

  const back = () => location.pathname + location.search.replace(/[?&]login=[a-z]+/, "");
  const loginUrl = (p) => p === "dev"
    ? `${API}/auth/dev?return=${encodeURIComponent(back())}`
    : `${API}/auth/login/${p}?return=${encodeURIComponent(back())}`;

  // ---- вход ----
  let me = { user: null, providers: [], dev: false };

  function loginDialog() {
    const names = { yandex: "Яндекс ID", vk: "VK ID", dev: "Вход разработчика" };
    const list = [...me.providers, ...(me.dev ? ["dev"] : [])];
    const dlg = el("dialog", { class: "login-dialog" },
      el("h2", {}, "Вход на платформу"),
      el("p", {}, "Вход нужен, чтобы проходить тесты и отмечать темы пройденными. Карты, курсы, статьи и вопросы доступны без регистрации."),
      list.length
        ? el("div", { class: "login-buttons" }, list.map((p) => el("a", { class: `btn ${p}`, href: loginUrl(p) }, names[p] || p)))
        : el("p", { class: "muted" }, "Вход скоро заработает."),
      el("p", { class: "muted consent" }, "Входя, вы соглашаетесь с ", el("a", { href: "/privacy/" }, "политикой обработки персональных данных"), " и даёте согласие на обработку данных аккаунта и прогресса."),
      el("button", { class: "btn ghost", type: "button", onclick: () => dlg.close() }, "Закрыть"));
    document.body.append(dlg);
    dlg.addEventListener("close", () => dlg.remove());
    dlg.showModal();
  }

  function header() {
    const box = $("#account");
    if (!box) return;
    box.replaceChildren(me.user
      ? el("a", { class: "account-link", href: "/me/" }, me.user.name)
      : el("button", { class: "btn primary small", type: "button", onclick: loginDialog }, "Войти"));
  }

  function loginNotice() {
    const m = new URLSearchParams(location.search).get("login");
    const text = { failed: "Вход не удался — попробуйте ещё раз.", cancelled: "Вход отменён.", expired: "Ссылка входа устарела — начните вход ещё раз." }[m];
    if (!text) return;
    const n = el("div", { class: "toast", role: "status" }, text);
    document.body.append(n);
    setTimeout(() => n.remove(), 6000);
    history.replaceState(null, "", back());
  }

  // ---- прогресс ----
  /** узел → {грейд: {score, source}} */
  let done = new Map();

  function markMaps() {
    for (const a of $$(".rm-node[data-node]")) {
      const got = done.get(a.dataset.node);
      a.classList.toggle("done", !!got);
      a.querySelector(".done-mark")?.remove();
      if (got) a.append(el("span", { class: "done-mark", title: "Пройдено" }, "✓ " + Object.keys(got).map((g) => GRADES[g][0]).join("")));
    }
  }

  function markPlan() {
    const hide = $("#pf-hide-done");
    if (!hide) return;
    hide.closest("label").hidden = false;
    for (const pn of $$(".pn[data-node]")) {
      const got = done.get(pn.dataset.node) || {};
      for (const pg of $$(".pg", pn)) {
        const passed = !!got[pg.dataset.g];
        pg.classList.toggle("done", passed);
        pg.querySelector(".done-mark")?.remove();
        if (passed) pg.querySelector("b").after(el("span", { class: "done-mark" }, " ✓ пройдено"));
      }
    }
    document.dispatchEvent(new Event("learn:progress"));
  }

  // ---- тест на странице темы ----
  function testBlock(box) {
    const node = box.dataset.node;
    const grades = box.dataset.grades.split(",").filter(Boolean);
    const body = el("div", { class: "test-body" });
    const note = $(".rm-test-note", box);
    if (!me.user) {
      note.replaceChildren("Войдите, чтобы пройти тест: сданный тест отмечает тему пройденной на карте и в ИПР. ",
        el("button", { class: "btn small", type: "button", onclick: loginDialog }, "Войти"));
      return;
    }
    const got = done.get(node) || {};
    note.textContent = "Тест — 8 вопросов из банка по теме, для зачёта нужно 80% верных ответов.";
    const pick = el("div", { class: "test-grades" }, grades.map((g) =>
      el("button", { class: "btn" + (got[g] ? " passed" : ""), type: "button", onclick: () => start(g) },
        got[g] ? `${GRADES[g]} ✓ ${got[g].score}%` : `Тест ${GRADES[g]}`)));
    box.append(pick, body);

    function start(grade) {
      runQuiz(body, { node, grade }, (r) => {
        const cur = done.get(node) || {};
        cur[grade] = { score: r.score, source: "test" };
        done.set(node, cur);
        const btn = pick.children[grades.indexOf(grade)];
        btn.classList.add("passed");
        btn.textContent = `${GRADES[grade]} ✓ ${r.score}%`;
        return `Сдано: ${r.score}%. Тема отмечена пройденной (${GRADES[grade]}).`;
      });
    }
  }

  /** Тест: вопросы, проверка на сервере, разбор. onPass возвращает текст успеха. */
  async function runQuiz(body, request, onPass) {
    body.replaceChildren(el("p", { class: "muted" }, "Готовим вопросы…"));
    let t;
    try { t = await api("/api/test/start", request); } catch (e) { body.replaceChildren(el("p", { class: "test-error" }, e.message)); return; }
    const form = el("form", { class: "test-form" });
    t.questions.forEach((q, i) => {
      form.append(el("fieldset", {},
        el("legend", {}, `${i + 1}. ${q.q}`),
        q.multiple ? el("p", { class: "muted" }, "Несколько верных ответов") : null,
        q.options.map((o, j) => el("label", {}, el("input", { type: q.multiple ? "checkbox" : "radio", name: `q${i}`, value: j }), " ", o))));
    });
    form.append(el("button", { class: "btn primary", type: "submit" }, "Проверить"));
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const answers = t.questions.map((_, i) => $$(`input[name=q${i}]:checked`, form).map((x) => +x.value));
      let r;
      try { r = await api("/api/test/submit", { attempt: t.attempt, answers }); } catch (e) { body.prepend(el("p", { class: "test-error" }, e.message)); return; }
      $$("fieldset", form).forEach((fs, i) => {
        const res = r.results[i];
        fs.classList.add(res.ok ? "ok" : "wrong");
        $$("label", fs).forEach((l, j) => res.correct.includes(j) && l.classList.add("right"));
        if (!res.ok && res.url) fs.append(el("a", { class: "why", href: res.url }, "Разбор вопроса →"));
      });
      $$("input, button", form).forEach((x) => (x.disabled = true));
      const msg = r.passed ? onPass(r) : `${r.score}% — нужно ${r.pass}%. Повторить можно чуть позже, пока посмотрите разборы.`;
      body.prepend(el("p", { class: r.passed ? "test-ok" : "test-error" }, msg));
      for (const id of r.courses_completed || []) {
        coursesDone.add(id);
        body.prepend(el("p", { class: "test-ok" }, "Курс пройден — его темы отмечены на карте и в ИПР."));
      }
    });
    body.replaceChildren(form);
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---- проверка урока и курсы ----
  /** урок → лучший результат; пройденные курсы */
  let lessonsDone = {};
  const coursesDone = new Set();

  function lessonCheck(box) {
    const lesson = box.dataset.lesson;
    const note = $(".rm-test-note", box);
    if (!me.user) {
      note.replaceChildren("Войдите, чтобы проверить себя: сданные проверки всех уроков курса отмечают его темы пройденными на карте и в ИПР. ",
        el("button", { class: "btn small", type: "button", onclick: loginDialog }, "Войти"));
      return;
    }
    const body = el("div", { class: "test-body" });
    const passed = lessonsDone[lesson];
    note.textContent = passed ? `Урок сдан: ${passed}%.` : "Несколько вопросов по уроку, для зачёта нужно 80% верных ответов.";
    const btn = el("button", { class: "btn" + (passed ? " passed" : ""), type: "button" }, passed ? "Пройти ещё раз" : "Проверить себя");
    btn.addEventListener("click", () => runQuiz(body, { lesson }, (r) => {
      lessonsDone[lesson] = Math.max(r.score, lessonsDone[lesson] || 0);
      note.textContent = `Урок сдан: ${lessonsDone[lesson]}%.`;
      return `Сдано: ${r.score}%. Урок засчитан.`;
    }));
    box.append(el("div", { class: "test-grades" }, btn), body);
  }

  function markCourses() {
    const page = $(".course[data-course]");
    if (page) {
      const items = $$(".course-lessons li[data-lesson]", page);
      let n = 0;
      for (const li of items) {
        const ok = lessonsDone[li.dataset.lesson] != null;
        li.classList.toggle("done", ok);
        n += ok;
      }
      const status = $(".course-status", page);
      status.hidden = false;
      status.textContent = coursesDone.has(page.dataset.course)
        ? "Курс пройден — его темы отмечены на карте и в ИПР."
        : `Сдано уроков: ${n} из ${items.length}.`;
      if (!coursesDone.has(page.dataset.course)) status.classList.add("muted");
    }
    for (const tile of $$(".tile[data-course]")) tile.classList.toggle("done", coursesDone.has(tile.dataset.course));
  }

  // ---- профиль ----
  function profile(box) {
    if (!me.user) {
      box.replaceChildren(el("p", { class: "lead" }, "Войдите, чтобы видеть прогресс по картам профессий."),
        el("button", { class: "btn primary", type: "button", onclick: loginDialog }, "Войти"));
      return;
    }
    const titles = window.LEARN_NODES || {};
    const rows = [...done.entries()].map(([node, by]) => {
      const t = titles[node] || [node, `/roadmap/${node}/`, ""];
      return el("li", {}, el("a", { href: t[1] }, t[0]), " ", el("span", { class: "muted" }, t[2]), " ",
        Object.entries(by).map(([g, v]) => el("span", { class: `lvl lvl-${g}` }, `${GRADES[g]} ${v.score}%`)));
    });
    box.replaceChildren(
      el("p", { class: "lead" }, me.user.name),
      el("h2", {}, `Пройдено тем: ${done.size}`),
      rows.length ? el("ul", { class: "links" }, rows) : el("p", { class: "muted" }, "Пока ничего — откройте карту профессии и пройдите тест по теме."),
      el("div", { class: "profile-actions" },
        el("button", { class: "btn", type: "button", onclick: async () => { await api("/api/logout", {}); location.href = "/"; } }, "Выйти"),
        el("button", { class: "btn ghost danger", type: "button", onclick: async () => {
          if (!confirm("Удалить аккаунт и весь прогресс? Это нельзя отменить.")) return;
          await api("/api/account/delete", { confirm: true });
          location.href = "/";
        } }, "Удалить аккаунт")));
  }

  async function main() {
    loginNotice();
    try { me = await api("/api/me"); } catch { /* API недоступен — сайт работает как гостевой */ }
    header();
    if (me.user) {
      try {
        const p = await api("/api/progress");
        for (const x of p.progress) {
          const cur = done.get(x.node) || {};
          cur[x.grade] = { score: x.score, source: x.source };
          done.set(x.node, cur);
        }
        lessonsDone = p.lessons || {};
        for (const c of p.courses || []) coursesDone.add(c);
      } catch { /* без отметок */ }
      markMaps();
      markPlan();
      markCourses();
    }
    $$(".rm-test").forEach(testBlock);
    $$(".lesson-check").forEach(lessonCheck);
    const pr = $("#profile");
    if (pr) profile(pr);
  }

  main();
})();
