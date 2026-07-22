import { api } from './api.js';
import { requireAuth, getUser, setUser, logout } from './auth.js';
import { toast } from './toast.js';
import { getInitials, formatBytes } from './utils.js';

if (!requireAuth()) throw new Error('unauthenticated');

async function init() {
  const user = getUser() || {};
  renderProfile(user);
  // Parallel API calls — faster page load
  const [fresh] = await Promise.allSettled([loadProfile(), loadStats()]);
  if (fresh.status === 'fulfilled' && fresh.value) renderProfile(fresh.value);
}

async function loadProfile() {
  try {
    const res = await api.getMe();
    setUser(res.data);
    return res.data;
  } catch (_) { return null; }
}

function renderProfile(u) {
  const nameEl     = document.getElementById('profile-name');
  const usernameEl = document.getElementById('profile-username');
  const bioEl      = document.getElementById('profile-bio');
  const avatarEl   = document.getElementById('profile-avatar');
  const storageEl  = document.getElementById('profile-storage');

  if (nameEl)     nameEl.textContent     = u.display_name || u.username || '';
  if (usernameEl) usernameEl.textContent = `@${u.username || ''}`;
  if (bioEl)      bioEl.textContent      = u.bio || '';

  if (avatarEl) {
    if (u.avatar_url) {
      avatarEl.innerHTML = `<img src="${u.avatar_url}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
    } else {
      avatarEl.style.background = 'var(--gradient-primary)';
      avatarEl.style.display = 'flex';
      avatarEl.style.alignItems = 'center';
      avatarEl.style.justifyContent = 'center';
      avatarEl.style.color = 'white';
      avatarEl.style.fontWeight = '700';
      avatarEl.style.fontSize = '28px';
      avatarEl.textContent = getInitials(u.display_name || u.username || '?');
    }
  }

  if (storageEl) {
    storageEl.textContent = `${formatBytes(u.storage_used)} / ${formatBytes(u.storage_limit)}`;
  }

  // Show admin panel link only for admins
  const adminLink = document.getElementById('admin-panel-link');
  if (adminLink) adminLink.style.display = u.is_admin ? 'flex' : 'none';
}

async function loadStats() {
  try {
    const res = await api.getStorageUsage();
    const d = res.data;
    const photoEl = document.getElementById('stat-photos');
    const videoEl = document.getElementById('stat-videos');
    const storageEl = document.getElementById('stat-storage-pct');

    if (photoEl)   photoEl.textContent   = d.photos?.count ?? 0;
    if (videoEl)   videoEl.textContent   = d.videos?.count ?? 0;
    if (storageEl) storageEl.textContent = `${d.percent_used?.toFixed(0) ?? 0}%`;
  } catch (_) {}
}

// ── Avatar upload ──
document.getElementById('avatar-input')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  try {
    await api.uploadAvatar(formData);
    toast.success('Avatar updated!');
    const fresh = await loadProfile();
    if (fresh) renderProfile(fresh);
  } catch (_) { toast.error('Avatar upload failed'); }
});

// ── Edit profile modal ──
document.getElementById('edit-profile-btn')?.addEventListener('click', () => {
  const user = getUser();
  document.getElementById('edit-name-input').value = user?.display_name || '';
  document.getElementById('edit-bio-input').value  = user?.bio || '';
  document.getElementById('edit-profile-modal').classList.add('open');
});

document.getElementById('edit-profile-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const display_name = document.getElementById('edit-name-input').value.trim();
  const bio = document.getElementById('edit-bio-input').value.trim();
  try {
    await api.updateProfile({ display_name, bio });
    const user = getUser();
    setUser({ ...user, display_name, bio });
    renderProfile({ ...user, display_name, bio });
    closeModal('edit-profile-modal');
    toast.success('Profile updated!');
  } catch (_) { toast.error('Failed to update profile'); }
});

// ── Logout ──
document.getElementById('logout-btn')?.addEventListener('click', async () => {
  if (confirm('Are you sure you want to log out?')) {
    await logout();
  }
});

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

document.querySelectorAll('[data-close-modal]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
});

init();
