// ── App Configuration ──
window.APP_CONFIG = {
  API_URL: 'https://personal-awj6.onrender.com/api/v1',
  GOOGLE_CLIENT_ID: '477159683903-hr9f9mh61puotl7qkbhd507sgdjhhhln.apps.googleusercontent.com',
};

// ── Apply saved background image on every page ──
// SECURITY: Sanitize the URL to prevent CSS injection via localStorage
(function() {
  var bg = localStorage.getItem('app_bg_image');
  if (!bg) return;

  // Only allow data: URLs (base64 images stored by settings page)
  // Block any CSS injection attempt like ); background: url(evil
  if (!bg.startsWith('data:image/')) {
    localStorage.removeItem('app_bg_image');
    return;
  }

  var x = parseInt(localStorage.getItem('app_bg_x') || '50', 10) || 50;
  var y = parseInt(localStorage.getItem('app_bg_y') || '50', 10) || 50;
  // Clamp to 0-100 to prevent CSS injection via position values
  x = Math.max(0, Math.min(100, x));
  y = Math.max(0, Math.min(100, y));

  var s = document.createElement('style');
  // Use CSS.escape equivalent — quote the data URL safely
  s.textContent = 'body{background-image:url("' + bg.replace(/"/g, '') + '")!important;background-size:cover!important;background-position:' + x + '% ' + y + '%!important;background-attachment:fixed!important;}';
  document.head.appendChild(s);
  document.addEventListener('DOMContentLoaded', function() {
    document.body.classList.add('has-bg');
    var app = document.getElementById('app');
    if (app) app.style.background = 'transparent';
  });
})();
