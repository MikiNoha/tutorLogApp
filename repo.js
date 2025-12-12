// repo.js
import { openDb, tx, reqToPromise } from "./db.js";

let _dbPromise = null;
function getDb() {
  if (!_dbPromise) _dbPromise = openDb();
  return _dbPromise;
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

// ---------- Lessons ----------
export async function lessons_add(lesson) {
  const db = await getDb();
  return tx(db, "lessons", "readwrite", (store) => reqToPromise(store.add(lesson)));
}

export async function lessons_put(lesson) {
  const db = await getDb();
  return tx(db, "lessons", "readwrite", (store) => reqToPromise(store.put(lesson)));
}

export async function lessons_get(id) {
  const db = await getDb();
  return tx(db, "lessons", "readonly", (store) => reqToPromise(store.get(id)));
}

export async function lessons_delete(id) {
  const db = await getDb();
  return tx(db, "lessons", "readwrite", (store) => reqToPromise(store.delete(id)));
}

export async function lessons_listByStudent(studentId) {
  const db = await getDb();
  return tx(db, "lessons", "readonly", (store) => {
    const index = store.index("by_studentId");
    return reqToPromise(index.getAll(studentId));
  });
}

export async function clearStore(storeName) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function students_bulkPut(students) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("students", "readwrite");
    const store = tx.objectStore("students");
    for (const s of students) {
      store.put(s);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function lessons_bulkPut(lessons) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("lessons", "readwrite");
    const store = tx.objectStore("lessons");
    for (const l of lessons) {
      store.put(l);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function exportAll() {
  const students = await students_list();

  const db = await getDb();
  const lessons = await new Promise((resolve, reject) => {
    const tx = db.transaction("lessons", "readonly");
    const store = tx.objectStore("lessons");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });

  return { students, lessons };
}

export async function importReplaceAll({ students, lessons }) {
  await clearStore("lessons");
  await clearStore("students");

  await students_bulkPut(students || []);
  await lessons_bulkPut(lessons || []);
}

export async function students_delete(id) {
  const db = await getDb();
  return tx(db, "students", "readwrite", (store) => reqToPromise(store.delete(id)));
}

export async function lessons_deleteByStudent(studentId) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction("lessons", "readwrite");
    const store = t.objectStore("lessons");
    const index = store.index("by_studentId");
    const req = index.openCursor(studentId);

    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return; // done
      cursor.delete();
      cursor.continue();
    };

    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

