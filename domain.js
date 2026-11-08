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

// Přijímá i "450,5" z formuláře.
function toNumber(value) {
  return Number(String(value ?? "").replace(",", "."));
}

// -------- MONEY --------
// Sazba, se kterou jsem učil, než měl student vlastní sazbu.
// Záznamy bez uložené ceny (staré hodiny a dobití) se počítají touto sazbou.
export const DEFAULT_HOURLY_RATE = 500;

function parseHourlyRate(value) {
  const rate = toNumber(value);
  assert(Number.isFinite(rate) && rate > 0, "Hodinová sazba musí být > 0");
  return rate;
}

export function getStudentHourlyRate(student) {
  return student?.hourlyRate ?? DEFAULT_HOURLY_RATE;
}

// Cena hodiny podle sazby platné v době, kdy byla hodina zapsána.
export function getLessonAmountCzk(lesson) {
  const rate = lesson.hourlyRate ?? DEFAULT_HOURLY_RATE;
  return Number(lesson.durationHours || 0) * rate;
}

// Skutečně zaplacená částka za dobití (balíček může být se slevou).
export function getTopupAmountCzk(txn) {
  return txn.amountCzk ?? Number(txn.hours || 0) * DEFAULT_HOURLY_RATE;
}

// -------- STUDENTS (API pro UI) --------
export async function addStudent({ firstName, lastName, meetLink = "", hourlyRate = DEFAULT_HOURLY_RATE }) {
  assert(firstName?.trim(), "firstName je povinné");
  assert(lastName?.trim(), "lastName je povinné");

  const student = {
    id: newId(),
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    meetLink: String(meetLink || "").trim(), // odkaz na výuku (Meet/Zoom/…), nepovinný
    hourlyRate: parseHourlyRate(hourlyRate),
    archived: false,
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
  if ("hourlyRate" in patch) {
    // změna sazby platí jen pro nové hodiny – staré mají sazbu uloženou u sebe
    updated.hourlyRate = parseHourlyRate(patch.hourlyRate);
  }

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

export async function archiveStudent(studentId) {
  return updateStudent(studentId, { archived: true });
}

export async function restoreStudent(studentId) {
  return updateStudent(studentId, { archived: false });
}

export async function deleteStudent(studentId) {
  assert(studentId, "studentId je povinné");
  // student + jeho hodiny + jeho kreditní transakce, vše najednou
  await repo.students_deleteCascade(studentId);
}

// -------- LESSONS (API pro UI) --------
export async function addLessonForStudent(studentId, form) {
  assert(studentId, "studentId je povinné");
  const student = await repo.students_get(studentId);
  assert(student, "Student nenalezen");

  const date = form?.date ?? todayIsoDate();
  const durationHours = Number(form?.durationHours ?? 1);
  assert(date && /^\d{4}-\d{2}-\d{2}$/.test(date), "date musí být YYYY-MM-DD");
  assert(Number.isFinite(durationHours) && durationHours > 0, "durationHours musí být > 0");

  // UI checkbox “neproběhla, ale placená”
  const paidNoShow = Boolean(form?.paidNoShow);

  const paymentMethod = form?.paymentMethod ?? "invoice";
  assert(
    paymentMethod === "invoice" || paymentMethod === "credit",
    "Neplatná platební metoda"
  );

  const occurred = paidNoShow ? false : (form?.occurred ?? true);

  // Hodina placená kreditem se nefakturuje – je zaplacená předem.
  // (billable=false / invoiced=true je historické kódování; flagy jsou pro ni zamčené.)
  const billable = paymentMethod === "credit" ? false : (form?.billable ?? true);
  const invoiced = paymentMethod === "credit" ? true : (form?.invoiced ?? false);

  const lesson = {
    id: newId(),
    studentId,
    date,
    durationHours,
    hourlyRate: getStudentHourlyRate(student), // snapshot – pozdější změna sazby hodinu nezmění
    occurred: Boolean(occurred),
    billable: Boolean(billable),
    invoiced: Boolean(invoiced),
    createdAt: nowIso(),
    paymentMethod,
  };

  const deduction =
    paymentMethod === "credit"
      ? buildCreditTxn(studentId, "lesson_deduction", -durationHours, "", lesson.id)
      : null;

  await repo.lessons_addWithCreditTxn(lesson, deduction);
  return lesson;
}

export async function listLessonsByStudent(studentId) {
  const lessons = await repo.lessons_listByStudent(studentId);
  // nejnovější nahoře
  lessons.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });
  return lessons;
}

async function getInvoiceLesson(lessonId) {
  const lesson = await repo.lessons_get(lessonId);
  assert(lesson, "Hodina nenalezena");
  assert(lesson.paymentMethod !== "credit", "Hodina placená kreditem se nefakturuje");
  return lesson;
}

export async function setLessonInvoiced(lessonId, invoiced) {
  const lesson = await getInvoiceLesson(lessonId);
  const updated = { ...lesson, invoiced: Boolean(invoiced) };
  await repo.lessons_put(updated);
  return updated;
}

export async function toggleLessonInvoiced(lessonId) {
  const lesson = await getInvoiceLesson(lessonId);
  return setLessonInvoiced(lessonId, !lesson.invoiced);
}

export async function setLessonBillable(lessonId, billable) {
  const lesson = await getInvoiceLesson(lessonId);
  const updated = { ...lesson, billable: Boolean(billable) };
  await repo.lessons_put(updated);
  return updated;
}

export async function deleteLesson(lessonId) {
  assert(lessonId, "lessonId je povinné");
  // smaže i odečtení kreditu navázané na hodinu → kredit se vrátí
  await repo.lessons_deleteWithCreditTxns(lessonId);
}

// -------- BULK INVOICING --------
export async function bulkInvoiceMonthForStudent(studentId, monthKey) {
  assert(studentId, "studentId je povinné");
  assert(monthKey, "monthKey je povinný");

  const lessons = await listLessonsByStudent(studentId);

  const target = lessons.filter(l =>
    l.date?.startsWith(monthKey) &&
    l.paymentMethod !== "credit" &&
    l.billable &&
    !l.invoiced
  );

  const undo = {
    type: "bulk_invoice_month",
    studentId,
    monthKey,
    createdAt: nowIso(),
    lessonStates: target.map(l => ({ id: l.id, invoiced: l.invoiced })),
  };

  await repo.lessons_setInvoicedMany(target.map(l => ({ id: l.id, invoiced: true })));
  return undo;
}

export async function undoBulkInvoiceMonth(undo) {
  assert(undo?.type === "bulk_invoice_month", "Neplatný undo token");
  // hodiny, které mezitím zmizely, se přeskočí
  await repo.lessons_setInvoicedMany(undo.lessonStates || []);
}

// -------- BACKUP --------
const SCHEMA_VERSION = 2; // v2: + creditTransactions

export async function exportData() {
  const { students, lessons, creditTransactions } = await repo.exportAll();
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowIso(),
    students,
    lessons,
    creditTransactions,
  };
}

export async function importReplaceData(payload) {
  assert(payload && typeof payload === "object", "Neplatný soubor");
  assert(
    payload.schemaVersion === 1 || payload.schemaVersion === 2,
    "Neznámá verze zálohy"
  );

  const students = payload.students || [];
  const lessons = payload.lessons || [];
  // záloha v1 kredity neobsahuje
  const creditTransactions = payload.creditTransactions || [];

  assert(
    Array.isArray(students) && Array.isArray(lessons) && Array.isArray(creditTransactions),
    "Neplatná struktura dat"
  );

  await repo.importReplaceAll({ students, lessons, creditTransactions });
}

// -------- CREDIT --------
function buildCreditTxn(studentId, type, hours, note, relatedLessonId = null) {
  return {
    id: newId(),
    studentId,
    type,
    hours,
    note: String(note || "").trim(),
    relatedLessonId,
    createdAt: nowIso(),
  };
}

// amountCzk = kolik student skutečně zaplatil (u balíčku se slevou méně než hodiny × sazba)
export async function addCreditTopup(studentId, { hours, amountCzk, note = "" }) {
  assert(studentId, "studentId je povinné");
  const amountHours = toNumber(hours);
  assert(Number.isFinite(amountHours) && amountHours > 0, "Počet hodin musí být > 0");
  const paid = toNumber(amountCzk);
  assert(Number.isFinite(paid) && paid >= 0, "Zaplacená částka musí být ≥ 0");

  const txn = { ...buildCreditTxn(studentId, "topup", amountHours, note), amountCzk: paid };
  await repo.creditTransactions_add(txn);
  return txn;
}

export async function addCreditAdjustment(studentId, hours, note = "") {
  assert(studentId, "studentId je povinné");
  const amountHours = Number(hours);
  assert(Number.isFinite(amountHours) && amountHours !== 0, "Počet hodin nesmí být 0");

  const txn = buildCreditTxn(studentId, "adjustment", amountHours, note);
  await repo.creditTransactions_add(txn);
  return txn;
}

export async function listCreditTransactionsByStudent(studentId) {
  const txns = await repo.creditTransactions_listByStudent(studentId);
  txns.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return txns;
}

export async function getStudentCreditBalance(studentId) {
  const txns = await repo.creditTransactions_listByStudent(studentId);
  return txns.reduce((sum, t) => sum + Number(t.hours || 0), 0);
}

export async function resetStudentCredit(studentId, note = "VYNULOVÁNÍ") {
  assert(studentId, "studentId je povinné");

  const currentBalance = await getStudentCreditBalance(studentId);
  if (currentBalance === 0) return null;

  return addCreditAdjustment(studentId, -currentBalance, note);
}
