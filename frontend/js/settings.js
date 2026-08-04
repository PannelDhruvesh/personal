import { api } from './api.js';
import { requireAuth } from './auth.js';
import { toast } from './toast.js';
import { formatBytes } from './utils.js';

// Auth guard — must await since requireAuth is async
const __authOk = await requireAuth();
if (!__authOk) throw new Error('unauthenticated');

let settings = {};

async function init() {
  await Promise.all([loadSettings(), loadStorageUsage()]);
}

async function loadSettings() {
  try {
    const res = await api.getSettings();
    settings = res.data || {};
    applySettings();
  } catch (_) {}
}

function applySettings() {
  setToggle('toggle-darkmode', settings.dark_mode !== false);
  setToggle('toggle-notifications', settings.notifications_enabled !== false);
  setToggle('toggle-hidden', settings.show_hidden_albums === true);
  setToggle('toggle-backup', settings.auto_backup === true);

  const gridBtns = document.querySelectorAll('[data-grid-size]');
  gridBtns.forEach(btn => btn.classList.toggle('selected', btn.dataset.gridSize === settings.grid_size));
}

function setToggle(id, val) {
  const el = document.getElementById(id);
  if (el) el.checked = val;
}

async function saveSetting(key, value) {
  try {
    await api.updateSettings({ [key]: value });
  } catch (_) { toast.error('Failed to save setting'); }
}

// ── Toggle listeners ──
document.getElementById('toggle-darkmode')?.addEventListener('change', e => {
  saveSetting('dark_mode', e.target.checked);
});

document.getElementById('toggle-notifications')?.addEventListener('change', e => {
  saveSetting('notifications_enabled', e.target.checked);
});

document.getElementById('toggle-hidden')?.addEventListener('change', e => {
  saveSetting('show_hidden_albums', e.target.checked);
});

document.getElementById('toggle-backup')?.addEventListener('change', e => {
  saveSetting('auto_backup', e.target.checked);
});

// ── Grid size ──
document.querySelectorAll('[data-grid-size]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-grid-size]').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    saveSetting('grid_size', btn.dataset.gridSize);
  });
});

// ── Storage usage ──
async function loadStorageUsage() {
  try {
    const res = await api.getStorageUsage();
    const d = res.data;

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('storage-used',   d.used_formatted);
    setEl('storage-limit',  d.limit_formatted);
    setEl('storage-pct',    `${d.percent_used?.toFixed(1)}%`);
    setEl('storage-photos', `${d.photos?.count} files · ${formatBytes(d.photos?.size)}`);
    setEl('storage-videos', `${d.videos?.count} files · ${formatBytes(d.videos?.size)}`);
    setEl('storage-trash',  `${d.trash?.count} files · ${formatBytes(d.trash?.size)}`);

    const photoBar = document.getElementById('storage-photos-bar');
    const videoBar = document.getElementById('storage-videos-bar');
    const used = d.used_bytes;
    if (used && photoBar) {
      setTimeout(() => {
        photoBar.style.width = `${(d.photos?.size / used) * 100}%`;
        if (videoBar) videoBar.style.width = `${(d.videos?.size / used) * 100}%`;
      }, 200);
    }

    const mainBar = document.getElementById('main-storage-bar');
    if (mainBar) setTimeout(() => { mainBar.style.width = `${d.percent_used}%`; }, 100);
  } catch (_) {}
}

// ── Change password ──
document.getElementById('change-password-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const current = document.getElementById('current-password').value;
  const newPwd  = document.getElementById('new-password').value;
  const confirm = document.getElementById('confirm-password').value;

  if (newPwd !== confirm) { toast.error('Passwords do not match'); return; }
  if (newPwd.length < 8)  { toast.error('Password must be at least 8 characters'); return; }

  try {
    await api.changePassword({ current_password: current, new_password: newPwd });
    toast.success('Password changed successfully!');
    e.target.reset();
    closeModal('change-password-modal');
  } catch (err) { toast.error(err.message || 'Failed to change password'); }
});

// ── Empty trash ──
document.getElementById('empty-trash-btn')?.addEventListener('click', async () => {
  if (!confirm('Permanently delete all trash? This cannot be undone.')) return;
  try {
    const res = await api.emptyTrash();
    toast.success(res.message || 'Trash emptied');
    await loadStorageUsage();
  } catch (_) { toast.error('Failed to empty trash'); }
});

function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
document.querySelectorAll('[data-close-modal]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
});

document.getElementById('change-password-btn')?.addEventListener('click', () => {
  document.getElementById('change-password-modal')?.classList.add('open');
});

init();
