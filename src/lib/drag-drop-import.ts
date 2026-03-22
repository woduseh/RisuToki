import { isSameReferencePath, type ReferenceFile } from './sidebar-refs';

// ---- Types ----

export interface CharxFileData {
  lorebook: Array<Record<string, unknown>>;
  regex: Array<Record<string, unknown>>;
}

export interface DragDropDeps {
  fileData: CharxFileData | null;
  referenceFiles: ReferenceFile[];
  syncReferenceFiles: () => Promise<ReferenceFile[]>;
  addAssetBuffer: (name: string, data: string) => Promise<unknown>;
  buildSidebar: () => void;
  setStatus: (msg: string) => void;
  openReferencePath: (path: string) => Promise<unknown>;
}

// ---- Helpers ----

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
}

// ---- Public API ----

export function initDragDrop(dropTarget: HTMLElement, deps: DragDropDeps): void {
  dropTarget.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropTarget.classList.add('drop-highlight');
  });

  dropTarget.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropTarget.classList.remove('drop-highlight');
  });

  dropTarget.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropTarget.classList.remove('drop-highlight');

    const files = (e as DragEvent).dataTransfer?.files;
    if (!files || files.length === 0) return;

    let jsonCount = 0,
      imgCount = 0,
      charxCount = 0;

    for (const file of files) {
      const ext = file.name.split('.').pop()!.toLowerCase();

      // .charx/.risum files → add as reference (works even without main file open)
      if (ext === 'charx' || ext === 'risum') {
        const filePath = (file as File & { path: string }).path;
        if (deps.referenceFiles.some((r) => isSameReferencePath(r.filePath, filePath))) {
          deps.setStatus(`이미 로드됨: ${file.name}`);
          continue;
        }
        const ref = await deps.openReferencePath(filePath);
        if (ref) {
          await deps.syncReferenceFiles();
          charxCount++;
        }
        continue;
      }

      if (!deps.fileData) {
        deps.setStatus('파일을 먼저 열어주세요');
        return;
      }

      if (ext === 'json') {
        const text = await file.text();
        try {
          const data = JSON.parse(text);
          const entries: Array<Record<string, unknown>> = Array.isArray(data) ? data : [data];
          // Detect regex vs lorebook: regex has "in"/"findRegex" or type containing "edit"
          const isRegex = entries.some(
            (e) =>
              e.in !== undefined ||
              e.findRegex !== undefined ||
              (typeof e.type === 'string' && e.type.toLowerCase().startsWith('edit')),
          );

          if (isRegex) {
            for (const entry of entries) {
              deps.fileData.regex.push({
                comment: entry.comment || entry.name || file.name.replace('.json', ''),
                in: entry.in || entry.findRegex || '',
                out: entry.out || entry.replaceString || '',
                type: (entry.type || 'editdisplay').toString().toLowerCase(),
                ableFlag: entry.ableFlag !== undefined ? entry.ableFlag : true,
              });
            }
          } else {
            const lbEntries: Array<Record<string, unknown>> =
              ((data as Record<string, unknown>).entries as Array<Record<string, unknown>>) || entries;
            for (const entry of lbEntries) {
              deps.fileData.lorebook.push({
                key: entry.key || (entry.keys ? (entry.keys as string[]).join(', ') : ''),
                content: entry.content || '',
                comment: entry.comment || entry.name || file.name.replace('.json', ''),
                mode: entry.mode || 'normal',
                insertorder: entry.insertorder || entry.insertion_order || 100,
                alwaysActive: entry.alwaysActive || entry.constant || false,
                forceActivation: entry.forceActivation || false,
                selective: entry.selective || false,
                secondkey:
                  entry.secondkey || (entry.secondary_keys ? (entry.secondary_keys as string[]).join(', ') : ''),
                constant: entry.constant || false,
                order: deps.fileData.lorebook.length,
                folder: entry.folder || '',
              });
            }
          }
          jsonCount++;
        } catch (err) {
          console.warn('[drag-drop] Invalid JSON:', file.name, err);
        }
      } else if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
        const base64 = await readFileAsBase64(file);
        const result = await deps.addAssetBuffer(file.name, base64);
        if (result) imgCount++;
      }
    }

    deps.buildSidebar();
    const parts: string[] = [];
    if (charxCount > 0) parts.push(`참고 파일 ${charxCount}개`);
    if (jsonCount > 0) parts.push(`JSON ${jsonCount}개`);
    if (imgCount > 0) parts.push(`이미지 ${imgCount}개`);
    if (parts.length > 0) {
      deps.setStatus(`드래그 드롭: ${parts.join(', ')} 추가됨`);
    }
  });
}
