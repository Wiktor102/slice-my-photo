const DB_NAME = 'slice-my-photo'
const STORE = 'images'
const KEY = 'current'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function idbSetImageStrict(value: unknown): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
      tx.objectStore(STORE).put(value, KEY)
    })
  } finally {
    db.close()
  }
}

/** Returns false when the write fails (e.g. storage quota exceeded). */
export async function idbSetImage(value: unknown): Promise<boolean> {
  let db: IDBDatabase | null = null
  try {
    db = await openDb()
    const activeDb = db
    await new Promise<void>((resolve, reject) => {
      const tx = activeDb.transaction(STORE, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
      tx.objectStore(STORE).put(value, KEY)
    })
    return true
  } catch {
    return false
  } finally {
    db?.close()
  }
}

export async function idbGetImage(): Promise<unknown> {
  let db: IDBDatabase | null = null
  try {
    db = await openDb()
    const activeDb = db
    const result = await new Promise<unknown>((resolve, reject) => {
      const tx = activeDb.transaction(STORE, 'readonly')
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
      const req = tx.objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    return result
  } catch {
    return null
  } finally {
    db?.close()
  }
}

/** Returns false when the previous recovery image could not be deleted. */
export async function idbClearImage(): Promise<boolean> {
  let db: IDBDatabase | null = null
  try {
    db = await openDb()
    const activeDb = db
    await new Promise<void>((resolve, reject) => {
      const tx = activeDb.transaction(STORE, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
      tx.objectStore(STORE).delete(KEY)
    })
    return true
  } catch {
    return false
  } finally {
    db?.close()
  }
}
