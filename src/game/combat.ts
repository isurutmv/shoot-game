import * as THREE from 'three'
import type { Destructible, Enemy, Player, Vehicle } from './actors.ts'
import { clamp, rayClosestBox, raySphere, type Collider } from './collision.ts'
import type { DamageSource } from './types.ts'

export interface HitWorld {
  enemies: Enemy[]
  vehicles: Vehicle[]
  props: Destructible[]
  colliders: Collider[]
  player: Player
  tracer: (a: THREE.Vector3, b: THREE.Vector3, color: number) => void
  impact: (p: THREE.Vector3) => void
  onKill: (e: Enemy) => void
  onVehicleDead: (v: Vehicle) => void
  onPropDead: (p: Destructible) => void
}

function falloff(dist: number, range: number, damage: number): number {
  if (dist < range * 0.45) return damage
  const t = (dist - range * 0.45) / (range * 0.55)
  return damage * clamp(1 - t * 0.65, 0.35, 1)
}

export function spreadDir(dir: THREE.Vector3, spread: number): THREE.Vector3 {
  return new THREE.Vector3(
    dir.x + (Math.random() - 0.5) * spread * 2,
    dir.y + (Math.random() - 0.5) * spread * 2,
    dir.z + (Math.random() - 0.5) * spread * 2,
  ).normalize()
}

export function hitscan(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  spread: number,
  pellets: number,
  range: number,
  damage: number,
  source: DamageSource,
  world: HitWorld,
): void {
  const color = source === 'enemy' ? 0xff6644 : 0xffe1a0
  for (let i = 0; i < pellets; i++) {
    const d = spreadDir(dir, spread)
    let bestT = range
    let kind: 'enemy' | 'vehicle' | 'prop' | 'player' | 'world' | null = null
    let enemy: Enemy | null = null
    let vehicle: Vehicle | null = null
    let prop: Destructible | null = null

    for (const e of world.enemies) {
      if (!e.alive) continue
      if ((source === 'player' || source === 'heli') && e.team !== 'hostile') continue
      if (source === 'enemy' && e.team !== 'friendly') continue
      const tBody = raySphere(origin.x, origin.y, origin.z, d.x, d.y, d.z, e.pos.x, e.pos.y + 0.95, e.pos.z, 0.48)
      const tHead = raySphere(origin.x, origin.y, origin.z, d.x, d.y, d.z, e.pos.x, e.pos.y + 1.55, e.pos.z, 0.28)
      const t = tBody === null ? tHead : tHead === null ? tBody : Math.min(tBody, tHead)
      if (t !== null && t > 0.2 && t < bestT) {
        bestT = t
        kind = 'enemy'
        enemy = e
        vehicle = null
        prop = null
      }
    }
    for (const v of world.vehicles) {
      if (v.destroyed) continue
      if (v.onlyHeli && source !== 'heli') continue
      if ((source === 'player' || source === 'heli') && v.team !== 'hostile') continue
      if (source === 'enemy' && v.team === 'hostile') continue
      const t = raySphere(origin.x, origin.y, origin.z, d.x, d.y, d.z, v.pos.x, v.pos.y + 1.1, v.pos.z, v.radius)
      if (t !== null && t > 0.4 && t < bestT) {
        bestT = t
        kind = 'vehicle'
        vehicle = v
        enemy = null
        prop = null
      }
    }
    if (source !== 'enemy') {
      for (const p of world.props) {
        if (!p.alive) continue
        const t = raySphere(origin.x, origin.y, origin.z, d.x, d.y, d.z, p.pos.x, 0.7, p.pos.z, p.radius)
        if (t !== null && t > 0.2 && t < bestT) {
          bestT = t
          kind = 'prop'
          prop = p
          enemy = null
          vehicle = null
        }
      }
    }
    if (source === 'enemy' && world.player.alive && !world.player.vehicle) {
      const t = raySphere(origin.x, origin.y, origin.z, d.x, d.y, d.z, world.player.pos.x, 1.05, world.player.pos.z, 0.5)
      if (t !== null && t > 0.2 && t < bestT) {
        bestT = t
        kind = 'player'
        enemy = null
        vehicle = null
        prop = null
      }
    }
    const boxT = rayClosestBox(origin.x, origin.y, origin.z, d.x, d.y, d.z, bestT, world.colliders)
    if (boxT !== null && boxT < bestT) {
      bestT = boxT
      kind = 'world'
      enemy = null
      vehicle = null
      prop = null
    }

    const hit = origin.clone().addScaledVector(d, bestT)
    world.tracer(origin, hit, color)
    world.impact(hit)
    const dealt = falloff(bestT, range, damage)
    if (kind === 'enemy' && enemy) {
      if (enemy.hurt(dealt, source)) world.onKill(enemy)
    } else if (kind === 'vehicle' && vehicle) {
      if (vehicle.hurt(dealt, source)) world.onVehicleDead(vehicle)
    } else if (kind === 'prop' && prop) {
      if (prop.hurt(dealt, source)) world.onPropDead(prop)
    } else if (kind === 'player') {
      world.player.hurt(dealt)
    }
  }
}

export function explode(pos: THREE.Vector3, radius: number, damage: number, source: DamageSource, world: HitWorld): void {
  for (const e of world.enemies) {
    if (!e.alive) continue
    const d = pos.distanceTo(new THREE.Vector3(e.pos.x, e.pos.y + 1, e.pos.z))
    if (d > radius) continue
    const amt = damage * (1 - d / radius)
    if (e.hurt(amt, source)) world.onKill(e)
  }
  for (const v of world.vehicles) {
    if (v.destroyed) continue
    const d = pos.distanceTo(new THREE.Vector3(v.pos.x, v.pos.y + 1, v.pos.z))
    if (d > radius + v.radius * 0.3) continue
    const amt = damage * (1 - d / (radius + 0.01))
    if (v.hurt(amt, source)) world.onVehicleDead(v)
  }
  if (source !== 'enemy') {
    for (const p of world.props) {
      if (!p.alive) continue
      const d = Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z)
      if (d > radius) continue
      if (p.hurt(damage * (1 - d / radius), source)) world.onPropDead(p)
    }
  }
  if (world.player.alive && !world.player.vehicle) {
    const d = Math.hypot(pos.x - world.player.pos.x, pos.z - world.player.pos.z)
    if (d < radius * 0.85) {
      const mul = source === 'player' || source === 'heli' ? 0.55 : 1
      world.player.hurt(damage * mul * (1 - d / radius))
    }
  } else if (world.player.vehicle && (source === 'player' || source === 'heli')) {
    const v = world.player.vehicle
    const d = pos.distanceTo(v.pos)
    if (d < radius * 0.7 && v.hurt(damage * 0.35 * (1 - d / radius), 'world')) world.onVehicleDead(v)
  }
}
