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
    bulkInvoiceAllForStudent,
    undoBulkInvoice,
    deleteLesson,
    deleteStudent,
  } from "./domain.js";

  const UNDO_KEY = "tutorlog_lastUndo";

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
  };
  
  let state = {
    students: [],
    selectedStudentId: null,
    lessons: [],
    search: "",
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
    const flags = [
      l.occurred ? `<span class="pill ok">proběhla</span>` : `<span class="pill">neproběhla</span>`,
      l.billable ? `<span class="pill ok">účtovat</span>` : `<span class="pill">zdarma</span>`,
      l.invoiced
        ? `<span class="pill good">vyfakt.</span>`
        : `<span class="pill bad">nefakt.</span>`,
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
  
  async function refreshStudents() {
    state.students = await listStudents();
    if (!state.selectedStudentId && state.students.length) {
      state.selectedStudentId = state.students[0].id;
    }
    renderSidebar();
    await refreshSelectedStudent();
  }
  
  async function refreshSelectedStudent() {
    if (!state.selectedStudentId) {
      state.lessons = [];
      renderMainEmpty();
      return;
    }
    state.lessons = await listLessonsByStudent(state.selectedStudentId);
    renderMain();
  }
  
  function renderSidebar() {
    const q = state.search.trim().toLowerCase();
    const filtered = q
      ? state.students.filter(s =>
          `${s.firstName} ${s.lastName}`.toLowerCase().includes(q)
        )
      : state.students;
  
    els.studentList.innerHTML = filtered.length
      ? filtered.map(s => {
          const active = s.id === state.selectedStudentId ? "active" : "";
          return `
            <div class="item ${active}" data-student-id="${escapeHtml(s.id)}">
              <div><strong>${escapeHtml(s.lastName)} ${escapeHtml(s.firstName)}</strong></div>
              <div class="muted">Online • Meet link uložen</div>
            </div>
          `;
        }).join("")
      : `<div class="muted">Žádní studenti.</div>`;
  
    // click handlers
    els.studentList.querySelectorAll("[data-student-id]").forEach(el => {
      el.addEventListener("click", async () => {
        state.selectedStudentId = el.getAttribute("data-student-id");
        renderSidebar();
        await refreshSelectedStudent();
      });
    });
  }
  
  function renderMainEmpty() {
    els.main.innerHTML = `
      <div class="card">
        <p class="title">TutorLog MVP</p>
        <p class="muted">Přidej prvního studenta vlevo.</p>
      </div>
    `;
  }
  
  async function renderMain() {
    const s = await getStudent(state.selectedStudentId);
    if (!s) return renderMainEmpty();
  
    const totalNotInvoiced = state.lessons
      .filter(l => l.billable && !l.invoiced)
      .reduce((sum, l) => sum + Number(l.durationHours || 0), 0);

    const undo = loadUndo();
    const hasUndoForThisStudent =
      undo?.type === "bulk_invoice" && undo?.studentId === s.id;
  
    els.main.innerHTML = `
      <div class="card col">
        <div class="row" style="justify-content: space-between; align-items: flex-start;">
          <div>
            <p class="title">${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</p>
            
          <div class="row" style="gap: 10px; margin-top: 6px;">
            <a class="btn" href="${escapeHtml(s.meetLink)}" target="_blank" rel="noreferrer">
              Otevřít Meet
            </a>
            <button class="btn primary" id="btnAddLesson">+ Hodina</button>
            <button class="btn" id="btnEditStudent">Upravit studenta</button>
            <button class="btn" id="btnBulkInvoice">Vyfakturovat vše</button>
            ${hasUndoForThisStudent ? `<button class="btn" id="btnUndo">Zpět</button>` : ``}
          </div>

          <div class="muted" style="margin-top: 8px;">
            Nevyfakturováno (účtovat):
            <strong>${totalNotInvoiced}</strong> h
          </div>
        </div>
      </div>
  
        <div>
        <table class="table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Hodiny</th>
              <th>Stavy</th>
              <th>Faktury</th>
              <th>Účtovat</th>
              <th>Akce<th>
            </tr>
          </thead>
          <tbody>
            ${
              state.lessons.length
                ? state.lessons.map(l => `
                  <tr>
                    <td>
                      ${(() => {
                        const d = fmtDateCZ(l.date);
                        return `
                          <div class="muted" style="font-size: 12px; white-space: nowrap;">
                            <div class="muted" style="font-size: 12px;">
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
                    <td>
                      <button class="btn" data-toggle-invoiced="${escapeHtml(l.id)}">
                        ${l.invoiced ? "Zpět" : "Zaplatit"}
                      </button>
                    </td>
                    <td>
                      <button class="btn" data-toggle-billable="${escapeHtml(l.id)}">
                        ${l.billable ? "Ano" : "Ne"}
                      </button>
                    </td>
                    <td>
                      <button class="btn" data-delete-lesson="${escapeHtml(l.id)}">Smazat</button>
                    </td>

                  </tr>
                `).join("")
                : `<tr><td colspan="5" class="muted">Zatím žádné hodiny.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
    `;
  
     // --- základní handlery ---
  document
    .getElementById("btnAddLesson")
    .addEventListener("click", () => openAddLessonDialog(s.id));

  document
    .getElementById("btnEditStudent")
    .addEventListener("click", () => openEditStudentDialog(s));

  // --- toggle jednotlivých hodin ---
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

  els.main.querySelectorAll("[data-delete-lesson]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-delete-lesson");
      const ok = confirm("Opravdu smazat tuto hodinu? Tohle nejde vrátit zpět.");
      if (!ok) return;
      await deleteLesson(id);
      await refreshSelectedStudent();
    });
  });



  // --- bulk invoice ---
  document
    .getElementById("btnBulkInvoice")
    .addEventListener("click", async () => {
      const ok1 = confirm("Označit všechny nefakturované účtované hodiny jako vyfakturované?");
      if (!ok1) return;

      const ok2 = confirm("Opravdu? Bude možné to vrátit tlačítkem Zpět.");
      if (!ok2) return;

      const undoToken = await bulkInvoiceAllForStudent(s.id);
      saveUndo(undoToken);
      await refreshSelectedStudent();
    });

  // --- undo ---
  const btnUndo = document.getElementById("btnUndo");
  if (btnUndo) {
    btnUndo.addEventListener("click", async () => {
      const undo = loadUndo();
      if (!undo) return;

      const ok = confirm("Vrátit zpět poslední hromadné vyfakturování?");
      if (!ok) return;

      await undoBulkInvoice(undo);
      clearUndo();
      await refreshSelectedStudent();
    });
  }
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
          <label>Google Meet odkaz</label>
          <input 
            name="meetLink" 
            type="text" 
            placeholder="https://meet.google.com/..." 
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            required />
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
          <label>Google Meet odkaz</label>
          <input name="meetLink" type="text" value="${escapeHtml(student.meetLink)}" required />
        </div>
  
        <div class="danger" id="studentErr" style="display:none;"></div>
  
        <div class="row" style="justify-content: space-between; margin-top: 6px;">
          <button class="btn" type="button" id="btnDeleteStudent">Smazat studenta</button>

       

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
        });
        els.dlgStudent.close();
        await refreshStudents();
      } catch (ex) {
        err.textContent = ex?.message ?? String(ex);
        err.style.display = "block";
      }
    });

    els.dlgStudent.querySelector("#btnCancelStudentEdit")
      .addEventListener("click", () => els.dlgStudent.close());

    els.dlgStudent.querySelector("#btnDeleteStudent")
      .addEventListener("click", async () => {
        const ok1 = confirm(`Opravdu smazat studenta ${student.firstName} ${student.lastName}?`);
        if (!ok1) return;

        const ok2 = confirm("Smažou se i všechny jeho hodiny. Pokračovat?");
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
  
  function openAddLessonDialog(studentId) {
    els.dlgLesson.innerHTML = `
      <form method="dialog" class="col" id="formLesson">
        <h3 style="margin: 0;">Přidat hodinu</h3>
  
        <div class="grid2">
          <div class="col">
            <label>Datum</label>
            <input name="date" type="date" value="${todayLocalISODate()}" required />
          </div>
          <div class="col">
            <label>Počet hodin</label>
            <input name="durationHours" type="number" step="0.5" min="0.5" value="1" required />
          </div>
        </div>
  
        <label class="row" style="gap: 10px;">
          <input name="paidNoShow" type="checkbox" />
          Neproběhla, ale bude zaplacená (absence)
        </label>
  
        <div class="danger" id="lessonErr" style="display:none;"></div>
  
        <div class="row" style="justify-content: flex-end; margin-top: 6px;">
          <button class="btn" value="cancel">Zrušit</button>
          <button class="btn primary" value="default">Uložit</button>
        </div>
      </form>
    `;
    els.dlgLesson.showModal();
  
    const form = els.dlgLesson.querySelector("#formLesson");
    const err = els.dlgLesson.querySelector("#lessonErr");
  
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.style.display = "none";
      try {
        const fd = new FormData(form);
        await addLessonForStudent(studentId, {
          date: fd.get("date"),
          durationHours: fd.get("durationHours"),
          paidNoShow: fd.get("paidNoShow") === "on",
        });
        els.dlgLesson.close();
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

  els.btnExport.addEventListener("click", async () => {
  const data = await exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `tutorlog-backup-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  });

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
  (async function init() {
    await refreshStudents();
    if (!state.students.length) renderMainEmpty();
  })();
  