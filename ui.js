// ui.js
import {
    addStudent,
    listStudents,
    getStudent,
    updateStudent,
    addLessonForStudent,
    listLessonsByStudent,
    toggleLessonInvoiced,
    setLessonBillable,
    exportData,
    importReplaceData,
    deleteLesson,
    deleteStudent,
    archiveStudent,
    restoreStudent,
    bulkInvoiceMonthForStudent,
    undoBulkInvoiceMonth,
    addCreditTopup,
    listCreditTransactionsByStudent,
    getStudentCreditBalance,
    resetStudentCredit,
    DEFAULT_HOURLY_RATE,
    getStudentHourlyRate,
    getLessonAmountCzk,
    getTopupAmountCzk,
    isChargedLesson,
    updateLesson,
    getStudentSummaries,
    LOW_CREDIT_HOURS,
  } from "./domain.js";

  const UNDO_KEY = "tutorlog_lastUndo";
  const LAST_EXPORT_KEY = "tutorlog_lastExportAt";
  const BACKUP_REMIND_DAYS = 14;

  // Kolik dní uplynulo od posledního exportu; null = ještě nikdy.
  function daysSinceLastExport() {
    try {
      const raw = localStorage.getItem(LAST_EXPORT_KEY);
      if (!raw) return null;
      return Math.floor((Date.now() - new Date(raw).getTime()) / 86_400_000);
    } catch {
      return null;
    }
  }

  function rememberExport() {
    try {
      localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
    } catch {
      // bez localStorage jen nebude fungovat připomínka
    }
  }

  function fmtHours(hours) {
    return `${Number(hours || 0).toLocaleString("cs-CZ")} h`;
  }

  // Odkaz na výuku jako webová adresa; "meet.google.com/x" doplníme o https://,
  // jiná schémata (javascript: apod.) nepustíme.
  function lessonLinkOf(student) {
    const link = String(student?.meetLink || "").trim();
    if (!link) return "";
    if (/^https?:\/\//i.test(link)) return link;
    if (/^[a-z][a-z0-9+.-]*:/i.test(link)) return "";
    return `https://${link}`;
  }

  function fmtCzk(amount) {
    return `${Number(amount || 0).toLocaleString("cs-CZ")} Kč`;
  }

  function sumLessonsCzk(lessons) {
    return lessons.reduce((sum, l) => sum + getLessonAmountCzk(l), 0);
  }

  function saveUndo(undo) {
    localStorage.setItem(UNDO_KEY, JSON.stringify(undo));
  }

  function loadUndo() {
    try {
      const raw = localStorage.getItem(UNDO_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function clearUndo() {
    localStorage.removeItem(UNDO_KEY);
  }

  
  const els = {
    studentList: document.getElementById("studentList"),
    main: document.getElementById("main"),
    btnAddStudent: document.getElementById("btnAddStudent"),
    dlgStudent: document.getElementById("dlgStudent"),
    dlgLesson: document.getElementById("dlgLesson"),
    search: document.getElementById("search"),
    btnExport: document.getElementById("btnExport"),
    btnImport: document.getElementById("btnImport"),
    importFile: document.getElementById("importFile"),
    dlgCredit: document.getElementById("dlgCredit"),
    backupNotice: document.getElementById("backupNotice"),
  };
  
  let state = {
    students: [],
    selectedStudentId: null,
    lessons: [],
    search: "",
    showArchive: false,
    summaries: new Map(), // studentId -> { creditBalance, usesCredit, notInvoicedHours }
    creditTransactions: [],
    creditBalance: 0,
  };
  
  // ---------- helpers ----------
  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  
  function fmtLessonRow(l) {
    const occurredPill = l.occurred
      ? `<span class="pill ok">proběhla</span>`
      : `<span class="pill">neproběhla</span>`;

    // Kreditní hodina se neúčtuje ani nefakturuje – je zaplacená dobitím.
    if (l.paymentMethod === "credit") {
      return `${occurredPill} <span class="pill good">kredit</span>`;
    }

    const flags = [
      occurredPill,
      l.billable ? `<span class="pill ok">účtovat</span>` : `<span class="pill">zdarma</span>`,
      l.invoiced
        ? `<span class="pill good">vyfakt.</span>`
        : `<span class="pill bad">nefakt.</span>`,
      l.paymentMethod === "credit"
        ? `<span class="pill good">kredit</span>`
        : `<span class="pill">faktura</span>`,
    ].join(" ");
    return flags;
  }
  
  function fmtDateCZ(isoDate) {
    // isoDate: "YYYY-MM-DD"
    if (!isoDate || typeof isoDate !== "string") {
      return { dow: "", date: "" };
    }

    const [y, m, d] = isoDate.split("-");
    const yyyy = Number(y);
    const mm = Number(m);
    const dd = Number(d);

    if (!yyyy || !mm || !dd) {
      return { dow: "", date: isoDate };
    }

    const dt = new Date(yyyy, mm - 1, dd);

    return {
      dow: dt.toLocaleDateString("cs-CZ", { weekday: "long" }),
      date: `${String(dd).padStart(2, "0")}. ${String(mm).padStart(2, "0")}. ${yyyy}`,
    };
}


  function todayLocalISODate() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function getMonthKeyFromDate(isoDate) {
  // "2026-03-14" -> "2026-03"
  if (!isoDate || typeof isoDate !== "string") return "";
  return isoDate.slice(0, 7);
}

function fmtMonthCZ(monthKey) {
  // "2026-03" -> "březen 2026"
  if (!monthKey) return "";
  const [y, m] = monthKey.split("-");
  const dt = new Date(Number(y), Number(m) - 1, 1);
  return dt.toLocaleDateString("cs-CZ", {
    month: "long",
    year: "numeric",
  });
}

  async function refreshStudents() {
    state.students = await listStudents();
    // Když vybraný student neexistuje (start, smazání, import), vyber prvního aktivního.
    const selectedExists = state.students.some(s => s.id === state.selectedStudentId);
    if (!selectedExists) {
      state.selectedStudentId = state.students.find(s => !s.archived)?.id ?? null;
    }
    await refreshSelectedStudent();
  }

  // Po každé změně dat: přepočítat stavy v sidebaru a překreslit vybraného studenta.
  async function refreshSelectedStudent() {
    state.summaries = await getStudentSummaries();
    renderSidebar();
    renderBackupNotice();

    if (!state.selectedStudentId) {
      state.lessons = [];
      state.creditTransactions = [];
      state.creditBalance = 0;
      renderMainEmpty();
      return;
    }

    state.lessons = await listLessonsByStudent(state.selectedStudentId);
    state.creditTransactions = await listCreditTransactionsByStudent(state.selectedStudentId);
    state.creditBalance = await getStudentCreditBalance(state.selectedStudentId);

    renderMain();
  }
  
  // Jednořádkový stav studenta: kredit (když ho používá) a hodiny k fakturaci.
  function studentStatusHtml(student) {
    const sum = state.summaries.get(student.id);
    const parts = [];

    if (sum?.usesCredit) {
      const balance = sum.creditBalance;
      const note = balance < 0 ? " (dluží)" : balance <= LOW_CREDIT_HOURS ? " (dochází)" : "";
      const cls = note ? ` class="warn"` : "";
      parts.push(`<span${cls}>kredit ${escapeHtml(fmtHours(balance))}${note}</span>`);
    }
    if (sum?.notInvoicedHours > 0) {
      parts.push(`k fakturaci ${escapeHtml(fmtHours(sum.notInvoicedHours))}`);
    }
    return parts.length ? parts.join(" · ") : "vše vyfakturováno";
  }

  function renderBackupNotice() {
    const days = daysSinceLastExport();
    const due = state.students.length > 0 && (days === null || days >= BACKUP_REMIND_DAYS);

    if (!due) {
      els.backupNotice.innerHTML = "";
      return;
    }

    els.backupNotice.innerHTML = `
      <div class="notice">
        <div>${
          days === null
            ? "Data jsou jen v tomto prohlížeči a zatím nemají zálohu."
            : `Poslední záloha před ${days} dny.`
        }</div>
        <button class="btn" type="button" id="btnBackupNow">Zálohovat teď</button>
      </div>
    `;
    document.getElementById("btnBackupNow").addEventListener("click", exportBackup);
  }

  function renderSidebar() {
    const q = state.search.trim().toLowerCase();

    const activeStudents = state.students.filter(s => !s.archived);
    const archivedStudents = state.students.filter(s => s.archived);

    const filteredActive = q
      ? activeStudents.filter(s =>
          `${s.firstName} ${s.lastName}`.toLowerCase().includes(q)
        )
      : activeStudents;

    const filteredArchived = q
      ? archivedStudents.filter(s =>
          `${s.firstName} ${s.lastName}`.toLowerCase().includes(q)
        )
      : archivedStudents;

    const activeHtml = filteredActive.length
      ? filteredActive.map(s => {
          const active = s.id === state.selectedStudentId ? "active" : "";
          return `
            <div class="item ${active}" data-student-id="${escapeHtml(s.id)}">
              <div><strong>${escapeHtml(s.lastName)} ${escapeHtml(s.firstName)}</strong></div>
              <div class="muted">${studentStatusHtml(s)}</div>
            </div>
          `;
        }).join("")
      : `<div class="muted">Žádní aktivní studenti.</div>`;

    const archiveToggleHtml = `
      <div class="item" id="archiveToggle" style="margin-top: 10px; background: transparent; border-style: dashed;">
        <div><strong>Archiv</strong></div>
        <div class="muted">${state.showArchive ? "Skrýt archivované studenty" : "Zobrazit archivované studenty"}</div>
      </div>
    `;

    const archiveHtml = state.showArchive
      ? (
          filteredArchived.length
            ? filteredArchived.map(s => {
                const active = s.id === state.selectedStudentId ? "active" : "";
                return `
                  <div class="item ${active}" data-student-id="${escapeHtml(s.id)}" style="opacity: 0.8;">
                    <div><strong>${escapeHtml(s.lastName)} ${escapeHtml(s.firstName)}</strong></div>
                    <div class="muted">Archivovaný student</div>
                  </div>
                `;
              }).join("")
            : `<div class="muted" style="margin-top: 8px;">Archiv je prázdný.</div>`
        )
      : "";

    els.studentList.innerHTML = `
      ${activeHtml}
      <div style="border-top: 1px solid var(--rule); margin: 12px 0 0 0; padding-top: 10px;">
        ${archiveToggleHtml}
        ${archiveHtml}
      </div>
    `;

    els.studentList.querySelectorAll("[data-student-id]").forEach(el => {
      el.addEventListener("click", async () => {
        state.selectedStudentId = el.getAttribute("data-student-id");
        renderSidebar();
        await refreshSelectedStudent();
      });
    });

    const archiveToggle = document.getElementById("archiveToggle");
    if (archiveToggle) {
      archiveToggle.addEventListener("click", () => {
        state.showArchive = !state.showArchive;
        renderSidebar();
      });
    }
}
  
  function renderMainEmpty() {
    els.main.innerHTML = `
      <div class="card">
        <p class="title">TutorLog MVP</p>
        <p class="muted">Přidej prvního studenta vlevo.</p>
      </div>
    `;
  }

function getMonthKeyFromDateTime(isoDateTime) {
  if (!isoDateTime || typeof isoDateTime !== "string") return "";
  return isoDateTime.slice(0, 7);
}

function mapLessonToTimelineItem(lesson) {
  return {
    itemType: "lesson",
    sortDate: lesson.date,
    monthKey: getMonthKeyFromDate(lesson.date),
    lesson,
  };
}

function mapCreditTxnToTimelineItem(txn) {
  return {
    itemType: "credit_txn",
    sortDate: txn.createdAt?.slice(0, 10) || "",
    monthKey: getMonthKeyFromDateTime(txn.createdAt),
    txn,
  };
}

function buildTimelineGroups(lessons, creditTransactions) {
  const groups = new Map();

  for (const lesson of lessons) {
    const item = mapLessonToTimelineItem(lesson);
    if (!groups.has(item.monthKey)) groups.set(item.monthKey, []);
    groups.get(item.monthKey).push(item);
  }

  for (const txn of creditTransactions.filter(t =>
    t.type === "topup" || t.type === "lesson_deduction" || t.type === "adjustment"
    )) {
    const item = mapCreditTxnToTimelineItem(txn);
    if (!groups.has(item.monthKey)) groups.set(item.monthKey, []);
    groups.get(item.monthKey).push(item);
  }

  return Array.from(groups.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([monthKey, items]) => ({
      monthKey,
      monthLabel: fmtMonthCZ(monthKey),
      items: items.sort((a, b) => {
        const aKey = (a.itemType === "lesson" ? a.lesson.createdAt : a.txn.createdAt) || "";
        const bKey = (b.itemType === "lesson" ? b.lesson.createdAt : b.txn.createdAt) || "";

        if (a.sortDate !== b.sortDate) return b.sortDate.localeCompare(a.sortDate);
        return bKey.localeCompare(aKey);
      }),
      lessons: items.filter(i => i.itemType === "lesson").map(i => i.lesson),
      creditTransactions: items.filter(i => i.itemType === "credit_txn").map(i => i.txn),
    }));
}
  
async function renderMain() {
  const s = await getStudent(state.selectedStudentId);
  if (!s) return renderMainEmpty();

  const undo = loadUndo();
  const monthGroups = buildTimelineGroups(state.lessons, state.creditTransactions);

  const notInvoicedLessons = state.lessons.filter(l => isChargedLesson(l) && !l.invoiced);
  const totalNotInvoiced = notInvoicedLessons
    .reduce((sum, l) => sum + Number(l.durationHours || 0), 0);
  const totalNotInvoicedAmount = sumLessonsCzk(notInvoicedLessons);

  els.main.innerHTML = `
    <div class="card col">
      <div class="row" style="justify-content: space-between; align-items: flex-start;">
        <div>
          <p class="title">${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</p>

          <div class="row" style="gap: 10px; margin-top: 6px;">
            ${
              lessonLinkOf(s)
                ? `<a class="btn" href="${escapeHtml(lessonLinkOf(s))}" target="_blank" rel="noreferrer">Otevřít výuku</a>`
                : ``
            }
            <button class="btn primary" id="btnAddLesson">+ Hodina</button>
            <button class="btn" id="btnEditStudent">Upravit studenta</button>
            <button class="btn" id="btnTopupCredit">Dobít kredit</button>
          </div>

          <div class="muted" style="margin-top: 8px;">
            Nevyfakturováno (účtovat): <strong>${totalNotInvoiced}</strong> h ·
            <strong>${fmtCzk(totalNotInvoicedAmount)}</strong> ·
            Kredit: <strong style="${state.creditBalance < 0 ? "color: var(--bad);" : ""}">
                      ${state.creditBalance} h
                    </strong> ·
            Sazba: <strong>${fmtCzk(getStudentHourlyRate(s))}</strong>/h
          </div>
        </div>
      </div>
    </div>
      ${
        monthGroups.length
          ? monthGroups.map(group => {
              const monthTotalHours = group.lessons
                .reduce((sum, l) => sum + Number(l.durationHours || 0), 0);

              // Odměna = přijaté peníze: účtované fakturační hodiny + dobití kreditu.
              // Úpravy kreditu (např. vynulování) nejsou platba, do odměny nepatří.
              const monthTopupAmount = group.creditTransactions
                .filter(t => t.type === "topup")
                .reduce((sum, t) => sum + getTopupAmountCzk(t), 0);

              const monthTotalAmount =
                sumLessonsCzk(group.lessons.filter(isChargedLesson)) + monthTopupAmount;

              const monthBillableNotInvoicedHours = group.lessons
                .filter(l => isChargedLesson(l) && !l.invoiced)
                .reduce((sum, l) => sum + Number(l.durationHours || 0), 0);

              const hasUndoForThisMonth =
                undo?.type === "bulk_invoice_month" &&
                undo?.studentId === s.id &&
                undo?.monthKey === group.monthKey;

              return `
                <section style="margin-top: 48px;">
                  <div class="row" style="margin-bottom: 10px; justify-content: space-between; align-items: flex-end;">
                    <div>
                      <div style="font-size: 18px; font-weight: 700;">
                        ${escapeHtml(group.monthLabel)}
                      </div>
                      <div class="muted" style="margin-top: 4px;">
                        celkem odučeno: <strong>${monthTotalHours}</strong> h · odměna:
                        <strong>${fmtCzk(monthTotalAmount)}</strong> · k vyfakturování:
                        <strong>${monthBillableNotInvoicedHours}</strong> h
                      </div>
                    </div>
                    ${
                      hasUndoForThisMonth
                        ? `<button class="btn" data-undo-month="${escapeHtml(group.monthKey)}">Zpět</button>`
                        : ``
                    }
                  </div>

                  <table class="table">
                    <thead>
                      <tr>
                        <th>Datum</th>
                        <th>Hodiny</th>
                        <th>Stavy</th>
                        <th>Vyfakturováno</th>
                        <th>Účtovat</th>
                        <th>Akce</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${
                        group.items.map(item => {
                          if (item.itemType === "lesson") {
                            const l = item.lesson;
                            return `
                              <tr>
                                <td>
                                  ${(() => {
                                    const d = fmtDateCZ(l.date);
                                    return `
                                      <div style="line-height: 1.15;">
                                        <div class="muted" style="font-size: 12px; white-space: nowrap;">
                                          ${escapeHtml(d.dow)}
                                        </div>
                                        <div style="white-space: nowrap;">
                                          ${escapeHtml(d.date)}
                                        </div>
                                      </div>
                                    `;
                                  })()}
                                </td>

                                <td>${escapeHtml(l.durationHours)}</td>
                                <td>${fmtLessonRow(l)}</td>

                                ${
                                  l.paymentMethod === "credit"
                                    ? `<td class="muted">—</td><td class="muted">—</td>`
                                    : `
                                      <td>
                                        <button class="btn" data-toggle-invoiced="${escapeHtml(l.id)}">
                                          ${l.invoiced ? "Ano" : "Ne"}
                                        </button>
                                      </td>

                                      <td>
                                        <button class="btn" data-toggle-billable="${escapeHtml(l.id)}">
                                          ${l.billable ? "Ano" : "Ne"}
                                        </button>
                                      </td>
                                    `
                                }

                                <td>
                                  <div class="row" style="flex-wrap: nowrap; gap: 6px;">
                                    <button class="btn" data-edit-lesson="${escapeHtml(l.id)}">Upravit</button>
                                    <button class="btn" data-delete-lesson="${escapeHtml(l.id)}">Smazat</button>
                                  </div>
                                </td>
                              </tr>
                            `;
                          }

                          if (item.itemType === "credit_txn") {
                            const t = item.txn;
                            const d = fmtDateCZ(t.createdAt?.slice(0, 10) || "");
                            const hoursNumber = Number(t.hours || 0);

                            const label =
                              t.type === "topup"
                                ? `dobití kreditů`
                                : t.type === "lesson_deduction"
                                  ? `odečtení kreditů`
                                  : hoursNumber > 0
                                    ? `úprava kreditů (připsání)`
                                    : `úprava kreditů (odečtení)`;

                            const pill =
                              hoursNumber > 0
                                ? `<span class="pill good"></span>`
                                : `<span class="pill bad"></span>`;

                            const hoursText =
                              hoursNumber > 0
                                ? `+ ${hoursNumber}`
                                : `- ${Math.abs(hoursNumber)}`;

                            return `
                              <tr>
                                <td>
                                  <div style="line-height: 1.15;">
                                    <div class="muted" style="font-size: 12px; white-space: nowrap;">
                                      ${escapeHtml(d.dow)}
                                    </div>
                                    <div style="white-space: nowrap;">
                                      ${escapeHtml(d.date)}
                                    </div>
                                  </div>
                                </td>

                                <td>${escapeHtml(hoursText)}</td>
                                <td>
                                  ${pill}
                                  <span style="margin-left: 8px;">${escapeHtml(label)}</span>
                                  ${t.type === "topup" ? `<span class="muted"> · zaplaceno ${escapeHtml(fmtCzk(getTopupAmountCzk(t)))}</span>` : ""}
                                  ${t.note ? `<div class="muted" style="margin-top: 4px;">${escapeHtml(t.note)}</div>` : ""}
                                </td>

                                <td></td>
                                <td></td>
                                <td></td>
                              </tr>
                            `;
                          }

                          return "";
                        }).join("")
                      }
                    </tbody>
                  </table>

                  <div style="margin-top: 10px;">
                    <button class="btn" data-invoice-month="${escapeHtml(group.monthKey)}">
                      Vyfakturovat měsíc
                    </button>
                  </div>
                </section>
              `;
            }).join("")
          : `<div class="muted" style="margin-top: 16px;">Zatím žádné hodiny.</div>`
      }
  `;

  document
    .getElementById("btnAddLesson")
    .addEventListener("click", () => openLessonDialog(s.id));

  document
    .getElementById("btnEditStudent")
    .addEventListener("click", () => openEditStudentDialog(s));

  els.main.querySelectorAll("[data-toggle-invoiced]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-toggle-invoiced");
      await toggleLessonInvoiced(id);
      await refreshSelectedStudent();
    });
  });

  els.main.querySelectorAll("[data-toggle-billable]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-toggle-billable");
      const lesson = state.lessons.find(x => x.id === id);
      if (!lesson) return;
      await setLessonBillable(id, !lesson.billable);
      await refreshSelectedStudent();
    });
  });

  els.main.querySelectorAll("[data-edit-lesson]").forEach(btn => {
    btn.addEventListener("click", () => {
      const lesson = state.lessons.find(x => x.id === btn.getAttribute("data-edit-lesson"));
      if (lesson) openLessonDialog(s.id, lesson);
    });
  });

  els.main.querySelectorAll("[data-delete-lesson]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-delete-lesson");
      const ok = confirm("Opravdu smazat tuto hodinu? Tohle nejde vrátit zpět.");
      if (!ok) return;
      await deleteLesson(id);
      await refreshSelectedStudent();
    });
  });

  els.main.querySelectorAll("[data-invoice-month]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const monthKey = btn.getAttribute("data-invoice-month");

      const ok1 = confirm(`Označit všechny nefakturované účtované hodiny za ${fmtMonthCZ(monthKey)} jako vyfakturované?`);
      if (!ok1) return;

      const ok2 = confirm("Opravdu? Bude možné to vrátit tlačítkem Zpět.");
      if (!ok2) return;

      const undoToken = await bulkInvoiceMonthForStudent(s.id, monthKey);
      saveUndo(undoToken);
      await refreshSelectedStudent();
    });
  });

  els.main.querySelectorAll("[data-undo-month]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const undo = loadUndo();
      if (!undo) return;

      const ok = confirm("Vrátit zpět poslední měsíční vyfakturování?");
      if (!ok) return;

      await undoBulkInvoiceMonth(undo);
      clearUndo();
      await refreshSelectedStudent();
    });
  });

  document
  .getElementById("btnTopupCredit")
  .addEventListener("click", () => openCreditTopupDialog(s));
}

  
  

  
  // ---------- dialogs ----------
  function openAddStudentDialog() {
    els.dlgStudent.innerHTML = `
      <form method="dialog" class="col" id="formStudent">
        <h3 style="margin: 0;">Nový student</h3>
  
        <div class="grid2">
          <div class="col">
            <label>Jméno</label>
            <input 
              name="firstName" 
              type="text" 
              placeholder="Jan" 
              autocomplete="off"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              required />
          </div>
          <div class="col">
            <label>Příjmení</label>
            <input 
            name="lastName" 
              type="text" 
              placeholder="Novák" 
              autocomplete="off"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              required />
          </div>
        </div>
  
        <div class="col">
          <label>Odkaz na výuku (nepovinné)</label>
          <input
            name="meetLink"
            type="text"
            placeholder="https://meet.google.com/… / Zoom / Teams"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false" />
        </div>

        <div class="col">
          <label>Hodinová sazba (Kč)</label>
          <input name="hourlyRate" type="number" step="any" min="1" value="${DEFAULT_HOURLY_RATE}" required />
        </div>

        <div class="danger" id="studentErr" style="display:none;"></div>
  
        <div class="row" style="justify-content: flex-end; margin-top: 6px;">
          <button class="btn" type="button" id="btnCancelStudent">Zrušit</button>
          <button class="btn primary" id="btnSaveStudent" value="default">Uložit</button>
        </div>
      </form>
    `;
    els.dlgStudent.showModal();
  
    const form = els.dlgStudent.querySelector("#formStudent");

    els.dlgStudent.querySelector("#btnCancelStudent")
      .addEventListener("click", () => els.dlgStudent.close());

    const err = els.dlgStudent.querySelector("#studentErr");

  
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.style.display = "none";
      try {
        const fd = new FormData(form);
        const s = await addStudent({
          firstName: fd.get("firstName"),
          lastName: fd.get("lastName"),
          meetLink: fd.get("meetLink"),
          hourlyRate: fd.get("hourlyRate"),
        });
        state.selectedStudentId = s.id;
        els.dlgStudent.close();
        await refreshStudents();
      } catch (ex) {
        err.textContent = ex?.message ?? String(ex);
        err.style.display = "block";
      }
    });
  }
  
  function openEditStudentDialog(student) {
    els.dlgStudent.innerHTML = `
      <form method="dialog" class="col" id="formStudentEdit">
        <h3 style="margin: 0;">Upravit studenta</h3>
  
        <div class="grid2">
          <div class="col">
            <label>Jméno</label>
            <input name="firstName" type="text" value="${escapeHtml(student.firstName)}" required />
          </div>
          <div class="col">
            <label>Příjmení</label>
            <input name="lastName" type="text" value="${escapeHtml(student.lastName)}" required />
          </div>
        </div>
  
        <div class="col">
          <label>Odkaz na výuku (nepovinné)</label>
          <input name="meetLink" type="text" value="${escapeHtml(student.meetLink || "")}" />
        </div>

        <div class="col">
          <label>Hodinová sazba (Kč)</label>
          <input name="hourlyRate" type="number" step="any" min="1" value="${escapeHtml(getStudentHourlyRate(student))}" required />
          <div class="muted">Změna platí jen pro nově zapsané hodiny.</div>
        </div>

        <div class="danger" id="studentErr" style="display:none;"></div>
  
        <div class="row" style="justify-content: space-between; margin-top: 6px;">
          <div class="row">
            <button class="btn" type="button" id="btnDeleteStudent">Smazat studenta</button>
            ${
              student.archived
                ? `<button class="btn" type="button" id="btnRestoreStudent">Obnovit z archivu</button>`
                : `<button class="btn" type="button" id="btnArchiveStudent">Archivovat</button>`
            }
            <button class="btn" type="button" id="btnResetCredit">Vynulovat kredity</button>
          </div>

          <div class="row" style="justify-content: flex-end;">
            <button class="btn" type="button" id="btnCancelStudentEdit">Zrušit</button>
            <button class="btn primary" type="submit">Uložit</button>
          </div>
        </div>

      </div>
      </form>
    `;
    els.dlgStudent.showModal();
  
    const form = els.dlgStudent.querySelector("#formStudentEdit");

    els.dlgStudent.querySelector("#btnCancelStudentEdit")
      .addEventListener("click", () => els.dlgStudent.close());

    const err = els.dlgStudent.querySelector("#studentErr");
  
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.style.display = "none";
      try {
        const fd = new FormData(form);
        await updateStudent(student.id, {
          firstName: String(fd.get("firstName") || "").trim(),
          lastName: String(fd.get("lastName") || "").trim(),
          meetLink: String(fd.get("meetLink") || "").trim(),
          hourlyRate: fd.get("hourlyRate"),
        });
        els.dlgStudent.close();
        await refreshStudents();
      } catch (ex) {
        err.textContent = ex?.message ?? String(ex);
        err.style.display = "block";
      }
    });

    const btnArchive = els.dlgStudent.querySelector("#btnArchiveStudent");
      if (btnArchive) {
        btnArchive.addEventListener("click", async () => {
          const ok = confirm(`Přesunout studenta ${student.firstName} ${student.lastName} do archivu?`);
          if (!ok) return;

          await archiveStudent(student.id);
          els.dlgStudent.close();

          if (state.selectedStudentId === student.id) {
            state.selectedStudentId = null;
          }

          await refreshStudents();
        });
      }

      const btnRestore = els.dlgStudent.querySelector("#btnRestoreStudent");
      if (btnRestore) {
        btnRestore.addEventListener("click", async () => {
          const ok = confirm(`Obnovit studenta ${student.firstName} ${student.lastName} z archivu?`);
          if (!ok) return;

          await restoreStudent(student.id);
          els.dlgStudent.close();
          state.selectedStudentId = student.id;
          await refreshStudents();
        });
      }

      const btnResetCredit = els.dlgStudent.querySelector("#btnResetCredit");
        if (btnResetCredit) {
          btnResetCredit.addEventListener("click", async () => {
            const currentBalance = await getStudentCreditBalance(student.id);

            if (currentBalance === 0) {
              alert("Student má už teď nulový kredit.");
              return;
            }

            const ok = confirm(
              `Opravdu chceš vynulovat kredit studenta ${student.firstName} ${student.lastName}?\nAktuální kredit: ${currentBalance} h`
            );

            if (!ok) return;

            try {
              await resetStudentCredit(student.id);
              els.dlgStudent.close();
              await refreshStudents();
            } catch (ex) {
              alert("Vynulování kreditu selhalo: " + (ex?.message ?? String(ex)));
            }
          });
        }

    els.dlgStudent.querySelector("#btnDeleteStudent")
      .addEventListener("click", async () => {
        const ok1 = confirm(`Opravdu smazat studenta ${student.firstName} ${student.lastName}?`);
        if (!ok1) return;

        const ok2 = confirm("Smažou se i všechny jeho hodiny a kredity. Pokračovat?");
        if (!ok2) return;

        await deleteStudent(student.id);

        clearUndo();


        // zavřít dialog
        els.dlgStudent.close();

        // vybrat jiného studenta (nebo null)
        state.selectedStudentId = null;
        await refreshStudents();
    });

  }
  
  // Bez `lesson` = nová hodina, s `lesson` = oprava existující.
  function openLessonDialog(studentId, lesson = null) {
    const isEdit = Boolean(lesson);
    const checked = (cond) => (cond ? "checked" : "");

    els.dlgLesson.innerHTML = `
      <form method="dialog" class="col" id="formLesson">
        <h3 style="margin: 0;">${isEdit ? "Upravit hodinu" : "Přidat hodinu"}</h3>

        <div class="grid2">
          <div class="col">
            <label>Datum</label>
            <input name="date" type="date" value="${escapeHtml(lesson?.date ?? todayLocalISODate())}" required />
          </div>
          <div class="col">
            <label>Počet hodin</label>
            <input name="durationHours" type="number" step="0.5" min="0.5" value="${escapeHtml(lesson?.durationHours ?? 1)}" required />
          </div>
        </div>

        ${
          isEdit
            ? `
              <div class="col">
                <label>Sazba této hodiny (Kč/h)</label>
                <input name="hourlyRate" type="number" step="any" min="1" value="${escapeHtml(lesson.hourlyRate ?? DEFAULT_HOURLY_RATE)}" required />
              </div>`
            : ""
        }

        <label class="row" style="gap: 10px;">
          <input name="paidNoShow" type="checkbox" ${checked(isEdit && !lesson.occurred)} />
          Neproběhla, ale bude zaplacená (absence)
        </label>

        <label class="row" style="gap: 10px;">
          <input name="payWithCredit" type="checkbox" ${checked(lesson?.paymentMethod === "credit")} />
          Zaplatit kredity
        </label>

        ${
          isEdit && lesson.paymentMethod !== "credit" && lesson.invoiced
            ? `<div class="muted">Hodina je už vyfakturovaná – úprava nezmění už odeslanou fakturu.</div>`
            : ""
        }

        <div class="danger" id="lessonErr" style="display:none;"></div>
  
        <div class="row" style="justify-content: flex-end; margin-top: 6px;">
          <button class="btn" type="button" value="cancel" id="btnCancelLesson">Zrušit</button>
          <button class="btn primary" value="default">Uložit</button>
        </div>
      </form>
    `;
    els.dlgLesson.showModal();
  
    const form = els.dlgLesson.querySelector("#formLesson");
    els.dlgLesson.querySelector("#btnCancelLesson")
      .addEventListener("click", () => els.dlgLesson.close());
    const err = els.dlgLesson.querySelector("#lessonErr");
  
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.style.display = "none";
      try {
        const fd = new FormData(form);

        const durationHours = Number(String(fd.get("durationHours") || "").replace(",", "."));
        const payWithCredit = fd.get("payWithCredit") === "on";

        if (payWithCredit) {
          const currentBalance = await getStudentCreditBalance(studentId);
          // při úpravě kreditní hodiny se její dosavadní odečtení vrací
          const returned = lesson?.paymentMethod === "credit" ? Number(lesson.durationHours) : 0;
          const nextBalance = currentBalance + returned - durationHours;

          if (nextBalance < 0) {
            const ok = confirm(
              `Student nemá dostatek kreditu.\n` +
              `Aktuální kredit: ${currentBalance} h\n` +
              `Po odečtení bude: ${nextBalance} h\n\n` +
              `Opravdu pokračovat?`
            );

            if (!ok) return;
          }
        }

        const values = {
          date: fd.get("date"),
          durationHours: fd.get("durationHours"),
          paidNoShow: fd.get("paidNoShow") === "on",
          paymentMethod: payWithCredit ? "credit" : "invoice",
        };

        if (isEdit) {
          await updateLesson(lesson.id, { ...values, hourlyRate: fd.get("hourlyRate") });
        } else {
          await addLessonForStudent(studentId, values);
        }
        els.dlgLesson.close();
        await refreshSelectedStudent();
      } catch (ex) {
        err.textContent = ex?.message ?? String(ex);
        err.style.display = "block";
      }
    });
  }

  function openCreditTopupDialog(student) {
  const studentId = student.id;
  const rate = getStudentHourlyRate(student);

  els.dlgCredit.innerHTML = `
    <form method="dialog" class="col" id="formCreditTopup">
      <h3 style="margin: 0;">Dobít kredit</h3>

      <div class="col">
        <label>Počet hodin kreditu</label>
        <input name="hours" type="number" step="0.5" min="0.5" value="1" required />
      </div>

      <div class="col">
        <label>Zaplaceno (Kč)</label>
        <input name="amountCzk" type="number" step="any" min="0" value="${rate}" required />
        <div class="muted">Předvyplněno hodiny × ${escapeHtml(fmtCzk(rate))}. U balíčku se slevou přepiš.</div>
      </div>

      <div class="col">
        <label>Poznámka (volitelné)</label>
        <input name="note" type="text" placeholder="např. doplatek za duben" />
      </div>

      <div class="danger" id="creditErr" style="display:none;"></div>

      <div class="row" style="justify-content: flex-end; margin-top: 6px;">
        <button class="btn" type="button" id="btnCancelCredit">Zrušit</button>
        <button class="btn primary" type="submit">Uložit</button>
      </div>
    </form>
  `;

  els.dlgCredit.showModal();

  const form = els.dlgCredit.querySelector("#formCreditTopup");
  const err = els.dlgCredit.querySelector("#creditErr");

  els.dlgCredit.querySelector("#btnCancelCredit")
    .addEventListener("click", () => els.dlgCredit.close());

  // Částka se dopočítává z hodin, dokud ji ručně nepřepíšu.
  const hoursInput = form.elements.hours;
  const amountInput = form.elements.amountCzk;
  let amountEditedByHand = false;
  amountInput.addEventListener("input", () => { amountEditedByHand = true; });
  hoursInput.addEventListener("input", () => {
    if (amountEditedByHand) return;
    const hours = Number(String(hoursInput.value).replace(",", "."));
    if (Number.isFinite(hours)) amountInput.value = hours * rate;
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.style.display = "none";

    try {
      const fd = new FormData(form);
      await addCreditTopup(studentId, {
        hours: fd.get("hours"),
        amountCzk: fd.get("amountCzk"),
        note: fd.get("note"),
      });

      els.dlgCredit.close();
      await refreshSelectedStudent();
    } catch (ex) {
      err.textContent = ex?.message ?? String(ex);
      err.style.display = "block";
    }
  });
}
  
  // ---------- wire up ----------
  els.btnAddStudent.addEventListener("click", openAddStudentDialog);
  els.search.addEventListener("input", async () => {
    state.search = els.search.value;
    renderSidebar();
  });

  async function exportBackup() {
    const data = await exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `tutorlog-backup-${todayLocalISODate()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    rememberExport();
    renderBackupNotice();
  }

  els.btnExport.addEventListener("click", exportBackup);

  els.btnImport.addEventListener("click", () => {
  els.importFile.value = "";
  els.importFile.click();
  });

  els.importFile.addEventListener("change", async () => {
  const file = els.importFile.files?.[0];
  if (!file) return;

  const ok = confirm(
    "Import REPLACE: Tohle smaže všechna aktuální data v aplikaci a nahradí je obsahem souboru. Pokračovat?"
  );
  if (!ok) return;

  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    await importReplaceData(payload);
    alert("Import hotový.");
    state.selectedStudentId = null;
    await refreshStudents();
  } catch (e) {
    alert("Import selhal: " + (e?.message ?? String(e)));
  }
});



  // init
  // Požádat prohlížeč, ať data nemaže při nedostatku místa (bez toho je může tiše vyklidit).
  async function requestPersistentStorage() {
    try {
      if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
        await navigator.storage.persist();
      }
    } catch {
      // nepodporováno – nic se neděje, zálohy jsou pojistka
    }
  }

  (async function init() {
    requestPersistentStorage();
    await refreshStudents();
    if (!state.students.length) renderMainEmpty();
  })();
  