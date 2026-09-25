export interface Collider {
  x: number
  z: number
  hw: number
  hd: number
  y: number
  h: number
  active: boolean
}

export const BOUNDS = { minX: -120, maxX: 120, minZ: -148, maxZ: 90 }

export function clampBounds(x: number, z: number, pad = 0): { x: number; z: number } {
  return {
    x: Math.min(BOUNDS.maxX - pad, Math.max(BOUNDS.minX + pad, x)),
    z: Math.min(BOUNDS.maxZ - pad, Math.max(BOUNDS.minZ + pad, z)),
  }
}

export function blocksFeet(b: Collider): boolean {
  return b.active && b.y < 1.2 && b.y + b.h > 0.4
}

function overlaps(x: number, z: number, r: number, b: Collider): boolean {
  const cx = clamp(x, b.x - b.hw, b.x + b.hw)
  const cz = clamp(z, b.z - b.hd, b.z + b.hd)
  const dx = x - cx
  const dz = z - cz
  return dx * dx + dz * dz < r * r
}

export function circleBlocked(x: number, z: number, r: number, boxes: Collider[]): boolean {
  for (const b of boxes) {
    if (!blocksFeet(b)) continue
    if (overlaps(x, z, r, b)) return true
  }
  return false
}

function pushOut(x: number, z: number, r: number, b: Collider): { x: number; z: number; hit: boolean } {
  const cx = clamp(x, b.x - b.hw, b.x + b.hw)
  const cz = clamp(z, b.z - b.hd, b.z + b.hd)
  const dx = x - cx
  const dz = z - cz
  const d2 = dx * dx + dz * dz
  if (d2 >= r * r) return { x, z, hit: false }
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2)
    const push = (r - d) / d
    return { x: x + dx * push, z: z + dz * push, hit: true }
  }
  const penL = x - (b.x - b.hw)
  const penR = b.x + b.hw - x
  const penD = z - (b.z - b.hd)
  const penU = b.z + b.hd - z
  const m = Math.min(penL, penR, penD, penU)
  if (m === penL) return { x: b.x - b.hw - r, z, hit: true }
  if (m === penR) return { x: b.x + b.hw + r, z, hit: true }
  if (m === penD) return { x, z: b.z - b.hd - r, hit: true }
  return { x, z: b.z + b.hd + r, hit: true }
}

export function moveCircle(
  x: number,
  z: number,
  dx: number,
  dz: number,
  r: number,
  boxes: Collider[],
): { x: number; z: number; hit: boolean } {
  let nx = x + dx
  let nz = z + dz
  let hit = false
  for (let pass = 0; pass < 3; pass++) {
    for (const b of boxes) {
      if (!blocksFeet(b)) continue
      const res = pushOut(nx, nz, r, b)
      if (res.hit) hit = true
      nx = res.x
      nz = res.z
    }
  }
  const c = clampBounds(nx, nz, r)
  return { x: c.x, z: c.z, hit }
}

export function findClear(x: number, z: number, r: number, boxes: Collider[]): { x: number; z: number } {
  if (!circleBlocked(x, z, r, boxes)) return clampBounds(x, z, r)
  for (const dist of [1.4, 2.6, 4, 6.5, 9]) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      const nx = x + Math.sin(a) * dist
      const nz = z - Math.cos(a) * dist
      if (!circleBlocked(nx, nz, r, boxes)) return clampBounds(nx, nz, r)
    }
  }
  return clampBounds(x, z, r)
}

export function rayAABB(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  b: Collider,
): number | null {
  const min = [b.x - b.hw, b.y, b.z - b.hd]
  const max = [b.x + b.hw, b.y + b.h, b.z + b.hd]
  const o = [ox, oy, oz]
  const d = [dx, dy, dz]
  let tmin = 0
  let tmax = 1e9
  for (let i = 0; i < 3; i++) {
    const di = d[i] ?? 0
    const oi = o[i] ?? 0
    const mn = min[i] ?? 0
    const mx = max[i] ?? 0
    if (Math.abs(di) < 1e-8) {
      if (oi < mn || oi > mx) return null
    } else {
      let t1 = (mn - oi) / di
      let t2 = (mx - oi) / di
      if (t1 > t2) {
        const s = t1
        t1 = t2
        t2 = s
      }
      tmin = Math.max(tmin, t1)
      tmax = Math.min(tmax, t2)
      if (tmax < tmin) return null
    }
  }
  if (tmax < 0) return null
  return tmin >= 0 ? tmin : tmax
}

export function rayClosestBox(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxT: number,
  boxes: Collider[],
): number | null {
  let best: number | null = null
  for (const b of boxes) {
    if (!b.active) continue
    const t = rayAABB(ox, oy, oz, dx, dy, dz, b)
    if (t === null || t < 0.05 || t > maxT) continue
    if (best === null || t < best) best = t
  }
  return best
}

/** Ray vs sphere. Direction should be normalized. Returns nearest t >= 0. */
export function raySphere(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  cx: number,
  cy: number,
  cz: number,
  r: number,
): number | null {
  const lx = ox - cx
  const ly = oy - cy
  const lz = oz - cz
  const b = lx * dx + ly * dy + lz * dz
  const c = lx * lx + ly * ly + lz * lz - r * r
  const disc = b * b - c
  if (disc < 0) return null
  const s = Math.sqrt(disc)
  const t0 = -b - s
  const t1 = -b + s
  if (t0 >= 0) return t0
  if (t1 >= 0) return t1
  return null
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

export function dist2(x1: number, z1: number, x2: number, z2: number): number {
  const dx = x1 - x2
  const dz = z1 - z2
  return Math.hypot(dx, dz)
}
