import { api } from './api.js';
import { redirectIfAuth } from './auth.js';
import { toast } from './toast.js';

redirectIfAuth();

// Steps
const stepRegister = document.getElementById('step-register');
const stepVerify   = document.getElementById('step-verify');

const form = document.getElementById('register-form');
const submitBtn = document.getElementById('submit-btn');
const formMsg = document.getElementById('form-message');
const passwordInput = document.getElementById('password');
const strengthBars = document.querySelectorAll('.strength-bar');
let registeredEmail = '';

function setLoading(loading, btn = submitBtn, text = 'Create Account') {
  btn.disabled = loading;
  btn.innerHTML = loading
    ? '<span class="animate-spin" style="display:inline-block">⏳</span> Creating...'
    : `✨ ${text}`;
}

function showMessage(msg, type = 'error') {
  formMsg.textContent = msg;
  formMsg.className = `form-message ${type}`;
  formMsg.style.display = 'block';
}

// Password strength meter
passwordInput?.addEventListener('input', () => {
  const val = passwordInput.value;
  let score = 0;
  if (val.length >= 8) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;

  strengthBars.forEach((bar, i) => {
    bar.className = 'strength-bar';
    if (i < score) {
      if (score <= 1) bar.classList.add('weak');
      else if (score <= 2) bar.classList.add('medium');
      else bar.classList.add('strong');
    }
  });
});

// ── Register form ──
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  formMsg.style.display = 'none';

  const email = document.getElementById('email').value.trim();
  const username = document.getElementById('username').value.trim();
  const display_name = document.getElementById('display_name').value.trim();
  const password = passwordInput.value;
  const confirm = document.getElementById('confirm_password').value;

  if (password !== confirm) {
    showMessage('Passwords do not match.');
    return;
  }

  setLoading(true);
  try {
    await api.register({ email, username, display_name: display_name || username, password });
    registeredEmail = email;
    document.getElementById('verify-email-hint').textContent = email;

    stepRegister.style.display = 'none';
    stepVerify.style.display = 'block';
    stepVerify.classList.add('animate-fadeInUp');
    initOtpInputs();
  } catch (err) {
    showMessage(err.message || 'Registration failed.');
    setLoading(false);
  }
});

// ── OTP Step ──
function initOtpInputs() {
  const inputs = document.querySelectorAll('.otp-input');
  inputs.forEach((input, idx) => {
    input.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val.slice(-1);
      if (val && idx < inputs.length - 1) inputs[idx + 1].focus();
      if (val) e.target.classList.add('filled');
      else e.target.classList.remove('filled');
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && idx > 0) {
        inputs[idx - 1].focus();
        inputs[idx - 1].value = '';
        inputs[idx - 1].classList.remove('filled');
      }
    });

    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      pasted.split('').forEach((char, i) => {
        if (inputs[i]) {
          inputs[i].value = char;
          inputs[i].classList.add('filled');
        }
      });
      inputs[Math.min(pasted.length, inputs.length - 1)]?.focus();
    });
  });
}

document.getElementById('verify-btn')?.addEventListener('click', async () => {
  const inputs = document.querySelectorAll('.otp-input');
  const code = Array.from(inputs).map(i => i.value).join('');
  const verifyMsg = document.getElementById('verify-message');

  if (code.length !== 6) {
    verifyMsg.textContent = 'Enter the 6-digit code.';
    verifyMsg.className = 'form-message error';
    verifyMsg.style.display = 'block';
    return;
  }

  const btn = document.getElementById('verify-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Verifying...';

  try {
    await api.verifyOtp({ email: registeredEmail, otp_code: code, otp_type: 'register' });
    toast.love('Account verified! Welcome ❤️');
    setTimeout(() => window.location.replace('/login.html'), 1000);
  } catch (err) {
    verifyMsg.textContent = err.message || 'Invalid code. Try again.';
    verifyMsg.className = 'form-message error';
    verifyMsg.style.display = 'block';
    btn.disabled = false;
    btn.textContent = '✅ Verify';
    document.querySelectorAll('.otp-input').forEach(i => {
      i.classList.add('animate-shake');
      i.addEventListener('animationend', () => i.classList.remove('animate-shake'), { once: true });
    });
  }
});

document.getElementById('resend-btn')?.addEventListener('click', async (e) => {
  e.preventDefault();
  if (!registeredEmail) return;
  const btn = document.getElementById('resend-btn');
  btn.textContent = 'Sending...';
  try {
    await api.resendOtp(registeredEmail);
    toast.success('New code sent to your email!');
  } catch (_) {
    toast.error('Could not resend. Try again.');
  } finally {
    btn.textContent = 'Resend code';
  }
});
