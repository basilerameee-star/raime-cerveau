import * as THREE from 'three';

const LOOK_KEYS = new Set(['KeyW', 'KeyZ', 'KeyS', 'KeyA', 'KeyQ', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE', 'Space', 'KeyC']);
const BOOST_KEYS = new Set(['ShiftLeft', 'ShiftRight']);
const UP = new THREE.Vector3(0, 1, 0);
const PITCH_LIMIT = Math.PI / 2 - .01;
const finiteVector = value => value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);

/** First-person flight. Inputs alter the eye and its orientation, never a pivot. */
export class CameraLibre {
  constructor({ camera, canvas, onChange = () => {}, onExit = () => {} }) {
    if (!camera?.isCamera || !canvas?.addEventListener) throw new TypeError('Une caméra Three et un canevas sont requis.');
    this.camera = camera;
    this.canvas = canvas;
    this.onChange = onChange;
    this.onExit = onExit;
    this.document = canvas.ownerDocument || globalThis.document;
    this.window = this.document?.defaultView || globalThis.window;
    this._enabled = false;
    this.disposed = false;
    this.keys = new Set();
    this.pointers = new Map();
    this.handlers = [];
    this.speed = 7;
    this.panScale = .018;
    this.lookScale = .004;
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._delta = new THREE.Vector3();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.yaw = 0;
    this.pitch = 0;
    if (canvas.tabIndex < 0) canvas.tabIndex = 0;
    this.syncFromCamera();
    this._events();
  }

  get enabled() { return this._enabled; }
  get moving() {
    if (!this.enabled || this.disposed) return false;
    const { forward, right, vertical } = this._input();
    return forward !== 0 || right !== 0 || vertical !== 0;
  }

  setEnabled(value) {
    if (this.disposed) return;
    const next = Boolean(value);
    if (next === this._enabled) return;
    this._clearInputs();
    this._enabled = next;
    if (next) {
      this.syncFromCamera();
      this._safePosition();
      this.canvas.focus?.({ preventScroll: true });
    }
    this.onChange();
  }

  /** Read the current external pose after Home, a preset or a transition. */
  syncFromCamera() {
    this._euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    if (Number.isFinite(this._euler.y) && Number.isFinite(this._euler.x)) {
      this.yaw = this._euler.y;
      this.pitch = THREE.MathUtils.clamp(this._euler.x, -PITCH_LIMIT, PITCH_LIMIT);
    }
    return this.getPose();
  }

  getPose() {
    return { position: this.camera.position.toArray(), quaternion: this.camera.quaternion.toArray(), yaw: this.yaw, pitch: this.pitch };
  }

  setPose({ position, quaternion, yaw, pitch } = {}) {
    if (this.disposed) return false;
    const pos = Array.isArray(position) ? position : position?.toArray?.();
    const quat = Array.isArray(quaternion) ? quaternion : quaternion?.toArray?.();
    let changed = false;
    if (pos?.length === 3 && pos.every(Number.isFinite)) { this.camera.position.fromArray(pos); changed = true; }
    if (quat?.length === 4 && quat.every(Number.isFinite) && quat.some(value => value !== 0)) {
      const magnitude = Math.max(...quat.map(Math.abs));
      this.camera.quaternion.fromArray(quat.map(value => value / magnitude)).normalize();
      this.syncFromCamera();
      changed = true;
    }
    if (Number.isFinite(yaw) || Number.isFinite(pitch)) {
      if (Number.isFinite(yaw)) this.yaw = THREE.MathUtils.euclideanModulo(yaw + Math.PI, Math.PI * 2) - Math.PI;
      if (Number.isFinite(pitch)) this.pitch = THREE.MathUtils.clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
      this._orient();
      changed = true;
    }
    if (changed) { this._safePosition(); this.onChange(); }
    return changed;
  }

  /** Advance along the view direction. Useful for the existing +/- controls. */
  dolly(distance) {
    if (!this.enabled || this.disposed || !Number.isFinite(distance) || distance === 0) return false;
    this.camera.getWorldDirection(this._forward);
    return this._translate(this._forward.multiplyScalar(THREE.MathUtils.clamp(distance, -30, 30)));
  }

  /** Translate in camera-local coordinates: +X right, +Y up, -Z forward. */
  move(localVector, amount = 1) {
    if (!this.enabled || this.disposed || !finiteVector(localVector) || !Number.isFinite(amount)) return false;
    this._delta.copy(localVector).multiplyScalar(THREE.MathUtils.clamp(amount, -30, 30)).applyQuaternion(this.camera.quaternion);
    return this._translate(this._delta);
  }

  update(deltaSeconds) {
    if (!this.moving || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return false;
    const { forward, right, vertical } = this._input();
    this.camera.getWorldDirection(this._forward);
    this._right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this._delta.set(0, 0, 0).addScaledVector(this._forward, forward).addScaledVector(this._right, right).addScaledVector(UP, vertical);
    if (this._delta.lengthSq() > 1) this._delta.normalize();
    const boost = [...BOOST_KEYS].some(key => this.keys.has(key)) ? 3 : 1;
    this._delta.multiplyScalar(this.speed * boost * Math.min(deltaSeconds, .1));
    return this._translate(this._delta);
  }

  _input() {
    const any = (...keys) => keys.some(key => this.keys.has(key)) ? 1 : 0;
    return {
      forward: any('KeyW', 'KeyZ', 'ArrowUp') - any('KeyS', 'ArrowDown'),
      right: any('KeyD', 'ArrowRight') - any('KeyA', 'KeyQ', 'ArrowLeft'),
      vertical: any('KeyE', 'Space') - any('KeyC'),
    };
  }

  _safePosition() {
    const p = this.camera.position;
    if (!finiteVector(p)) return false;
    p.y = THREE.MathUtils.clamp(p.y, -250, 250);
    const radius = Math.hypot(p.x, p.z);
    const allowed = Math.sqrt(Math.max(0, 250 * 250 - p.y * p.y));
    if (radius > allowed) { p.x *= allowed / radius; p.z *= allowed / radius; }
    this.camera.updateMatrixWorld();
    return true;
  }

  _translate(delta) {
    if (!finiteVector(delta) || delta.lengthSq() === 0 || !finiteVector(this.camera.position)) return false;
    const before = this.camera.position.clone();
    this.camera.position.add(delta);
    this._safePosition();
    if (this.camera.position.equals(before)) return false;
    this.onChange();
    return true;
  }

  _orient() {
    this._euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this._euler);
    this.camera.updateMatrixWorld();
  }

  _look(dx, dy) {
    if (![dx, dy].every(Number.isFinite) || (!dx && !dy)) return;
    this.yaw = THREE.MathUtils.euclideanModulo(this.yaw - dx * this.lookScale + Math.PI, Math.PI * 2) - Math.PI;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * this.lookScale, -PITCH_LIMIT, PITCH_LIMIT);
    this._orient();
    this.onChange();
  }

  _pan(dx, dy) {
    if (![dx, dy].every(Number.isFinite)) return;
    this._right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this._up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    this._delta.copy(this._right).multiplyScalar(-dx * this.panScale).addScaledVector(this._up, dy * this.panScale);
    this._translate(this._delta);
  }

  _focused() {
    const active = this.document?.activeElement;
    return !this.document?.hidden && active === this.canvas && !active?.isContentEditable;
  }

  _clearInputs() {
    this.keys.clear();
    for (const id of this.pointers.keys()) {
      try { if (this.canvas.hasPointerCapture?.(id)) this.canvas.releasePointerCapture(id); } catch { /* A lost pointer is already released. */ }
    }
    this.pointers.clear();
    this.touchGesture = null;
  }

  _listen(target, type, handler, options) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, options);
    this.handlers.push(() => target.removeEventListener(type, handler, options));
  }

  _events() {
    this._listen(this.canvas, 'pointerdown', event => {
      if (!this.enabled || (event.button !== 0 && event.button !== 2 && event.pointerType !== 'touch')) return;
      this.canvas.focus?.({ preventScroll: true });
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, button: event.button, touch: event.pointerType === 'touch', dragged: false });
      this.touchGesture = this._touchGesture();
      try { this.canvas.setPointerCapture?.(event.pointerId); } catch { /* Capture is optional. */ }
    });
    this._listen(this.canvas, 'pointermove', event => {
      if (!this.enabled) return;
      const pointer = this.pointers.get(event.pointerId);
      if (!pointer) return;
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      pointer.x = event.clientX; pointer.y = event.clientY;
      if (!pointer.dragged && Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY) < 4) return;
      pointer.dragged = true;
      event.preventDefault();
      const gesture = this._touchGesture();
      if (gesture) {
        const previous = this.touchGesture;
        if (previous) { this._pan(gesture.x - previous.x, gesture.y - previous.y); this.dolly((gesture.distance - previous.distance) * .035); }
        this.touchGesture = gesture;
      } else if (pointer.button === 2 || event.shiftKey) this._pan(dx, dy);
      else this._look(dx, dy);
    }, { passive: false });
    const release = event => {
      this.pointers.delete(event.pointerId);
      this.touchGesture = this._touchGesture();
      // A remaining touch starts a fresh gesture, rather than jumping the view.
      for (const pointer of this.pointers.values()) { pointer.startX = pointer.x; pointer.startY = pointer.y; pointer.dragged = false; }
    };
    this._listen(this.canvas, 'pointerup', release);
    this._listen(this.canvas, 'pointercancel', release);
    this._listen(this.canvas, 'lostpointercapture', release);
    this._listen(this.canvas, 'wheel', event => {
      if (!this.enabled) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.canvas.clientHeight || 600 : 1;
      this.dolly(-event.deltaY * unit * .015);
    }, { passive: false });
    this._listen(this.canvas, 'contextmenu', event => { if (this.enabled) event.preventDefault(); });
    this._listen(this.window, 'keydown', event => {
      if (!this.enabled || !this._focused()) return;
      if (event.code === 'Escape') { event.preventDefault(); this.setEnabled(false); this.onExit(); return; }
      if (!LOOK_KEYS.has(event.code) && !BOOST_KEYS.has(event.code)) return;
      if (LOOK_KEYS.has(event.code)) event.preventDefault();
      const existed = this.keys.has(event.code);
      this.keys.add(event.code);
      if (!existed) this.onChange();
    });
    this._listen(this.window, 'keyup', event => {
      if (this.keys.delete(event.code) && this.enabled) this.onChange();
    });
    const clear = () => { const changed = this.moving || this.pointers.size > 0; this._clearInputs(); if (changed && this.enabled) this.onChange(); };
    this._listen(this.window, 'blur', clear);
    this._listen(this.canvas, 'blur', clear);
    this._listen(this.document, 'visibilitychange', () => { if (this.document.hidden) clear(); });
  }

  _touchGesture() {
    const touches = [...this.pointers.values()].filter(pointer => pointer.touch);
    if (touches.length !== 2) return null;
    return { x: (touches[0].x + touches[1].x) / 2, y: (touches[0].y + touches[1].y) / 2, distance: Math.hypot(touches[1].x - touches[0].x, touches[1].y - touches[0].y) };
  }

  dispose() {
    if (this.disposed) return;
    this._clearInputs();
    this._enabled = false;
    for (const remove of this.handlers) remove();
    this.handlers.length = 0;
    this.disposed = true;
  }
}
