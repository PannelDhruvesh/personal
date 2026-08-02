import { api } from './api.js';
import { requireAuth } from './auth.js';
import { toast } from './toast.js';
import { formatBytes, timeAgo } from './utils.js';

await requireAuth();

const params = new URLSearchParams(location.search);
const fileId = params.get('id');

let file = null;
let scale = 1;
let startDist = 0;

const mediaContainer = document.getElementById('viewer-media');
const titleEl = document.getElementById('viewer-title');
const sizeEl  = document.getElementById('viewer-size');
const dateEl  = document.getElementById('viewer-date');
const favBtn  = document.getElementById('viewer-fav-btn');

async function loadFile() {
  // Try session cache first — skip API call if we have valid cached data
  const cached = sessionStorage.getItem('viewer_file');
  if (cached) {
    try {
      file = JSON.parse(cached);
      if (file?.id === fileId) {
        render();
        return; // Cache hit — no API call needed
      }
    } catch (_) {}
  }

  // Cache miss — fetch from API
  try {
    const res = await api.getFile(fileId);
    file = res.data;
    render();
  } catch (_) {
    if (!file) { toast.error('File not found'); history.back(); }
  }
}

function render() {
  if (!file) return;

  // Sanitize and safely set text content
  if (titleEl) titleEl.textContent = file.original_filename || 'Untitled';
  if (sizeEl)  sizeEl.textContent  = formatBytes(file.file_size);
  if (dateEl)  dateEl.textContent  = timeAgo(file.created_at);
  if (favBtn)  favBtn.textContent  = file.is_favorite ? '❤️' : '🤍';

  if (mediaContainer) {
    // Clear previous content
    mediaContainer.innerHTML = '';
    
    if (file.file_type === 'photo') {
      const img = document.createElement('img');
      img.id = 'viewer-img';
      // Sanitize URL - only use if it's a valid URL
      const safeUrl = String(file.signed_url || '').trim();
      if (safeUrl) {
        img.setAttribute('src', safeUrl);
      }
      img.setAttribute('alt', '');
      img.setAttribute('draggable', 'false');
      img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;user-select:none;';
      mediaContainer.appendChild(img);
      initPinchZoom();
    } else {
      const video = document.createElement('video');
      video.id = 'viewer-video';
      const safeUrl = String(file.signed_url || '').trim();
      if (safeUrl) {
        video.setAttribute('src', safeUrl);
      }
      video.setAttribute('controls', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('autoplay', '');
      video.style.cssText = 'max-width:100%;max-height:100%;border-radius:8px;';
      mediaContainer.appendChild(video);
    }
  }
}

// ── Pinch to zoom ──
function initPinchZoom() {
  const img = document.getElementById('viewer-img');
  if (!img) return;

  mediaContainer.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      startDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  }, { passive: true });

  mediaContainer.addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      scale = Math.min(Math.max(scale * (dist / startDist), 1), 4);
      img.style.transform = `scale(${scale})`;
      startDist = dist;
    }
  }, { passive: true });

  // Double-tap to reset
  let lastTap = 0;
  mediaContainer.addEventListener('touchend', () => {
    const now = Date.now();
    if (now - lastTap < 300) { scale = 1; img.style.transform = 'scale(1)'; }
    lastTap = now;
  });
}

// ── Actions ──
favBtn?.addEventListener('click', async () => {
  try {
    const res = await api.favoriteFile(fileId);
    file.is_favorite = res.data.is_favorite;
    favBtn.textContent = file.is_favorite ? '❤️' : '🤍';
    toast.love(file.is_favorite ? 'Added to favorites ❤️' : 'Removed from favorites');
  } catch (_) { toast.error('Failed'); }
});

document.getElementById('viewer-download-btn')?.addEventListener('click', async () => {
  try {
    const res = await api.getDownloadUrl(fileId);
    const a = document.createElement('a');
    a.href = res.data.download_url;
    a.download = res.data.filename;
    a.click();
  } catch (_) { toast.error('Download failed'); }
});

document.getElementById('viewer-delete-btn')?.addEventListener('click', async () => {
  if (!confirm('Move this file to trash?')) return;
  try {
    await api.deleteFile(fileId);
    toast.success('Moved to trash');
    history.back();
  } catch (_) { toast.error('Failed to delete'); }
});

document.getElementById('viewer-share-btn')?.addEventListener('click', async () => {
  if (navigator.share && file) {
    try {
      await navigator.share({ title: file.original_filename, url: file.signed_url });
    } catch (_) {}
  } else {
    toast.info('Sharing not supported on this device');
  }
});

document.getElementById('viewer-back-btn')?.addEventListener('click', () => history.back());

loadFile();
