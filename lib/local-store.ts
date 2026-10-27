import fs from "fs";
import path from "path";
import crypto from "crypto";

const DATA_DIR = path.join(process.cwd(), ".data");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function filePath(collection: string): string {
  ensureDir();
  return path.join(DATA_DIR, `${collection}.json`);
}

function readCollection<T>(collection: string): T[] {
  const fp = filePath(collection);
  if (!fs.existsSync(fp)) return [];
  try {
    const raw = fs.readFileSync(fp, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeCollection<T>(collection: string, data: T[]) {
  const fp = filePath(collection);
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), "utf-8");
}

function uuid(): string {
  return crypto.randomUUID();
}

export const localStore = {
  // ---- Generic CRUD ----

  getAll<T>(collection: string): T[] {
    return readCollection<T>(collection);
  },

  getById<T extends { id: string }>(collection: string, id: string): T | null {
    const items = readCollection<T>(collection);
    return items.find((i) => i.id === id) || null;
  },

  getByField<T>(collection: string, field: string, value: any): T[] {
    const items = readCollection<T>(collection);
    return items.filter((i: any) => i[field] === value);
  },

  insert<T extends { id?: string }>(collection: string, item: Omit<T, "id"> & { id?: string }): T {
    const items = readCollection<any>(collection);
    const newItem = { ...item, id: item.id || uuid() } as T;
    items.push(newItem);
    writeCollection(collection, items);
    return newItem;
  },

  insertIfNotExists<T extends { id?: string }>(
    collection: string,
    item: Omit<T, "id"> & { id?: string },
    uniqueField: string
  ): { data: T; inserted: boolean } {
    const items = readCollection<any>(collection);
    const val = (item as any)[uniqueField];
    const existing = items.find(
      (i: any) =>
        typeof i[uniqueField] === "string" && typeof val === "string"
          ? i[uniqueField].toLowerCase() === val.toLowerCase()
          : i[uniqueField] === val
    );
    if (existing) return { data: existing, inserted: false };
    const newItem = { ...item, id: item.id || uuid() } as T;
    items.push(newItem);
    writeCollection(collection, items);
    return { data: newItem, inserted: true };
  },

  update<T extends { id: string }>(
    collection: string,
    id: string,
    updates: Partial<T>
  ): T | null {
    const items = readCollection<any>(collection);
    const idx = items.findIndex((i: any) => i.id === id);
    if (idx === -1) return null;
    items[idx] = { ...items[idx], ...updates };
    writeCollection(collection, items);
    return items[idx];
  },

  delete(collection: string, id: string): boolean {
    const items = readCollection<any>(collection);
    const filtered = items.filter((i: any) => i.id !== id);
    if (filtered.length === items.length) return false;
    writeCollection(collection, filtered);
    return true;
  },

  // ---- Settings (single object) ----

  getSettings(): Record<string, any> {
    const fp = filePath("settings");
    if (!fs.existsSync(fp)) return {};
    try {
      const raw = fs.readFileSync(fp, "utf-8");
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.length > 0 ? arr[0] : {};
    } catch {
      return {};
    }
  },

  saveSettings(settings: Record<string, any>) {
    const current = localStore.getSettings();
    const merged = { ...current, ...settings, id: current.id || uuid() };
    writeCollection("settings", [merged]);
    return merged;
  },
};
