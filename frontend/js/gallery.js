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
let currentAbort = null;
const PAGE_SIZE = 30;

const grid = document.getElementById('media-grid');
const searchInput = document.getElementById('search-input');
const filterChips = document.querySelectorAll('.chip[data-filter]');

// ── Shared lazy-load observer (1 instance for all images) ──
const imgObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target;
      if (img.dataset.src) {
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
        imgObserver.unobserve(img);
      }
    }
  });
}, { rootMargin: '300px' });

async function loadFiles(reset = false) {
  if (isLoading || (!hasMore && !reset)) return;

  if (reset) {
    currentPage = 1;
    hasMore = true;
    grid.innerHTML = renderSkeletons(12);
    // Cancel any in-flight request
    if (currentAbort) { currentAbort.abort(); }
  }

  isLoading = true;
  showLoadingSpinner(true);

  try {
    const params = { page: currentPage, limit: PAGE_SIZE };
    if (currentFilter === 'photos') params.file_type = 'photo';
    if (currentFilter === 'videos') params.file_type = 'video';
    if (currentFilter === 'favorites') params.favorites_only = true;

    const res = await api.getGallery(params);
    const { data: files, pagination } = res;

    if (reset) grid.innerHTML = '';

    if (!files?.length && reset) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state-icon" style="font-size:48px;opacity:0.4;">&#9651;</div>
        <p class="empty-state-title">No memories here</p>
        <p class="empty-state-text">Upload your first photo or video</p>
      </div>`;
      return;
    }

    // Use DocumentFragment for efficient batch DOM insert
    const frag = document.createDocumentFragment();
    files?.forEach(file => frag.appendChild(createMediaItem(file)));
    grid.appendChild(frag);

    hasMore = pagination?.has_next || false;
    currentPage++;
  } catch (err) {
    if (err?.name === 'AbortError') return;
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

  const overlay = document.createElement('div');
  overlay.className = 'media-overlay';
  div.appendChild(overlay);

  if (file.file_type === 'photo') {
    const img = document.createElement('img');
    img.dataset.src = file.signed_url || '';
    img.alt = file.original_filename || '';
    img.loading = 'lazy';
    img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    if (file.signed_url) imgObserver.observe(img);
    div.appendChild(img);
  } else {
    // Videos: lazy-load src via observer
    const vid = document.createElement('video');
    vid.dataset.src = file.signed_url || '';
    vid.muted = true;
    vid.playsInline = true;
    vid.preload = 'none';
    vid.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    div.appendChild(vid);
    // Use same observer to set video src when near viewport
    imgObserver.observe(vid);
  }

  if (file.is_favorite) {
    const fav = document.createElement('span');
    fav.className = 'media-fav-icon';
    fav.textContent = '♥';
    div.appendChild(fav);
  }

  if (file.file_type === 'video') {
    const badge = document.createElement('div');
    badge.className = 'media-badges';
    badge.innerHTML = `<span class="media-type-badge">&#9654; ${file.duration_seconds ? formatDuration(file.duration_seconds) : 'Video'}</span>`;
    div.appendChild(badge);
  }

  div.addEventListener('click', () => {
    sessionStorage.setItem('viewer_file', JSON.stringify(file));
    window.location.href = `/viewer.html?id=${file.id}`;
  });
  return div;
}

function renderSkeletons(count) {
  return Array(count).fill('<div class="skeleton" style="aspect-ratio:1;border-radius:4px;"></div>').join('');
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

// ── Search with abort ──
let searchAbort = null;
const doSearch = debounce(async (q) => {
  if (searchAbort) searchAbort.abort();
  if (!q.trim()) { loadFiles(true); return; }
  grid.innerHTML = renderSkeletons(6);
  try {
    const res = await api.searchFiles(q.trim());
    grid.innerHTML = '';
    const files = res.data;
    if (!files?.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state-title">No results for "${q}"</div>
      </div>`;
      return;
    }
    const frag = document.createDocumentFragment();
    files.forEach(f => frag.appendChild(createMediaItem(f)));
    grid.appendChild(frag);
  } catch (e) {
    if (e?.name !== 'AbortError') toast.error('Search failed');
  }
}, 350);

searchInput?.addEventListener('input', (e) => doSearch(e.target.value));

// ── Grid size ──
document.querySelectorAll('[data-grid]').forEach(btn => {
  btn.addEventListener('click', () => {
    currentView = btn.dataset.grid;
    grid.className = `media-grid grid-${currentView}`;
    document.querySelectorAll('[data-grid]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    localStorage.setItem('grid_size', currentView);
  });
});

const savedGrid = localStorage.getItem('grid_size') || 'medium';
currentView = savedGrid;
grid.className = `media-grid grid-${savedGrid}`;
document.querySelector(`[data-grid="${savedGrid}"]`)?.classList.add('active');

// ── Infinite scroll ──
const sentinel = document.getElementById('scroll-sentinel');
if (sentinel) {
  new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) loadFiles();
  }, { rootMargin: '300px' }).observe(sentinel);
}

loadFiles(true);
