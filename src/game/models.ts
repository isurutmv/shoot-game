import * as THREE from 'three'
import type { EnemyKind, WeaponId } from './types.ts'

const geoCache = new Map<string, THREE.BufferGeometry>()
const matCache = new Map<string, THREE.MeshStandardMaterial>()

function boxGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  const k = `b${w}_${h}_${d}`
  let g = geoCache.get(k)
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d)
    geoCache.set(k, g)
  }
  return g
}

function cylGeo(rt: number, rb: number, h: number, seg = 8): THREE.BufferGeometry {
  const k = `c${rt}_${rb}_${h}_${seg}`
  let g = geoCache.get(k)
  if (!g) {
    g = new THREE.CylinderGeometry(rt, rb, h, seg)
    geoCache.set(k, g)
  }
  return g
}

function sphGeo(r: number): THREE.BufferGeometry {
  const k = `s${r}`
  let g = geoCache.get(k)
  if (!g) {
    g = new THREE.SphereGeometry(r, 10, 8)
    geoCache.set(k, g)
  }
  return g
}

export function stdMat(color: number, rough = 0.84, metal = 0.06): THREE.MeshStandardMaterial {
  const k = `${color}_${rough}_${metal}`
  let m = matCache.get(k)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })
    matCache.set(k, m)
  }
  return m
}

function addBox(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
  shadow = true,
): THREE.Mesh {
  const mesh = new THREE.Mesh(boxGeo(w, h, d), mat)
  mesh.position.set(x, y, z)
  mesh.castShadow = shadow
  mesh.receiveShadow = shadow
  parent.add(mesh)
  return mesh
}

export interface SoldierRig {
  group: THREE.Group
  gun: THREE.Group
  leftLeg: THREE.Group
  rightLeg: THREE.Group
  bodyMat: THREE.MeshStandardMaterial
}

export function makeSoldier(kind: EnemyKind | 'player' | 'vip'): SoldierRig {
  const group = new THREE.Group()
  const clothColor =
    kind === 'player' ? 0x31402c : kind === 'vip' ? 0x2f4d62 : kind === 'sniper' ? 0x3e4638 : kind === 'officer' ? 0x6a5438 : 0x7a6244
  const bodyMat = new THREE.MeshStandardMaterial({ color: clothColor, roughness: 0.88 })
  const skin = stdMat(kind === 'vip' ? 0xd2b48c : 0xc4a574, 0.7, 0)
  const dark = stdMat(0x1c201c, 0.6, 0.2)
  const vest = stdMat(kind === 'heavy' ? 0x2a2e28 : 0x24281f, 0.75, 0.15)

  const leftLeg = new THREE.Group()
  leftLeg.position.set(-0.12, 0.92, 0)
  addBox(leftLeg, 0.16, 0.5, 0.18, 0, -0.28, 0, bodyMat)
  addBox(leftLeg, 0.17, 0.12, 0.28, 0, -0.56, 0.04, dark)
  group.add(leftLeg)

  const rightLeg = new THREE.Group()
  rightLeg.position.set(0.12, 0.92, 0)
  addBox(rightLeg, 0.16, 0.5, 0.18, 0, -0.28, 0, bodyMat)
  addBox(rightLeg, 0.17, 0.12, 0.28, 0, -0.56, 0.04, dark)
  group.add(rightLeg)

  addBox(group, 0.42, 0.18, 0.24, 0, 0.98, 0, dark)
  addBox(group, 0.46, 0.48, 0.28, 0, 1.32, 0, bodyMat)
  addBox(group, 0.4, 0.32, 0.16, 0, 1.36, 0.12, vest)
  addBox(group, 0.12, 0.36, 0.12, -0.28, 1.28, 0.05, bodyMat)
  addBox(group, 0.12, 0.36, 0.12, 0.28, 1.28, 0.12, bodyMat)

  const head = new THREE.Mesh(sphGeo(0.16), skin)
  head.position.set(0, 1.72, 0)
  head.castShadow = true
  group.add(head)
  addBox(group, 0.28, 0.1, 0.28, 0, 1.84, 0, dark)
  if (kind === 'officer') addBox(group, 0.22, 0.08, 0.22, 0, 1.92, 0, stdMat(0x2a241c))
  if (kind === 'vip') addBox(group, 0.12, 0.08, 0.04, 0.22, 1.4, 0.16, stdMat(0xd7b36a))

  const gun = new THREE.Group()
  gun.position.set(0.28, 1.22, 0.28)
  group.add(gun)
  if (kind === 'heavy') group.scale.setScalar(1.12)
  return { group, gun, leftLeg, rightLeg, bodyMat }
}

export function setWeaponVisual(gun: THREE.Group, id: WeaponId | 'none'): void {
  gun.clear()
  if (id === 'none') return
  const metal = stdMat(0x2a2d30, 0.45, 0.55)
  const wood = stdMat(0x5a4030, 0.7, 0.05)
  const olive = stdMat(0x3d4632, 0.6, 0.2)
  if (id === 'pistol') {
    addBox(gun, 0.06, 0.12, 0.18, 0, 0, 0.08, metal, false)
    addBox(gun, 0.05, 0.1, 0.06, 0, -0.08, 0.02, darkSafe(), false)
  } else if (id === 'smg') {
    addBox(gun, 0.07, 0.1, 0.34, 0, 0, 0.12, metal, false)
    addBox(gun, 0.06, 0.14, 0.08, 0, -0.1, 0.02, metal, false)
  } else if (id === 'shotgun') {
    addBox(gun, 0.07, 0.07, 0.62, 0, 0.02, 0.22, metal, false)
    addBox(gun, 0.06, 0.08, 0.22, 0, -0.02, 0.02, wood, false)
  } else if (id === 'sniper') {
    addBox(gun, 0.06, 0.07, 0.78, 0, 0.03, 0.28, olive, false)
    addBox(gun, 0.05, 0.06, 0.16, 0, 0.1, 0.18, metal, false)
  } else if (id === 'rocket') {
    addBox(gun, 0.12, 0.12, 0.7, 0, 0.02, 0.2, olive, false)
    addBox(gun, 0.08, 0.08, 0.28, 0, 0.02, 0.55, metal, false)
  } else {
    addBox(gun, 0.07, 0.09, 0.55, 0, 0.02, 0.2, olive, false)
    addBox(gun, 0.08, 0.12, 0.14, 0, -0.06, 0.05, metal, false)
  }
}

function darkSafe(): THREE.MeshStandardMaterial {
  return stdMat(0x1a1c1e, 0.5, 0.4)
}

function wheel(parent: THREE.Group, x: number, z: number): THREE.Mesh {
  const axle = new THREE.Group()
  axle.position.set(x, 0.36, z)
  axle.rotation.z = Math.PI / 2
  const tire = new THREE.Mesh(cylGeo(0.36, 0.36, 0.22, 10), stdMat(0x1a1a1a, 0.9, 0.1))
  tire.castShadow = true
  axle.add(tire)
  parent.add(axle)
  return tire
}

export interface RideRig {
  group: THREE.Group
  wheels: THREE.Mesh[]
  mainRotor: THREE.Group | null
  tailRotor: THREE.Group | null
}

export function makeJeep(): RideRig {
  const group = new THREE.Group()
  const paint = stdMat(0x6d7344, 0.7, 0.15)
  const dark = stdMat(0x2a2c28, 0.6, 0.2)
  addBox(group, 1.7, 0.42, 3.15, 0, 0.72, 0, paint)
  addBox(group, 1.55, 0.28, 1.1, 0, 1.05, 0.15, paint)
  addBox(group, 1.2, 0.35, 0.08, 0, 1.15, 0.72, stdMat(0x9ec9d6, 0.15, 0.1))
  addBox(group, 0.08, 0.55, 0.08, -0.7, 1.25, -0.4, dark)
  addBox(group, 0.08, 0.55, 0.08, 0.7, 1.25, -0.4, dark)
  addBox(group, 1.5, 0.06, 0.08, 0, 1.52, -0.4, dark)
  const wheels = [
    wheel(group, -0.92, 1.05),
    wheel(group, 0.92, 1.05),
    wheel(group, -0.92, -1.05),
    wheel(group, 0.92, -1.05),
  ]
  return { group, wheels, mainRotor: null, tailRotor: null }
}

export function makeTruck(): RideRig {
  const group = new THREE.Group()
  const paint = stdMat(0x3e4632, 0.72, 0.18)
  const dark = stdMat(0x22241f, 0.55, 0.25)
  addBox(group, 2.15, 0.7, 2.1, 0, 1.15, 1.35, paint)
  addBox(group, 2.25, 0.85, 3.6, 0, 1.25, -1.15, dark)
  addBox(group, 2.05, 0.45, 0.08, 0, 1.45, 2.35, stdMat(0x8eb8c4, 0.12, 0.15))
  addBox(group, 0.12, 0.7, 3.4, -1.2, 1.55, -1.1, stdMat(0x4a5140, 0.6, 0.3))
  addBox(group, 0.12, 0.7, 3.4, 1.2, 1.55, -1.1, stdMat(0x4a5140, 0.6, 0.3))
  const wheels: THREE.Mesh[] = []
  for (const z of [1.7, -0.4, -1.9]) {
    wheels.push(wheel(group, -1.15, z))
    wheels.push(wheel(group, 1.15, z))
  }
  return { group, wheels, mainRotor: null, tailRotor: null }
}

export function makeHeli(): RideRig {
  const group = new THREE.Group()
  const paint = stdMat(0x4e5638, 0.68, 0.2)
  const dark = stdMat(0x242820, 0.5, 0.25)
  const glass = new THREE.MeshStandardMaterial({
    color: 0x9ec9d4,
    roughness: 0.12,
    metalness: 0.1,
    transparent: true,
    opacity: 0.45,
  })
  addBox(group, 2.05, 1.35, 4.1, 0, 1.55, 0.2, paint)
  addBox(group, 1.5, 0.7, 1.3, 0, 1.7, 1.7, glass, false)
  addBox(group, 0.38, 0.38, 3.3, 0, 1.7, -3.15, paint)
  addBox(group, 0.12, 0.9, 0.5, 0, 2.15, -4.6, dark)
  addBox(group, 0.9, 0.08, 0.35, 0.15, 1.85, -4.55, dark)
  addBox(group, 0.12, 0.55, 0.12, 0, 2.45, 0.1, dark)
  const skidL = addBox(group, 0.08, 0.08, 2.6, -0.7, 0.28, 0.1, dark)
  const skidR = addBox(group, 0.08, 0.08, 2.6, 0.7, 0.28, 0.1, dark)
  skidL.castShadow = true
  skidR.castShadow = true
  addBox(group, 0.06, 0.5, 0.06, -0.7, 0.55, 0.6, dark)
  addBox(group, 0.06, 0.5, 0.06, 0.7, 0.55, 0.6, dark)
  addBox(group, 0.06, 0.5, 0.06, -0.7, 0.55, -0.5, dark)
  addBox(group, 0.06, 0.5, 0.06, 0.7, 0.55, -0.5, dark)

  const mainRotor = new THREE.Group()
  mainRotor.position.set(0, 2.85, 0.1)
  addBox(mainRotor, 0.16, 0.04, 9.2, 0, 0, 0, dark, false)
  addBox(mainRotor, 9.2, 0.04, 0.16, 0, 0, 0, dark, false)
  group.add(mainRotor)

  const tailRotor = new THREE.Group()
  tailRotor.position.set(0.2, 2.05, -4.6)
  addBox(tailRotor, 0.04, 1.3, 0.1, 0, 0, 0, dark, false)
  addBox(tailRotor, 0.04, 0.1, 1.3, 0, 0, 0, dark, false)
  group.add(tailRotor)
  return { group, wheels: [], mainRotor, tailRotor }
}

export function makePickupMesh(kind: 'ammo' | 'health' | 'grenade'): THREE.Group {
  const g = new THREE.Group()
  const color = kind === 'health' ? 0xd8d2c6 : kind === 'grenade' ? 0x3d4a32 : 0x8a7a42
  addBox(g, 0.55, 0.4, 0.55, 0, 0.35, 0, stdMat(color, 0.6, 0.15))
  if (kind === 'health') addBox(g, 0.22, 0.08, 0.08, 0, 0.58, 0, stdMat(0xb3392c), false)
  return g
}

export function makePropMesh(kind: 'cache' | 'generator'): THREE.Group {
  const g = new THREE.Group()
  if (kind === 'cache') {
    addBox(g, 1.1, 0.7, 0.8, 0, 0.45, 0, stdMat(0x6a5a32, 0.7, 0.2))
    addBox(g, 0.7, 0.7, 0.7, 0.7, 0.45, 0.2, stdMat(0x5a4e30, 0.75, 0.15))
    addBox(g, 0.35, 0.55, 0.35, -0.55, 0.85, -0.1, stdMat(0x8a3a28, 0.5, 0.2))
  } else {
    addBox(g, 1.4, 0.9, 0.8, 0, 0.55, 0, stdMat(0x3a4038, 0.6, 0.3))
    addBox(g, 0.3, 0.5, 0.3, 0.3, 1.2, 0, stdMat(0x222, 0.4, 0.4))
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xffc56a,
      emissive: 0xffa040,
      emissiveIntensity: 0.8,
      roughness: 0.4,
    })
    const bulb = new THREE.Mesh(sphGeo(0.12), bulbMat)
    bulb.position.set(0.3, 1.5, 0)
    g.add(bulb)
  }
  return g
}

export function makeWreck(): THREE.Group {
  const g = new THREE.Group()
  const dead = stdMat(0x3a342c, 0.85, 0.2)
  addBox(g, 1.6, 0.7, 3.4, 0, 0.7, 0, dead)
  addBox(g, 0.3, 0.3, 2.2, 0.2, 0.9, -2.2, dead)
  g.rotation.z = 0.35
  g.rotation.y = 0.6
  return g
}
