// repo.js
import { openDb, tx, reqToPromise } from "./db.js";

let _dbPromise = null;
function getDb() {
  if (!_dbPromise) _dbPromise = openDb();
  return _dbPromise;
}

// Resolves when a multi-store / multi-request transaction commits.
function txDone(t) {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// Walks an index cursor and deletes every record for which `match` is true.
function deleteByIndex(store, indexName, key, match = () => true) {
  const req = store.index(indexName).openCursor(key);
  req.onsuccess = () => {
    const cursor = req.result;
    if (!cursor) return;
    if (match(cursor.value)) cursor.delete();
    cursor.continue();
  };
}

// ---------- Students ----------
export async function students_add(student) {
  const db = await getDb();
  return tx(db, "students", "readwrite", (store) => reqToPromise(store.add(student)));
}

export async function students_put(student) {
  const db = await getDb();
  return tx(db, "students", "readwrite", (store) => reqToPromise(store.put(student)));
}

export async function students_get(id) {
  const db = await getDb();
  return tx(db, "students", "readonly", (store) => reqToPromise(store.get(id)));
}

export async function students_list() {
  const db = await getDb();
  return tx(db, "students", "readonly", (store) => reqToPromise(store.getAll()));
}

// Deletes the student together with all their lessons and credit transactions, atomically.
export async function students_deleteCascade(studentId) {
  const db = await getDb();
  const t = db.transaction(["students", "lessons", "creditTransactions"], "readwrite");
  t.objectStore("students").delete(studentId);
  deleteByIndex(t.objectStore("lessons"), "by_studentId", studentId);
  deleteByIndex(t.objectStore("creditTransactions"), "by_studentId", studentId);
  return txDone(t);
}

// ---------- Lessons ----------

// Adds a lesson and (optionally) its credit transaction in one transaction,
// so a credit-paid lesson can never exist without its deduction.
export async function lessons_addWithCreditTxn(lesson, creditTxn = null) {
  const db = await getDb();
  const t = db.transaction(["lessons", "creditTransactions"], "readwrite");
  t.objectStore("lessons").add(lesson);
  if (creditTxn) t.objectStore("creditTransactions").add(creditTxn);
  return txDone(t);
}

export async function lessons_put(lesson) {
  const db = await getDb();
  return tx(db, "lessons", "readwrite", (store) => reqToPromise(store.put(lesson)));
}

export async function lessons_get(id) {
  const db = await getDb();
  return tx(db, "lessons", "readonly", (store) => reqToPromise(store.get(id)));
}

export async function lessons_listByStudent(studentId) {
  const db = await getDb();
  return tx(db, "lessons", "readonly", (store) => {
    const index = store.index("by_studentId");
    return reqToPromise(index.getAll(studentId));
  });
}

// Sets `invoiced` on many lessons in one transaction (all or nothing).
// Lessons that no longer exist are skipped.
export async function lessons_setInvoicedMany(states) {
  const db = await getDb();
  const t = db.transaction("lessons", "readwrite");
  const store = t.objectStore("lessons");
  for (const { id, invoiced } of states) {
    const req = store.get(id);
    req.onsuccess = () => {
      if (req.result) store.put({ ...req.result, invoiced: Boolean(invoiced) });
    };
  }
  return txDone(t);
}

// Saves an edited lesson together with the changes to its credit transactions, atomically.
export async function lessons_putWithCreditChanges(lesson, { putTxns = [], deleteTxnIds = [] } = {}) {
  const db = await getDb();
  const t = db.transaction(["lessons", "creditTransactions"], "readwrite");
  t.objectStore("lessons").put(lesson);
  const credits = t.objectStore("creditTransactions");
  for (const txn of putTxns) credits.put(txn);
  for (const id of deleteTxnIds) credits.delete(id);
  return txDone(t);
}

// Deletes a lesson and any credit transaction tied to it (its deduction), atomically.
export async function lessons_deleteWithCreditTxns(lessonId) {
  const db = await getDb();
  const t = db.transaction(["lessons", "creditTransactions"], "readwrite");
  const lessons = t.objectStore("lessons");
  const getReq = lessons.get(lessonId);
  getReq.onsuccess = () => {
    const lesson = getReq.result;
    if (!lesson) return;
    lessons.delete(lessonId);
    deleteByIndex(
      t.objectStore("creditTransactions"),
      "by_studentId",
      lesson.studentId,
      (txn) => txn.relatedLessonId === lessonId
    );
  };
  return txDone(t);
}

// ---------- Credit Transactions ----------
export async function creditTransactions_add(txn) {
  const db = await getDb();
  return tx(db, "creditTransactions", "readwrite", (store) => reqToPromise(store.add(txn)));
}

export async function creditTransactions_listByStudent(studentId) {
  const db = await getDb();
  return tx(db, "creditTransactions", "readonly", (store) => {
    const index = store.index("by_studentId");
    return reqToPromise(index.getAll(studentId));
  });
}

// ---------- Whole database ----------
const ALL_STORES = ["students", "lessons", "creditTransactions"];

// Consistent snapshot of everything (backup export, per-student summaries).
export async function readAll() {
  const db = await getDb();
  const t = db.transaction(ALL_STORES, "readonly");
  const reqs = ALL_STORES.map((name) => t.objectStore(name).getAll());
  await txDone(t);
  const [students, lessons, creditTransactions] = reqs.map((r) => r.result || []);
  return { students, lessons, creditTransactions };
}

// Replaces ALL data with the given payload in one transaction —
// if anything fails, the current data stays untouched.
export async function importReplaceAll({ students, lessons, creditTransactions }) {
  const db = await getDb();
  const t = db.transaction(ALL_STORES, "readwrite");
  const data = { students, lessons, creditTransactions };
  for (const name of ALL_STORES) {
    const store = t.objectStore(name);
    store.clear();
    for (const record of data[name] || []) store.put(record);
  }
  return txDone(t);
}
