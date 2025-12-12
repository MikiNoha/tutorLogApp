// db.js
const DB_NAME = "tutorlog";
const DB_VERSION = 1;

export function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      // Students
      if (!db.objectStoreNames.contains("students")) {
        const students = db.createObjectStore("students", { keyPath: "id" });
        students.createIndex("by_lastName", "lastName", { unique: false });
      }

      // Lessons
      if (!db.objectStoreNames.contains("lessons")) {
        const lessons = db.createObjectStore("lessons", { keyPath: "id" });
        lessons.createIndex("by_studentId", "studentId", { unique: false });
        lessons.createIndex("by_date", "date", { unique: false });
        lessons.createIndex("by_invoiced", "invoiced", { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function tx(db, storeName, mode, fn) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);

    let result;
    try {
      result = fn(store, transaction);
    } catch (e) {
      transaction.abort();
      reject(e);
      return;
    }

    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
