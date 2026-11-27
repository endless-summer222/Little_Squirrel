export interface AppSettings {
  gestureUndo: boolean;
  gestureRedo: boolean;
  undoSteps: number;
  undoMB: number;
  gridDefault: boolean;
  perfFps: boolean;
}

const KEY = 'pixeluv.settings';

const DEFAULTS: AppSettings = {
  gestureUndo: true,
  gestureRedo: true,
  undoSteps: 100,
  undoMB: 64,
  gridDefault: false,
  perfFps: false,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(next: AppSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}


export function resetSettings(): AppSettings {
  const next = { ...DEFAULTS };
  saveSettings(next);
  return next;
}
