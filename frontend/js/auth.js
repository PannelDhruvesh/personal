/* ── Auth Guard & Session ── */
import { api } from './api.js';

export function getUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setUser(user) {
  localStorage.setItem('user', JSON.stringify(user));
}

export function isLoggedIn() {
  return !!localStorage.getItem('access_token');
}

/**
 * Redirect to login if not authenticated.
 * Call at top of every protected page.
 */
export function requireAuth() {
  if (!isLoggedIn()) {
    window.location.replace('/login.html');
    return false;
  }
  return true;
}

/**
 * Redirect to dashboard if already authenticated.
 * Call on login/register pages.
 */
export function redirectIfAuth() {
  if (isLoggedIn()) {
    window.location.replace('/dashboard.html');
  }
}

/**
 * Require admin role. Redirect to dashboard if not admin.
 */
export function requireAdmin() {
  if (!isLoggedIn()) {
    window.location.replace('/login.html');
    return false;
  }
  const user = getUser();
  if (!user?.is_admin) {
    window.location.replace('/dashboard.html');
    return false;
  }
  return true;
}

/**
 * Full logout: revoke token, clear storage, redirect.
 */
export async function logout() {
  const refresh = localStorage.getItem('refresh_token');
  if (refresh) {
    try { await api.logout(refresh); } catch (_) {}
  }
  api.clearTokens();
  window.location.replace('/login.html');
}

/**
 * Fetch fresh user profile and cache it.
 */
export async function refreshUserProfile() {
  try {
    const res = await api.getMe();
    if (res?.data) {
      setUser(res.data);
      return res.data;
    }
  } catch (_) {}
  return null;
}
