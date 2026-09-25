import type { WeaponId } from './types.ts'

export interface WeaponStats {
  name: string
  short: string
  damage: number
  pellets: number
  rpm: number
  mag: number
  reserve: number
  reload: number
  spread: number
  range: number
  auto: boolean
  projectile: boolean
}

export const WEAPONS: Record<WeaponId, WeaponStats> = {
  pistol: {
    name: 'M9 Pistol',
    short: 'M9',
    damage: 26,
    pellets: 1,
    rpm: 400,
    mag: 12,
    reserve: 60,
    reload: 1.15,
    spread: 0.014,
    range: 75,
    auto: false,
    projectile: false,
  },
  smg: {
    name: 'MP5 SMG',
    short: 'MP5',
    damage: 13,
    pellets: 1,
    rpm: 820,
    mag: 30,
    reserve: 150,
    reload: 1.45,
    spread: 0.055,
    range: 50,
    auto: true,
    projectile: false,
  },
  ar: {
    name: 'M4 Carbine',
    short: 'M4',
    damage: 28,
    pellets: 1,
    rpm: 560,
    mag: 30,
    reserve: 150,
    reload: 1.8,
    spread: 0.02,
    range: 120,
    auto: true,
    projectile: false,
  },
  shotgun: {
    name: 'M870 Shotgun',
    short: '870',
    damage: 15,
    pellets: 8,
    rpm: 75,
    mag: 6,
    reserve: 32,
    reload: 2.25,
    spread: 0.15,
    range: 30,
    auto: false,
    projectile: false,
  },
  sniper: {
    name: 'M24 Sniper',
    short: 'M24',
    damage: 100,
    pellets: 1,
    rpm: 40,
    mag: 5,
    reserve: 25,
    reload: 2.3,
    spread: 0.0016,
    range: 250,
    auto: false,
    projectile: false,
  },
  rocket: {
    name: 'RPG-7',
    short: 'RPG',
    damage: 150,
    pellets: 1,
    rpm: 32,
    mag: 1,
    reserve: 5,
    reload: 2.45,
    spread: 0.012,
    range: 170,
    auto: false,
    projectile: true,
  },
}

export const WEAPON_ORDER: WeaponId[] = ['pistol', 'smg', 'ar', 'shotgun', 'sniper', 'rocket']

export function missionScale(id: number): number {
  return 0.7 + (id - 1) * 0.034
}

export function cooldown(rpm: number): number {
  return 60 / rpm
}
