import * as THREE from 'three'
import { AudioBus } from './audio.ts'
import { Destructible, Enemy, Pickup, Player, Projectile, Vehicle, type FightCtx } from './actors.ts'
import { explode, hitscan, type HitWorld } from './combat.ts'
import { clamp, dist2, findClear, rayClosestBox, smoothstep } from './collision.ts'
import { Input } from './input.ts'
import { A } from './landmarks.ts'
import { boardSlots, getMission, MISSIONS } from './missions.ts'
import { formatTime, isUnlocked, loadSave, markComplete, type SaveData } from './save.ts'
import type { EnemySpawn, MissionDef } from './types.ts'
import { Hud, type Mode } from './ui.ts'
import { cooldown, WEAPON_ORDER, WEAPONS } from './weapons.ts'
import { applySky, buildWorld, updateRain, type WorldHandle } from './world.ts'
import { makeHeli, makeJeep, makeTruck } from './models.ts'

const HEADINGS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

interface Runtime {
  def: MissionDef
  step: number
  killCount: number
  survive: number
  interact: number
  abandon: number
  arrivals: number
  elapsed: number
  waves: { step: number; delay: number; enemies: EnemySpawn[]; spawned: boolean }[]
  barrageT: number
  pending: 'win' | 'fail' | null
  reason: string
  pendingT: number
  heliNote: boolean
}

export class Game {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(62, 1, 0.1, 420)
  private world: WorldHandle
  private input: Input
  private audio = new AudioBus()
  private hud: Hud
  private player: Player
  private enemies: Enemy[] = []
  private vehicles: Vehicle[] = []
  private pickups: Pickup[] = []
  private props: Destructible[] = []
  private projectiles: Projectile[] = []
  private tracers: { line: THREE.Line; life: number }[] = []
  private booms: { mesh: THREE.Mesh; light: THREE.PointLight; life: number }[] = []
  private beam: THREE.Mesh
  private dress: THREE.Group
  private dressRotor: THREE.Object3D
  private mode: Mode = 'title'
  private save: SaveData = loadSave()
  private selected = 1
  private rt: Runtime | null = null
  private introT = 0
  private exitFrom: THREE.Vector3 | null = null
  private titleT = 0
  private hitMark = 0
  private hintT = 0
  private pods = 16
  private podCd = 0
  private reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  private flash = 0
  private lastFrame = performance.now()
  private introStart = 0

  constructor() {
    if (MISSIONS.length !== 1 || MISSIONS[0]?.id !== 1) throw new Error('Only contract 1 is in this build')
    const canvas = document.getElementById('view')
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('missing canvas')
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.world = buildWorld(this.scene)
    this.player = new Player(this.scene)
    this.player.rig.group.visible = false
    this.input = new Input(canvas)
    this.input.canLock = () => this.mode === 'play'
    this.hud = new Hud({
      onDeploy: () => {
        this.audio.resume()
        this.audio.blip()
        this.showBoard()
      },
      onHowTo: () => this.hud.toggleHowTo(),
      onSelect: (id) => this.openBrief(id),
      onBoardBack: () => this.setMode('title'),
      onBriefBack: () => this.showBoard(),
      onStart: () => this.beginMission(this.selected),
      onResume: () => this.setMode('play'),
      onRetry: () => this.beginMission(this.selected),
      onAbort: () => {
        this.clearMission()
        this.showBoard()
      },
      onNext: () => this.beginMission(this.selected + 1),
      onWipe: () => {
        this.save = { completed: [] }
        localStorage.removeItem('iron-line-save-v1')
        this.showBoard()
        this.hud.toast('Record wiped.')
      },
      onSkip: () => this.finishIntro(),
    })
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 30, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xe1b15a, transparent: true, opacity: 0.22, depthWrite: false }),
    )
    this.beam.visible = false
    this.scene.add(this.beam)
    const dress = new THREE.Group()
    const heli = makeHeli()
    const jeep = makeJeep()
    const truck = makeTruck()
    jeep.group.position.set(A.jeep.x, 0, A.jeep.z)
    truck.group.position.set(A.truckPark.x, 0, A.truckPark.z)
    dress.add(heli.group, jeep.group, truck.group)
    this.dress = dress
    this.dressRotor = heli.mainRotor ?? new THREE.Group()
    this.scene.add(dress)
    for (let i = 0; i < 36; i++) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe1a0 }))
      line.visible = false
      line.frustumCulled = false
      this.scene.add(line)
      this.tracers.push({ line, life: 0 })
    }
    applySky(this.world, this.scene, 16.5, 'clear')
    this.setMode('title')
    window.addEventListener('resize', () => this.resize())
    this.resize()
    this.renderer.setAnimationLoop(() => this.frame())
  }

  private resize(): void {
    const w = window.innerWidth
    const h = window.innerHeight
    this.camera.aspect = w / Math.max(1, h)
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private setMode(mode: Mode): void {
    this.mode = mode
    this.hud.setMode(mode)
    const menu = mode === 'title' || mode === 'missions' || mode === 'brief'
    this.dress.visible = menu
    this.player.rig.group.visible = mode === 'play' || mode === 'intro'
    if (mode !== 'play') {
      this.input.ignoreUnlock()
      if (document.pointerLockElement) document.exitPointerLock()
    }
  }

  private showBoard(): void {
    this.hud.renderBoard(boardSlots(), this.save)
    this.setMode('missions')
  }

  private openBrief(id: number): void {
    const m = getMission(id)
    if (!m || !isUnlocked(this.save, id)) return
    this.selected = id
    this.audio.blip()
    this.hud.showBrief(m)
    this.setMode('brief')
  }

  private frame(): void {
    const now = performance.now()
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000)
    this.lastFrame = now
    this.hud.tickToast(dt)
    if (this.mode === 'title' || this.mode === 'missions' || this.mode === 'brief') this.updateMenu(dt)
    else if (this.mode === 'intro') this.updateIntro(dt)
    else if (this.mode === 'play') this.updatePlay(dt)
    this.renderer.render(this.scene, this.camera)
    this.input.endFrame()
  }

  private updateMenu(dt: number): void {
    this.titleT += dt
    const a = this.titleT * 0.12
    this.camera.position.set(Math.sin(a) * 34, 12 + Math.sin(this.titleT * 0.4) * 1.5, A.pad.z + Math.cos(a) * 26)
    this.camera.lookAt(A.pad.x, 2, A.pad.z)
    const h = this.titleT * 0.18
    const heli = this.dress.children[0]
    if (heli) {
      heli.position.set(Math.sin(h) * 38, 14, A.pad.z + Math.cos(h) * 18)
      heli.lookAt(heli.position.x + Math.cos(h), 14, heli.position.z - Math.sin(h))
    }
    this.dressRotor.rotation.y += dt * 16
    this.followSun(new THREE.Vector3(A.pad.x, 0, A.pad.z))
    this.audio.setRotor(0.35)
    this.audio.setEngine(0, false)
  }

  private beginMission(id: number): void {
    const def = getMission(id)
    if (!def) return
    this.audio.resume()
    this.clearMission()
    this.selected = id
    this.player.loadout(def.weapons, def.grenades, def.primary)
    const start = findClear(def.start.x, def.start.z, 0.5, this.world.colliders)
    this.player.pos.set(start.x, 0, start.z)
    this.player.yaw = def.start.yaw
    this.player.pitch = 0.06
    this.player.invuln = def.intro ? 0 : 1.5
    this.pods = 16
    this.podCd = 0
    this.hintT = id === 1 ? 12 : 5
    this.rt = {
      def,
      step: 0,
      killCount: 0,
      survive: 0,
      interact: 0,
      abandon: 0,
      arrivals: 0,
      elapsed: 0,
      waves: def.waves.map((w) => ({ ...w, spawned: false })),
      barrageT: def.barrage?.every ?? 5,
      pending: null,
      reason: '',
      pendingT: 0,
      heliNote: false,
    }
    applySky(this.world, this.scene, def.hour, def.weather)
    this.spawnStep(0)
    this.world.wash.visible = false
    if (def.intro) {
      const heli = this.vehicles.find((v) => v.scripted)
      if (heli) {
        heli.pos.set(16, 38, 148)
        heli.yaw = 0
      }
      this.introStart = performance.now()
      this.introT = 0
      this.exitFrom = null
      this.setMode('intro')
      this.hud.subtitle('Kesh Valley — forward pad')
    } else {
      this.player.syncVisual()
      this.setMode('play')
      this.hud.subtitle('')
      this.hud.toast(def.steps[0]?.label ?? def.objective)
    }
  }

  private spawnStep(step: number): void {
    const def = this.rt?.def
    if (!def) return
    for (const s of def.enemies) if ((s.step ?? 0) === step) this.enemies.push(new Enemy(this.scene, s, def.id, this.world.colliders))
    for (const s of def.vehicles) {
      if ((s.step ?? 0) !== step) continue
      const v = new Vehicle(this.scene, s)
      v.onlyHeli = def.heliOnly.includes(v.tag)
      this.vehicles.push(v)
    }
    for (const s of def.pickups) {
      if ((s.step ?? 0) !== step) continue
      this.pickups.push(new Pickup(this.scene, s.kind, s.x, s.z, s.step ?? 0))
    }
    for (const s of def.props) {
      if ((s.step ?? 0) !== step) continue
      this.props.push(new Destructible(this.scene, s))
    }
  }

  private clearMission(): void {
    for (const e of this.enemies) e.remove()
    for (const v of this.vehicles) v.remove()
    for (const p of this.pickups) p.remove()
    for (const p of this.props) p.remove()
    for (const p of this.projectiles) p.remove()
    this.enemies = []
    this.vehicles = []
    this.pickups = []
    this.props = []
    this.projectiles = []
    this.rt = null
    this.beam.visible = false
    this.player.vehicle = null
  }

  private updateIntro(dt: number): void {
    this.introT = (performance.now() - this.introStart) / 1000
    const heli = this.vehicles.find((v) => v.tag === 'insert-heli')
    const t = this.introT
    if (this.input.skipEdge && t > 0.45) {
      this.finishIntro()
      return
    }
    if (!heli) {
      this.finishIntro()
      return
    }
    if (t < 5.6) {
      const u = smoothstep(t / 5.6)
      heli.pos.set(16 + (0 - 16) * u, 38 + (8 - 38) * u, 148 + (64 - 148) * u)
    } else if (t < 7.7) {
      const u = smoothstep((t - 5.6) / 2.1)
      heli.pos.set(0, 8 * (1 - u), 64 + (56 - 64) * u)
    } else heli.pos.set(A.pad.x, 0, A.pad.z)
    heli.yaw = 0
    heli.landed = heli.pos.y < 0.2
    const ride = t < 7.7
    if (ride) {
      const right = heli.right()
      this.player.pos.set(heli.pos.x + right.x * 1.85, heli.pos.y + 0.05, heli.pos.z + right.z * 1.85)
      this.player.yaw = heli.yaw
      this.exitFrom = null
    } else if (t < 9.5) {
      if (!this.exitFrom) this.exitFrom = this.player.pos.clone()
      const u = smoothstep((t - 7.7) / 1.8)
      this.player.pos.lerpVectors(this.exitFrom, new THREE.Vector3(2.6, 0, 53.2), u)
      this.player.yaw = 0
    } else {
      this.finishIntro()
      return
    }
    this.player.alive = true
    this.player.syncVisual()
    for (const v of this.vehicles) v.update(this.ctx(dt), null)
    this.washAt(heli.pos)
    if (t < 7.7) {
      this.camera.position.set(heli.pos.x + 9, heli.pos.y + 6.2, heli.pos.z + 15)
      const shake = this.reduceMotion ? 0 : Math.sin(t * 37) * (heli.pos.y < 6 ? 0.08 : 0.03)
      this.camera.position.y += shake
      this.camera.lookAt(heli.pos.x, heli.pos.y + 1.6, heli.pos.z)
    } else this.updateCamera()
    this.followSun(heli.pos)
    this.audio.setRotor(heli.pos.y > 1 ? 1 : 0.4)
    const lines = [
      [0.4, 'Kesh Valley — forward pad'],
      [2.3, 'Iron Line, this is Dustoff. The pad is hot.'],
      [4.8, 'We are coming in. Hold the rails.'],
      [7.5, 'Skids down. Out. Move.'],
    ] as const
    let line = ''
    for (const [at, text] of lines) if (t >= at) line = text
    this.hud.subtitle(line)
    this.hud.playHud(this.hudData())
  }

  private finishIntro(): void {
    const heli = this.vehicles.find((v) => v.tag === 'insert-heli')
    if (heli) {
      heli.scripted = false
      heli.pos.set(A.pad.x, 0, A.pad.z)
      heli.yaw = 0
      heli.vy = 0
      heli.landed = true
      heli.syncMesh(0.4, 0.016)
    }
    const spot = findClear(2.6, 53.2, 0.45, this.world.colliders)
    this.player.pos.set(spot.x, 0, spot.z)
    this.player.yaw = 0
    this.player.pitch = -0.04
    this.player.invuln = 2
    this.player.vehicle = null
    this.player.syncVisual()
    this.hud.subtitle('')
    this.updateCamera()
    this.setMode('play')
    this.hud.toast('Eliminate the reception.')
  }

  private updatePlay(dt: number): void {
    const rt = this.rt
    if (!rt) return
    if (this.input.pauseEdge) {
      this.setMode('pause')
      return
    }
    this.applyLook(dt)
    const ctx = this.ctx(dt)
    if (rt.pending) {
      rt.pendingT -= dt
      this.updateCamera()
      this.fadeFx(dt)
      if (rt.pendingT <= 0) this.showOutcome()
      return
    }
    rt.elapsed += dt
    this.player.invuln = Math.max(0, this.player.invuln - dt)
    this.player.hurtFlash = Math.max(0, this.player.hurtFlash - dt)
    this.player.grenadeCd = Math.max(0, this.player.grenadeCd - dt)
    this.player.fireCd = Math.max(0, this.player.fireCd - dt)
    this.podCd = Math.max(0, this.podCd - dt)
    this.hitMark = Math.max(0, this.hitMark - dt)
    this.hintT = Math.max(0, this.hintT - dt)
    if (this.player.reloadT > 0 && this.player.alive) {
      this.player.reloadT -= dt
      if (this.player.reloadT <= 0) this.finishReload()
    }

    const veh = this.player.vehicle
    if (veh && (veh.destroyed || !this.vehicles.includes(veh))) this.player.vehicle = null
    if (this.player.alive) {
      if (this.player.vehicle) {
        this.player.vehicle.occupied = true
        this.player.vehicle.update(ctx, {
          forward: this.input.forward,
          strafe: this.input.strafe,
          climb: this.input.climb,
          descend: this.input.descend,
          brake: this.input.climb && this.player.vehicle.kind !== 'heli',
          lookYaw: this.player.yaw,
        })
        this.player.pos.copy(this.player.vehicle.pos)
        this.player.rig.group.visible = false
      } else {
        this.player.updateFoot(dt, this.input.forward, this.input.strafe, this.input.sprint, this.world.colliders)
        this.player.rig.group.visible = true
      }
      this.tryBoard()
      this.tryFire()
    }

    for (const v of this.vehicles) {
      if (v === this.player.vehicle) continue
      v.update(ctx, null)
    }
    for (const e of this.enemies) e.update(ctx)
    this.updateProjectiles(dt)
    this.updatePickups(dt)
    this.updateBarrage(dt)
    this.updateWaves(dt)
    this.evaluateMission(dt)
    this.updateCamera()
    this.followSun(this.player.pos)
    updateRain(this.world, dt, this.player.pos)
    this.updateFlashlight()
    this.audioBeds()
    this.fadeFx(dt)
    const lowHeli = [...this.vehicles].filter((v) => v.kind === 'heli' && !v.destroyed).sort((a, b) => a.pos.y - b.pos.y)[0]
    if (lowHeli) this.washAt(lowHeli.pos)
    else this.world.wash.visible = false
    this.hud.subtitle(this.player.alive ? '' : 'Killed in action.')
    this.hud.playHud(this.hudData())
    this.drawMarker()
    this.drawMap()
    if (!this.player.alive) this.fail('Killed in action.')
  }

  private applyLook(dt: number): void {
    const look = this.input.consumeLook()
    this.player.yaw += look.x
    this.player.pitch -= look.y
    const turn = (this.input.keys.has('ArrowRight') ? 1 : 0) - (this.input.keys.has('ArrowLeft') ? 1 : 0)
    const nod = (this.input.keys.has('ArrowUp') ? 1 : 0) - (this.input.keys.has('ArrowDown') ? 1 : 0)
    const qe = (this.input.keys.has('KeyE') && !this.nearInteract() ? 1 : 0) - (this.input.keys.has('KeyQ') ? 1 : 0)
    this.player.yaw += (turn + qe) * dt * 1.7
    this.player.pitch += nod * dt * 1.35
    this.player.pitch = clamp(this.player.pitch, -0.95, 0.85)
  }

  private tryBoard(): void {
    if (!this.input.useEdge) return
    const current = this.player.vehicle
    if (current) {
      current.occupied = false
      this.player.vehicle = null
      const right = current.right()
      const spot = findClear(current.pos.x + right.x * 2.4, current.pos.z + right.z * 2.4, 0.45, this.world.colliders)
      this.player.pos.set(spot.x, 0, spot.z)
      this.player.syncVisual()
      this.audio.blip()
      return
    }
    const near = this.nearestBoardable()
    if (!near) return
    near.occupied = true
    this.player.vehicle = near
    this.player.reloadT = 0
    this.player.yaw = near.yaw
    this.audio.blip()
    if (near.kind === 'heli') this.hud.toast('Space climbs. C descends. Rockets are armed.')
  }

  private nearestBoardable(): Vehicle | null {
    let best: Vehicle | null = null
    let bestD = 1e9
    for (const v of this.vehicles) {
      if (!v.boardable) continue
      const reach = v.kind === 'heli' ? 5.5 : 3.4
      const d = dist2(this.player.pos.x, this.player.pos.z, v.pos.x, v.pos.z)
      if (d < reach && d < bestD) {
        best = v
        bestD = d
      }
    }
    return best
  }

  private tryFire(): void {
    if (!this.player.alive || !this.rt || this.rt.pending) return
    const veh = this.player.vehicle
    if (veh?.kind === 'heli') {
      if ((this.input.fire || this.input.fireEdge) && this.podCd <= 0) {
        if (this.pods <= 0) {
          if (this.input.fireEdge) this.audio.dry()
          return
        }
        this.pods -= 1
        this.podCd = 0.48
        const dir = new THREE.Vector3()
        this.camera.getWorldDirection(dir)
        const origin = this.camera.position.clone().addScaledVector(dir, 1.2)
        this.spawnProjectile('rocket', origin, dir.multiplyScalar(46), 'heli')
        this.audio.gun('rocket')
      }
      return
    }
    if (this.input.reloadEdge) this.startReload()
    if (this.input.weaponSlot) {
      const id = WEAPON_ORDER[this.input.weaponSlot - 1]
      if (id) this.player.switchTo(id)
    }
    if (this.input.nextWeaponEdge || this.input.wheel) this.player.cycle(this.input.wheel < 0 || this.input.nextWeaponEdge ? -1 : 1)
    if (this.input.grenadeEdge) this.throwGrenade()
    const stats = WEAPONS[this.player.current]
    const pulled = stats.auto ? this.input.fire : this.input.fireEdge
    if (!pulled || this.player.fireCd > 0 || this.player.reloadT > 0) return
    if (this.player.mag[this.player.current] <= 0) {
      if (this.player.reserve[this.player.current] > 0) this.startReload()
      else if (this.input.fireEdge) this.audio.dry()
      return
    }
    this.player.mag[this.player.current] -= 1
    this.player.fireCd = cooldown(stats.rpm)
    const dir = new THREE.Vector3()
    this.camera.getWorldDirection(dir)
    const origin = this.camera.position.clone()
    if (stats.projectile) {
      this.spawnProjectile('rocket', origin, dir.multiplyScalar(42), 'player')
    } else {
      hitscan(origin, dir, stats.spread, stats.pellets, stats.range, stats.damage, 'player', this.hitWorld())
    }
    this.audio.gun(this.player.current)
    this.alertGunfire()
    if (this.player.mag[this.player.current] <= 0 && this.player.reserve[this.player.current] > 0) this.startReload()
  }

  private throwGrenade(): void {
    if (this.player.grenades <= 0 || this.player.grenadeCd > 0) return
    this.player.grenades -= 1
    this.player.grenadeCd = 0.45
    const dir = new THREE.Vector3()
    this.camera.getWorldDirection(dir)
    const origin = this.player.pos.clone().add(new THREE.Vector3(0, 1.4, 0)).addScaledVector(dir, 0.6)
    const vel = dir.multiplyScalar(16).add(new THREE.Vector3(0, 7, 0))
    this.spawnProjectile('grenade', origin, vel, 'player')
    this.audio.gun('shotgun')
  }

  private spawnProjectile(kind: 'rocket' | 'grenade', pos: THREE.Vector3, vel: THREE.Vector3, source: 'player' | 'heli'): void {
    this.projectiles.push(new Projectile(this.scene, kind, pos, vel, source))
  }

  private startReload(): void {
    const id = this.player.current
    const stats = WEAPONS[id]
    if (this.player.reloadT > 0) return
    if (this.player.mag[id] >= stats.mag) return
    if (this.player.reserve[id] <= 0) {
      this.audio.dry()
      return
    }
    this.player.reloadT = stats.reload
    this.audio.reload()
  }

  private finishReload(): void {
    const id = this.player.current
    const stats = WEAPONS[id]
    const need = stats.mag - this.player.mag[id]
    const take = Math.min(need, this.player.reserve[id])
    this.player.mag[id] += take
    this.player.reserve[id] -= take
    this.audio.reloadDone()
  }

  private alertGunfire(): void {
    for (const e of this.enemies) {
      if (!e.alive || e.team !== 'hostile') continue
      if (dist2(e.pos.x, e.pos.z, this.player.pos.x, this.player.pos.z) < 40) {
        e.alert = true
        e.loseTimer = 0
      }
    }
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      if (!p.alive) continue
      p.armed += dt
      p.life -= dt
      p.vel.y -= (p.kind === 'grenade' ? 13 : 2.2) * dt
      const next = p.pos.clone().addScaledVector(p.vel, dt)
      if (p.kind === 'rocket' && p.armed > 0.1) {
        const dir = p.vel.clone().normalize()
        const hit = rayClosestBox(p.pos.x, p.pos.y, p.pos.z, dir.x, dir.y, dir.z, p.vel.length() * dt + 0.3, this.world.colliders)
        const struck = this.projectileStrike(next)
        if (hit !== null || struck || next.y <= 0.25 || p.life <= 0) {
          this.detonate(p, hit !== null ? p.pos.clone().addScaledVector(dir, hit) : next)
          continue
        }
      }
      if (p.kind === 'grenade' && next.y <= 0.2) {
        next.y = 0.2
        p.vel.y = Math.abs(p.vel.y) * 0.38
        p.vel.x *= 0.62
        p.vel.z *= 0.62
      }
      p.pos.copy(next)
      p.mesh.position.copy(p.pos)
      if (p.vel.lengthSq() > 0.1) p.mesh.lookAt(p.pos.clone().add(p.vel))
      if (p.kind === 'grenade' && p.life <= 0) this.detonate(p, p.pos.clone())
    }
    this.projectiles = this.projectiles.filter((p) => p.alive)
  }

  private projectileStrike(pos: THREE.Vector3): boolean {
    for (const e of this.enemies) {
      if (e.alive && e.team === 'hostile' && pos.distanceTo(e.pos) < 1.3) return true
    }
    for (const v of this.vehicles) {
      if (!v.destroyed && v.team === 'hostile' && pos.distanceTo(v.pos) < v.radius) return true
    }
    for (const prop of this.props) {
      if (prop.alive && Math.hypot(pos.x - prop.pos.x, pos.z - prop.pos.z) < 1.3) return true
    }
    return false
  }

  private detonate(p: Projectile, at: THREE.Vector3): void {
    if (!p.alive) return
    p.alive = false
    p.remove()
    explode(at, p.radius, p.damage, p.source, this.hitWorld())
    this.boom(at, p.radius)
    this.audio.explosion()
  }

  private updatePickups(dt: number): void {
    const t = performance.now() * 0.001
    for (const p of this.pickups) {
      if (p.taken) continue
      p.update(t)
      void dt
      if (!this.player.alive) continue
      if (dist2(this.player.pos.x, this.player.pos.z, p.pos.x, p.pos.z) < 1.7) {
        p.taken = true
        p.remove()
        if (p.kind === 'health') {
          this.player.heal(45)
          this.hud.toast('Medkit. You can still bleed later.')
        } else if (p.kind === 'grenade') {
          this.player.grenades = Math.min(6, this.player.grenades + 2)
          this.hud.toast('Two more frags.')
        } else {
          this.player.resupply()
          this.hud.toast('Ammunition.')
        }
        this.audio.blip()
      }
    }
  }

  private updateBarrage(dt: number): void {
    const rt = this.rt
    if (!rt?.def.barrage) return
    rt.barrageT -= dt
    if (rt.barrageT > 0) return
    rt.barrageT = rt.def.barrage.every
    const n = this.vehicles.filter((v) => v.tag === rt.def.barrage?.from && !v.destroyed).length
    const target = this.props.find((p) => p.tag === rt.def.barrage?.target && p.alive)
    if (n > 0 && target) {
      const dead = target.hurt(rt.def.barrage.damage * n, 'world')
      this.boom(target.pos.clone().add(new THREE.Vector3(0, 1, 0)), 2)
      this.audio.explosion()
      if (dead) this.boom(target.pos.clone(), 4)
    }
  }

  private updateWaves(dt: number): void {
    const rt = this.rt
    if (!rt) return
    const living = this.enemies.filter((e) => e.alive && e.team === 'hostile').length
    for (const w of rt.waves) {
      if (w.spawned || w.step !== rt.step) continue
      w.delay -= dt
      if (w.delay > 0) continue
      if (living > 12) {
        w.delay = 0.8
        continue
      }
      for (const s of w.enemies) this.enemies.push(new Enemy(this.scene, s, rt.def.id, this.world.colliders))
      w.spawned = true
    }
  }

  private evaluateMission(dt: number): void {
    const rt = this.rt
    if (!rt || rt.pending) return
    for (const rule of rt.def.protect) {
      if (rule.untilStep !== undefined && rt.step > rule.untilStep) continue
      if (this.tagState(rule.tag) === 'dead') {
        this.fail(rule.reason)
        return
      }
    }
    const step = rt.def.steps[rt.step]
    if (!step) {
      this.succeed()
      return
    }
    if (step.kind === 'kill' && rt.killCount >= step.need) this.advance()
    else if (step.kind === 'killAll') {
      const pending = rt.waves.some((w) => w.step === rt.step && !w.spawned)
      const left = this.enemies.filter((e) => e.alive && e.team === 'hostile' && (!step.tag || e.tag === step.tag))
      const seen = this.enemies.some((e) => e.team === 'hostile' && (!step.tag || e.tag === step.tag))
      if (!pending && seen && left.length === 0) this.advance()
    } else if (step.kind === 'reach') {
      const pos = this.player.vehicle?.pos ?? this.player.pos
      const height = this.player.vehicle?.pos.y ?? 0
      const okVehicle = !step.vehicle || this.player.vehicle?.kind === step.vehicle
      const okHeight = step.minY === undefined || height >= step.minY
      if (okVehicle && okHeight && dist2(pos.x, pos.z, step.x, step.z) <= step.r) this.advance()
    } else if (step.kind === 'land') {
      const v = this.player.vehicle
      if (v?.kind === 'heli' && v.landed && dist2(v.pos.x, v.pos.z, step.x, step.z) <= step.r) this.advance()
    } else if (step.kind === 'destroy') {
      if (this.tagState(step.tag) === 'dead') this.advance()
    } else if (step.kind === 'escort') {
      const pos = this.tagPosition(step.tag)
      if (pos && dist2(pos.x, pos.z, step.x, step.z) <= step.r) this.advance()
    } else if (step.kind === 'interact') {
      const d = dist2(this.player.pos.x, this.player.pos.z, step.x, step.z)
      const holding = this.input.keys.has('KeyE') && !this.player.vehicle && d <= step.r
      if (holding) rt.interact += dt
      else rt.interact = Math.max(0, rt.interact - dt * 1.4)
      if (rt.interact >= step.seconds) this.advance()
    } else if (step.kind === 'survive') {
      let inside = true
      if (step.zone) {
        const pos = this.player.vehicle?.pos ?? this.player.pos
        inside = dist2(pos.x, pos.z, step.zone.x, step.zone.z) <= step.zone.r
      }
      if (inside) {
        rt.survive += dt
        rt.abandon = 0
      } else {
        rt.abandon += dt
        if (rt.abandon > (step.abandon ?? 99)) {
          this.fail('You left the objective.')
          return
        }
      }
      if (rt.survive >= step.seconds) this.advance()
    }
  }

  private advance(): void {
    const rt = this.rt
    if (!rt || rt.pending) return
    rt.step += 1
    rt.killCount = 0
    rt.survive = 0
    rt.interact = 0
    rt.abandon = 0
    this.spawnStep(rt.step)
    const next = rt.def.steps[rt.step]
    if (!next) this.succeed()
    else this.hud.toast(next.label)
  }

  private succeed(): void {
    const rt = this.rt
    if (!rt || rt.pending) return
    rt.pending = 'win'
    rt.pendingT = 0.85
    rt.reason = rt.def.winLine
    this.audio.sting()
  }

  private fail(reason: string): void {
    const rt = this.rt
    if (!rt || rt.pending) return
    rt.pending = 'fail'
    rt.reason = reason
    rt.pendingT = 1.05
  }

  private showOutcome(): void {
    const rt = this.rt
    if (!rt) return
    const win = rt.pending === 'win'
    if (win) this.save = markComplete(this.save, rt.def.id)
    const stats = `${formatTime(rt.elapsed)} on the ground · ${this.player.kills} hostiles down`
    const canNext = false
    this.hud.showResult(win, rt.def.name, rt.reason, stats, canNext)
    this.input.ignoreUnlock()
    if (document.pointerLockElement) document.exitPointerLock()
    this.mode = 'result'
    this.hud.setMode('result')
    this.player.rig.group.visible = true
  }

  private tagState(tag: string): 'missing' | 'alive' | 'dead' {
    const flags: boolean[] = []
    for (const e of this.enemies) if (e.tag === tag) flags.push(e.alive)
    for (const v of this.vehicles) if (v.tag === tag) flags.push(!v.destroyed)
    for (const p of this.props) if (p.tag === tag) flags.push(p.alive)
    if (flags.length === 0) return 'missing'
    return flags.some(Boolean) ? 'alive' : 'dead'
  }

  private tagPosition(tag: string): THREE.Vector3 | null {
    for (const e of this.enemies) if (e.tag === tag && e.alive) return e.pos
    for (const v of this.vehicles) if (v.tag === tag && !v.destroyed) return v.pos
    for (const p of this.props) if (p.tag === tag && p.alive) return p.pos
    return null
  }

  private onKill = (e: Enemy): void => {
    this.player.kills += 1
    this.hitMark = 0.12
    this.audio.hit()
    const rt = this.rt
    const step = rt?.def.steps[rt.step]
    if (rt && step?.kind === 'kill' && (!step.tag || e.tag === step.tag)) rt.killCount += 1
  }

  private onArrival = (e: Enemy): void => {
    const rt = this.rt
    if (!rt?.def.arrivals || e.tag !== rt.def.arrivals.tag || e.counted) return
    e.counted = true
    rt.arrivals += 1
    this.hud.toast(`Spotter on the mast. ${rt.arrivals} / ${rt.def.arrivals.count}`)
    if (rt.arrivals >= rt.def.arrivals.count) this.fail(rt.def.arrivals.reason)
  }

  private onVehicleDead = (v: Vehicle): void => {
    this.boom(v.pos.clone().add(new THREE.Vector3(0, 1, 0)), 5)
    this.audio.explosion()
    if (this.player.vehicle === v) {
      this.player.vehicle = null
      this.player.hp = 0
      this.player.alive = false
      v.occupied = false
    }
  }

  private onPropDead = (p: Destructible): void => {
    this.boom(p.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), 3.5)
    this.audio.explosion()
  }

  private hitWorld(): HitWorld {
    return {
      enemies: this.enemies,
      vehicles: this.vehicles,
      props: this.props,
      colliders: this.world.colliders,
      player: this.player,
      tracer: (a, b, color) => this.tracer(a, b, color),
      impact: (p) => this.spark(p),
      onKill: this.onKill,
      onVehicleDead: this.onVehicleDead,
      onPropDead: this.onPropDead,
    }
  }

  private ctx(dt: number): FightCtx {
    const rt = this.rt
    const hour = rt?.def.hour ?? 12
    const weather = rt?.def.weather ?? 'clear'
    let vision = 1
    if (hour >= 20 || hour < 5.6) vision *= 0.58
    if (weather === 'fog') vision *= 0.48
    if (weather === 'mist') vision *= 0.82
    if (weather === 'storm' || weather === 'rain') vision *= 0.78
    return {
      dt,
      time: this.titleT,
      colliders: this.world.colliders,
      cover: this.world.cover,
      player: this.player,
      enemies: this.enemies,
      vehicles: this.vehicles,
      visionMul: vision,
      shoot: (from, to, spread, damage, pellets, range) => {
        const dir = to.clone().sub(from)
        if (dir.lengthSq() < 1e-4) return
        dir.normalize()
        hitscan(from, dir, spread, pellets, range, damage, 'enemy', this.hitWorld())
      },
      onArrival: this.onArrival,
    }
  }

  private updateCamera(): void {
    const veh = this.player.vehicle
    const yaw = this.player.yaw
    const pitch = this.player.pitch
    const look = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
    const right = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw))
    const pivotY = veh ? (veh.kind === 'heli' ? 2.4 : veh.kind === 'truck' ? 2.5 : 1.9) : 1.5
    const dist = veh ? (veh.kind === 'heli' ? 9.5 : veh.kind === 'truck' ? 7.4 : 5.8) : 3.8
    const shoulder = veh ? 0.15 : 0.7
    const pivot = this.player.pos.clone().add(new THREE.Vector3(0, pivotY, 0))
    const aim = pivot.clone().addScaledVector(look, 20)
    let desired = pivot.clone().addScaledVector(look, -dist).addScaledVector(right, shoulder).add(new THREE.Vector3(0, 0.35, 0))
    const offset = desired.clone().sub(pivot)
    const len = offset.length() || 1
    offset.multiplyScalar(1 / len)
    const hit = rayClosestBox(pivot.x, pivot.y, pivot.z, offset.x, offset.y, offset.z, len, this.world.colliders)
    if (hit !== null) desired = pivot.clone().addScaledVector(offset, Math.max(0.85, hit - 0.3))
    if (desired.y < 0.45) desired.y = 0.45
    this.camera.position.copy(desired)
    this.camera.lookAt(aim)
    if (!veh) this.player.rig.group.visible = desired.distanceTo(pivot) > 1.05
  }

  private followSun(focus: THREE.Vector3): void {
    this.world.sun.position.set(focus.x + this.world.sunOffset.x, this.world.sunOffset.y, focus.z + this.world.sunOffset.z)
    this.world.sun.target.position.set(focus.x, 0, focus.z)
    this.world.sun.target.updateMatrixWorld()
  }

  private updateFlashlight(): void {
    const spot = this.world.flashlight
    if (!this.world.flashOn) {
      spot.intensity = 0
      return
    }
    const dir = new THREE.Vector3()
    this.camera.getWorldDirection(dir)
    spot.position.copy(this.camera.position)
    spot.target.position.copy(this.camera.position).addScaledVector(dir, 12)
    spot.target.updateMatrixWorld()
  }

  private audioBeds(): void {
    const heli = this.player.vehicle?.kind === 'heli' ? this.player.vehicle : this.vehicles.find((v) => v.kind === 'heli' && !v.destroyed)
    if (heli) {
      const d = dist2(this.player.pos.x, this.player.pos.z, heli.pos.x, heli.pos.z)
      const near = this.player.vehicle === heli ? 1 : Math.max(0, 1 - d / 40)
      this.audio.setRotor(near * (heli.landed && this.player.vehicle !== heli ? 0.25 : 1))
    } else this.audio.setRotor(0)
    const ground = this.player.vehicle && this.player.vehicle.kind !== 'heli' ? this.player.vehicle : null
    this.audio.setEngine(ground ? Math.min(1, Math.abs(ground.speed) / 10 + 0.15) : 0, ground?.kind === 'truck')
  }

  private washAt(pos: THREE.Vector3): void {
    const closeness = 1 - clamp(pos.y / 8, 0, 1)
    this.world.wash.visible = closeness > 0.04
    this.world.wash.position.set(pos.x, 0.06, pos.z)
    this.world.wash.scale.setScalar(4 + closeness * 10)
    this.world.washMat.opacity = closeness * 0.4
  }

  private tracer(a: THREE.Vector3, b: THREE.Vector3, color: number): void {
    const slot = this.tracers.find((t) => t.life <= 0) ?? this.tracers[0]
    if (!slot) return
    const attr = slot.line.geometry.getAttribute('position') as THREE.BufferAttribute
    attr.setXYZ(0, a.x, a.y, a.z)
    attr.setXYZ(1, b.x, b.y, b.z)
    attr.needsUpdate = true
    const mat = slot.line.material
    if (mat instanceof THREE.LineBasicMaterial) mat.color.setHex(color)
    slot.line.visible = true
    slot.life = 0.06
  }

  private spark(p: THREE.Vector3): void {
    this.flash = Math.max(this.flash, 0.04)
    void p
  }

  private boom(at: THREE.Vector3, radius: number): void {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff7a32, transparent: true, opacity: 0.85 }),
    )
    mesh.position.copy(at)
    const light = new THREE.PointLight(0xff6a2a, 8, radius * 4)
    light.position.copy(at)
    this.scene.add(mesh, light)
    this.booms.push({ mesh, light, life: 0.35 })
    void radius
  }

  private fadeFx(dt: number): void {
    for (const t of this.tracers) {
      if (t.life <= 0) continue
      t.life -= dt
      if (t.life <= 0) t.line.visible = false
    }
    for (const b of this.booms) {
      b.life -= dt
      const u = Math.max(0, b.life / 0.35)
      b.mesh.scale.setScalar((1 - u) * 6 + 0.4)
      const mat = b.mesh.material
      if (mat instanceof THREE.MeshBasicMaterial) mat.opacity = u
      b.light.intensity = u * 10
      if (b.life <= 0) {
        b.mesh.geometry.dispose()
        if (b.mesh.material instanceof THREE.Material) b.mesh.material.dispose()
        b.mesh.removeFromParent()
        b.light.removeFromParent()
      }
    }
    this.booms = this.booms.filter((b) => b.life > 0)
    const m = this.markerPos()
    if (m && this.mode === 'play') {
      this.beam.visible = true
      this.beam.position.set(m.x, 15, m.z)
    } else this.beam.visible = false
  }

  private objectiveLine(): { text: string; sub: string } {
    const rt = this.rt
    if (!rt) return { text: '', sub: '' }
    const step = rt.def.steps[rt.step]
    if (!step) return { text: rt.def.objective, sub: '' }
    if (step.kind === 'kill') return { text: step.label, sub: `${rt.killCount} / ${step.need}` }
    if (step.kind === 'killAll') {
      const left = this.enemies.filter((e) => e.alive && e.team === 'hostile' && (!step.tag || e.tag === step.tag)).length
      return { text: step.label, sub: left ? `${left} still standing` : 'Clear' }
    }
    if (step.kind === 'survive') return { text: step.label, sub: `${Math.ceil(rt.survive)}s / ${step.seconds}s${rt.abandon > 0.2 ? ' · get back' : ''}` }
    if (step.kind === 'destroy') {
      const left = this.countTag(step.tag)
      return { text: step.label, sub: `${left} left` }
    }
    if (step.kind === 'interact') return { text: step.label, sub: 'Hold E on the marker' }
    return { text: step.label, sub: '' }
  }

  private countTag(tag: string): number {
    let n = 0
    for (const e of this.enemies) if (e.tag === tag && e.alive) n++
    for (const v of this.vehicles) if (v.tag === tag && !v.destroyed) n++
    for (const p of this.props) if (p.tag === tag && p.alive) n++
    return n
  }

  private markerPos(): THREE.Vector3 | null {
    const rt = this.rt
    if (!rt) return null
    const step = rt.def.steps[rt.step]
    if (!step) return null
    if (step.kind === 'reach' || step.kind === 'land') return new THREE.Vector3(step.x, 1, step.z)
    if (step.kind === 'interact') return new THREE.Vector3(step.x, 1, step.z)
    if (step.kind === 'survive' && step.zone) return new THREE.Vector3(step.zone.x, 1, step.zone.z)
    if (step.kind === 'escort') return new THREE.Vector3(step.x, 1, step.z)
    if (step.kind === 'destroy') return this.nearestTagged(step.tag)
    if (step.kind === 'kill') return this.nearestEnemy(step.tag)
    if (step.kind === 'killAll') return this.nearestEnemy(step.tag)
    return null
  }

  private nearestEnemy(tag?: string): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null
    let bestD = 1e9
    for (const e of this.enemies) {
      if (!e.alive || e.team !== 'hostile') continue
      if (tag && e.tag !== tag) continue
      const d = dist2(this.player.pos.x, this.player.pos.z, e.pos.x, e.pos.z)
      if (d < bestD) {
        bestD = d
        best = e.pos.clone()
      }
    }
    return best
  }

  private nearestTagged(tag: string): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null
    let bestD = 1e9
    const consider = (pos: THREE.Vector3) => {
      const d = dist2(this.player.pos.x, this.player.pos.z, pos.x, pos.z)
      if (d < bestD) {
        bestD = d
        best = pos.clone()
      }
    }
    for (const e of this.enemies) if (e.alive && e.tag === tag) consider(e.pos)
    for (const v of this.vehicles) if (!v.destroyed && v.tag === tag) consider(v.pos)
    for (const p of this.props) if (p.alive && p.tag === tag) consider(p.pos)
    return best
  }

  private drawMarker(): void {
    const pos = this.markerPos()
    if (!pos || this.mode !== 'play') {
      this.hud.setMarker(0, 0, '', false, 0)
      return
    }
    const projected = pos.clone().project(this.camera)
    const w = window.innerWidth
    const h = window.innerHeight
    const behind = projected.z > 1
    let x = (projected.x * 0.5 + 0.5) * w
    let y = (-projected.y * 0.5 + 0.5) * h
    let dx = x - w / 2
    let dy = y - h / 2
    if (behind) {
      dx *= -1
      dy *= -1
    }
    const ang = Math.atan2(dy, dx)
    const margin = 36
    const on = !behind && x > margin && x < w - margin && y > margin && y < h - margin
    if (!on) {
      x = w / 2 + Math.cos(ang) * (w * 0.42)
      y = h / 2 + Math.sin(ang) * (h * 0.36)
    }
    const dist = Math.round(dist2(this.player.pos.x, this.player.pos.z, pos.x, pos.z))
    this.hud.setMarker(x, y, `${dist}m`, true, ang + Math.PI / 2)
  }

  private drawMap(): void {
    const canvas = document.getElementById('minimap')
    if (!(canvas instanceof HTMLCanvasElement)) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(18, 16, 12, 0.55)'
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2)
    ctx.fill()
    const scale = w / 170
    const px = this.player.pos.x
    const pz = this.player.pos.z
    const map = (x: number, z: number) => ({ x: w / 2 + (x - px) * scale, y: h / 2 + (z - pz) * scale })
    ctx.strokeStyle = 'rgba(90, 90, 86, 0.9)'
    ctx.lineWidth = 4
    const road = (x1: number, z1: number, x2: number, z2: number) => {
      const a = map(x1, z1)
      const b = map(x2, z2)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
    road(0, -148, 0, 88)
    road(-100, 0, 100, 0)
    road(-90, -70, 100, -70)
    const mark = this.markerPos()
    if (mark) {
      const p = map(mark.x, mark.z)
      ctx.fillStyle = '#e1b15a'
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6)
    }
    for (const v of this.vehicles) {
      if (v.destroyed) continue
      const p = map(v.pos.x, v.pos.z)
      ctx.fillStyle = v.team === 'hostile' ? '#e15a3a' : '#7eb6d6'
      ctx.fillRect(p.x - 2, p.y - 2, 5, 5)
    }
    for (const e of this.enemies) {
      if (!e.alive) continue
      const p = map(e.pos.x, e.pos.z)
      ctx.fillStyle = e.team === 'friendly' ? '#9dcc6a' : '#e15a3a'
      ctx.fillRect(p.x - 2, p.y - 2, 3, 3)
    }
    ctx.save()
    ctx.translate(w / 2, h / 2)
    ctx.rotate(this.player.yaw)
    ctx.fillStyle = '#f3ead7'
    ctx.beginPath()
    ctx.moveTo(0, -7)
    ctx.lineTo(5, 6)
    ctx.lineTo(0, 3)
    ctx.lineTo(-5, 6)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  private hudData() {
    const rt = this.rt
    const line = this.objectiveLine()
    const veh = this.player.vehicle
    const inHeli = veh?.kind === 'heli'
    const id = this.player.current
    const stats = WEAPONS[id]
    const near = !veh ? this.nearestBoardable() : null
    let prompt = ''
    if (veh) prompt = 'F  Dismount'
    else if (near) prompt = `F  Board ${near.kind === 'heli' ? 'helicopter' : near.kind === 'truck' ? 'armored truck' : 'jeep'}`
    else if (this.nearInteract()) prompt = 'Hold E'
    const vipFar = this.enemies.some((e) => e.tag === 'vip' && e.alive && dist2(e.pos.x, e.pos.z, this.player.pos.x, this.player.pos.z) > 16)
    if (vipFar) prompt = 'Stay with the package'
    const headingDeg = ((this.player.yaw * 180) / Math.PI + 360) % 360
    const heading = `${HEADINGS[Math.round(headingDeg / 45) % 8]} ${Math.round(headingDeg).toString().padStart(3, '0')}`
    const step = rt?.def.steps[rt.step]
    const channel = step?.kind === 'interact' && rt ? rt.interact / step.seconds : 0
    return {
      kicker: rt ? `Contract ${rt.def.id.toString().padStart(2, '0')} · ${rt.def.name}` : '',
      objective: line.text,
      sub: line.sub,
      heading,
      hp: this.player.hp,
      weapon: inHeli ? 'Rocket pods' : stats.name,
      mag: inHeli ? `${this.pods}` : `${this.player.mag[id]}`,
      reserve: inHeli ? '' : ` / ${this.player.reserve[id]}`,
      grenades: this.player.grenades,
      reload: this.player.reloadT > 0 ? 1 - this.player.reloadT / stats.reload : 0,
      prompt,
      channel,
      channelLabel: channel > 0 ? 'Planting charge' : '',
      vehicle: veh && !veh.destroyed ? `${veh.kind.toUpperCase()}  ${Math.ceil((veh.hp / veh.maxHp) * 100)}%` : '',
      weapons: inHeli
        ? []
        : this.player.weapons.map((w) => ({
            key: String(WEAPON_ORDER.indexOf(w) + 1),
            name: WEAPONS[w].short,
            on: w === id,
          })),
      hurt: this.player.hurtFlash,
      hit: this.hitMark > 0,
      showHint: this.hintT > 0 && this.mode === 'play',
    }
  }

  private nearInteract(): boolean {
    const rt = this.rt
    const step = rt?.def.steps[rt.step]
    if (step?.kind !== 'interact') return false
    return dist2(this.player.pos.x, this.player.pos.z, step.x, step.z) <= step.r + 0.4
  }
}
