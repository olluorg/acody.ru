// Генератор ИПР на /roadmap/<карта>/plan/: страница собрана целиком, скрипт
// оставляет темы и критерии между текущим и целевым грейдом, пересчитывает
// часы и выгружает план текстом или CSV.
(() => {
  const G = ["junior", "middle", "senior"];
  const N = { junior: "Junior", middle: "Middle", senior: "Senior" };
  const $ = (s) => document.querySelector(s);
  const from = $("#pf-from"), to = $("#pf-to"), opt = $("#pf-opt"), week = $("#pf-week");
  const branch = $("#pf-branch");   // выбор ветки (язык в карте Backend), если карта его предлагает
  if (!from) return;

  function apply() {
    if (+to.value <= +from.value) to.value = String(Math.min(2, +from.value + 1));
    const lo = +from.value, hi = +to.value;
    let total = 0, topics = 0;
    document.querySelectorAll(".ps").forEach((st) => {
      if (branch && st.dataset.branch && st.dataset.branch !== branch.value) { st.hidden = true; return; }
      let sh = 0, any = false;
      st.querySelectorAll(".pn").forEach((n) => {
        const okKind = opt.checked || n.dataset.kind === "core";
        const hours = JSON.parse(n.dataset.hours || "{}");
        let h = 0, shown = false;
        n.querySelectorAll(".pg").forEach((p) => {
          const i = G.indexOf(p.dataset.g), on = okKind && i > lo && i <= hi;
          p.hidden = !on;
          if (on) { shown = true; h += hours[p.dataset.g] || 0; }
        });
        n.hidden = !shown;
        n.querySelector(".ph").textContent = shown && h ? `≈ ${h} ч` : "";
        if (shown) { any = true; sh += h; topics++; }
      });
      st.hidden = !any;
      st.querySelector(".sh").textContent = sh ? `≈ ${sh} ч` : "";
      total += sh;
    });
    const w = Math.max(1, +week.value || 6);
    $("#pf-total").textContent = topics
      ? `${topics} тем · около ${total} ч · примерно ${Math.ceil(total / w)} нед. при ${w} ч в неделю`
      : "Для выбранных грейдов тем нет.";
  }

  function rows() {
    const out = [];
    document.querySelectorAll(".ps:not([hidden])").forEach((st) => {
      const stage = st.dataset.title;
      st.querySelectorAll(".pn:not([hidden])").forEach((n) => {
        const topic = n.querySelector("h3 a").textContent;
        const hours = JSON.parse(n.dataset.hours || "{}");
        n.querySelectorAll(".pg:not([hidden])").forEach((p) => {
          const pr = p.querySelector(".rm-practice");
          out.push({
            stage, topic, grade: N[p.dataset.g], hours: hours[p.dataset.g] || "",
            crit: [...p.querySelectorAll("li")].map((li) => li.textContent),
            practice: pr ? pr.textContent.replace(/^Практика\.\s*/, "") : "",
          });
        });
      });
    });
    return out;
  }

  function flash(btn, text, back) {
    btn.textContent = text;
    setTimeout(() => (btn.textContent = back), 2000);
  }

  $("#pf-copy").addEventListener("click", async (ev) => {
    const lines = [$("h1").textContent, $("#pf-total").textContent];
    let last = "";
    for (const r of rows()) {
      if (r.stage !== last) { lines.push("", r.stage.toUpperCase()); last = r.stage; }
      lines.push("", `${r.topic} (${r.grade}${r.hours ? `, ≈ ${r.hours} ч` : ""})`);
      for (const c of r.crit) lines.push(`  ☐ ${c}`);
      if (r.practice) lines.push(`  Практика: ${r.practice}`);
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      flash(ev.target, "Скопировано", "Скопировать текстом");
    } catch {
      flash(ev.target, "Не удалось скопировать", "Скопировать текстом");
    }
  });

  $("#pf-csv").addEventListener("click", () => {
    const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const head = ["Этап", "Тема", "Грейд", "Критерии освоения", "Практика", "Часы", "Срок", "Статус"];
    const lines = [head.map(q).join(";")];
    for (const r of rows()) lines.push([r.stage, r.topic, r.grade, r.crit.join("\n"), r.practice, r.hours, "", ""].map(q).join(";"));
    // BOM — чтобы Excel открыл UTF-8 с кириллицей без ручного выбора кодировки.
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "ipr.csv" });
    a.click();
    URL.revokeObjectURL(a.href);
  });

  [from, to, opt, week, branch].forEach((el) => el && el.addEventListener("input", apply));
  apply();
})();
