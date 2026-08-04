import { api } from './api.js';
import { redirectIfAuth, setUser } from './auth.js';
import { toast } from './toast.js';

redirectIfAuth();

const form = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const togglePwd = document.getElementById('toggle-password');
const submitBtn = document.getElementById('submit-btn');
const formMsg = document.getElementById('form-message');

// Toggle password visibility
togglePwd?.addEventListener('click', () => {
  const isText = passwordInput.type === 'text';
  passwordInput.type = isText ? 'password' : 'text';
  togglePwd.textContent = isText ? 'SHOW' : 'HIDE';
});

function setLoading(loading) {
  submitBtn.disabled = loading;
  submitBtn.innerHTML = loading
    ? '<span class="animate-spin" style="display:inline-block">&#8987;</span> Signing in...'
    : 'Sign In';
}

function showMessage(msg, type = 'error') {
  formMsg.textContent = msg;
  formMsg.className = `form-message ${type}`;
  formMsg.style.display = 'block';
}

function hideMessage() {
  formMsg.style.display = 'none';
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMessage();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showMessage('Please fill in all fields.');
    return;
  }

  setLoading(true);
  try {
    const res = await api.login({ email, password });
    const { access_token, refresh_token, user } = res.data;

    // Store tokens first
    api.setTokens(access_token, refresh_token);
    // Store initial user from login response (may have stale/signed avatar)
    setUser(user);

    // Fetch fresh profile immediately — gets a fresh signed avatar URL
    // and up-to-date user data (storage, verified status etc.)
    try {
      const freshRes = await api.getMe();
      if (freshRes?.data) setUser(freshRes.data);
    } catch (_) { /* non-fatal — proceed with login-response user */ }

    toast.love('Welcome back ❤️');
    setTimeout(() => window.location.replace('/dashboard.html'), 600);
  } catch (err) {
    showMessage(err.message || 'Login failed. Please try again.');
    setLoading(false);
  }
});
