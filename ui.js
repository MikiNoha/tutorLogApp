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
  } from "./domain.js";
  
  const els = {
    studentList: document.getElementById("studentList"),
    main: document.getElementById("main"),
    btnAddStudent: document.getElementById("btnAddStudent"),
    dlgStudent: document.getElementById("dlgStudent"),
    dlgLesson: document.getElementById("dlgLesson"),
    search: document.getElementById("search"),
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
      l.invoiced ? `<span class="pill ok">vyfakt.</span>` : `<span class="pill">nefakt.</span>`,
    ].join(" ");
    return flags;
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
  
    els.main.innerHTML = `
      <div class="card col">
        <div class="row" style="justify-content: space-between; align-items: flex-start;">
          <div>
            <p class="title">${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</p>
            <div class="row" style="gap: 10px; margin-top: 6px;">
              <a class="btn" href="${escapeHtml(s.meetLink)}" target="_blank" rel="noreferrer">Otevřít Meet</a>
              <button class="btn primary" id="btnAddLesson">+ Hodina</button>
              <button class="btn" id="btnEditStudent">Upravit studenta</button>
            </div>
            <div class="muted" style="margin-top: 8px;">
              Nevyfakturováno (účtovat): <strong>${totalNotInvoiced}</strong> h
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
                <th>Vyfakturováno</th>
                <th>Účtovat</th>
              </tr>
            </thead>
            <tbody>
              ${
                state.lessons.length
                  ? state.lessons.map(l => `
                    <tr>
                      <td>${escapeHtml(l.date)}</td>
                      <td>${escapeHtml(l.durationHours)}</td>
                      <td>${fmtLessonRow(l)}</td>
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
                    </tr>
                  `).join("")
                  : `<tr><td colspan="5" class="muted">Zatím žádné hodiny.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  
    // Handlers
    document.getElementById("btnAddLesson").addEventListener("click", () => openAddLessonDialog(s.id));
    document.getElementById("btnEditStudent").addEventListener("click", () => openEditStudentDialog(s));
  
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
  }
  
  // ---------- dialogs ----------
  function openAddStudentDialog() {
    els.dlgStudent.innerHTML = `
      <form method="dialog" class="col" id="formStudent">
        <h3 style="margin: 0;">Nový student</h3>
  
        <div class="grid2">
          <div class="col">
            <label>Jméno</label>
            <input name="firstName" type="text" placeholder="Jan" required />
          </div>
          <div class="col">
            <label>Příjmení</label>
            <input name="lastName" type="text" placeholder="Novák" required />
          </div>
        </div>
  
        <div class="col">
          <label>Google Meet odkaz</label>
          <input name="meetLink" type="text" placeholder="https://meet.google.com/..." required />
          <div class="muted">1 student = 1 odkaz. Otevře se tlačítkem “Otevřít Meet”.</div>
        </div>
  
        <div class="danger" id="studentErr" style="display:none;"></div>
  
        <div class="row" style="justify-content: flex-end; margin-top: 6px;">
          <button class="btn" value="cancel">Zrušit</button>
          <button class="btn primary" id="btnSaveStudent" value="default">Uložit</button>
        </div>
      </form>
    `;
    els.dlgStudent.showModal();
  
    const form = els.dlgStudent.querySelector("#formStudent");
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
  
        <div class="row" style="justify-content: flex-end; margin-top: 6px;">
          <button class="btn" value="cancel">Zrušit</button>
          <button class="btn primary" id="btnSaveStudent" value="default">Uložit</button>
        </div>
      </form>
    `;
    els.dlgStudent.showModal();
  
    const form = els.dlgStudent.querySelector("#formStudentEdit");
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
  
  // init
  (async function init() {
    await refreshStudents();
    if (!state.students.length) renderMainEmpty();
  })();
  