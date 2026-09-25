import * as THREE from 'three'
import {
  circleBlocked,
  clamp,
  dist2,
  findClear,
  moveCircle,
  rayClosestBox,
  type Collider,
} from './collision.ts'
import { makeHeli, makeJeep, makePickupMesh, makePropMesh, makeSoldier, makeTruck, setWeaponVisual, type SoldierRig } from './models.ts'
import type { Behavior, DamageSource, EnemyKind, EnemySpawn, PropSpawn, Team, VehicleKind, VehicleSpawn, WeaponId } from './types.ts'
import { WEAPONS, WEAPON_ORDER, missionScale } from './weapons.ts'

const KIND: Record<EnemyKind, { hp: number; speed: number; damage: number; range: number; interval: number; spread: number; pellets: number; vision: number }> = {
  soldier: { hp: 72, speed: 3.35, damage: 8, range: 42, interval: 0.95, spread: 0.07, pellets: 1, vision: 46 },
  officer: { hp: 64, speed: 3.15, damage: 9, range: 50, interval: 1.05, spread: 0.045, pellets: 1, vision: 52 },
  sniper: { hp: 48, speed: 2.5, damage: 16, range: 110, interval: 1.55, spread: 0.015, pellets: 1, vision: 100 },
  heavy: { hp: 140, speed: 2.45, damage: 8, range: 18, interval: 0.72, spread: 0.16, pellets: 5, vision: 28 },
}

export interface FightCtx {
  dt: number
  time: number
  colliders: Collider[]
  cover: { x: number; z: number }[]
  player: Player
  enemies: Enemy[]
  vehicles: Vehicle[]
  visionMul: number
  shoot: (from: THREE.Vector3, to: THREE.Vector3, spread: number, damage: number, pellets: number, range: number) => void
  onArrival: (e: Enemy) => void
}

const _v = new THREE.Vector3()

export class Player {
  pos = new THREE.Vector3(0, 0, 70)
  yaw = 0
  pitch = 0.08
  hp = 100
  alive = true
  radius = 0.42
  vehicle: Vehicle | null = null
  weapons: WeaponId[] = ['pistol', 'ar']
  mag: Record<WeaponId, number> = { pistol: 12, smg: 0, ar: 30, shotgun: 0, sniper: 0, rocket: 0 }
  reserve: Record<WeaponId, number> = { pistol: 48, smg: 0, ar: 90, shotgun: 0, sniper: 0, rocket: 0 }
  current: WeaponId = 'ar'
  grenades = 2
  reloadT = 0
  fireCd = 0
  invuln = 0
  hurtFlash = 0
  kills = 0
  walk = 0
  moving = false
  grenadeCd = 0
  rig: SoldierRig

  constructor(scene: THREE.Scene) {
    this.rig = makeSoldier('player')
    setWeaponVisual(this.rig.gun, 'ar')
    scene.add(this.rig.group)
  }

  loadout(weapons: WeaponId[], grenades: number, primary: WeaponId): void {
    this.weapons = [...weapons]
    this.grenades = grenades
    this.reloadT = 0
    this.fireCd = 0
    this.grenadeCd = 0
    for (const id of WEAPON_ORDER) {
      if (weapons.includes(id)) {
        this.mag[id] = WEAPONS[id].mag
        this.reserve[id] = WEAPONS[id].reserve
      } else {
        this.mag[id] = 0
        this.reserve[id] = 0
      }
    }
    this.current = weapons.includes(primary) ? primary : (weapons[0] ?? 'pistol')
    setWeaponVisual(this.rig.gun, this.current)
    this.hp = 100
    this.alive = true
    this.vehicle = null
    this.kills = 0
    this.rig.group.visible = true
  }

  hurt(amount: number): void {
    if (!this.alive || this.invuln > 0 || this.vehicle) return
    this.hp = Math.max(0, this.hp - amount)
    this.hurtFlash = 0.45
    this.invuln = 0.18
    if (this.hp <= 0) this.alive = false
  }

  heal(amount: number): void {
    if (!this.alive) return
    this.hp = Math.min(100, this.hp + amount)
  }

  resupply(): void {
    for (const id of this.weapons) {
      this.reserve[id] = WEAPONS[id].reserve
      if (this.mag[id] <= 0) this.mag[id] = WEAPONS[id].mag
    }
    this.grenades = Math.min(6, this.grenades + 2)
  }

  switchTo(id: WeaponId): void {
    if (!this.weapons.includes(id) || id === this.current) return
    this.current = id
    this.reloadT = 0
    setWeaponVisual(this.rig.gun, id)
  }

  cycle(dir: number): void {
    if (this.weapons.length === 0) return
    const i = this.weapons.indexOf(this.current)
    const n = (i + dir + this.weapons.length) % this.weapons.length
    const next = this.weapons[n]
    if (next) this.switchTo(next)
  }

  updateFoot(dt: number, forward: number, strafe: number, sprint: boolean, boxes: Collider[]): void {
    if (!this.alive || this.vehicle) {
      this.moving = false
      return
    }
    const speed = (sprint ? 9.1 : 5.7) * (this.reloadT > 0 ? 0.72 : 1)
    const fx = Math.sin(this.yaw)
    const fz = -Math.cos(this.yaw)
    const rx = Math.cos(this.yaw)
    const rz = Math.sin(this.yaw)
    let mx = fx * forward + rx * strafe
    let mz = fz * forward + rz * strafe
    const len = Math.hypot(mx, mz)
    this.moving = len > 0.05
    if (len > 0) {
      mx = (mx / len) * speed * dt
      mz = (mz / len) * speed * dt
      this.walk += dt * speed * 1.3
    }
    const moved = moveCircle(this.pos.x, this.pos.z, mx, mz, this.radius, boxes)
    this.pos.x = moved.x
    this.pos.z = moved.z
    this.pos.y = 0
    this.syncVisual()
  }

  syncVisual(): void {
    const g = this.rig.group
    g.position.set(this.pos.x, this.pos.y, this.pos.z)
    const fx = Math.sin(this.yaw)
    const fz = -Math.cos(this.yaw)
    if (this.alive) g.lookAt(this.pos.x + fx, this.pos.y, this.pos.z + fz)
    const swing = this.moving && this.alive ? Math.sin(this.walk) * 0.65 : 0
    this.rig.leftLeg.rotation.x = swing
    this.rig.rightLeg.rotation.x = -swing
    this.rig.gun.rotation.x = -this.pitch * 0.85
  }

  aimPoint(out: THREE.Vector3): THREE.Vector3 {
    if (this.vehicle) return out.set(this.vehicle.pos.x, this.vehicle.pos.y + 1.3, this.vehicle.pos.z)
    return out.set(this.pos.x, 1.15, this.pos.z)
  }
}

export class Enemy {
  pos = new THREE.Vector3()
  yaw = 0
  hp: number
  maxHp: number
  team: 'hostile' | 'friendly'
  tag: string
  behavior: Behavior
  kind: EnemyKind
  alive = true
  arrived = false
  counted = false
  home = new THREE.Vector3()
  patrol: { x: number; z: number }[]
  patrolIndex = 0
  cooldown: number
  suppressed = 0
  loseTimer = 0
  alert = false
  stuck = 0
  nudge = 0
  nudgeAng = 0
  flash = 0
  deathT = 0
  step: number
  speed: number
  damage: number
  range: number
  spread: number
  pellets: number
  vision: number
  interval: number
  rig: SoldierRig
  bar: THREE.Sprite
  barMat: THREE.SpriteMaterial
  cover: { x: number; z: number } | null = null

  constructor(scene: THREE.Scene, spawn: EnemySpawn, missionId: number, boxes: Collider[]) {
    const kind = spawn.kind ?? 'soldier'
    const base = KIND[kind]
    const scale = missionScale(missionId)
    this.kind = kind
    this.team = spawn.team ?? 'hostile'
    this.tag = spawn.tag ?? ''
    this.behavior = spawn.behavior ?? 'guard'
    this.step = spawn.step ?? 0
    this.maxHp = spawn.hp ?? base.hp * scale
    this.hp = this.maxHp
    this.speed = spawn.speed ?? base.speed
    this.damage = base.damage * (0.85 + scale * 0.35)
    this.range = base.range
    this.spread = Math.max(0.012, base.spread - (missionId - 1) * 0.001)
    this.pellets = base.pellets
    this.vision = base.vision
    this.interval = Math.max(0.5, base.interval * (1.12 - (missionId - 1) * 0.018))
    this.cooldown = Math.random() * this.interval
    this.patrol = spawn.patrol ?? []
    const y = spawn.y ?? 0
    const spot = y > 1 ? { x: spawn.x, z: spawn.z } : findClear(spawn.x, spawn.z, 0.45, boxes)
    this.pos.set(spot.x, y, spot.z)
    this.home.copy(this.pos)
    this.rig = makeSoldier(this.team === 'friendly' ? 'vip' : kind)
    if (this.team === 'friendly') setWeaponVisual(this.rig.gun, 'none')
    else setWeaponVisual(this.rig.gun, kind === 'sniper' ? 'sniper' : kind === 'heavy' ? 'shotgun' : 'ar')
    scene.add(this.rig.group)
    this.barMat = new THREE.SpriteMaterial({ color: this.team === 'friendly' ? 0x7dce6a : 0xd25a3a })
    this.bar = new THREE.Sprite(this.barMat)
    this.bar.position.y = 2.15
    this.bar.scale.set(0.7, 0.07, 1)
    this.rig.group.add(this.bar)
    this.sync()
  }

  hurt(amount: number, source: DamageSource): boolean {
    if (!this.alive) return false
    if (source === 'player' || source === 'heli') {
      if (this.team !== 'hostile') return false
    } else if (source === 'enemy') {
      if (this.team !== 'friendly') return false
    }
    this.hp -= amount
    this.flash = 0.12
    this.suppressed = 1.45
    this.alert = true
    this.loseTimer = 0
    if (this.hp <= 0) {
      this.alive = false
      this.deathT = 0
      this.bar.visible = false
      return true
    }
    return false
  }

  update(ctx: FightCtx): void {
    const dt = ctx.dt
    if (!this.alive) {
      this.deathT += dt
      this.rig.group.rotation.x = Math.min(1.25, this.deathT * 2.4)
      if (this.deathT > 1.3) this.rig.group.position.y = this.pos.y - (this.deathT - 1.3) * 0.35
      return
    }
    this.cooldown -= dt
    this.suppressed = Math.max(0, this.suppressed - dt)
    this.flash = Math.max(0, this.flash - dt)
    this.rig.bodyMat.emissive.setHex(this.flash > 0 ? 0xff2200 : 0x000000)
    this.rig.bodyMat.emissiveIntensity = this.flash > 0 ? 0.7 : 0
    const frac = clamp(this.hp / this.maxHp, 0.05, 1)
    this.bar.scale.set(0.72 * frac, 0.07, 1)

    if (this.behavior === 'follow') {
      this.follow(ctx)
      return
    }

    const target = this.team === 'hostile' ? this.pickTarget(ctx) : null
    const see = target ? this.canSee(ctx, target.point) && target.dist < this.vision * ctx.visionMul : false
    if (see) {
      this.alert = true
      this.loseTimer = 0
      for (const other of ctx.enemies) {
        if (other !== this && other.alive && other.team === 'hostile' && dist2(this.pos.x, this.pos.z, other.pos.x, other.pos.z) < 22) {
          other.alert = true
          other.loseTimer = 0
        }
      }
    } else if (this.alert) {
      this.loseTimer += dt
      if (this.loseTimer > 4) this.alert = false
    }

    if (this.behavior === 'advance') {
      this.advance(ctx)
    } else if (this.behavior === 'sniper') {
      this.holdSniper(ctx, target)
    } else if (this.suppressed > 0.2 && this.pos.y < 0.8) {
      this.moveCover(ctx, target)
    } else if (this.alert && target && this.behavior !== 'patrol') {
      this.engage(ctx, target)
    } else if (this.alert && target && this.behavior === 'patrol') {
      this.engage(ctx, target)
    } else if (this.patrol.length > 0) {
      this.walkPatrol(ctx)
    } else if (dist2(this.pos.x, this.pos.z, this.home.x, this.home.z) > 1.6) {
      this.stepToward(ctx, this.home.x, this.home.z, this.speed * 0.8)
    }

    if (this.behavior === 'guard' && dist2(this.pos.x, this.pos.z, this.home.x, this.home.z) > 18 && this.pos.y < 0.8) {
      this.stepToward(ctx, this.home.x, this.home.z, this.speed)
    }

    if (target && see && this.cooldown <= 0 && target.dist < this.range && this.team === 'hostile') {
      ctx.shoot(this.muzzle(target.point), target.point, this.spread, this.damage, this.pellets, this.range)
      this.cooldown = this.interval * (0.85 + Math.random() * 0.4)
    }
    this.face()
    this.sync()
  }

  private follow(ctx: FightCtx): void {
    const d = dist2(this.pos.x, this.pos.z, ctx.player.pos.x, ctx.player.pos.z)
    if (d > 3.1 && d < 18) this.stepToward(ctx, ctx.player.pos.x, ctx.player.pos.z, d > 7 ? this.speed * 1.25 : this.speed)
    else if (d >= 18) {
      /* wait — the player ran off */
    }
    this.face()
    this.sync()
  }

  private advance(ctx: FightCtx): void {
    if (this.patrol.length === 0) return
    const last = this.patrol[this.patrol.length - 1]
    if (last && !this.arrived && dist2(this.pos.x, this.pos.z, last.x, last.z) < 3.2) {
      this.arrived = true
      ctx.onArrival(this)
    }
    const wp = this.patrol[this.patrolIndex]
    if (!wp) return
    if (dist2(this.pos.x, this.pos.z, wp.x, wp.z) < 1.8) {
      this.patrolIndex = Math.min(this.patrol.length - 1, this.patrolIndex + 1)
    }
    const goal = this.patrol[this.patrolIndex] ?? wp
    this.stepToward(ctx, goal.x, goal.z, this.speed)
  }

  private holdSniper(ctx: FightCtx, target: { point: THREE.Vector3; dist: number } | null): void {
    if (this.pos.y > 0.8) {
      const dx = this.pos.x - this.home.x
      const dz = this.pos.z - this.home.z
      const d = Math.hypot(dx, dz)
      if (d > 1.2) {
        this.pos.x = this.home.x + (dx / d) * 1.2
        this.pos.z = this.home.z + (dz / d) * 1.2
      }
      if (target) this.yaw = Math.atan2(target.point.x - this.pos.x, -(target.point.z - this.pos.z))
      return
    }
    if (target && target.dist < 12) this.stepToward(ctx, this.home.x, this.home.z, this.speed)
  }

  private engage(ctx: FightCtx, target: { point: THREE.Vector3; dist: number }): void {
    const prefer = this.kind === 'heavy' ? 8 : this.kind === 'sniper' ? 26 : 13
    if (target.dist > prefer + 2) this.stepToward(ctx, target.point.x, target.point.z, this.speed)
    else if (target.dist < prefer - 3) {
      const dx = this.pos.x - target.point.x
      const dz = this.pos.z - target.point.z
      this.stepToward(ctx, this.pos.x + dx, this.pos.z + dz, this.speed * 0.8)
    } else {
      const ang = Math.atan2(target.point.x - this.pos.x, -(target.point.z - this.pos.z)) + Math.PI / 2
      this.stepToward(ctx, this.pos.x + Math.sin(ang) * 3, this.pos.z - Math.cos(ang) * 3, this.speed * 0.7)
    }
  }

  private moveCover(ctx: FightCtx, target: { point: THREE.Vector3; dist: number } | null): void {
    if (!this.cover) {
      let best: { x: number; z: number } | null = null
      let bestD = 1e9
      for (const c of ctx.cover) {
        const d = dist2(this.pos.x, this.pos.z, c.x, c.z)
        if (d > 12) continue
        if (target && dist2(c.x, c.z, target.point.x, target.point.z) + 1 < target.dist) continue
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      this.cover = best
    }
    if (this.cover) this.stepToward(ctx, this.cover.x, this.cover.z, this.speed * 1.15)
    else if (target) this.engage(ctx, target)
    if (this.suppressed <= 0) this.cover = null
  }

  private walkPatrol(ctx: FightCtx): void {
    const wp = this.patrol[this.patrolIndex]
    if (!wp) return
    if (dist2(this.pos.x, this.pos.z, wp.x, wp.z) < 1.5) this.patrolIndex = (this.patrolIndex + 1) % this.patrol.length
    const goal = this.patrol[this.patrolIndex] ?? wp
    this.stepToward(ctx, goal.x, goal.z, this.speed * 0.75)
  }

  private stepToward(ctx: FightCtx, tx: number, tz: number, speed: number): void {
    if (this.pos.y > 0.8) return
    let dx = tx - this.pos.x
    let dz = tz - this.pos.z
    const len = Math.hypot(dx, dz) || 1
    dx /= len
    dz /= len
    if (this.nudge > 0) {
      this.nudge -= ctx.dt
      const nx = Math.sin(this.nudgeAng)
      const nz = -Math.cos(this.nudgeAng)
      dx = dx * 0.3 + nx * 0.7
      dz = dz * 0.3 + nz * 0.7
    }
    const sep = this.separate(ctx)
    dx += sep.x
    dz += sep.z
    const mag2 = Math.hypot(dx, dz) || 1
    dx /= mag2
    dz /= mag2
    this.yaw = Math.atan2(dx, -dz)
    let mx = dx * speed * ctx.dt
    let mz = dz * speed * ctx.dt
    if (circleBlocked(this.pos.x + dx * 0.8, this.pos.z + dz * 0.8, 0.42, ctx.colliders)) {
      const side = Math.random() > 0.5 ? 1 : -1
      const sx = dx * 0.4 + -dz * side
      const sz = dz * 0.4 + dx * side
      mx = sx * speed * ctx.dt
      mz = sz * speed * ctx.dt
    }
    const beforeX = this.pos.x
    const beforeZ = this.pos.z
    const moved = moveCircle(this.pos.x, this.pos.z, mx, mz, 0.42, ctx.colliders)
    this.pos.x = moved.x
    this.pos.z = moved.z
    if (Math.hypot(this.pos.x - beforeX, this.pos.z - beforeZ) < speed * ctx.dt * 0.2) {
      this.stuck += ctx.dt
      if (this.stuck > 0.45) {
        this.nudge = 0.55
        this.nudgeAng = Math.random() * Math.PI * 2
        this.stuck = 0
      }
    } else this.stuck = 0
  }

  private separate(ctx: FightCtx): { x: number; z: number } {
    let ox = 0
    let oz = 0
    for (const o of ctx.enemies) {
      if (o === this || !o.alive) continue
      const ddx = this.pos.x - o.pos.x
      const ddz = this.pos.z - o.pos.z
      const d = Math.hypot(ddx, ddz)
      if (d > 0.01 && d < 1.15) {
        ox += (ddx / d) * 0.9
        oz += (ddz / d) * 0.9
      }
    }
    return { x: ox, z: oz }
  }

  private pickTarget(ctx: FightCtx): { point: THREE.Vector3; dist: number } | null {
    let best: { point: THREE.Vector3; dist: number } | null = null
    const consider = (x: number, y: number, z: number) => {
      const d = dist2(this.pos.x, this.pos.z, x, z)
      if (!best || d < best.dist) best = { point: new THREE.Vector3(x, y, z), dist: d }
    }
    if (ctx.player.alive) {
      ctx.player.aimPoint(_v)
      consider(_v.x, _v.y, _v.z)
    }
    for (const e of ctx.enemies) {
      if (e.team === 'friendly' && e.alive) consider(e.pos.x, e.pos.y + 1.1, e.pos.z)
    }
    for (const v of ctx.vehicles) {
      if (!v.destroyed && v.team !== 'hostile') consider(v.pos.x, v.pos.y + 1.2, v.pos.z)
    }
    return best
  }

  private canSee(ctx: FightCtx, point: THREE.Vector3): boolean {
    const from = this.muzzle(point)
    const dir = point.clone().sub(from)
    const dist = dir.length()
    if (dist < 0.2) return true
    dir.multiplyScalar(1 / dist)
    const hit = rayClosestBox(from.x, from.y, from.z, dir.x, dir.y, dir.z, dist - 0.3, ctx.colliders)
    return hit === null
  }

  private muzzle(toward: THREE.Vector3): THREE.Vector3 {
    const dir = toward.clone().sub(new THREE.Vector3(this.pos.x, this.pos.y + 1.45, this.pos.z))
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1)
    dir.normalize()
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.45, this.pos.z).addScaledVector(dir, 1.05)
  }

  private face(): void {
    /* yaw already set by movement; if idle keep */
  }

  private sync(): void {
    if (!this.alive) return
    this.rig.group.position.copy(this.pos)
    const fx = Math.sin(this.yaw)
    const fz = -Math.cos(this.yaw)
    this.rig.group.lookAt(this.pos.x + fx, this.pos.y, this.pos.z + fz)
    const moving = this.alive
    const swing = moving ? Math.sin(this.pos.x * 0.4 + performance.now() * 0.006) * 0.35 : 0
    this.rig.leftLeg.rotation.x = swing
    this.rig.rightLeg.rotation.x = -swing
  }

  remove(): void {
    this.rig.bodyMat.dispose()
    this.barMat.dispose()
    this.rig.group.removeFromParent()
  }
}

export class Vehicle {
  kind: VehicleKind
  pos = new THREE.Vector3()
  yaw = 0
  speed = 0
  vy = 0
  hp: number
  maxHp: number
  team: Team
  tag: string
  occupied = false
  destroyed = false
  scripted = false
  landed = true
  step: number
  onlyHeli = false
  radius: number
  ai: { path: { x: number; z: number }[]; speed: number; index: number; stuck: number } | null
  group: THREE.Group
  wheels: THREE.Mesh[]
  mainRotor: THREE.Group | null
  tailRotor: THREE.Group | null
  cooldown = 1
  smoke = 0

  constructor(scene: THREE.Scene, spawn: VehicleSpawn) {
    this.kind = spawn.kind
    this.team = spawn.team ?? 'player'
    this.tag = spawn.tag ?? ''
    this.step = spawn.step ?? 0
    this.scripted = !!spawn.scripted
    this.yaw = spawn.yaw ?? 0
    const rig = spawn.kind === 'heli' ? makeHeli() : spawn.kind === 'truck' ? makeTruck() : makeJeep()
    this.group = rig.group
    this.wheels = rig.wheels
    this.mainRotor = rig.mainRotor
    this.tailRotor = rig.tailRotor
    this.radius = spawn.kind === 'truck' ? 1.7 : spawn.kind === 'heli' ? 2.1 : 1.25
    const base = spawn.kind === 'truck' ? 640 : spawn.kind === 'heli' ? 280 : 220
    this.maxHp = spawn.hp ?? base
    this.hp = this.maxHp
    this.ai = spawn.ai ? { path: spawn.ai.path, speed: spawn.ai.speed, index: 0, stuck: 0 } : null
    const spot = findClear(spawn.x, spawn.z, this.radius * 0.7, [])
    this.pos.set(spot.x, spawn.kind === 'heli' ? 0 : 0, spot.z)
    scene.add(this.group)
    this.syncMesh(1)
  }

  get boardable(): boolean {
    return !this.destroyed && !this.scripted && this.team === 'player' && !this.occupied
  }

  hurt(amount: number, source: DamageSource): boolean {
    if (this.destroyed) return false
    if (this.onlyHeli && source !== 'heli') return false
    if ((source === 'player' || source === 'heli') && this.team !== 'hostile') return false
    if (source === 'enemy' && this.team === 'hostile') return false
    this.hp -= amount
    if (this.hp <= 0) {
      this.hp = 0
      this.destroyed = true
      this.occupied = false
      this.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const src = obj.material
          const list = Array.isArray(src) ? src : [src]
          const cloned = list.map((m) => {
            if (m instanceof THREE.MeshStandardMaterial) {
              const c = m.clone()
              c.color.set(0x2a2420)
              c.emissive.set(0x3a140c)
              c.emissiveIntensity = 0.25
              return c
            }
            return m
          })
          obj.material = Array.isArray(src) ? cloned : (cloned[0] ?? src)
        }
      })
      this.group.rotation.z = this.kind === 'heli' ? 0.4 : 0.15
      return true
    }
    return false
  }

  update(ctx: FightCtx, drive: { forward: number; strafe: number; climb: boolean; descend: boolean; brake: boolean; lookYaw: number } | null): void {
    const dt = ctx.dt
    if (this.destroyed) {
      this.smoke += dt
      this.syncMesh(0.15, dt)
      return
    }
    if (this.scripted) {
      this.syncMesh(1, dt)
      return
    }
    if (this.occupied && drive) this.drive(ctx, drive)
    else if (this.ai && this.team !== 'player') this.runAi(ctx)
    else if (this.ai && this.team === 'friendly') this.runAi(ctx)
    else {
      this.speed *= Math.max(0, 1 - dt * 1.4)
      this.vy *= Math.max(0, 1 - dt * 1.5)
    }
    if (this.team === 'hostile' && !this.occupied) this.aiShoot(ctx)
    const spinning = this.occupied || this.kind === 'heli' ? 1 : 0.2
    this.syncMesh(this.kind === 'heli' ? (this.landed && !this.occupied ? 0.35 : 1) : spinning, dt)
  }

  private drive(ctx: FightCtx, drive: { forward: number; strafe: number; climb: boolean; descend: boolean; brake: boolean; lookYaw: number }): void {
    const dt = ctx.dt
    if (this.kind === 'heli') {
      this.yaw = drive.lookYaw
      const f = this.forward()
      const r = this.right()
      const accel = 22
      let vx = (f.x * drive.forward + r.x * drive.strafe) * accel
      let vz = (f.z * drive.forward + r.z * drive.strafe) * accel
      this.pos.x += vx * dt
      this.pos.z += vz * dt
      this.pos.x = clamp(this.pos.x, -135, 135)
      this.pos.z = clamp(this.pos.z, -165, 105)
      if (drive.climb) this.vy += 18 * dt
      else if (drive.descend) this.vy -= 18 * dt
      else this.vy *= Math.max(0, 1 - dt * 1.3)
      this.vy = clamp(this.vy, -9, 11)
      this.pos.y += this.vy * dt
      if (this.pos.y <= 0) {
        this.pos.y = 0
        if (this.vy < 0) this.vy = 0
        this.landed = true
      } else {
        this.landed = this.pos.y < 0.35 && Math.abs(this.vy) < 0.4
      }
      this.pos.y = clamp(this.pos.y, 0, 52)
      if (this.pos.y < 1.7) {
        const moved = moveCircle(this.pos.x, this.pos.z, 0, 0, this.radius, ctx.colliders)
        // if overlapping, push
        if (circleBlocked(this.pos.x, this.pos.z, this.radius, ctx.colliders)) {
          const clear = findClear(this.pos.x, this.pos.z, this.radius, ctx.colliders)
          this.pos.x = clear.x
          this.pos.z = clear.z
        }
        void moved
      }
      this.speed = Math.hypot(vx, vz)
      return
    }

    const max = this.kind === 'truck' ? 12.5 : 18
    const accel = this.kind === 'truck' ? 9 : 16
    this.speed += drive.forward * accel * dt
    const drag = drive.brake ? 3.4 : 0.65
    this.speed -= this.speed * dt * drag
    if (Math.abs(drive.forward) < 0.05 && Math.abs(this.speed) < 0.2) this.speed = 0
    this.speed = clamp(this.speed, -max * 0.4, max)
    const dir = this.speed >= -0.2 ? 1 : -1
    this.yaw += drive.strafe * dir * dt * 1.65 * Math.min(1, Math.abs(this.speed) / 4 + 0.2)
    const f = this.forward()
    const mx = f.x * this.speed * dt
    const mz = f.z * this.speed * dt
    const moved = moveCircle(this.pos.x, this.pos.z, mx, mz, this.radius, ctx.colliders)
    if (moved.hit) this.speed *= 0.45
    this.pos.x = moved.x
    this.pos.z = moved.z
    this.pos.y = 0
    this.landed = true
  }

  private runAi(ctx: FightCtx): void {
    const ai = this.ai
    if (!ai || ai.path.length === 0) return
    const wp = ai.path[ai.index % ai.path.length]
    if (!wp) return
    const dx = wp.x - this.pos.x
    const dz = wp.z - this.pos.z
    const d = Math.hypot(dx, dz)
    if (d < 3.2) {
      ai.index = (ai.index + 1) % ai.path.length
      ai.stuck = 0
      return
    }
    const desired = Math.atan2(dx, -dz)
    let diff = desired - this.yaw
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    this.yaw += clamp(diff, -1.4 * ctx.dt, 1.4 * ctx.dt)
    this.speed = ai.speed
    const f = this.forward()
    const before = this.pos.clone()
    const moved = moveCircle(this.pos.x, this.pos.z, f.x * this.speed * ctx.dt, f.z * this.speed * ctx.dt, this.radius, ctx.colliders)
    this.pos.x = moved.x
    this.pos.z = moved.z
    if (before.distanceTo(this.pos) < this.speed * ctx.dt * 0.25) {
      ai.stuck += ctx.dt
      if (ai.stuck > 1.6) {
        ai.index = (ai.index + 1) % ai.path.length
        ai.stuck = 0
      }
    }
  }

  private aiShoot(ctx: FightCtx): void {
    this.cooldown -= ctx.dt
    if (this.cooldown > 0) return
    let target: THREE.Vector3 | null = null
    if (ctx.player.alive) {
      ctx.player.aimPoint(_v)
      if (dist2(this.pos.x, this.pos.z, _v.x, _v.z) < 48) target = _v.clone()
    }
    if (!target) return
    const from = new THREE.Vector3(this.pos.x, this.pos.y + 1.7, this.pos.z)
    ctx.shoot(from, target, 0.08, 9, 1, 55)
    this.cooldown = 0.85
  }

  forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.yaw), 0, -Math.cos(this.yaw))
  }

  right(): THREE.Vector3 {
    return new THREE.Vector3(Math.cos(this.yaw), 0, Math.sin(this.yaw))
  }

  syncMesh(rotor: number, dt = 0.016): void {
    if (this.destroyed) {
      this.group.position.set(this.pos.x, Math.max(-0.6, this.pos.y - Math.min(0.8, this.smoke * 0.2)), this.pos.z)
      return
    }
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z)
    const f = this.forward()
    this.group.lookAt(this.pos.x + f.x, this.pos.y, this.pos.z + f.z)
    if (this.kind !== 'heli') this.group.rotateX(-clamp(this.speed / 18, -1, 1) * 0.05)
    const spin = this.speed * dt * 1.4
    for (const w of this.wheels) w.rotation.y += spin
    if (this.mainRotor) this.mainRotor.rotation.y += rotor * 18 * dt
    if (this.tailRotor) this.tailRotor.rotation.x += rotor * 26 * dt
  }

  remove(): void {
    this.group.removeFromParent()
  }
}

export class Pickup {
  kind: 'ammo' | 'health' | 'grenade'
  pos: THREE.Vector3
  mesh: THREE.Group
  taken = false
  step: number

  constructor(scene: THREE.Scene, kind: 'ammo' | 'health' | 'grenade', x: number, z: number, step = 0) {
    this.kind = kind
    this.step = step
    this.pos = new THREE.Vector3(x, 0, z)
    this.mesh = makePickupMesh(kind)
    this.mesh.position.copy(this.pos)
    scene.add(this.mesh)
  }

  update(time: number): void {
    if (this.taken) return
    this.mesh.position.y = 0.15 + Math.sin(time * 2.2 + this.pos.x) * 0.08
    this.mesh.rotation.y += 0.01
  }

  remove(): void {
    this.mesh.removeFromParent()
  }
}

export class Destructible {
  kind: 'cache' | 'generator'
  pos = new THREE.Vector3()
  hp: number
  maxHp: number
  tag: string
  alive = true
  mesh: THREE.Group
  step: number
  radius = 0.9

  constructor(scene: THREE.Scene, spawn: PropSpawn) {
    this.kind = spawn.kind
    this.tag = spawn.tag
    this.maxHp = spawn.hp
    this.hp = spawn.hp
    this.step = spawn.step ?? 0
    this.pos.set(spawn.x, 0, spawn.z)
    this.mesh = makePropMesh(spawn.kind)
    this.mesh.position.copy(this.pos)
    scene.add(this.mesh)
  }

  hurt(amount: number, source: DamageSource): boolean {
    if (!this.alive) return false
    if (source === 'enemy') return false
    this.hp -= amount
    if (this.hp <= 0) {
      this.hp = 0
      this.alive = false
      this.mesh.visible = false
      return true
    }
    return false
  }

  remove(): void {
    this.mesh.removeFromParent()
  }
}

export class Projectile {
  pos = new THREE.Vector3()
  vel = new THREE.Vector3()
  life: number
  radius: number
  damage: number
  splash: number
  source: DamageSource
  kind: 'rocket' | 'grenade'
  armed = 0
  mesh: THREE.Mesh
  alive = true

  constructor(scene: THREE.Scene, kind: 'rocket' | 'grenade', pos: THREE.Vector3, vel: THREE.Vector3, source: DamageSource) {
    this.kind = kind
    this.pos.copy(pos)
    this.vel.copy(vel)
    this.source = source
    this.life = kind === 'grenade' ? 2.15 : 3.4
    this.radius = kind === 'grenade' ? 5.6 : 6.4
    this.damage = kind === 'grenade' ? 105 : 150
    this.splash = this.damage
    const geo = kind === 'grenade' ? new THREE.SphereGeometry(0.14, 8, 6) : new THREE.BoxGeometry(0.12, 0.12, 0.4)
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: kind === 'grenade' ? 0x3d4a32 : 0x6a5a32 }))
    scene.add(this.mesh)
  }

  remove(): void {
    this.mesh.geometry.dispose()
    if (this.mesh.material instanceof THREE.Material) this.mesh.material.dispose()
    this.mesh.removeFromParent()
  }
}
