import { requireAdmin, logout, getUser } from './auth.js';
import { api } from './api.js';
import { showToast } from './toast.js';

// ── Guard ────────────────────────────────────────────────────────────────────
if (!requireAdmin()) throw new Error('Not admin');

// ── State ────────────────────────────────────────────────────────────────────
let currentSection = 'overview';
let usersPage = 1;
let activityPage = 1;
let filesPage = 1;
let usersSearch = '';
let usersFilter = '';
let activityUserFilter = '';
let activityActionFilter = '';
let selectedUser = null;

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Set admin name in topbar
  const user = getUser();
  const nameEl = document.getElementById('admin-user-name');
  if (nameEl && user) nameEl.textContent = user.display_name || user.username || 'Admin';

  // Wire nav
  document.querySelectorAll('.admin-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const section = item.dataset.section;
      if (section) navigateTo(section);
    });
  });

  document.getElementById('admin-logout-btn')?.addEventListener('click', logout);

  // Wire search & filters
  document.getElementById('users-search')?.addEventListener('input', debounce(e => {
    usersSearch = e.target.value;
    usersPage = 1;
    loadUsers();
  }, 400));

  document.getElementById('users-filter')?.addEventListener('change', e => {
    usersFilter = e.target.value;
    usersPage = 1;
    loadUsers();
  });

  document.getElementById('activity-user-filter')?.addEventListener('input', debounce(e => {
    activityUserFilter = e.target.value;
    activityPage = 1;
    loadActivity();
  }, 400));

  document.getElementById('activity-action-filter')?.addEventListener('change', e => {
    activityActionFilter = e.target.value;
    activityPage = 1;
    loadActivity();
  });

  // Pagination buttons
  document.getElementById('users-prev')?.addEventListener('click', () => { if (usersPage > 1) { usersPage--; loadUsers(); } });
  document.getElementById('users-next')?.addEventListener('click', () => { usersPage++; loadUsers(); });
  document.getElementById('activity-prev')?.addEventListener('click', () => { if (activityPage > 1) { activityPage--; loadActivity(); } });
  document.getElementById('activity-next')?.addEventListener('click', () => { activityPage++; loadActivity(); });
  document.getElementById('files-prev')?.addEventListener('click', () => { if (filesPage > 1) { filesPage--; loadFiles(); } });
  document.getElementById('files-next')?.addEventListener('click', () => { filesPage++; loadFiles(); });

  // Modal close
  document.getElementById('user-modal-overlay')?.addEventListener('click', e => {
    if (e.target.id === 'user-modal-overlay') closeModal();
  });
  document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);

  // Load first section
  navigateTo('overview');
});

// ── Navigation ────────────────────────────────────────────────────────────────
function navigateTo(section) {
  currentSection = section;

  document.querySelectorAll('.admin-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.section === section);
  });

  document.querySelectorAll('.admin-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === `section-${section}`);
  });

  // Lazy load data
  if (section === 'overview') loadOverview();
  if (section === 'users') { usersPage = 1; loadUsers(); }
  if (section === 'activity') { activityPage = 1; loadActivity(); }
  if (section === 'files') { filesPage = 1; loadFiles(); }
}

// ── Overview ─────────────────────────────────────────────────────────────────
async function loadOverview() {
  try {
    const res = await api.adminGetStats();
    const d = res.data;

    setText('stat-total-users', d.users.total);
    setText('stat-active-users', d.users.active);
    setText('stat-new-week', d.users.new_this_week);
    setText('stat-total-files', d.files.total);
    setText('stat-photos', d.files.photos);
    setText('stat-videos', d.files.videos);
    setText('stat-uploads-week', d.files.uploads_this_week);
    setText('stat-trash', d.files.in_trash);
    setText('stat-albums', d.albums.total);
    setText('stat-storage', d.storage.total_fmt);
  } catch (e) {
    showToast('Failed to load stats', 'error');
  }
}

// ── Users ─────────────────────────────────────────────────────────────────────
async function loadUsers() {
  const list = document.getElementById('users-list');
  if (!list) return;
  list.innerHTML = '<div class="admin-loading">Loading...</div>';

  try {
    const params = { page: usersPage, limit: 15 };
    if (usersSearch) params.search = usersSearch;
    if (usersFilter) params.status = usersFilter;

    const res = await api.adminGetUsers(params);
    const { items, total, page, limit } = res.data;

    list.innerHTML = '';
    if (!items.length) {
      list.innerHTML = '<div class="admin-loading">No users found</div>';
      return;
    }

    items.forEach(user => list.appendChild(buildUserRow(user)));

    // Pagination info
    const info = document.getElementById('users-page-info');
    if (info) info.textContent = `Page ${page} · ${total} total`;

    const prevBtn = document.getElementById('users-prev');
    const nextBtn = document.getElementById('users-next');
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page * limit >= total;
  } catch (e) {
    list.innerHTML = '<div class="admin-loading">Failed to load users</div>';
  }
}

function buildUserRow(user) {
  const row = document.createElement('div');
  row.className = 'admin-user-row';

  // Avatar
  const avatar = document.createElement('div');
  avatar.className = 'avatar avatar-sm';
  avatar.style.cssText = 'background:var(--gradient-primary);color:white;font-weight:700;font-size:13px;';
  avatar.textContent = (user.display_name || user.username || '?')[0].toUpperCase();
  row.appendChild(avatar);

  // Info
  const info = document.createElement('div');
  info.className = 'admin-user-info';
  info.innerHTML = `
    <div class="admin-user-name">${esc(user.display_name || user.username)}</div>
    <div class="admin-user-email">${esc(user.email)}</div>
    <div class="admin-user-meta">
      ${user.is_admin ? '<span class="badge badge-admin">Admin</span>' : ''}
      <span class="badge ${user.is_active ? 'badge-green' : 'badge-red'}">${user.is_active ? 'Active' : 'Suspended'}</span>
      ${!user.is_verified ? '<span class="badge badge-yellow">Unverified</span>' : ''}
      <span class="admin-user-storage">${user.storage_used_fmt}
        <span class="mini-storage-bar"><span class="mini-storage-fill" style="width:${Math.min(user.storage_pct,100)}%"></span></span>
      </span>
    </div>
  `;
  row.appendChild(info);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'admin-user-actions';

  const viewBtn = document.createElement('button');
  viewBtn.className = 'admin-btn admin-btn-ghost';
  viewBtn.textContent = 'View';
  viewBtn.onclick = () => openUserModal(user.id);
  actions.appendChild(viewBtn);

  const statusBtn = document.createElement('button');
  statusBtn.className = `admin-btn ${user.is_active ? 'admin-btn-danger' : 'admin-btn-success'}`;
  statusBtn.textContent = user.is_active ? 'Suspend' : 'Activate';
  statusBtn.onclick = () => toggleUserStatus(user.id, !user.is_active, statusBtn);
  actions.appendChild(statusBtn);

  row.appendChild(actions);
  return row;
}

async function toggleUserStatus(userId, newStatus, btn) {
  btn.disabled = true;
  try {
    await api.adminSetUserStatus(userId, newStatus);
    showToast(newStatus ? 'User activated' : 'User suspended', 'success');
    loadUsers();
  } catch (e) {
    showToast(e.message || 'Failed', 'error');
    btn.disabled = false;
  }
}

// ── User detail modal ─────────────────────────────────────────────────────────
async function openUserModal(userId) {
  const overlay = document.getElementById('user-modal-overlay');
  if (!overlay) return;
  overlay.classList.add('open');

  const body = document.getElementById('modal-body');
  body.innerHTML = '<div class="admin-loading">Loading...</div>';

  try {
    const res = await api.adminGetUser(userId);
    const { user, stats, recent_activity } = res.data;
    selectedUser = user;

    body.innerHTML = `
      <div class="admin-detail-row">
        <span class="admin-detail-key">ID</span>
        <span class="admin-detail-val" style="font-size:11px;color:var(--dark-muted)">${user.id}</span>
      </div>
      <div class="admin-detail-row">
        <span class="admin-detail-key">Email</span>
        <span class="admin-detail-val">${esc(user.email)}</span>
      </div>
      <div class="admin-detail-row">
        <span class="admin-detail-key">Username</span>
        <span class="admin-detail-val">@${esc(user.username)}</span>
      </div>
      <div class="admin-detail-row">
        <span class="admin-detail-key">Status</span>
        <span class="admin-detail-val">
          <span class="badge ${user.is_active ? 'badge-green' : 'badge-red'}">${user.is_active ? 'Active' : 'Suspended'}</span>
          ${!user.is_verified ? '<span class="badge badge-yellow" style="margin-left:4px">Unverified</span>' : ''}
          ${user.is_admin ? '<span class="badge badge-admin" style="margin-left:4px">Admin</span>' : ''}
        </span>
      </div>
      <div class="admin-detail-row">
        <span class="admin-detail-key">Storage</span>
        <span class="admin-detail-val">${user.storage_used_fmt} / ${user.storage_limit_fmt} (${user.storage_pct}%)</span>
      </div>
      <div class="admin-detail-row">
        <span class="admin-detail-key">Files / Albums</span>
        <span class="admin-detail-val">${stats.files} files · ${stats.albums} albums</span>
      </div>
      <div class="admin-detail-row">
        <span class="admin-detail-key">Joined</span>
        <span class="admin-detail-val">${formatDate(user.created_at)}</span>
      </div>
      <div class="admin-detail-row">
        <span class="admin-detail-key">Last login</span>
        <span class="admin-detail-val">${user.last_login ? formatDate(user.last_login) : '—'}</span>
      </div>

      <div style="margin-top:var(--space-5);margin-bottom:var(--space-3)">
        <div class="admin-card-title" style="margin-bottom:var(--space-3)">Actions</div>
        <div style="display:flex;gap:var(--space-2);flex-wrap:wrap;">
          <button class="admin-btn ${user.is_active ? 'admin-btn-danger' : 'admin-btn-success'}"
            onclick="window._adminToggleStatus('${user.id}', ${!user.is_active})">
            ${user.is_active ? 'Suspend User' : 'Activate User'}
          </button>
          <button class="admin-btn ${user.is_admin ? 'admin-btn-danger' : 'admin-btn-ghost'}"
            onclick="window._adminToggleAdmin('${user.id}', ${!user.is_admin})">
            ${user.is_admin ? 'Revoke Admin' : 'Make Admin'}
          </button>
          <button class="admin-btn admin-btn-ghost"
            onclick="window._adminSetStorage('${user.id}')">
            Set Storage Limit
          </button>
          <button class="admin-btn admin-btn-danger"
            onclick="window._adminDeleteUser('${user.id}', '${esc(user.email)}')">
            Delete Account
          </button>
        </div>
      </div>

      <div style="margin-top:var(--space-5)">
        <div class="admin-card-title" style="margin-bottom:var(--space-3)">Recent Activity</div>
        ${recent_activity.length ? recent_activity.slice(0,10).map(a => `
          <div class="activity-row">
            <div class="activity-dot"></div>
            <div style="flex:1;min-width:0">
              <div class="activity-action">${esc(a.action)}</div>
              <div class="activity-meta">${a.resource_type ? esc(a.resource_type) : ''} ${a.details?.filename ? '· ' + esc(a.details.filename) : ''}</div>
            </div>
            <div class="activity-time">${timeAgo(a.created_at)}</div>
          </div>
        `).join('') : '<div style="color:var(--dark-muted);font-size:var(--text-sm);padding:var(--space-3) 0">No activity yet</div>'}
      </div>
    `;
  } catch (e) {
    body.innerHTML = '<div class="admin-loading">Failed to load user details</div>';
  }
}

function closeModal() {
  document.getElementById('user-modal-overlay')?.classList.remove('open');
  selectedUser = null;
}

// Exposed to inline onclick handlers in modal HTML
window._adminToggleStatus = async (userId, newStatus) => {
  try {
    await api.adminSetUserStatus(userId, newStatus);
    showToast(newStatus ? 'User activated' : 'User suspended', 'success');
    closeModal();
    loadUsers();
  } catch (e) { showToast(e.message, 'error'); }
};

window._adminToggleAdmin = async (userId, makeAdmin) => {
  if (!confirm(`${makeAdmin ? 'Grant' : 'Revoke'} admin role for this user?`)) return;
  try {
    await api.adminToggleAdmin(userId, makeAdmin);
    showToast(makeAdmin ? 'Admin role granted' : 'Admin role revoked', 'success');
    closeModal();
    loadUsers();
  } catch (e) { showToast(e.message, 'error'); }
};

window._adminSetStorage = async (userId) => {
  const gb = prompt('Enter new storage limit in GB (e.g. 20):');
  if (!gb || isNaN(parseFloat(gb))) return;
  try {
    await api.adminSetStorageLimit(userId, parseFloat(gb));
    showToast(`Storage limit set to ${gb} GB`, 'success');
    closeModal();
    loadUsers();
  } catch (e) { showToast(e.message, 'error'); }
};

window._adminDeleteUser = async (userId, email) => {
  if (!confirm(`Permanently delete account "${email}"? This cannot be undone.`)) return;
  try {
    await api.adminDeleteUser(userId);
    showToast('Account deleted', 'success');
    closeModal();
    loadUsers();
  } catch (e) { showToast(e.message, 'error'); }
};

// ── Activity log ──────────────────────────────────────────────────────────────
async function loadActivity() {
  const list = document.getElementById('activity-list');
  if (!list) return;
  list.innerHTML = '<div class="admin-loading">Loading...</div>';

  try {
    const params = { page: activityPage, limit: 25 };
    if (activityUserFilter) params.user_id = activityUserFilter;
    if (activityActionFilter) params.action = activityActionFilter;

    const res = await api.adminGetActivity(params);
    const { items, total, page, limit } = res.data;

    list.innerHTML = '';
    if (!items.length) {
      list.innerHTML = '<div class="admin-loading">No activity found</div>';
      return;
    }

    items.forEach(log => {
      const row = document.createElement('div');
      row.className = 'activity-row';
      row.innerHTML = `
        <div class="activity-dot"></div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:var(--space-2);flex-wrap:wrap;">
            <span class="activity-action">${esc(log.action)}</span>
            <span class="badge badge-purple" style="font-size:10px;">@${esc(log.username)}</span>
            ${log.resource_type ? `<span class="badge badge-blue" style="font-size:10px;">${esc(log.resource_type)}</span>` : ''}
          </div>
          <div class="activity-meta">
            ${log.details?.filename ? esc(log.details.filename) : ''}
            ${log.ip_address ? `· ${log.ip_address}` : ''}
          </div>
        </div>
        <div class="activity-time">${timeAgo(log.created_at)}</div>
      `;
      list.appendChild(row);
    });

    const info = document.getElementById('activity-page-info');
    if (info) info.textContent = `Page ${page} · ${total} total`;

    const prevBtn = document.getElementById('activity-prev');
    const nextBtn = document.getElementById('activity-next');
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page * limit >= total;
  } catch (e) {
    list.innerHTML = '<div class="admin-loading">Failed to load activity</div>';
  }
}

// ── Files overview ────────────────────────────────────────────────────────────
async function loadFiles() {
  const list = document.getElementById('files-list');
  if (!list) return;
  list.innerHTML = '<div class="admin-loading">Loading...</div>';

  try {
    const res = await api.adminGetFiles({ page: filesPage, limit: 20 });
    const { items, total, page, limit } = res.data;

    list.innerHTML = '';
    if (!items.length) {
      list.innerHTML = '<div class="admin-loading">No files</div>';
      return;
    }

    items.forEach(f => {
      const row = document.createElement('div');
      row.className = 'admin-user-row';
      row.innerHTML = `
        <div style="font-size:24px;flex-shrink:0;">${f.file_type === 'photo' ? '🖼️' : '🎬'}</div>
        <div class="admin-user-info">
          <div class="admin-user-name">${esc(f.original_filename)}</div>
          <div class="admin-user-email">@${esc(f.username)} · ${esc(f.email)}</div>
          <div class="admin-user-meta">
            <span class="badge ${f.file_type === 'photo' ? 'badge-pink' : 'badge-purple'}">${f.file_type}</span>
            <span class="admin-user-storage">${f.file_size_fmt}</span>
          </div>
        </div>
        <div class="admin-user-storage" style="font-size:var(--text-xs);color:var(--dark-muted);flex-shrink:0;">${timeAgo(f.created_at)}</div>
      `;
      list.appendChild(row);
    });

    const info = document.getElementById('files-page-info');
    if (info) info.textContent = `Page ${page} · ${total} total`;

    const prevBtn = document.getElementById('files-prev');
    const nextBtn = document.getElementById('files-next');
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page * limit >= total;
  } catch (e) {
    list.innerHTML = '<div class="admin-loading">Failed to load files</div>';
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? '—';
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(iso);
}
