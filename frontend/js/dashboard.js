import { api } from './api.js';
import { requireAuth, getUser, setUser, refreshUserProfile } from './auth.js';
import { toast } from './toast.js';
import { formatBytes, timeAgo, getInitials } from './utils.js';

await requireAuth();

let user = getUser();

async function init() {
  renderUserInfo(user);

  // If we just came back from an upload, re-fetch fresh user profile
  // (storage_used, photo count etc. changed server-side)
  const needsRefresh = sessionStorage.getItem('dashboard_needs_refresh');
  if (needsRefresh) {
    sessionStorage.removeItem('dashboard_needs_refresh');
    try {
      const res = await api.getMe();
      if (res?.data) {
        user = res.data;
        // Update localStorage cache with fresh data (setUser is already imported above)
        setUser(user);
        renderUserInfo(user);
      }
    } catch (_) {}
  }

  await Promise.all([loadStorageStats(), loadRecentFiles(), loadAlbums()]);
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#x27;');
}

function renderUserInfo(u) {
  const nameEl = document.getElementById('greeting-name');
  const avatarEl = document.getElementById('user-avatar');

  if (nameEl) nameEl.textContent = u?.display_name || u?.username || 'Friend';
  if (avatarEl) {
    if (u?.avatar_url) {
      const img = document.createElement('img');
      img.src = u.avatar_url;
      img.alt = 'avatar';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
      avatarEl.innerHTML = '';
      avatarEl.appendChild(img);
    } else {
      avatarEl.textContent = getInitials(u?.display_name || u?.username || '?');
    }
  }
}

async function loadStorageStats() {
  try {
    const res = await api.getStorageUsage();
    const d = res.data;
    const pct = Math.min(d.percent_used, 100);

    safeSet('storage-used-text', d.used_formatted);
    safeSet('storage-limit-text', d.limit_formatted);
    safeSet('storage-pct', `${pct.toFixed(1)}%`);
    safeSet('stat-photos', d.photos?.count ?? 0);
    safeSet('stat-videos', d.videos?.count ?? 0);

    const bar = document.getElementById('storage-progress');
    if (bar) {
      setTimeout(() => { bar.style.width = `${pct}%`; }, 100);
    }
  } catch (_) {}
}

async function loadRecentFiles() {
  const container = document.getElementById('recent-strip');
  if (!container) return;

  container.innerHTML = '<div class="skeleton" style="width:90px;height:90px;border-radius:14px;flex-shrink:0"></div>'.repeat(5);

  try {
    const res = await api.getRecent(12);
    const files = res.data;

    if (!files?.length) {
      container.innerHTML = '<p style="color:var(--dark-subtext);font-size:13px;padding:8px 0;">No memories yet ✨</p>';
      return;
    }

    // Clear container and build safely with DOM methods
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    files.forEach(f => {
      const thumb = document.createElement('div');
      thumb.className = 'recent-thumb';
      thumb.style.cursor = 'pointer';
      
      if (f.file_type === 'photo') {
        const img = document.createElement('img');
        img.setAttribute('src', String(f.signed_url || ''));
        img.setAttribute('alt', String(f.original_filename || ''));
        img.setAttribute('loading', 'lazy');
        thumb.appendChild(img);
      } else {
        const video = document.createElement('video');
        video.setAttribute('src', String(f.signed_url || ''));
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        video.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        thumb.appendChild(video);
        
        const badge = document.createElement('span');
        badge.className = 'recent-video-badge';
        badge.textContent = '▶';
        thumb.appendChild(badge);
      }
      
      // Use proper event listener instead of onclick attribute
      thumb.addEventListener('click', () => {
        sessionStorage.setItem('viewer_file', JSON.stringify({
          id: f.id,
          file_type: f.file_type,
          signed_url: f.signed_url
        }));
        window.location.href = `/viewer.html?id=${encodeURIComponent(f.id)}`;
      });
      
      fragment.appendChild(thumb);
    });
    
    container.appendChild(fragment);
  } catch (_) {
    container.innerHTML = '';
  }
}

async function loadAlbums() {
  const container = document.getElementById('albums-mini-grid');
  if (!container) return;

  container.innerHTML = '<div class="skeleton" style="height:140px;border-radius:14px;"></div>'.repeat(4);

  try {
    const res = await api.getAlbums({ limit: 4 });
    const albums = res.data;

    if (!albums?.length) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;padding:32px 0;">
          <div class="empty-state-icon">📁</div>
          <p class="empty-state-title">No albums yet</p>
          <p class="empty-state-text">Create your first album to organize memories</p>
        </div>`;
      return;
    }

    container.innerHTML = albums.map(a => `
      <div class="album-mini-card" onclick="location.href='/album.html?id=${a.id}'">
        <div class="album-mini-thumb">
          ${a.cover_url
            ? `<img src="${a.cover_url}" alt="${a.name}" style="width:100%;height:100%;object-fit:cover;" />`
            : '📁'}
        </div>
        <div class="album-mini-info">
          <div class="album-mini-name">${a.name}</div>
          <div class="album-mini-count">${a.file_count} items</div>
        </div>
      </div>
    `).join('');
  } catch (_) {
    container.innerHTML = '';
  }
}

function safeSet(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// No longer needed - using event listeners instead of inline onclick

init();
