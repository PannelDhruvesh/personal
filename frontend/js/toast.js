/* ── Toast Notification System ── */
let toastContainer = null;

function getContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.style.cssText = `
      position: fixed;
      top: 24px;
      left: 50%;
      transform: translateX(-50%);
      width: calc(100% - 32px);
      max-width: 390px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

const icons = {
  success: '✅',
  error:   '❌',
  warning: '⚠️',
  info:    'ℹ️',
  love:    '❤️',
};

const colors = {
  success: 'rgba(52,211,153,0.15)',
  error:   'rgba(255,107,138,0.15)',
  warning: 'rgba(251,191,36,0.15)',
  info:    'rgba(124,58,237,0.15)',
  love:    'rgba(233,30,140,0.15)',
};

const borders = {
  success: 'rgba(52,211,153,0.3)',
  error:   'rgba(255,107,138,0.3)',
  warning: 'rgba(251,191,36,0.3)',
  info:    'rgba(124,58,237,0.3)',
  love:    'rgba(233,30,140,0.3)',
};

export function showToast(message, type = 'info', duration = 3000) {
  const container = getContainer();

  const toast = document.createElement('div');
  toast.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 18px;
    background: rgba(20,20,30,0.95);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid ${borders[type] || borders.info};
    background-blend-mode: overlay;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    font-weight: 500;
    color: #f5f0ff;
    pointer-events: all;
    cursor: pointer;
    animation: toastIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    transform-origin: top center;
    background-color: ${colors[type] || colors.info};
  `;

  const iconEl = document.createElement('span');
  iconEl.textContent = icons[type] || icons.info;
  iconEl.style.fontSize = '18px';
  iconEl.style.flexShrink = '0';

  const textEl = document.createElement('span');
  textEl.textContent = message;
  textEl.style.flex = '1';

  toast.appendChild(iconEl);
  toast.appendChild(textEl);

  // Add keyframes if not already added
  if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
      @keyframes toastIn {
        from { opacity: 0; transform: translateY(-16px) scale(0.92); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes toastOut {
        from { opacity: 1; transform: translateY(0) scale(1); }
        to   { opacity: 0; transform: translateY(-12px) scale(0.92); }
      }
    `;
    document.head.appendChild(style);
  }

  const dismiss = () => {
    toast.style.animation = 'toastOut 0.25s ease forwards';
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };

  toast.addEventListener('click', dismiss);
  container.appendChild(toast);

  const timer = setTimeout(dismiss, duration);
  toast._timer = timer;

  return toast;
}

export const toast = {
  success: (msg, dur) => showToast(msg, 'success', dur),
  error:   (msg, dur) => showToast(msg, 'error',   dur || 4000),
  warning: (msg, dur) => showToast(msg, 'warning', dur),
  info:    (msg, dur) => showToast(msg, 'info',    dur),
  love:    (msg, dur) => showToast(msg, 'love',    dur),
};
