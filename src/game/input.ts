import { clamp } from './collision.ts'

export class Input {
  keys = new Set<string>()
  fire = false
  fireEdge = false
  reloadEdge = false
  useEdge = false
  grenadeEdge = false
  pauseEdge = false
  skipEdge = false
  weaponSlot: number | null = null
  nextWeaponEdge = false
  wheel = 0
  interactHeld = false
  pointerLocked = false
  private ignoreNextUnlock = false

  private mouseFire = false
  private keyFire = false
  private touchFire = false
  private lookDX = 0
  private lookDY = 0
  private stickX = 0
  private stickY = 0
  private stickId: number | null = null
  private lookId: number | null = null
  private lookLastX = 0
  private lookLastY = 0
  private canvas: HTMLCanvasElement
  canLock = (): boolean => false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    window.addEventListener('keydown', (e) => this.onKey(e, true))
    window.addEventListener('keyup', (e) => this.onKey(e, false))
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return
      this.mouseFire = true
      this.syncFire()
    })
    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return
      this.mouseFire = false
      this.syncFire()
    })
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    canvas.addEventListener('click', () => {
      if (this.canLock() && document.pointerLockElement !== canvas) {
        void canvas.requestPointerLock()
      }
    })
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas
      if (this.pointerLocked && !locked && !this.ignoreNextUnlock) this.pauseEdge = true
      this.ignoreNextUnlock = false
      this.pointerLocked = locked
    })
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return
      this.lookDX += e.movementX * 0.0022
      this.lookDY += e.movementY * 0.002
    })
    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.canLock()) return
        e.preventDefault()
        this.wheel = Math.sign(e.deltaY)
      },
      { passive: false },
    )
    this.bindTouch()
  }

  get forward(): number {
    const k = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0)
    return clamp(k + this.stickY, -1, 1)
  }

  get strafe(): number {
    const k = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0)
    return clamp(k + this.stickX, -1, 1)
  }

  get sprint(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || Math.hypot(this.stickX, this.stickY) > 0.92
  }

  get climb(): boolean {
    return this.keys.has('Space') || this.keys.has('touch-up')
  }

  get descend(): boolean {
    return this.keys.has('KeyC') || this.keys.has('touch-down')
  }

  consumeLook(): { x: number; y: number } {
    const v = { x: this.lookDX, y: this.lookDY }
    this.lookDX = 0
    this.lookDY = 0
    return v
  }

  ignoreUnlock(): void {
    this.ignoreNextUnlock = true
  }

  endFrame(): void {
    this.fireEdge = false
    this.reloadEdge = false
    this.useEdge = false
    this.grenadeEdge = false
    this.pauseEdge = false
    this.skipEdge = false
    this.weaponSlot = null
    this.nextWeaponEdge = false
    this.wheel = 0
  }

  private syncFire(): void {
    const down = this.mouseFire || this.keyFire || this.touchFire
    if (down && !this.fire) this.fireEdge = true
    this.fire = down
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const code = e.code
    const ui = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
    if (ui.includes(code)) e.preventDefault()
    if (down) this.keys.add(code)
    else this.keys.delete(code)
    if (e.repeat && down) return
    if (code === 'KeyJ') {
      this.keyFire = down
      this.syncFire()
    }
    if (!down) return
    if (code === 'KeyR') this.reloadEdge = true
    if (code === 'KeyF') this.useEdge = true
    if (code === 'KeyG') this.grenadeEdge = true
    if (code === 'Enter') this.skipEdge = true
    if (code === 'Escape' || code === 'KeyP') {
      if (code === 'Escape' && document.pointerLockElement === this.canvas) return
      this.pauseEdge = true
    }
    if (code.startsWith('Digit')) {
      const n = Number(code.slice(5))
      if (n >= 1 && n <= 6) this.weaponSlot = n
    }
  }

  private bindTouch(): void {
    const stick = document.getElementById('stick-zone')
    const nub = document.getElementById('stick-nub')
    const look = document.getElementById('look-zone')
    const buttons = document.getElementById('touch-buttons')
    if (!stick || !nub || !look || !buttons) return

    const moveStick = (e: PointerEvent) => {
      const rect = stick.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      let dx = e.clientX - cx
      let dy = e.clientY - cy
      const max = rect.width * 0.38
      const mag = Math.hypot(dx, dy) || 1
      if (mag > max) {
        dx = (dx / mag) * max
        dy = (dy / mag) * max
      }
      nub.style.transform = `translate(${dx}px, ${dy}px)`
      this.stickX = dx / max
      this.stickY = -dy / max
    }
    const clearStick = () => {
      this.stickId = null
      this.stickX = 0
      this.stickY = 0
      nub.style.transform = 'translate(0px, 0px)'
    }
    stick.addEventListener('pointerdown', (e) => {
      this.stickId = e.pointerId
      stick.setPointerCapture(e.pointerId)
      moveStick(e)
    })
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) moveStick(e)
    })
    stick.addEventListener('pointerup', clearStick)
    stick.addEventListener('pointercancel', clearStick)

    look.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return
      this.lookId = e.pointerId
      this.lookLastX = e.clientX
      this.lookLastY = e.clientY
    })
    look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return
      this.lookDX += (e.clientX - this.lookLastX) * 0.005
      this.lookDY += (e.clientY - this.lookLastY) * 0.004
      this.lookLastX = e.clientX
      this.lookLastY = e.clientY
    })
    const endLook = (e: PointerEvent) => {
      if (e.pointerId === this.lookId) this.lookId = null
    }
    look.addEventListener('pointerup', endLook)
    look.addEventListener('pointercancel', endLook)

    buttons.querySelectorAll('button').forEach((btn) => {
      const act = btn.getAttribute('data-act')
      if (!act) return
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (act === 'fire') {
          this.touchFire = true
          this.syncFire()
        } else if (act === 'reload') this.reloadEdge = true
        else if (act === 'use') {
          this.useEdge = true
          this.keys.add('KeyE')
        } else if (act === 'grenade') this.grenadeEdge = true
        else if (act === 'weapon') this.nextWeaponEdge = true
        else if (act === 'up') this.keys.add('touch-up')
        else if (act === 'down') this.keys.add('touch-down')
        else if (act === 'pause') this.pauseEdge = true
      })
      const release = () => {
        if (act === 'fire') {
          this.touchFire = false
          this.syncFire()
        } else if (act === 'use') this.keys.delete('KeyE')
        else if (act === 'up') this.keys.delete('touch-up')
        else if (act === 'down') this.keys.delete('touch-down')
      }
      btn.addEventListener('pointerup', release)
      btn.addEventListener('pointercancel', release)
      btn.addEventListener('pointerleave', release)
    })
  }
}
