import { api } from './api.js';
import { requireAuth } from './auth.js';
import { toast } from './toast.js';
import { formatDuration } from './utils.js';

if (!requireAuth()) throw new Error('unauthenticated');

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
  div.innerHTML = `
    <div class="media-overlay"></div>
    ${file.file_type === 'photo'
      ? `<img data-src="${file.signed_url}" loading="lazy" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt="${file.original_filename}"/>`
      : `<video src="${file.signed_url}" muted playsinline preload="none" style="width:100%;height:100%;object-fit:cover;"></video>`
    }
    ${file.is_favorite ? '<span class="media-fav-icon">❤️</span>' : ''}
    ${file.file_type === 'video' ? '<span class="media-type-badge" style="position:absolute;bottom:5px;left:5px;">▶</span>' : ''}
  `;

  const img = div.querySelector('img[data-src]');
  if (img) {
    new IntersectionObserver((entries, obs) => {
      entries.forEach(e => {
        if (e.isIntersecting) { img.src = img.dataset.src; img.removeAttribute('data-src'); obs.unobserve(img); }
      });
    }, { rootMargin: '150px' }).observe(img);
  }

  div.addEventListener('click', () => {
    sessionStorage.setItem('viewer_file', JSON.stringify(file));
    location.href = `/viewer.html?id=${file.id}`;
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
