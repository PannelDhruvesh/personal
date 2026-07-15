// ── App Configuration ──
window.APP_CONFIG = {
  API_URL: 'https://personal-awj6.onrender.com/api/v1',
  GOOGLE_CLIENT_ID: '458568704116-your-client-id.apps.googleusercontent.com', // Replace with your Google Client ID
};

// ── Apply saved background image on every page ──
(function() {
  const bg = localStorage.getItem('app_bg_image');
  if (bg) {
    const x = localStorage.getItem('app_bg_x') || '50';
    const y = localStorage.getItem('app_bg_y') || '50';
    const s = document.createElement('style');
    s.textContent = `body{background-image:url(${bg})!important;background-size:cover!important;background-position:${x}% ${y}%!important;background-attachment:fixed!important;}`;
    document.head.appendChild(s);
    document.addEventListener('DOMContentLoaded', () => {
      document.body.classList.add('has-bg');
      const app = document.getElementById('app');
      if (app) app.style.background = 'transparent';
    });
  }
})();
