/**
 * cropEditor.js — Reusable image crop/zoom/pan modal
 *
 * Usage:
 *   import { openCropModal } from './cropEditor.js';
 *
 *   openCropModal({
 *     file,           // File object from <input type="file">
 *     mode,           // 'avatar' | 'banner'
 *     onSave(blob),   // called with a Blob on Save
 *     onCancel(),     // called when user cancels
 *   });
 */

// ── Constants ─────────────────────────────────────────────────────────────────
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SCALE_STEP = 0.15;

// ── State ──────────────────────────────────────────────────────────────────────
let _state = null;       // active crop session
let _raf   = null;       // requestAnimationFrame handle

// ── Public API ─────────────────────────────────────────────────────────────────
export function openCropModal({ file, mode = 'avatar', onSave, onCancel }) {
  // Only one crop session at a time
  _destroyModal();

  const objectUrl = URL.createObjectURL(file);

  _state = {
    mode,           // 'avatar' | 'banner'
    objectUrl,
    onSave,
    onCancel,
    scale: 1,
    // Pixel offset of image origin relative to crop-frame centre
    offsetX: 0,
    offsetY: 0,
    // Natural image dimensions (filled after load)
    imgNatW: 0,
    imgNatH: 0,
    // Crop frame size in CSS px (filled after mount)
    frameW: 0,
    frameH: 0,
    // Rendered image size at scale=1 (filled after layout)
    baseW: 0,
    baseH: 0,
    // Touch / pointer tracking
    dragging: false,
    lastX: 0,
    lastY: 0,
    // Pinch
    pinchDist: null,
    pinchScale: null,
  };

  _buildModal();
  _loadImage(objectUrl);
}

// ── Build DOM ──────────────────────────────────────────────────────────────────
function _buildModal() {
  const s = _state;
  const isAvatar = s.mode === 'avatar';

  // ── Overlay ──
  const overlay = document.createElement('div');
  overlay.id = 'crop-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', isAvatar ? 'Edit profile photo' : 'Edit banner photo');

  // ── Prevent body scroll while open ──
  document.body.style.overflow = 'hidden';
  document.body.style.touchAction = 'none';

  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(0,0,0,0.92);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    overflow: hidden;
    touch-action: none;
  `;

  // ── Header ──
  const header = document.createElement('div');
  header.style.cssText = `
    width: 100%;
    max-width: 430px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    padding-top: max(16px, env(safe-area-inset-top, 16px));
    flex-shrink: 0;
  `;

  const title = document.createElement('h2');
  title.textContent = isAvatar ? 'Edit Profile Photo' : 'Edit Banner';
  title.style.cssText = `
    font-size: 17px;
    font-weight: 700;
    color: #f0eaff;
    margin: 0;
  `;

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.setAttribute('aria-label', 'Cancel crop');
  cancelBtn.style.cssText = `
    background: none;
    border: none;
    color: #9b55f5;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    padding: 8px 4px;
    min-width: 44px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
  `;

  header.appendChild(title);
  header.appendChild(cancelBtn);

  // ── Crop viewport ──
  const viewportWrap = document.createElement('div');
  viewportWrap.style.cssText = `
    flex: 1;
    width: 100%;
    max-width: 430px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
    min-height: 0;
  `;

  // Dark background behind crop frame
  const cropBg = document.createElement('div');
  cropBg.style.cssText = `
    position: absolute;
    inset: 0;
    background: #000;
  `;

  // Crop frame (the visible area)
  const frame = document.createElement('div');
  frame.id = 'crop-frame';
  frame.style.cssText = `
    position: relative;
    overflow: hidden;
    flex-shrink: 0;
    touch-action: none;
    cursor: grab;
    ${isAvatar
      ? 'border-radius: 50%; box-shadow: 0 0 0 9999px rgba(0,0,0,0.72);'
      : 'border-radius: 12px; box-shadow: 0 0 0 9999px rgba(0,0,0,0.72);'}
  `;

  // Dimming overlay for the entire viewport (outside frame)
  // handled by box-shadow on frame already

  // Image inside frame
  const img = document.createElement('img');
  img.id = 'crop-img';
  img.setAttribute('alt', '');
  img.draggable = false;
  img.style.cssText = `
    position: absolute;
    transform-origin: center center;
    user-select: none;
    -webkit-user-drag: none;
    pointer-events: none;
    will-change: transform;
    image-rendering: high-quality;
  `;

  // Avatar guide ring (for avatar mode)
  if (isAvatar) {
    const ring = document.createElement('div');
    ring.style.cssText = `
      position: absolute;
      inset: 0;
      border-radius: 50%;
      border: 2px solid rgba(155,85,245,0.7);
      pointer-events: none;
      z-index: 5;
    `;
    frame.appendChild(ring);
  }

  frame.appendChild(img);
  viewportWrap.appendChild(cropBg);
  viewportWrap.appendChild(frame);

  // ── Controls ──
  const controls = document.createElement('div');
  controls.style.cssText = `
    width: 100%;
    max-width: 430px;
    padding: 16px 20px;
    padding-bottom: max(16px, env(safe-area-inset-bottom, 16px));
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
    background: rgba(8,5,26,0.95);
    border-top: 1px solid rgba(155,85,245,0.14);
  `;

  // Zoom row
  const zoomRow = document.createElement('div');
  zoomRow.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
  `;

  const zoomOutBtn = _iconBtn('zoom-out', '−', 'Zoom out');
  const zoomInBtn  = _iconBtn('zoom-in',  '+', 'Zoom in');
  const resetBtn   = _textBtn('reset-crop', 'Reset', 'Reset crop');

  const slider = document.createElement('input');
  slider.id = 'crop-zoom-slider';
  slider.type = 'range';
  slider.min = '100';
  slider.max = '400';
  slider.step = '1';
  slider.value = '100';
  slider.setAttribute('aria-label', 'Zoom level');
  slider.style.cssText = `
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    background: rgba(155,85,245,0.3);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
    accent-color: #9b55f5;
  `;

  zoomRow.appendChild(zoomOutBtn);
  zoomRow.appendChild(slider);
  zoomRow.appendChild(zoomInBtn);
  zoomRow.appendChild(resetBtn);

  // Action row
  const actionRow = document.createElement('div');
  actionRow.style.cssText = `
    display: flex;
    gap: 12px;
  `;

  const saveBtn = document.createElement('button');
  saveBtn.id = 'crop-save-btn';
  saveBtn.textContent = 'Save Photo';
  saveBtn.setAttribute('aria-label', isAvatar ? 'Save profile photo' : 'Save banner');
  saveBtn.style.cssText = `
    flex: 1;
    padding: 14px;
    background: linear-gradient(135deg, #9b55f5 0%, #5e1ab8 100%);
    color: white;
    border: none;
    border-radius: 999px;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    min-height: 48px;
    transition: opacity 0.15s;
  `;

  actionRow.appendChild(saveBtn);

  controls.appendChild(zoomRow);
  controls.appendChild(actionRow);

  // ── Assemble ──
  overlay.appendChild(header);
  overlay.appendChild(viewportWrap);
  overlay.appendChild(controls);
  document.body.appendChild(overlay);

  s.overlay  = overlay;
  s.frame    = frame;
  s.img      = img;
  s.slider   = slider;
  s.saveBtn  = saveBtn;

  // ── Event listeners ──
  cancelBtn.addEventListener('click', _handleCancel);
  saveBtn.addEventListener('click', _handleSave);
  resetBtn.addEventListener('click', _handleReset);

  zoomOutBtn.addEventListener('click', () => _adjustZoom(-SCALE_STEP));
  zoomInBtn.addEventListener('click',  () => _adjustZoom(+SCALE_STEP));

  slider.addEventListener('input', () => {
    const newScale = parseInt(slider.value, 10) / 100;
    _setScale(newScale);
    _constrainOffset();
    _applyTransform();
  });

  // Pointer events (mouse + touch unified)
  frame.addEventListener('pointerdown',  _onPointerDown, { passive: false });
  window.addEventListener('pointermove', _onPointerMove, { passive: false });
  window.addEventListener('pointerup',   _onPointerUp);
  window.addEventListener('pointercancel', _onPointerUp);

  // Pinch gesture (touch)
  frame.addEventListener('touchstart',  _onTouchStart,  { passive: true });
  frame.addEventListener('touchmove',   _onTouchMove,   { passive: false });
  frame.addEventListener('touchend',    _onTouchEnd,    { passive: true });

  // Mouse wheel zoom
  frame.addEventListener('wheel', _onWheel, { passive: false });

  // Keyboard close
  window.addEventListener('keydown', _onKeyDown);
}

// ── Image Loading ──────────────────────────────────────────────────────────────
function _loadImage(src) {
  const s = _state;
  if (!s) return;
  const img = s.img;

  img.onload = () => {
    s.imgNatW = img.naturalWidth;
    s.imgNatH = img.naturalHeight;
    // Wait one rAF so the overlay is painted and we can read real dimensions
    requestAnimationFrame(() => _measureFrameAndLayout());
  };
  img.onerror = () => {
    _showError('Could not load image. Please try another file.');
  };
  img.src = src;
}

function _measureFrameAndLayout() {
  const s = _state;
  if (!s) return;

  const vw = Math.min(window.innerWidth, 430);
  const vh = window.innerHeight;

  // Measure actual header + controls heights so we never guess wrong
  const overlay   = s.overlay;
  const allDivs   = overlay.children;           // [header, viewportWrap, controls]
  const headerEl  = allDivs[0];
  const controlEl = allDivs[2];
  const headerH   = headerEl  ? headerEl.getBoundingClientRect().height  : 60;
  const controlH  = controlEl ? controlEl.getBoundingClientRect().height : 136;
  const available = Math.max(vh - headerH - controlH - 16, 100);

  let frameW, frameH;

  if (s.mode === 'avatar') {
    const size = Math.min(vw - 48, available, 320);
    frameW = size;
    frameH = size;
  } else {
    // Banner: 16:5 aspect ratio
    frameW = Math.min(vw - 32, 390);
    frameH = Math.round(frameW * (5 / 16));
    if (frameH > available - 8) {
      frameH = available - 8;
      frameW = Math.round(frameH * (16 / 5));
    }
    // Clamp to viewport width
    if (frameW > vw - 32) {
      frameW = vw - 32;
      frameH = Math.round(frameW * (5 / 16));
    }
  }

  s.frameW = frameW;
  s.frameH = frameH;

  const frame = s.frame;
  frame.style.width  = frameW + 'px';
  frame.style.height = frameH + 'px';

  // Cover the frame at scale=1: image must be at least frameW × frameH
  const scaleToFit = Math.max(frameW / s.imgNatW, frameH / s.imgNatH);
  s.baseW = Math.round(s.imgNatW * scaleToFit);
  s.baseH = Math.round(s.imgNatH * scaleToFit);

  s.img.style.width  = s.baseW + 'px';
  s.img.style.height = s.baseH + 'px';

  // Start perfectly centred, no zoom
  s.offsetX = 0;
  s.offsetY = 0;
  s.scale   = 1;
  s.slider.value = '100';

  _applyTransform();
}

// ── Transform ──────────────────────────────────────────────────────────────────
/**
 * Positions the image inside the crop frame.
 *
 * Strategy: keep transform-origin at "0 0" (top-left) so the maths is simple
 * and there are no pivot surprises.
 *
 *  - At scale=1 the image (baseW × baseH) is centred in the frame.
 *  - offsetX / offsetY are the user's pan delta on top of that centred position.
 *  - Scale is applied from the centre of the image so it zooms in-place:
 *      left = centreLeft - (baseW * scale - baseW) / 2  + offsetX
 *           = (frameW - baseW*scale) / 2               + offsetX
 */
function _applyTransform() {
  const s = _state;
  if (!s || !s.img) return;

  const left = (s.frameW - s.baseW * s.scale) / 2 + s.offsetX;
  const top  = (s.frameH - s.baseH * s.scale) / 2 + s.offsetY;

  s.img.style.transformOrigin = '0 0';
  s.img.style.left      = '0';
  s.img.style.top       = '0';
  s.img.style.transform = `translate(${left}px, ${top}px) scale(${s.scale})`;
}

function _constrainOffset() {
  const s = _state;
  if (!s) return;

  // With the new transform: left = (frameW - baseW*scale)/2 + offsetX
  // The image must cover the frame, so:
  //   left <= 0  →  offsetX <= (baseW*scale - frameW) / 2
  //   left + baseW*scale >= frameW  →  offsetX >= -(baseW*scale - frameW) / 2
  const maxX = Math.max((s.baseW * s.scale - s.frameW) / 2, 0);
  const maxY = Math.max((s.baseH * s.scale - s.frameH) / 2, 0);

  s.offsetX = Math.max(-maxX, Math.min(maxX, s.offsetX));
  s.offsetY = Math.max(-maxY, Math.min(maxY, s.offsetY));
}

function _setScale(newScale) {
  const s = _state;
  if (!s) return;
  s.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
  s.slider.value = Math.round(s.scale * 100).toString();
}

function _adjustZoom(delta) {
  const s = _state;
  if (!s) return;
  _setScale(s.scale + delta);
  _constrainOffset();
  _applyTransform();
}

// ── Drag (Pointer) ─────────────────────────────────────────────────────────────
const _activePointers = new Map();

function _onPointerDown(e) {
  e.preventDefault();
  _activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (_activePointers.size === 1) {
    const s = _state;
    if (!s) return;
    s.dragging = true;
    s.lastX = e.clientX;
    s.lastY = e.clientY;
    s.frame.style.cursor = 'grabbing';
  }
}

function _onPointerMove(e) {
  _activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  // Pinch in progress — skip drag
  if (_activePointers.size >= 2) return;

  const s = _state;
  if (!s || !s.dragging) return;

  e.preventDefault();
  const dx = e.clientX - s.lastX;
  const dy = e.clientY - s.lastY;
  s.lastX = e.clientX;
  s.lastY = e.clientY;

  s.offsetX += dx;
  s.offsetY += dy;
  _constrainOffset();

  if (_raf) cancelAnimationFrame(_raf);
  _raf = requestAnimationFrame(_applyTransform);
}

function _onPointerUp(e) {
  _activePointers.delete(e.pointerId);
  const s = _state;
  if (!s) return;
  if (_activePointers.size === 0) {
    s.dragging = false;
    if (s.frame) s.frame.style.cursor = 'grab';
  }
}

// ── Pinch (Touch) ──────────────────────────────────────────────────────────────
function _getTouchDist(t1, t2) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.hypot(dx, dy);
}

function _onTouchStart(e) {
  if (e.touches.length === 2) {
    const s = _state;
    if (!s) return;
    s.dragging = false;
    s.pinchDist  = _getTouchDist(e.touches[0], e.touches[1]);
    s.pinchScale = s.scale;
  }
}

function _onTouchMove(e) {
  const s = _state;
  if (!s) return;

  if (e.touches.length === 2 && s.pinchDist !== null) {
    e.preventDefault();
    const dist = _getTouchDist(e.touches[0], e.touches[1]);
    const ratio = dist / s.pinchDist;
    _setScale(s.pinchScale * ratio);
    _constrainOffset();
    if (_raf) cancelAnimationFrame(_raf);
    _raf = requestAnimationFrame(_applyTransform);
  }
}

function _onTouchEnd(e) {
  const s = _state;
  if (!s) return;
  if (e.touches.length < 2) {
    s.pinchDist  = null;
    s.pinchScale = null;
  }
}

// ── Mouse wheel zoom ───────────────────────────────────────────────────────────
function _onWheel(e) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP;
  _adjustZoom(delta);
}

// ── Keyboard ───────────────────────────────────────────────────────────────────
function _onKeyDown(e) {
  if (e.key === 'Escape') _handleCancel();
}

// ── Reset ──────────────────────────────────────────────────────────────────────
function _handleReset() {
  const s = _state;
  if (!s) return;
  s.scale   = 1;
  s.offsetX = 0;
  s.offsetY = 0;
  s.slider.value = '100';
  _applyTransform();
}

// ── Cancel ─────────────────────────────────────────────────────────────────────
function _handleCancel() {
  const s = _state;
  if (!s) return;
  const cb = s.onCancel;
  _destroyModal();
  if (cb) cb();
}

// ── Save ───────────────────────────────────────────────────────────────────────
async function _handleSave() {
  const s = _state;
  if (!s) return;

  const btn = s.saveBtn;
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const blob = await _exportCrop();
    const cb   = s.onSave;
    _destroyModal();
    if (cb) cb(blob);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Save Photo';
    _showError('Failed to process image. Please try again.');
  }
}

// ── Export canvas crop ──────────────────────────────────────────────────────────
function _exportCrop() {
  return new Promise((resolve, reject) => {
    const s = _state;
    if (!s) return reject(new Error('No state'));

    const canvas = document.createElement('canvas');
    // Output dimensions
    const outW = s.mode === 'avatar' ? 400 : 1200;
    const outH = s.mode === 'avatar' ? 400 : Math.round(1200 * (5 / 16));

    canvas.width  = outW;
    canvas.height = outH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return reject(new Error('No canvas context'));

    const img = new Image();
    img.onload = () => {
      /**
       * New transform:
       *   left = (frameW - baseW * scale) / 2 + offsetX
       *   top  = (frameH - baseH * scale) / 2 + offsetY
       *
       * Pixel (0,0) in frame space corresponds to:
       *   imgX = -left  in the scaled-image space
       *   imgY = -top   in the scaled-image space
       *
       * In natural-image space:
       *   ratio = baseW / imgNatW  (same as baseH / imgNatH)
       *   srcX = imgX / (scale * ratio)
       *   srcW = frameW / (scale * ratio)
       */
      const ratio  = s.baseW / s.imgNatW;
      const left   = (s.frameW - s.baseW * s.scale) / 2 + s.offsetX;
      const top    = (s.frameH - s.baseH * s.scale) / 2 + s.offsetY;

      const srcX = -left  / (s.scale * ratio);
      const srcY = -top   / (s.scale * ratio);
      const srcW =  s.frameW / (s.scale * ratio);
      const srcH =  s.frameH / (s.scale * ratio);

      // Clamp src rect to image bounds to avoid black edges
      const clampedSrcX = Math.max(0, srcX);
      const clampedSrcY = Math.max(0, srcY);
      const clampedSrcW = Math.min(srcW, s.imgNatW - clampedSrcX);
      const clampedSrcH = Math.min(srcH, s.imgNatH - clampedSrcY);

      // Map clamped source back to dest
      const dstX = (clampedSrcX - srcX) / srcW * outW;
      const dstY = (clampedSrcY - srcY) / srcH * outH;
      const dstW = (clampedSrcW / srcW) * outW;
      const dstH = (clampedSrcH / srcH) * outH;

      if (s.mode === 'avatar') {
        ctx.beginPath();
        ctx.arc(outW / 2, outH / 2, outW / 2, 0, Math.PI * 2);
        ctx.clip();
      }

      ctx.drawImage(img, clampedSrcX, clampedSrcY, clampedSrcW, clampedSrcH, dstX, dstY, dstW, dstH);

      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('toBlob failed')),
        'image/jpeg',
        0.92
      );
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = s.objectUrl;
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function _iconBtn(id, label, ariaLabel) {
  const btn = document.createElement('button');
  btn.id = id;
  btn.textContent = label;
  btn.setAttribute('aria-label', ariaLabel);
  btn.style.cssText = `
    width: 44px;
    height: 44px;
    background: rgba(155,85,245,0.15);
    border: 1px solid rgba(155,85,245,0.25);
    border-radius: 12px;
    color: #f0eaff;
    font-size: 22px;
    font-weight: 400;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    line-height: 1;
  `;
  return btn;
}

function _textBtn(id, label, ariaLabel) {
  const btn = document.createElement('button');
  btn.id = id;
  btn.textContent = label;
  btn.setAttribute('aria-label', ariaLabel);
  btn.style.cssText = `
    padding: 0 14px;
    height: 44px;
    background: rgba(155,85,245,0.10);
    border: 1px solid rgba(155,85,245,0.20);
    border-radius: 12px;
    color: #9b55f5;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
    white-space: nowrap;
  `;
  return btn;
}

function _showError(msg) {
  // Dispatch a custom event so the host page can show a toast
  window.dispatchEvent(new CustomEvent('crop-error', { detail: msg }));
  console.error('[cropEditor]', msg);
}

function _destroyModal() {
  // Restore body scroll
  document.body.style.overflow = '';
  document.body.style.touchAction = '';

  // Remove listeners
  window.removeEventListener('pointermove', _onPointerMove);
  window.removeEventListener('pointerup',   _onPointerUp);
  window.removeEventListener('pointercancel', _onPointerUp);
  window.removeEventListener('keydown', _onKeyDown);

  _activePointers.clear();
  if (_raf) { cancelAnimationFrame(_raf); _raf = null; }

  // Release object URL
  if (_state?.objectUrl) {
    URL.revokeObjectURL(_state.objectUrl);
  }

  // Remove overlay
  const overlay = document.getElementById('crop-modal-overlay');
  if (overlay) overlay.remove();

  _state = null;
}
