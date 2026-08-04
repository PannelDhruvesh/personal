import { api } from './api.js';
import { requireAuth } from './auth.js';
import { toast } from './toast.js';
import { formatDuration } from './utils.js';

await requireAuth();

const params = new URLSearchParams(location.search);
const albumId = params.get('id');
if (!albumId) location.replace('/dashboard.html');

let album = null;
let page = 1;
let hasMore = true;
let isLoading = false;

const grid = document.getElementById('album-grid');
const albumName = document.getElementById('album-name');
const albumCount = document.getElementById('album-count');

// Shared observer for lazy-loading images and videos (1 instance for the whole grid)
const albumObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const el = entry.target;
      if (el.dataset.src) {
        if (el.tagName === 'VIDEO') {
          el.src = el.dataset.src;
        } else {
          el.src = el.dataset.src;
        }
        el.removeAttribute('data-src');
        albumObserver.unobserve(el);
      }
    }
  });
}, { rootMargin: '200px' });

async function loadAlbum() {
  try {
    const res = await api.getAlbum(albumId);
    album = res.data;
    if (albumName) albumName.textContent = album.name;
    document.getElementById('album-fav-btn')?.classList.toggle('active', album.is_favorite);
    await loadFiles(true);
  } catch (_) {
    toast.error('Album not found');
    location.replace('/dashboard.html');
  }
}

async function loadFiles(reset = false) {
  if (isLoading || (!hasMore && !reset)) return;
  if (reset) { page = 1; hasMore = true; grid.innerHTML = renderSkeletons(9); }
  isLoading = true;

  try {
    const params = { page, limit: 30 };
    if (albumId && albumId !== 'null' && albumId !== 'undefined') {
      params.album_id = albumId;
    }
    const res = await api.getGallery(params);
    const files = res.data;
    const pagination = res.pagination;

    if (reset) grid.innerHTML = '';
    if (!files?.length && reset) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state-icon">📸</div>
        <p class="empty-state-title">Album is empty</p>
        <p class="empty-state-text">Upload photos or videos to this album</p>
      </div>`;
      return;
    }

    files?.forEach(f => grid.appendChild(createItem(f)));
    if (albumCount) albumCount.textContent = `${pagination?.total || 0} items`;
    hasMore = pagination?.has_next || false;
    page++;
  } catch (_) {
    toast.error('Failed to load files');
  } finally {
    isLoading = false;
  }
}

function createItem(file) {
  const div = document.createElement('div');
  div.className = 'media-item';
  div.dataset.id = file.id;
  
  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'media-overlay';
  div.appendChild(overlay);
  
  // Safely create media element
  const safeUrl = String(file.signed_url || '').trim();
  const safeName = String(file.original_filename || '').trim();
  
  if (file.file_type === 'photo') {
    const img = document.createElement('img');
    img.setAttribute('data-src', safeUrl);
    img.setAttribute('loading', 'lazy');
    img.setAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=');
    img.setAttribute('alt', safeName);
    div.appendChild(img);
    if (safeUrl) albumObserver.observe(img);
  } else {
    const video = document.createElement('video');
    video.setAttribute('data-src', safeUrl);
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('preload', 'none');
    video.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    div.appendChild(video);
    if (safeUrl) albumObserver.observe(video);
  }
  
  // Add favorite icon — SVG heart, no emoji
  if (file.is_favorite) {
    const fav = document.createElement('span');
    fav.className = 'media-fav-icon';
    fav.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#f87171"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
    div.appendChild(fav);
  }
  
  // Add video badge
  if (file.file_type === 'video') {
    const badge = document.createElement('span');
    badge.className = 'media-type-badge';
    badge.style.cssText = 'position:absolute;bottom:5px;left:5px;';
    badge.textContent = '▶';
    div.appendChild(badge);
  }

  div.addEventListener('click', () => {
    sessionStorage.setItem('viewer_file', JSON.stringify(file));
    location.href = `/viewer.html?id=${encodeURIComponent(file.id)}`;
  });
  return div;
}

function renderSkeletons(n) {
  return Array(n).fill('<div class="skeleton" style="aspect-ratio:1;border-radius:4px;"></div>').join('');
}

// ── Album actions ──
document.getElementById('album-fav-btn')?.addEventListener('click', async () => {
  try {
    const res = await api.favoriteAlbum(albumId);
    const btn = document.getElementById('album-fav-btn');
    btn?.classList.toggle('active', res.data.is_favorite);
    toast.love(res.data.is_favorite ? 'Added to favorites ❤️' : 'Removed from favorites');
  } catch (_) { toast.error('Failed'); }
});

document.getElementById('album-rename-btn')?.addEventListener('click', () => {
  const name = prompt('New album name:', album?.name || '');
  if (name?.trim()) renameAlbum(name.trim());
});

async function renameAlbum(name) {
  try {
    await api.updateAlbum(albumId, { name });
    if (albumName) albumName.textContent = name;
    toast.success('Album renamed');
  } catch (_) { toast.error('Failed to rename'); }
}

document.getElementById('album-delete-btn')?.addEventListener('click', async () => {
  if (!confirm('Move this album to trash?')) return;
  try {
    await api.deleteAlbum(albumId);
    toast.success('Album moved to trash');
    location.replace('/dashboard.html');
  } catch (_) { toast.error('Failed to delete'); }
});

// Infinite scroll
const sentinel = document.getElementById('scroll-sentinel');
if (sentinel) {
  new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) loadFiles();
  }, { rootMargin: '200px' }).observe(sentinel);
}

loadAlbum();
