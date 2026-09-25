export type WeaponId = 'pistol' | 'smg' | 'ar' | 'shotgun' | 'sniper' | 'rocket'
export type Weather = 'clear' | 'cloudy' | 'rain' | 'storm' | 'mist' | 'fog'
export type VehicleKind = 'jeep' | 'truck' | 'heli'
export type Team = 'player' | 'hostile' | 'friendly'
export type EnemyKind = 'soldier' | 'officer' | 'sniper' | 'heavy'
export type Behavior = 'patrol' | 'guard' | 'aggressive' | 'sniper' | 'advance' | 'follow'
export type DamageSource = 'player' | 'enemy' | 'heli' | 'world'

export interface EnemySpawn {
  x: number
  z: number
  y?: number
  kind?: EnemyKind
  behavior?: Behavior
  patrol?: { x: number; z: number }[]
  tag?: string
  step?: number
  team?: 'hostile' | 'friendly'
  speed?: number
  hp?: number
}

export interface VehicleSpawn {
  kind: VehicleKind
  x: number
  z: number
  yaw?: number
  team?: Team
  tag?: string
  step?: number
  hp?: number
  scripted?: boolean
  ai?: { path: { x: number; z: number }[]; speed: number }
}

export interface PickupSpawn {
  kind: 'ammo' | 'health' | 'grenade'
  x: number
  z: number
  step?: number
}

export interface PropSpawn {
  kind: 'cache' | 'generator'
  x: number
  z: number
  tag: string
  hp: number
  step?: number
}

export type Step =
  | { kind: 'kill'; need: number; tag?: string; label: string }
  | { kind: 'killAll'; tag?: string; label: string }
  | { kind: 'reach'; x: number; z: number; r: number; label: string; vehicle?: VehicleKind; minY?: number }
  | { kind: 'destroy'; tag: string; label: string }
  | { kind: 'survive'; seconds: number; label: string; zone?: { x: number; z: number; r: number }; abandon?: number }
  | { kind: 'escort'; tag: string; x: number; z: number; r: number; label: string }
  | { kind: 'interact'; x: number; z: number; r: number; seconds: number; label: string }
  | { kind: 'land'; x: number; z: number; r: number; label: string }

export interface ProtectRule {
  tag: string
  untilStep?: number
  reason: string
}

export interface Wave {
  step: number
  delay: number
  enemies: EnemySpawn[]
}

export interface MissionDef {
  id: number
  name: string
  location: string
  meta: string
  briefing: string
  objective: string
  failure: string
  winLine: string
  hour: number
  weather: Weather
  weapons: WeaponId[]
  primary: WeaponId
  grenades: number
  start: { x: number; z: number; yaw: number }
  intro: boolean
  steps: Step[]
  enemies: EnemySpawn[]
  vehicles: VehicleSpawn[]
  pickups: PickupSpawn[]
  props: PropSpawn[]
  waves: Wave[]
  protect: ProtectRule[]
  arrivals: { tag: string; count: number; reason: string } | null
  barrage: { from: string; target: string; every: number; damage: number } | null
  heliOnly: string[]
}
