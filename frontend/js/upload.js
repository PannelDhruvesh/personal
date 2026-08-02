import { api } from './api.js';
import { requireAuth } from './auth.js';
import { toast } from './toast.js';
import { formatBytes } from './utils.js';

// Auth guard — must await since requireAuth is async
const __authOk = await requireAuth();
if (!__authOk) throw new Error('unauthenticated');

const ALLOWED_TYPES = ['image/jpeg','image/png','image/gif','image/webp','image/heic','video/mp4','video/quicktime','video/webm','video/x-msvideo'];
const MAX_SIZE = 100 * 1024 * 1024;

let selectedFiles = [];
let selectedAlbumId = null;
let albums = [];

const fileInput      = document.getElementById('file-input');
const uploadZone     = document.getElementById('upload-zone');
const previewList    = document.getElementById('preview-list');
const uploadBtn      = document.getElementById('upload-btn');
const albumSelect    = document.getElementById('album-select');
const albumValue     = document.getElementById('album-value');
const albumSheet     = document.getElementById('album-sheet');
const albumSheetList = document.getElementById('album-sheet-list');
const progressBar    = document.getElementById('global-progress-fill');

// ── Load albums ──
async function loadAlbums() {
  try {
    const res = await api.getAlbums({ limit: 100 });
    albums = res.data || [];
    renderAlbumSheet();
  } catch (_) {}
}

function renderAlbumSheet() {
  albumSheetList.innerHTML = '';

  const noAlbum = document.createElement('div');
  noAlbum.className = 'album-sheet-item';
  noAlbum.dataset.id = '';
  noAlbum.dataset.name = 'No Album';
  noAlbum.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="opacity:0.5;flex-shrink:0"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/></svg><span>No Album (Uncategorized)</span>';
  albumSheetList.appendChild(noAlbum);

  albums.forEach(a => {
    const item = document.createElement('div');
    item.className = 'album-sheet-item';
    item.dataset.id = a.id;
    item.dataset.name = a.name;
    const svg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0;opacity:0.7"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/></svg>';
    const span = document.createElement('span');
    span.textContent = `${a.name} (${a.file_count})`;
    item.innerHTML = svg;
    item.appendChild(span);
    albumSheetList.appendChild(item);
  });

  // Event delegation — single listener for all items
  albumSheetList.onclick = (e) => {
    const item = e.target.closest('.album-sheet-item');
    if (!item) return;
    selectAlbum(item.dataset.id, item.dataset.name);
  };
}

function selectAlbum(id, name) {
  selectedAlbumId = id || null;
  albumValue.textContent = name || 'No Album';
  albumSelect.classList.toggle('selected', !!id);
  closeAlbumSheet();
}

albumSelect?.addEventListener('click', () => {
  if (typeof openSheet === 'function') openSheet();
  else albumSheet.classList.add('open');
});

function closeAlbumSheet() {
  if (typeof closeSheet === 'function') closeSheet();
  else albumSheet.classList.remove('open');
}

document.getElementById('album-sheet-backdrop')?.addEventListener('click', closeAlbumSheet);

// ── Drag & Drop ──
uploadZone?.addEventListener('dragenter', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone?.addEventListener('dragleave', e => { if (!uploadZone.contains(e.relatedTarget)) uploadZone.classList.remove('drag-over'); });
uploadZone?.addEventListener('dragover', e => e.preventDefault());
uploadZone?.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  addFiles(Array.from(e.dataTransfer.files));
});

fileInput?.addEventListener('change', () => {
  addFiles(Array.from(fileInput.files));
  fileInput.value = '';
});

function addFiles(files) {
  const valid = files.filter(f => {
    if (!ALLOWED_TYPES.includes(f.type)) {
      toast.error(`${f.name}: unsupported type`);
      return false;
    }
    if (f.size > MAX_SIZE) {
      toast.error(`${f.name}: exceeds 100MB limit`);
      return false;
    }
    return true;
  });

  if (selectedFiles.length + valid.length > 20) {
    toast.warning('Maximum 20 files at once');
    valid.splice(20 - selectedFiles.length);
  }

  selectedFiles.push(...valid);
  renderPreviews();
  uploadBtn.disabled = selectedFiles.length === 0;
}

function renderPreviews() {
  if (!selectedFiles.length) {
    previewList.innerHTML = '';
    return;
  }

  previewList.innerHTML = selectedFiles.map((f, i) => `
    <div class="file-preview-item" id="preview-${i}">
      <div class="file-preview-thumb" id="thumb-${i}">
        ${f.type.startsWith('image/') ? '' : '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" style="opacity:0.5;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>'}
      </div>
      <div class="file-preview-info">
        <div class="file-preview-name">${f.name}</div>
        <div class="file-preview-size">${formatBytes(f.size)}</div>
        <div class="upload-item-progress" id="prog-wrap-${i}" style="display:none">
          <div class="upload-item-progress-fill" id="prog-${i}" style="width:0%"></div>
        </div>
      </div>
      <span class="file-preview-status" id="status-${i}" style="font-size:14px;color:var(--dark-muted);">—</span>
      <button onclick="removeFile(${i})" style="color:var(--dark-muted);font-size:18px;padding:4px 8px;background:none;border:none;cursor:pointer;">✕</button>
    </div>
  `).join('');

  // Generate thumbnails for images
  selectedFiles.forEach((f, i) => {
    if (f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => {
        const thumb = document.getElementById(`thumb-${i}`);
        if (thumb) thumb.innerHTML = `<img src="${e.target.result}" alt="${f.name}" />`;
      };
      reader.readAsDataURL(f);
    }
  });
}

window.removeFile = function(idx) {
  selectedFiles.splice(idx, 1);
  renderPreviews();
  uploadBtn.disabled = selectedFiles.length === 0;
};

// ── Upload ──
uploadBtn?.addEventListener('click', startUpload);

async function startUpload() {
  if (!selectedFiles.length) return;
  uploadBtn.disabled = true;
  uploadBtn.textContent = 'Uploading...';

  const total = selectedFiles.length;
  let done = 0;

  // Upload in parallel with max 3 concurrent
  const CONCURRENCY = 3;
  const queue = [...selectedFiles.entries()];

  async function uploadOne([i, file]) {
    const statusEl = document.getElementById(`status-${i}`);
    const progWrap = document.getElementById(`prog-wrap-${i}`);
    const progFill = document.getElementById(`prog-${i}`);
    if (progWrap) progWrap.style.display = 'block';
    if (progFill) progFill.style.width = '20%';
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (selectedAlbumId && selectedAlbumId !== 'null') formData.append('album_id', selectedAlbumId);
      await api.uploadFile(formData);
      if (statusEl) statusEl.textContent = '✓';
      if (progFill) progFill.style.width = '100%';      done++;
    } catch (err) {
      if (statusEl) statusEl.textContent = '✗';
      toast.error(`Failed: ${file.name}`);
    }
    if (progressBar) progressBar.style.width = `${(done / total) * 100}%`;
  }

  // Process in batches of CONCURRENCY
  for (let i = 0; i < queue.length; i += CONCURRENCY) {
    await Promise.allSettled(queue.slice(i, i + CONCURRENCY).map(uploadOne));
  }

  toast.success(`${done}/${total} uploaded!`);

  // Signal dashboard to reload fresh data on next visit
  if (done > 0) {
    sessionStorage.setItem('dashboard_needs_refresh', '1');
    // Also clear the locally cached user so dashboard re-fetches fresh profile
    // (avatar_url, storage_used etc. may have changed)
    localStorage.removeItem('user');
  }

  selectedFiles = [];
  setTimeout(() => {
    renderPreviews();
    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Upload';
    if (progressBar) progressBar.style.width = '0%';
  }, 1200);
}

loadAlbums();
