import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Project } from './types';

interface PixelUVDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
  };
}

const DB_NAME = 'pixeluv';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<PixelUVDB>> | null = null;

function db(): Promise<IDBPDatabase<PixelUVDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PixelUVDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('projects')) {
          database.createObjectStore('projects', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function loadProjects(): Promise<Project[]> {
  const database = await db();
  return database.getAll('projects');
}

export async function saveProject(project: Project): Promise<void> {
  const database = await db();
  await database.put('projects', project);
}

export async function saveProjects(projects: Project[]): Promise<void> {
  const database = await db();
  const tx = database.transaction('projects', 'readwrite');
  await Promise.all([...projects.map((p) => tx.store.put(p)), tx.done]);
}

export async function deleteProjectRow(id: string): Promise<void> {
  const database = await db();
  await database.delete('projects', id);
}

export async function deleteProjects(ids: string[]): Promise<void> {
  const database = await db();
  const tx = database.transaction('projects', 'readwrite');
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
}

export async function storageEstimate(): Promise<string> {
  if (!navigator.storage?.estimate) return '未知';
  const { usage } = await navigator.storage.estimate();
  if (!usage) return '未知';
  return `${(usage / 1024 / 1024).toFixed(1)} MB`;
}
