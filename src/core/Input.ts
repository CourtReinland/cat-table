/** Keyboard + pointer + touch-stick input, pooled per frame. */
export class Input {
  private keys = new Set<string>();
  private pressedEdge = new Set<string>();
  private consumed = new Set<string>();
  touch = { x: 0, z: 0, active: false };
  pointerDown = false;
  private pointerEdge = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressedEdge.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    this.bindTouch();
  }

  bindCanvas(canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', () => {
      this.pointerDown = true;
      this.pointerEdge = true;
    });
    window.addEventListener('pointerup', () => (this.pointerDown = false));
  }

  down(code: string) {
    return this.keys.has(code);
  }

  /** true once per physical press */
  pressed(code: string) {
    if (this.pressedEdge.has(code) && !this.consumed.has(code)) {
      this.consumed.add(code);
      return true;
    }
    return false;
  }

  pointerPressed() {
    if (this.pointerEdge) {
      this.pointerEdge = false;
      return true;
    }
    return false;
  }

  /** call at end of each frame */
  flush() {
    this.pressedEdge.clear();
    this.consumed.clear();
    this.pointerEdge = false;
  }

  moveAxes(): { x: number; z: number } {
    let x = this.touch.x;
    let z = this.touch.z;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) z -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) z += 1;
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    return { x, z };
  }

  get sprint() {
    return this.down('ShiftLeft') || this.down('ShiftRight');
  }

  private bindTouch() {
    const zone = document.getElementById('stick-zone');
    const knob = document.getElementById('stick-knob');
    if (!zone || !knob) return;
    const maxR = 44;
    let active = false;
    let cx = 0;
    let cy = 0;

    const setKnob = (dx: number, dy: number) => {
      const len = Math.hypot(dx, dy) || 1;
      const cl = Math.min(len, maxR);
      knob.style.transform = `translate(calc(-50% + ${(dx / len) * cl}px), calc(-50% + ${(dy / len) * cl}px))`;
      this.touch.x = (dx / len) * (cl / maxR);
      this.touch.z = (dy / len) * (cl / maxR);
      this.touch.active = true;
    };
    const reset = () => {
      active = false;
      this.touch.x = 0;
      this.touch.z = 0;
      this.touch.active = false;
      knob.style.transform = 'translate(-50%, -50%)';
    };

    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      active = true;
      zone.setPointerCapture(e.pointerId);
      const r = zone.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      setKnob(e.clientX - cx, e.clientY - cy);
    });
    zone.addEventListener('pointermove', (e) => {
      if (!active) return;
      setKnob(e.clientX - cx, e.clientY - cy);
    });
    zone.addEventListener('pointerup', reset);
    zone.addEventListener('pointercancel', reset);
  }
}
