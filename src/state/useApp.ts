import { create } from 'zustand';
import type { Project } from '../core/types';
import {
  deleteProjects,
  loadProjects,
  saveProject,
  saveProjects,
} from '../core/db';

export type { Project } from '../core/types';

export type SheetKind =
  | 'new'
  | 'newFolder'
  | 'more'
  | 'settings'
  | 'help'
  | 'color'
  | 'layers'
  | 'selection'
  | 'effects'
  | null;

interface AppState {
  ready: boolean;
  screen: 'library' | 'editor';
  projects: Project[];
  activeId: string | null;
  sheet: SheetKind;
  toast: string | null;
  hydrate: () => Promise<void>;
  openProject: (id: string) => void;
  closeProject: () => void;
  createProject: (
    width: number,
    height: number,
    name: string | undefined,
    folderId: string | null,
  ) => void;
  importProject: (
    name: string,
    width: number,
    height: number,
    pixels: Uint8ClampedArray,
    folderId: string | null,
  ) => void;
  createFolder: (name: string, folderId: string | null) => void;
  renameProject: (id: string, name: string) => void;
  updateProjectPixels: (id: string, pixels: Uint8ClampedArray) => void;
  updateProjectPalette: (id: string, palette: string[]) => void;
  deleteProject: (id: string) => void;
  setSheet: (sheet: SheetKind) => void;
  showToast: (message: string) => void;
}

const today = new Date().toISOString().slice(0, 10);

const initialProjects: Project[] = [
  {
    id: 'p1',
    name: '副本-副本-副本',
    kind: 'file',
    width: 32,
    height: 32,
    updatedAt: today,
    folderId: null,
  },
  {
    id: 'p2',
    name: '副本-副本',
    kind: 'file',
    width: 64,
    height: 64,
    updatedAt: today,
    folderId: null,
  },
  {
    id: 'p3',
    name: 'Hero_Body_01',
    kind: 'file',
    width: 128,
    height: 128,
    updatedAt: '2026-11-24',
    folderId: null,
  },
  {
    id: 'p4',
    name: 'Rock_01',
    kind: 'file',
    width: 64,
    height: 64,
    updatedAt: '2026-11-23',
    folderId: null,
  },
];

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let hydratePromise: Promise<void> | null = null;

const persist = (project: Project) => {
  void saveProject(project).catch(() => {
    useApp.getState().showToast('本地保存失败');
  });
};

/** 兼容 v0.5 之前的旧工程（只有 size，没有 width/height） */
function normalize(p: Project & { size?: number }): Project {
  const side = p.width ?? p.height ?? p.size ?? 64;
  return {
    ...p,
    width: p.width ?? p.size ?? side,
    height: p.height ?? p.size ?? side,
  };
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  screen: 'library',
  projects: [],
  activeId: null,
  sheet: null,
  toast: null,

  hydrate: async () => {
    if (get().ready) return;
    if (hydratePromise) return hydratePromise;

    hydratePromise = (async () => {
      try {
        const rows = await loadProjects();
        if (rows.length === 0) {
          await saveProjects(initialProjects);
          set({ projects: initialProjects, ready: true });
        } else {
          const projects = rows
            .map((p) => normalize(p))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
          set({ projects, ready: true });
        }
      } catch {
        set({ projects: initialProjects, ready: true });
        get().showToast('本地存储不可用，改动仅在本次会话');
      }
    })();

    return hydratePromise;
  },

  openProject: (id) => {
    const project = get().projects.find((p) => p.id === id);
    if (!project || project.kind === 'folder') return;
    set({ screen: 'editor', activeId: id, sheet: null });
  },

  closeProject: () => set({ screen: 'library', activeId: null, sheet: null }),

  createProject: (width, height, name, folderId) => {
    const id = `p${Date.now().toString(36)}`;
    const project: Project = {
      id,
      name: name?.trim() || `未命名 ${get().projects.length + 1}`,
      kind: 'file',
      width,
      height,
      updatedAt: new Date().toISOString().slice(0, 10),
      folderId,
      // 新建画布默认全透明，不再生成示例图案
      pixels: new Uint8ClampedArray(width * height * 4),
      palette: [],
    };
    persist(project);
    set((s) => ({
      projects: [project, ...s.projects],
      screen: 'editor',
      activeId: id,
      sheet: null,
    }));
  },

  importProject: (name, width, height, pixels, folderId) => {
    const id = `p${Date.now().toString(36)}`;
    const project: Project = {
      id,
      name: name.trim() || '导入的贴图',
      kind: 'file',
      width,
      height,
      updatedAt: new Date().toISOString().slice(0, 10),
      folderId,
      pixels,
      palette: [],
    };
    persist(project);
    set((s) => ({
      projects: [project, ...s.projects],
      screen: 'editor',
      activeId: id,
      sheet: null,
    }));
  },

  createFolder: (name, folderId) => {
    const id = `f${Date.now().toString(36)}`;
    const folder: Project = {
      id,
      name: name.trim() || '新建文件夹',
      kind: 'folder',
      width: 0,
      height: 0,
      updatedAt: new Date().toISOString().slice(0, 10),
      folderId,
    };
    persist(folder);
    set((s) => ({ projects: [folder, ...s.projects], sheet: null }));
    get().showToast('文件夹已创建');
  },

  renameProject: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    let updated: Project | undefined;
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== id) return p;
        updated = { ...p, name: trimmed, updatedAt: new Date().toISOString().slice(0, 10) };
        return updated;
      }),
    }));
    if (updated) persist(updated);
  },

  updateProjectPixels: (id, pixels) => {
    let updated: Project | undefined;
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== id) return p;
        updated = {
          ...p,
          pixels,
          updatedAt: new Date().toISOString().slice(0, 10),
        };
        return updated;
      }),
    }));
    if (updated) persist(updated);
  },

  updateProjectPalette: (id, palette) => {
    let updated: Project | undefined;
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== id) return p;
        updated = { ...p, palette };
        return updated;
      }),
    }));
    if (updated) persist(updated);
  },

  deleteProject: (id) => {
    const target = get().projects.find((p) => p.id === id);
    const ids = [id];
    if (target?.kind === 'folder') {
      get()
        .projects.filter((p) => p.folderId === id)
        .forEach((p) => ids.push(p.id));
    }
    set((s) => ({ projects: s.projects.filter((p) => !ids.includes(p.id)) }));
    void deleteProjects(ids).catch(() => get().showToast('删除失败'));
    get().showToast('已删除');
  },

  setSheet: (sheet) => set({ sheet }),

  showToast: (message) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: message });
    toastTimer = setTimeout(() => set({ toast: null }), 2400);
  },
}));
