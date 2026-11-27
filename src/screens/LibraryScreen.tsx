import { useEffect, useMemo, useRef, useState } from 'react';
import { createDemoTexture } from '../core/pixels';
import { compositeLayers, ensureLayers } from '../core/layers';
import { saveProjectPng } from '../core/export';
import { parseProject, saveProjectFile } from '../core/projectFile';
import { useApp, type Project } from '../state/useApp';
import { TextureView } from '../components/TextureView';
import {
  ChevronLeft,
  Folder,
  Gear,
  GridIcon,
  More,
  Plus,
  Search,
} from '../components/icons';
import {
  NewFolderSheet,
  NewProjectSheet,
  RenameSheet,
  Sheet,
} from './Sheets';
import { SettingsScreen } from './SettingsScreen';

type SortKey = 'custom' | 'date' | 'name' | 'size';

const SORT_LABEL: Record<SortKey, string> = {
  custom: '自定义',
  date: '时间',
  name: '名称',
  size: '尺寸',
};

function FileCard({
  project,
  onMenu,
  onDrag,
  dragging,
}: {
  project: Project;
  onMenu: () => void;
  onDrag: (e: React.PointerEvent<HTMLDivElement>) => void;
  dragging: boolean;
}) {
  const openProject = useApp((s) => s.openProject);
  const pixels = useMemo(() => {
    if (project.layers && project.layers.length > 0) {
      return compositeLayers(ensureLayers(project), project.width, project.height);
    }
    return createDemoTexture(Math.max(project.width, project.height), project.id);
  }, [project]);

  return (
    <div
      className={`card ${dragging ? 'lift' : ''}`}
      role="button"
      tabIndex={0}
      data-project={project.id}
      aria-label={`编辑 ${project.name}`}
      onPointerDown={onDrag}
      onClick={() => openProject(project.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') openProject(project.id);
      }}
    >
      <div className="thumb">
        <TextureView pixels={pixels} width={project.width} height={project.height} />
      </div>
      <div className="meta">
        <div className="name">{project.name}</div>
        <div className="date">{project.updatedAt}</div>
      </div>
      <button
        className="card-menu"
        aria-label="更多"
        onClick={(e) => {
          e.stopPropagation();
          onMenu();
        }}
      >
        ⋮
      </button>
    </div>
  );
}

function FolderCard({
  project,
  onOpen,
  onMenu,
  onDrag,
  dragging,
}: {
  project: Project;
  onOpen: () => void;
  onMenu: () => void;
  onDrag: (e: React.PointerEvent<HTMLDivElement>) => void;
  dragging: boolean;
}) {
  return (
    <div
      className={`card folder-card ${dragging ? 'lift' : ''}`}
      role="button"
      tabIndex={0}
      data-folder={project.id}
      aria-label={`打开文件夹 ${project.name}`}
      onPointerDown={onDrag}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen();
      }}
    >
      <div className="thumb folder-thumb">
        <Folder size={44} />
      </div>
      <div className="meta">
        <div className="name">{project.name}</div>
        <div className="date">文件夹</div>
      </div>
      <button
        className="card-menu"
        aria-label="更多"
        onClick={(e) => {
          e.stopPropagation();
          onMenu();
        }}
      >
        ⋮
      </button>
    </div>
  );
}

export function LibraryScreen() {
  const projects = useApp((s) => s.projects);
  const sheet = useApp((s) => s.sheet);
  const setSheet = useApp((s) => s.setSheet);
  const showToast = useApp((s) => s.showToast);
  const importProject = useApp((s) => s.importProject);
  const deleteProject = useApp((s) => s.deleteProject);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  const importRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLInputElement>(null);
  const importFullProject = useApp((s) => s.importFullProject);
  const moveProjectToFolder = useApp((s) => s.moveProjectToFolder);
  const reorderProjects = useApp((s) => s.reorderProjects);
  const folder = projects.find((p) => p.id === folderId) ?? null;
  const menuProject = projects.find((p) => p.id === menuId) ?? null;
  const [dragId, setDragId] = useState<string | null>(null);
  const dragTimer = useRef(0);
  const dragPos = useRef({ x: 0, y: 0 });

  const startDrag = (id: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.card-menu')) return;
    dragPos.current = { x: e.clientX, y: e.clientY };
    window.clearTimeout(dragTimer.current);
    dragTimer.current = window.setTimeout(() => {
      setDragId(id);
      if (navigator.vibrate) navigator.vibrate(8);
    }, 220);
  };

  useEffect(() => {
    if (!dragId) return;
    const move = (e: PointerEvent) => {
      dragPos.current = { x: e.clientX, y: e.clientY };
    };
    const up = () => {
      const el = document
        .elementFromPoint(dragPos.current.x, dragPos.current.y)
        ?.closest('[data-folder],[data-project]') as HTMLElement | null;
      const folderId2 = el?.dataset.folder ?? null;
      const projectId2 = el?.dataset.project ?? null;
      if (folderId2 && dragId !== folderId2) {
        moveProjectToFolder(dragId, folderId2);
        setSortKey('custom');
      } else if (projectId2 && projectId2 !== dragId) {
        const ids = projects
          .filter((p) => p.folderId === folderId)
          .map((p) => p.id)
          .filter((id) => id !== dragId);
        const idx = ids.indexOf(projectId2);
        ids.splice(idx < 0 ? ids.length : idx, 0, dragId);
        reorderProjects(ids);
        setSortKey('custom');
      }
      setDragId(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragId, projects, folderId]);

  const list = useMemo(() => {
    const kw = query.trim().toLowerCase();
    const rows = projects
      .filter((p) => p.folderId === folderId)
      .filter((p) => !kw || p.name.toLowerCase().includes(kw));
    const dir = sortAsc ? 1 : -1;
    return rows.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'zh') * dir;
      if (sortKey === 'size') return (a.width * a.height - b.width * b.height) * dir;
      if (sortKey === 'custom') {
        return (a.order ?? 1e9) - (b.order ?? 1e9) || b.updatedAt.localeCompare(a.updatedAt);
      }
      return a.updatedAt.localeCompare(b.updatedAt) * dir;
    });
  }, [projects, folderId, query, sortKey, sortAsc]);

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const maxSide = Math.max(bitmap.width, bitmap.height);
      const scale = maxSide > 1024 ? 1024 / maxSide : 1;
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      const data = ctx.getImageData(0, 0, w, h).data;
      importProject(
        file.name.replace(/\.[^.]+$/, '') || '导入的贴图',
        w,
        h,
        new Uint8ClampedArray(data),
        folderId,
      );
    } catch {
      showToast('导入失败：请选择 PNG / JPG 图片');
    }
  };

  const doExport = async (project: Project, scale: number) => {
    setMenuId(null);
    try {
      const path = await saveProjectPng(project, scale);
      showToast(`已导出：${path}`);
    } catch {
      showToast('导出失败');
    }
  };

  return (
    <div className="lib">
      <header className="lib-top">
        {folder ? (
          <>
            <button className="icon-btn" aria-label="返回全部" onClick={() => setFolderId(null)}>
              <ChevronLeft />
            </button>
            <div className="lib-title">{folder.name}</div>
          </>
        ) : searching ? (
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={() => {
              if (!query) setSearching(false);
            }}
            placeholder="搜索贴图"
            className="lib-search"
          />
        ) : (
          <button className="icon-btn" aria-label="搜索" onClick={() => setSearching(true)}>
            <Search />
          </button>
        )}
        <div className="right">
          <button className="icon-btn" aria-label="更多" onClick={() => setSheet('more')}>
            <More />
          </button>
        </div>
      </header>

      <main className="lib-scroll">
        {projects.length === 0 ? (
          <div className="empty">
            <GridIcon size={44} />
            <h2>还没有贴图</h2>
            <p>新建一张，或在电脑上画好后导入</p>
            <button className="primary" onClick={() => setSheet('new')}>
              新建贴图
            </button>
          </div>
        ) : list.length === 0 ? (
          <div className="empty">
            <Folder size={40} />
            <h2>这里是空的</h2>
            <p>右上角「⋮ → 新建文件 / 导入图片」开始</p>
          </div>
        ) : (
          <div className="grid">
            {list.map((p) =>
              p.kind === 'folder' ? (
                <FolderCard
                  key={p.id}
                  project={p}
                  onOpen={() => setFolderId(p.id)}
                  onMenu={() => setMenuId(p.id)}
                  onDrag={startDrag(p.id)}
                  dragging={dragId === p.id}
                />
              ) : (
                <FileCard key={p.id} project={p} onMenu={() => setMenuId(p.id)} onDrag={startDrag(p.id)} dragging={dragId === p.id} />
              ),
            )}
          </div>
        )}
      </main>

      <nav className="bottom-nav">
        <button className="nav-item active">
          <GridIcon size={22} />
          <span>创作</span>
        </button>
        <button className="fab" aria-label="新建贴图" onClick={() => setSheet('new')}>
          <Plus size={26} />
        </button>
        <button className="nav-item" onClick={() => setSheet('settings')}>
          <Gear size={22} />
          <span>设置</span>
        </button>
      </nav>

      <input
        ref={projectRef}
        type="file"
        accept=".uvproj,application/json"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const text = await f.text();
            importFullProject(parseProject(text));
            showToast('已导入工程');
          } catch {
            showToast('工程文件解析失败');
          }
          e.target.value = '';
        }}
      />
      <input
        ref={importRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          void onPickFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {sheet === 'new' && <NewProjectSheet folderId={folderId} />}
      {sheet === 'newFolder' && <NewFolderSheet folderId={folderId} />}
      {sheet === 'settings' && <SettingsScreen onBack={() => setSheet(null)} />}
      {sheet === 'more' && (
        <Sheet title="更多">
          <div className="muted" style={{ marginBottom: 6 }}>
            排序
          </div>
          <div className="opt-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <button
                key={k}
                className={`opt ${sortKey === k ? 'sel' : ''}`}
                onClick={() => setSortKey(k)}
              >
                {SORT_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="row">
            <span>顺序</span>
            <button className="chipbtn" onClick={() => setSortAsc((v) => !v)}>
              {sortAsc ? '升序 ↑' : '降序 ↓'}
            </button>
          </div>
          <div className="menu-list">
            <button
              className="menu-row"
              onClick={() => {
                setSheet(null);
                importRef.current?.click();
              }}
            >
              导入图片
            </button>
            <button
              className="menu-row"
              onClick={() => {
                setSheet(null);
                projectRef.current?.click();
              }}
            >
              导入工程（.uvproj）
            </button>
            <button className="menu-row" onClick={() => setSheet('new')}>
              新建文件
            </button>
            <button className="menu-row" onClick={() => setSheet('newFolder')}>
              新建文件夹
            </button>
          </div>
        </Sheet>
      )}

      {menuProject && (
        <Sheet title={menuProject.name} onClose={() => setMenuId(null)}>
          <div className="menu-list" style={{ marginTop: 0, borderTop: 0 }}>
            <button
              className="menu-row"
              onClick={() => {
                setRenameId(menuProject.id);
                setRenameText(menuProject.name);
                setMenuId(null);
              }}
            >
              重命名
            </button>
            {menuProject.kind === 'file' && (
              <>
                <button className="menu-row" onClick={() => void doExport(menuProject, 1)}>
                  导出 PNG（1×）
                </button>
                <button className="menu-row" onClick={() => void doExport(menuProject, 4)}>
                  导出 PNG（4× 最近邻）
                </button>
                <button
                  className="menu-row"
                  onClick={async () => {
                    const path = await saveProjectFile(menuProject);
                    showToast(`已导出工程：${path}`);
                  }}
                >
                  导出工程（.uvproj）
                </button>
              </>
            )}
            <button
              className="menu-row danger"
              onClick={() => {
                deleteProject(menuProject.id);
                setMenuId(null);
              }}
            >
              删除
            </button>
          </div>
        </Sheet>
      )}

      {renameId && (
        <RenameSheet
          id={renameId}
          initial={renameText}
          onClose={() => setRenameId(null)}
        />
      )}
    </div>
  );
}
