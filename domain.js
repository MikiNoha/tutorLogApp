// domain.js
import * as repo from "./repo.js";

function nowIso() {
  return new Date().toISOString();
}

function todayIsoDate() {
  // YYYY-MM-DD v lokálním čase (ne UTC), aby to sedělo na “dnes”
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function newId() {
  return crypto.randomUUID();
}

// -------- STUDENTS (API pro UI) --------
export async function addStudent({ firstName, lastName, meetLink }) {
  assert(firstName?.trim(), "firstName je povinné");
  assert(lastName?.trim(), "lastName je povinné");
  assert(meetLink?.trim(), "meetLink je povinný");

  const student = {
    id: newId(),
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    meetLink: meetLink.trim(),
    createdAt: nowIso(),
  };

  await repo.students_add(student);
  return student;
}

export async function updateStudent(id, patch) {
  const current = await repo.students_get(id);
  assert(current, "Student nenalezen");

  const updated = {
    ...current,
    ...patch,
  };

  await repo.students_put(updated);
  return updated;
}

export async function listStudents() {
  const students = await repo.students_list();
  // drobný komfort: seřadit
  students.sort((a, b) =>
    (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName, "cs")
  );
  return students;
}

export async function getStudent(id) {
  return repo.students_get(id);
}

// -------- LESSONS (API pro UI) --------
export async function addLessonForStudent(studentId, form) {
  assert(studentId, "studentId je povinné");

  const date = form?.date ?? todayIsoDate();
  const durationHours = Number(form?.durationHours ?? 1);
  assert(date && /^\d{4}-\d{2}-\d{2}$/.test(date), "date musí být YYYY-MM-DD");
  assert(Number.isFinite(durationHours) && durationHours > 0, "durationHours musí být > 0");

  // UI checkbox “neproběhla, ale placená”
  const paidNoShow = Boolean(form?.paidNoShow);

  // Rozšiřitelná logika:
  // - default: proběhla a účtuje se
  // - paidNoShow: neproběhla, ale účtuje se
  // - bonus/free: umožníš později přes form.billable = false
  const occurred = paidNoShow ? false : (form?.occurred ?? true);
  const billable = form?.billable ?? true;
  const invoiced = form?.invoiced ?? false;

  const lesson = {
    id: newId(),
    studentId,
    date,
    durationHours,
    occurred: Boolean(occurred),
    billable: Boolean(billable),
    invoiced: Boolean(invoiced),
    createdAt: nowIso(),
  };

  await repo.lessons_add(lesson);
  return lesson;
}

export async function listLessonsByStudent(studentId) {
  const lessons = await repo.lessons_listByStudent(studentId);
  // nejnovější nahoře
  lessons.sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  return lessons;
}

export async function setLessonInvoiced(lessonId, invoiced) {
  const lesson = await repo.lessons_get(lessonId);
  assert(lesson, "Hodina nenalezena");

  const updated = { ...lesson, invoiced: Boolean(invoiced) };
  await repo.lessons_put(updated);
  return updated;
}

export async function toggleLessonInvoiced(lessonId) {
  const lesson = await repo.lessons_get(lessonId);
  assert(lesson, "Hodina nenalezena");
  return setLessonInvoiced(lessonId, !lesson.invoiced);
}

export async function setLessonBillable(lessonId, billable) {
  const lesson = await repo.lessons_get(lessonId);
  assert(lesson, "Hodina nenalezena");

  const updated = { ...lesson, billable: Boolean(billable) };
  await repo.lessons_put(updated);
  return updated;
}

// --- (jen test, klidně smaž) ---
(async function quickSmokeTest() {
  // nic nespouštím automaticky do UI, jen ať to nejde do erroru při importu
})();

export async function exportData() {
  const { students, lessons } = await repo.exportAll();
  return {
    schemaVersion: 1,
    exportedAt: nowIso(),
    students,
    lessons,
  };
}

export async function importReplaceData(payload) {
  assert(payload && typeof payload === "object", "Neplatný soubor");
  assert(payload.schemaVersion === 1, "Neznámá verze zálohy");

  const students = payload.students || [];
  const lessons = payload.lessons || [];

  // minimální sanity check
  assert(Array.isArray(students) && Array.isArray(lessons), "Neplatná struktura dat");

  await repo.importReplaceAll({ students, lessons });
}

export async function bulkInvoiceAllForStudent(studentId) {
  assert(studentId, "studentId je povinné");
  const lessons = await listLessonsByStudent(studentId);

  const target = lessons.filter(l => l.billable && !l.invoiced);

  // undo payload = původní stavy
  const undo = {
    type: "bulk_invoice",
    studentId,
    createdAt: nowIso(),
    lessonStates: target.map(l => ({ id: l.id, invoiced: l.invoiced })),
  };

  // proveď změny
  for (const l of target) {
    await setLessonInvoiced(l.id, true);
  }

  return undo;
}

export async function undoBulkInvoice(undo) {
  assert(undo?.type === "bulk_invoice", "Neplatný undo token");
  for (const s of undo.lessonStates || []) {
    // když hodina mezitím neexistuje, prostě přeskočíme
    const lesson = await repo.lessons_get(s.id);
    if (!lesson) continue;
    await setLessonInvoiced(s.id, s.invoiced);
  }
}

export async function deleteLesson(lessonId) {
  assert(lessonId, "lessonId je povinné");
  await repo.lessons_delete(lessonId);
}

export async function deleteStudent(studentId) {
  assert(studentId, "studentId je povinné");

  // nejdřív smazat hodiny (kvůli “sirotkům”)
  await repo.lessons_deleteByStudent(studentId);

  // pak smazat studenta
  await repo.students_delete(studentId);
}
