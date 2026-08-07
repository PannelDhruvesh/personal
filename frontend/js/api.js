/* ── API Client ── */
const BASE_URL = window.APP_CONFIG?.API_URL || 'https://its-billi-api.onrender.com/api/v1';

class ApiClient {
  constructor() {
    this.baseURL = BASE_URL;
    this._refreshing = false;
    this._refreshQueue = [];
  }

  getToken() {
    return localStorage.getItem('access_token');
  }

  getRefreshToken() {
    return localStorage.getItem('refresh_token');
  }

  setTokens(access, refresh) {
    localStorage.setItem('access_token', access);
    if (refresh) localStorage.setItem('refresh_token', refresh);
  }

  clearTokens() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('viewer_file');
    // Clear all sessionStorage to prevent data leaks
    sessionStorage.clear();
  }

  async refreshAccessToken() {
    const refresh = this.getRefreshToken();
    if (!refresh) throw new Error('No refresh token');

    const res = await fetch(`${this.baseURL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh })
    });

    if (!res.ok) {
      this.clearTokens();
      window.location.href = '/login.html';
      throw new Error('Session expired');
    }

    const data = await res.json();
    this.setTokens(data.data.access_token, data.data.refresh_token || null);
    return data.data.access_token;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const token = this.getToken();

    const headers = { ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    // Preserve any AbortSignal passed by caller
    const signal = options.signal || null;

    // Show wake-up indicator on first request if server might be sleeping
    const wakeEl = document.getElementById('server-wake-toast');

    let response;
    try {
      response = await fetch(url, { ...options, headers, signal });
    } catch (networkErr) {
      // Skip retry for intentional aborts
      if (networkErr.name === 'AbortError') throw networkErr;
      // Likely Render cold start — retry once after delay
      if (wakeEl) { wakeEl.style.display = 'flex'; }
      await new Promise(r => setTimeout(r, 3000));
      response = await fetch(url, { ...options, headers, signal });
      if (wakeEl) { wakeEl.style.display = 'none'; }
    }

    if (wakeEl) { wakeEl.style.display = 'none'; }

    // Token expired → try refresh once
    if (response.status === 401 && token) {
      if (this._refreshing) {
        await new Promise(resolve => this._refreshQueue.push(resolve));
        return this.request(endpoint, options);
      }
      this._refreshing = true;
      try {
        const newToken = await this.refreshAccessToken();
        headers['Authorization'] = `Bearer ${newToken}`;
        this._refreshQueue.forEach(r => r());
        this._refreshQueue = [];
        response = await fetch(url, { ...options, headers, signal });
      } finally {
        this._refreshing = false;
      }
    }

    // Rate limited → surface a clear error
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const msg = retryAfter
        ? `Too many requests. Please wait ${retryAfter}s before retrying.`
        : 'Too many requests. Please slow down.';
      const error = new ApiError(msg, 429, {});
      error.retryAfter = retryAfter;
      throw error;
    }

    // Forbidden
    if (response.status === 403) {
      const data403 = await response.json().catch(() => ({}));
      const msg403 = data403.detail || data403.message || 'Access denied';
      // Only clear session if it's an auth/account-level 403, not a resource-level one
      const isAuthForbidden = endpoint.includes('/auth/') ||
        msg403.toLowerCase().includes('suspended') ||
        msg403.toLowerCase().includes('account');
      if (isAuthForbidden) {
        this.clearTokens();
        window.location.href = '/login.html';
      }
      throw new ApiError(msg403, 403, data403);
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const msg = data.detail || data.message || `Error ${response.status}`;
      throw new ApiError(msg, response.status, data);
    }

    return data;
  }

  get(endpoint, params = {}, signal = null) {
    const query = new URLSearchParams(params).toString();
    return this.request(`${endpoint}${query ? '?' + query : ''}`, { method: 'GET', signal });
  }

  post(endpoint, body = {}) {
    const isForm = body instanceof FormData;
    return this.request(endpoint, {
      method: 'POST',
      body: isForm ? body : JSON.stringify(body)
    });
  }

  patch(endpoint, body = {}) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
  }

  delete(endpoint, params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`${endpoint}${query ? '?' + query : ''}`, { method: 'DELETE' });
  }

  // ── Auth ──
  register(data)           { return this.post('/auth/register', data); }
  login(data)              { return this.post('/auth/login', data); }
  logout(refreshToken)     { return this.post('/auth/logout', { refresh_token: refreshToken }); }
  verifyOtp(data)          { return this.post('/auth/verify-otp', data); }
  resendOtp(email)         { return this.post('/auth/resend-otp', { email }); }
  forgotPassword(email)    { return this.post('/auth/forgot-password', { email }); }
  resetPassword(data)      { return this.post('/auth/reset-password', data); }
  googleLogin(idToken)     { return this.post('/auth/google', { id_token: idToken }); }

  // ── User ──
  getMe()                  { return this.get('/users/me'); }
  updateProfile(data)      { return this.patch('/users/me', data); }
  changePassword(data)     { return this.post('/users/me/change-password', data); }
  getSettings()            { return this.get('/users/me/settings'); }
  updateSettings(data)     { return this.patch('/users/me/settings', data); }
  uploadAvatar(formData)   { return this.request('/users/me/avatar', { method: 'POST', body: formData }); }
  uploadBanner(formData)   { return this.request('/users/me/banner', { method: 'POST', body: formData }); }

  // ── Albums ──
  getAlbums(params)        { return this.get('/albums/', params); }
  createAlbum(data)        { return this.post('/albums/', data); }
  getAlbum(id)             { return this.get(`/albums/${id}`); }
  updateAlbum(id, data)    { return this.patch(`/albums/${id}`, data); }
  deleteAlbum(id, perm)    { return this.delete(`/albums/${id}`, perm ? { permanent: true } : {}); }
  restoreAlbum(id)         { return this.post(`/albums/${id}/restore`); }
  favoriteAlbum(id)        { return this.post(`/albums/${id}/favorite`); }
  getAlbumTrash(params)    { return this.get('/albums/trash', params); }

  // ── Gallery ──
  getGallery(params, signal)       { return this.get('/gallery/', params, signal); }
  getRecent(limit)         { return this.get('/gallery/recent', { limit }); }
  searchFiles(q, params, signal)   { return this.get('/gallery/search', { q, ...params }, signal); }
  getTrash(params)         { return this.get('/gallery/trash', params); }

  // ── Uploads ──
  uploadFile(formData)     { return this.request('/uploads/', { method: 'POST', body: formData }); }
  uploadMultiple(formData) { return this.request('/uploads/multi', { method: 'POST', body: formData }); }
  getFile(id)              { return this.get(`/uploads/${id}`); }
  deleteFile(id, perm)     { return this.delete(`/uploads/${id}`, perm ? { permanent: true } : {}); }
  restoreFile(id)          { return this.post(`/uploads/${id}/restore`); }
  favoriteFile(id)         { return this.post(`/uploads/${id}/favorite`); }

  // ── Download ──
  getDownloadUrl(id)       { return this.get(`/download/file/${id}`); }
  getAlbumZipUrl(albumId)  { return `${this.baseURL}/download/album/${albumId}/zip`; }

  // ── Settings ──
  getStorageUsage()        { return this.get('/settings/storage-usage'); }
  emptyTrash()             { return this.delete('/settings/trash/empty'); }

  // ── Admin ──
  adminGetStats()                          { return this.get('/admin/stats'); }
  adminGetUsers(params)                    { return this.get('/admin/users', params); }
  adminGetUser(id)                         { return this.get(`/admin/users/${id}`); }
  adminSetUserStatus(id, is_active)        { return this.request(`/admin/users/${id}/status?is_active=${is_active}`, { method: 'PATCH' }); }
  adminToggleAdmin(id, is_admin)           { return this.request(`/admin/users/${id}/admin?is_admin=${is_admin}`, { method: 'PATCH' }); }
  adminDeleteUser(id)                      { return this.delete(`/admin/users/${id}`); }
  adminSetStorageLimit(id, limit_gb)       { return this.request(`/admin/users/${id}/storage-limit?limit_gb=${limit_gb}`, { method: 'PATCH' }); }
  adminGetActivity(params)                 { return this.get('/admin/activity', params); }
  adminGetFiles(params)                    { return this.get('/admin/files', params); }
}

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export const api = new ApiClient();
export { ApiError };
