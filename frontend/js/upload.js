import { api } from './api.js';
import { requireAuth } from './auth.js';
import { toast } from './toast.js';
import { formatBytes } from './utils.js';

if (!requireAuth()) throw new Error('unauthenticated');

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
  albumSheetList.innerHTML = `
    <div class="album-sheet-item" data-id="" onclick="selectAlbum('', 'No Album')">
      <span>📁</span><span>No Album (Uncategorized)</span>
    </div>
  ` + albums.map(a => `
    <div class="album-sheet-item" data-id="${a.id}" onclick="selectAlbum('${a.id}', '${a.name}')">
      <span>📂</span><span>${a.name} (${a.file_count})</span>
    </div>
  `).join('');
}

window.selectAlbum = function(id, name) {
  selectedAlbumId = id || null;
  albumValue.textContent = name;
  albumSelect.classList.toggle('selected', !!id);
  closeAlbumSheet();
};

albumSelect?.addEventListener('click', () => {
  albumSheet.classList.add('open');
});

function closeAlbumSheet() {
  albumSheet.classList.remove('open');
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
        ${f.type.startsWith('image/') ? '' : '🎬'}
      </div>
      <div class="file-preview-info">
        <div class="file-preview-name">${f.name}</div>
        <div class="file-preview-size">${formatBytes(f.size)}</div>
        <div class="upload-item-progress" id="prog-wrap-${i}" style="display:none">
          <div class="upload-item-progress-fill" id="prog-${i}" style="width:0%"></div>
        </div>
      </div>
      <span class="file-preview-status" id="status-${i}">⏳</span>
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
  uploadBtn.textContent = '⏳ Uploading...';

  let done = 0;
  const total = selectedFiles.length;

  for (let i = 0; i < total; i++) {
    const file = selectedFiles[i];
    const statusEl = document.getElementById(`status-${i}`);
    const progWrap = document.getElementById(`prog-wrap-${i}`);
    const progFill = document.getElementById(`prog-${i}`);

    if (progWrap) progWrap.style.display = 'block';
    if (progFill) { progFill.style.width = '30%'; }

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (selectedAlbumId) formData.append('album_id', selectedAlbumId);

      await api.uploadFile(formData);

      if (statusEl) statusEl.textContent = '✅';
      if (progFill) progFill.style.width = '100%';
      done++;

      if (progressBar) progressBar.style.width = `${(done / total) * 100}%`;
    } catch (err) {
      if (statusEl) statusEl.textContent = '❌';
      toast.error(`Failed: ${file.name}`);
    }
  }

  toast.success(`${done}/${total} files uploaded!`);
  selectedFiles = [];

  setTimeout(() => {
    renderPreviews();
    uploadBtn.disabled = false;
    uploadBtn.textContent = '🚀 Upload';
    if (progressBar) progressBar.style.width = '0%';
  }, 1500);
}

loadAlbums();
