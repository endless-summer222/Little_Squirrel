export type ProjectKind = 'file' | 'folder';

export interface Project {
  id: string;
  name: string;
  kind: ProjectKind;
  width: number;
  height: number;
  updatedAt: string;
  folderId: string | null;
  pixels?: Uint8ClampedArray;
  palette?: string[];
}
