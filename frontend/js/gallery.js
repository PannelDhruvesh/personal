import { api } from './api.js';
import { requireAuth } from './auth.js';
import { toast } from './toast.js';
import { formatDuration, debounce } from './utils.js';

if (!requireAuth()) throw new Error('unauthenticated');

let currentPage = 1;
let isLoading = false;
let hasMore = true;
let currentFilter = 'all';
let currentView = 'medium';
const PAGE_SIZE = 30;

const grid = document.getElementById('media-grid');
const searchInput = document.getElementById('search-input');
const filterChips = document.querySelectorAll('.chip[data-filter]');

async function loadFiles(reset = false) {
  if (isLoading || (!hasMore && !reset)) return;

  if (reset) {
    currentPage = 1;
    hasMore = true;
    grid.innerHTML = renderSkeletons(12);
  }

  isLoading = true;
  showLoadingSpinner(true);

  try {
    const params = {
      page: currentPage,
      limit: PAGE_SIZE,
    };
    if (currentFilter === 'photos') params.file_type = 'photo';
    if (currentFilter === 'videos') params.file_type = 'video';
    if (currentFilter === 'favorites') params.favorites_only = true;

    const res = await api.getGallery(params);
    const { data: files, pagination } = res;

    if (reset) grid.innerHTML = '';

    if (!files?.length && reset) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-state-icon">🖼️</div>
          <p class="empty-state-title">No memories here</p>
          <p class="empty-state-text">Upload your first photo or video</p>
        </div>`;
      return;
    }

    files?.forEach(file => {
      grid.appendChild(createMediaItem(file));
    });

    hasMore = pagination?.has_next || false;
    currentPage++;
  } catch (err) {
    if (reset) grid.innerHTML = '';
    toast.error('Failed to load media');
  } finally {
    isLoading = false;
    showLoadingSpinner(false);
  }
}

function createMediaItem(file) {
  const div = document.createElement('div');
  div.className = 'media-item';
  div.dataset.id = file.id;
  div.dataset.type = file.file_type;

  div.innerHTML = `
    <div class="media-overlay"></div>
    ${file.file_type === 'photo'
      ? `<img data-src="${file.signed_url}" alt="${file.original_filename}" loading="lazy" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" />`
      : `<video src="${file.signed_url}" muted playsinline preload="none" style="width:100%;height:100%;object-fit:cover;"></video>`
    }
    ${file.is_favorite ? '<span class="media-fav-icon">❤️</span>' : ''}
    <div class="media-badges">
      ${file.file_type === 'video'
        ? `<span class="media-type-badge">▶ ${file.duration_seconds ? formatDuration(file.duration_seconds) : 'Video'}</span>`
        : ''}
    </div>
  `;

  // Lazy load image
  const img = div.querySelector('img[data-src]');
  if (img) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          obs.unobserve(img);
        }
      });
    }, { rootMargin: '200px' });
    observer.observe(img);
  }

  div.addEventListener('click', () => openViewer(file));
  return div;
}

function openViewer(file) {
  sessionStorage.setItem('viewer_file', JSON.stringify(file));
  window.location.href = `/viewer.html?id=${file.id}`;
}

function renderSkeletons(count) {
  return Array(count).fill(0).map(() =>
    `<div class="skeleton" style="aspect-ratio:1;border-radius:4px;"></div>`
  ).join('');
}

function showLoadingSpinner(show) {
  const spinner = document.getElementById('load-spinner');
  if (spinner) spinner.style.display = show ? 'flex' : 'none';
}

// ── Filter chips ──
filterChips.forEach(chip => {
  chip.addEventListener('click', () => {
    filterChips.forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentFilter = chip.dataset.filter;
    loadFiles(true);
  });
});

// ── Search ──
const doSearch = debounce(async (q) => {
  if (!q.trim()) { loadFiles(true); return; }
  grid.innerHTML = renderSkeletons(6);
  try {
    const res = await api.searchFiles(q.trim());
    grid.innerHTML = '';
    const files = res.data;
    if (!files?.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🔍</div><p class="empty-state-title">No results</p></div>`;
      return;
    }
    files.forEach(f => grid.appendChild(createMediaItem(f)));
  } catch (_) {}
}, 400);

searchInput?.addEventListener('input', (e) => doSearch(e.target.value));

// ── Grid size toggle ──
document.querySelectorAll('[data-grid]').forEach(btn => {
  btn.addEventListener('click', () => {
    currentView = btn.dataset.grid;
    grid.className = `media-grid grid-${currentView}`;
    document.querySelectorAll('[data-grid]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    localStorage.setItem('grid_size', currentView);
  });
});

// Load saved grid size
const savedGrid = localStorage.getItem('grid_size') || 'medium';
currentView = savedGrid;
grid.className = `media-grid grid-${savedGrid}`;
document.querySelector(`[data-grid="${savedGrid}"]`)?.classList.add('active');

// ── Infinite scroll ──
const sentinel = document.getElementById('scroll-sentinel');
if (sentinel) {
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) loadFiles();
  }, { rootMargin: '200px' });
  observer.observe(sentinel);
}

loadFiles(true);
