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
