/**
 * profile.js — Profile page logic
 *
 * Responsibilities:
 *  - Load & render user profile (name, avatar, banner, stats)
 *  - Profile photo: file pick → crop modal → upload → persist → sync all UI
 *  - Banner:        file pick → crop modal → upload → persist → sync all UI
 *  - Edit Profile modal (display_name + bio)
 *  - Logout
 *  - Avatar synchronised across: profile avatar, dashboard header
 */

import { api }                         from './api.js';
import { requireAuth, getUser, setUser, logout } from './auth.js';
import { toast }                        from './toast.js';
import { getInitials, formatBytes }     from './utils.js';
import { openCropModal }               from './cropEditor.js';

// ── Auth guard ────────────────────────────────────────────────────────────────
const __authOk = await requireAuth();
if (!__authOk) throw new Error('unauthenticated');

// ── Listen for crop errors ────────────────────────────────────────────────────
window.addEventListener('crop-error', e => toast.error(e.detail));

// ── State ─────────────────────────────────────────────────────────────────────
// Track previous avatar/banner so Cancel restores the UI correctly
let _prevAvatarUrl = null;
let _prevBannerUrl = null;

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const cached = getUser() || {};
  renderProfile(cached);

  const [profileResult] = await Promise.allSettled([loadProfile(), loadStats()]);
  if (profileResult.status === 'fulfilled' && profileResult.value) {
    renderProfile(profileResult.value);
  }
}

// ── Load fresh profile from API ───────────────────────────────────────────────
async function loadProfile() {
  try {
    const res = await api.getMe();
    if (res?.data) {
      setUser(res.data);
      return res.data;
    }
  } catch (_) {}
  return null;
}

// ── Render profile to all UI locations ───────────────────────────────────────
function renderProfile(u) {
  if (!u) return;

  // Text fields
  _setText('profile-name',     u.display_name || u.username || '');
  _setText('profile-username', `@${u.username || ''}`);
  _setText('profile-bio',      u.bio || '');
  _setText('profile-storage',  `${formatBytes(u.storage_used)} / ${formatBytes(u.storage_limit)}`);

  // Admin panel link
  const adminLink = document.getElementById('admin-panel-link');
  if (adminLink) adminLink.style.display = u.is_admin ? 'flex' : 'none';

  // Avatar (main profile circle)
  renderAvatar(document.getElementById('profile-avatar'), u.avatar_url, u.display_name || u.username);

  // Banner
  renderBanner(u.banner_url);
}

// ── Render avatar element ─────────────────────────────────────────────────────
function renderAvatar(el, url, name) {
  if (!el) return;
  el.innerHTML = '';

  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Profile photo';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
    img.addEventListener('error', async () => {
      // Stale signed URL — re-fetch
      const fresh = await loadProfile();
      if (fresh?.avatar_url && fresh.avatar_url !== url) {
        renderProfile(fresh);
      } else {
        // Fallback to initials
        el.innerHTML = '';
        el.style.background = 'var(--gradient-primary)';
        el.textContent = getInitials(name || '?');
      }
    }, { once: true });
    el.appendChild(img);
    el.style.background = '';
    el.style.fontSize   = '';
    el.style.color      = '';
  } else {
    el.style.background = 'var(--gradient-primary)';
    el.style.display    = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.color      = 'white';
    el.style.fontWeight = '700';
    el.style.fontSize   = '28px';
    el.textContent      = getInitials(name || '?');
  }
}

// ── Render banner ─────────────────────────────────────────────────────────────
function renderBanner(url) {
  const cover = document.getElementById('profile-cover');
  if (!cover) return;

  if (url) {
    // Use a real <img> for proper error handling
    const existing = cover.querySelector('.banner-img');
    if (existing) existing.remove();

    const img = document.createElement('img');
    img.className  = 'banner-img';
    img.src        = url;
    img.alt        = '';
    img.setAttribute('aria-hidden', 'true');
    img.style.cssText = `
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      z-index: 0;
      pointer-events: none;
    `;
    img.addEventListener('error', async () => {
      img.remove();
      const fresh = await loadProfile();
      if (fresh?.banner_url && fresh.banner_url !== url) renderBanner(fresh.banner_url);
    }, { once: true });

    // Insert before the settings icon overlay
    cover.insertBefore(img, cover.firstChild);
    cover.classList.add('has-banner');
  } else {
    const existing = cover.querySelector('.banner-img');
    if (existing) existing.remove();
    cover.classList.remove('has-banner');
  }
}

// ── Load stats ────────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const res = await api.getStorageUsage();
    const d   = res.data;
    _setText('stat-photos',      d.photos?.count ?? 0);
    _setText('stat-videos',      d.videos?.count ?? 0);
    _setText('stat-storage-pct', `${d.percent_used?.toFixed(0) ?? 0}%`);
  } catch (_) {}
}

// ── Avatar: file select → crop → upload ──────────────────────────────────────
const avatarInput = document.getElementById('avatar-input');
if (avatarInput) {
  avatarInput.addEventListener('change', e => {
    const file = e.target.files[0];
    // Reset input so same file can be re-selected after cancel
    avatarInput.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('Image is too large. Please choose a file under 20 MB.');
      return;
    }

    // Remember current avatar for cancel
    _prevAvatarUrl = getUser()?.avatar_url || null;

    openCropModal({
      file,
      mode: 'avatar',
      onCancel: () => {
        // Nothing to restore in UI — we never changed it before save
      },
      onSave: blob => _uploadAvatar(blob),
    });
  });
}

async function _uploadAvatar(blob) {
  // Optimistic preview while uploading
  const avatarEl = document.getElementById('profile-avatar');
  const previewUrl = URL.createObjectURL(blob);
  renderAvatar(avatarEl, previewUrl, getUser()?.display_name || getUser()?.username);

  try {
    const formData = new FormData();
    formData.append('file', blob, 'avatar.jpg');
    await api.uploadAvatar(formData);

    // Fetch the persisted profile with the real signed URL
    const fresh = await loadProfile();
    if (fresh) {
      renderProfile(fresh);
      toast.success('Profile photo updated!');
    }
  } catch (err) {
    // Revert preview on failure
    const prev = getUser();
    renderAvatar(avatarEl, prev?.avatar_url || null, prev?.display_name || prev?.username);
    toast.error(err?.message || 'Failed to update profile photo. Please try again.');
  } finally {
    URL.revokeObjectURL(previewUrl);
  }
}

// ── Banner: file select → crop → upload ──────────────────────────────────────
const bannerInput = document.getElementById('banner-input');
if (bannerInput) {
  bannerInput.addEventListener('change', e => {
    const file = e.target.files[0];
    bannerInput.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file.');
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      toast.error('Image is too large. Please choose a file under 30 MB.');
      return;
    }

    _prevBannerUrl = getUser()?.banner_url || null;

    openCropModal({
      file,
      mode: 'banner',
      onCancel: () => {},
      onSave: blob => _uploadBanner(blob),
    });
  });
}

async function _uploadBanner(blob) {
  // Optimistic preview
  const previewUrl = URL.createObjectURL(blob);
  renderBanner(previewUrl);

  try {
    const formData = new FormData();
    formData.append('file', blob, 'banner.jpg');
    await api.uploadBanner(formData);

    const fresh = await loadProfile();
    if (fresh) {
      renderProfile(fresh);
      toast.success('Banner updated!');
    }
  } catch (err) {
    // Revert on failure
    const prev = getUser();
    renderBanner(prev?.banner_url || null);
    toast.error(err?.message || 'Failed to update banner. Please try again.');
  } finally {
    URL.revokeObjectURL(previewUrl);
  }
}

// ── Edit Profile modal ────────────────────────────────────────────────────────
document.getElementById('edit-profile-btn')?.addEventListener('click', () => {
  const user = getUser();
  const nameInput = document.getElementById('edit-name-input');
  const bioInput  = document.getElementById('edit-bio-input');
  if (nameInput) nameInput.value = user?.display_name || '';
  if (bioInput)  bioInput.value  = user?.bio || '';

  // Pre-fill edit modal photo/banner previews
  _refreshEditModalPreviews(user);

  const modal = document.getElementById('edit-profile-modal');
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
});

function _refreshEditModalPreviews(u) {
  if (!u) return;

  // Small avatar inside edit modal
  const editAvatarEl = document.getElementById('edit-modal-avatar');
  if (editAvatarEl) {
    renderAvatar(editAvatarEl, u.avatar_url, u.display_name || u.username);
  }

  // Banner preview inside edit modal
  const editBannerEl = document.getElementById('edit-modal-banner');
  if (editBannerEl) {
    if (u.banner_url) {
      editBannerEl.style.backgroundImage = `url('${_safeCssUrl(u.banner_url)}')`;
      editBannerEl.classList.add('has-banner');
    } else {
      editBannerEl.style.backgroundImage = '';
      editBannerEl.classList.remove('has-banner');
    }
  }
}

document.getElementById('edit-profile-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const display_name = document.getElementById('edit-name-input')?.value.trim() || '';
  const bio          = document.getElementById('edit-bio-input')?.value.trim() || '';

  const btn = e.target.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    await api.updateProfile({ display_name, bio });
    const user = getUser();
    const updated = { ...user, display_name, bio };
    setUser(updated);
    renderProfile(updated);
    closeModal('edit-profile-modal');
    toast.success('Profile updated!');
  } catch (err) {
    toast.error(err?.message || 'Failed to update profile.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
  }
});

// ── Edit-modal: Change Photo trigger ─────────────────────────────────────────
document.getElementById('edit-change-photo-btn')?.addEventListener('click', () => {
  closeModal('edit-profile-modal');
  // Small delay so modal closes before file picker opens (iOS Safari quirk)
  setTimeout(() => avatarInput?.click(), 80);
});

// ── Edit-modal: Change Banner trigger ────────────────────────────────────────
document.getElementById('edit-change-banner-btn')?.addEventListener('click', () => {
  closeModal('edit-profile-modal');
  setTimeout(() => bannerInput?.click(), 80);
});

// ── Logout ────────────────────────────────────────────────────────────────────
document.getElementById('logout-btn')?.addEventListener('click', async () => {
  if (confirm('Are you sure you want to sign out?')) {
    await logout();
  }
});

// ── Modal helpers ─────────────────────────────────────────────────────────────
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  // Restore body scroll when any modal closes
  document.body.style.overflow = '';
}

document.querySelectorAll('[data-close-modal]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
});

// Close modals on backdrop click
document.getElementById('edit-profile-modal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal('edit-profile-modal');
});

// ── Utilities ─────────────────────────────────────────────────────────────────
function _setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function _safeCssUrl(url) {
  // Sanitise URL for use in CSS — only allow http/https/data URLs
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/')) {
    return url.replace(/['"\\]/g, '');
  }
  return '';
}

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
