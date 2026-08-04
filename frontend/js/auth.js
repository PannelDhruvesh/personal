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
 * Check if a JWT token is expired (or within 60s of expiry).
 * Returns true if expired/invalid, false if still valid.
 */
function isTokenExpired(token) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    // Consider expired if within 60 seconds of expiry
    return payload.exp * 1000 < Date.now() + 60000;
  } catch {
    return true;
  }
}

/**
 * Redirect to login if not authenticated.
 * Call at top of every protected page.
 * Skips API round-trip if token is still valid (performance optimization).
 */
export async function requireAuth() {
  const token = localStorage.getItem('access_token');
  if (!token) {
    window.location.replace('/login.html');
    return false;
  }

  // If token is still valid, skip API call
  if (!isTokenExpired(token)) {
    return true;
  }

  // Token expired or about to expire — try to refresh/validate
  try {
    await api.getMe();
    return true;
  } catch (err) {
    api.clearTokens();
    window.location.replace('/login.html');
    return false;
  }
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
 * Always call this after login to get a fresh signed avatar URL.
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

/**
 * Refresh the avatar URL for a user object if the stored URL has expired.
 * Call this whenever rendering an avatar from localStorage cache.
 * Returns a promise that resolves with the fresh user data (or null on failure).
 */
export async function refreshAvatarIfNeeded(user) {
  if (!user?.avatar_url) return user;
  // If avatar_url looks like a signed Supabase URL that might have expired,
  // fetch fresh profile data. Signed URLs contain 'token=' in the query string.
  const isSignedUrl = user.avatar_url.includes('token=') || user.avatar_url.includes('supabase');
  if (isSignedUrl) {
    return await refreshUserProfile();
  }
  return user;
}
