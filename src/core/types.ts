export type ProjectKind = 'file' | 'folder';

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0..1
  blend: BlendMode;
  pixels: Uint8ClampedArray;
  groupId?: string | null;
}

export interface LayerGroup {
  id: string;
  name: string;
  expanded: boolean;
}

export interface Overlay {
  dataUrl: string;
  opacity: number;
  visible: boolean;
}

export interface Project {
  id: string;
  name: string;
  kind: ProjectKind;
  width: number;
  height: number;
  updatedAt: string;
  folderId: string | null;
  layers?: Layer[];
  activeLayerId?: string;
  groups?: LayerGroup[];
  overlay?: Overlay;
  palette?: string[];
  /** 旧版本（单缓冲）兼容字段 */
  pixels?: Uint8ClampedArray;
}
