// ── App Configuration ──
window.APP_CONFIG = {
  API_URL: 'https://personal-awj6.onrender.com/api/v1',
};

// ── Apply saved background image on every page ──
(function() {
  const bg = localStorage.getItem('app_bg_image');
  if (bg) {
    document.documentElement.style.cssText += ``;
    const s = document.createElement('style');
    s.textContent = `body{background-image:url(${bg})!important;background-size:cover!important;background-position:center!important;background-attachment:fixed!important;}body.has-bg #app::before,body.has-bg .app-container::before{opacity:1!important;}`;
    document.head.appendChild(s);
    document.addEventListener('DOMContentLoaded', () => document.body.classList.add('has-bg'));
  }
})();
