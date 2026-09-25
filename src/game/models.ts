import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import type { EnemyKind, WeaponId } from './types.ts'

const gltfLoader = new GLTFLoader()
const templates = new Map<string, THREE.Group>()

async function loadTemplate(name: string): Promise<void> {
  const gltf = await gltfLoader.loadAsync(`/models/${name}.glb`)
  gltf.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.isMesh) {
      mesh.castShadow = true
      mesh.receiveShadow = true
    }
  })
  templates.set(name, gltf.scene)
}

export async function preloadModels(): Promise<void> {
  await Promise.all(['soldier', 'm4', 'pistol', 'grenade', 'jeep', 'helicopter', 'truck'].map(loadTemplate))
}

function template(name: string): THREE.Group {
  const src = templates.get(name)
  if (!src) throw new Error(`Model ${name} is not loaded`)
  return src
}

function worldBox(obj: THREE.Object3D): THREE.Box3 {
  obj.updateMatrixWorld(true)
  return new THREE.Box3().setFromObject(obj)
}

/** Scale so the longest side matches `longest`, then sit the bottom on y = 0. */
function fitUpright(obj: THREE.Object3D, longest: number): void {
  obj.position.set(0, 0, 0)
  obj.rotation.set(0, 0, 0)
  obj.scale.set(1, 1, 1)
  const size = worldBox(obj).getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z, 0.001)
  obj.scale.setScalar(longest / maxDim)
  const box = worldBox(obj)
  obj.position.y -= box.min.y
  const center = box.getCenter(new THREE.Vector3())
  obj.position.x -= center.x
  obj.position.z -= center.z
}

function fitCarried(obj: THREE.Object3D, length: number): void {
  obj.position.set(0, 0, 0)
  obj.rotation.set(0, 0, 0)
  obj.scale.set(1, 1, 1)
  const size = worldBox(obj).getSize(new THREE.Vector3())
  if (size.x >= size.y && size.x >= size.z) obj.rotation.y = Math.PI / 2
  else if (size.y >= size.x && size.y >= size.z) obj.rotation.x = Math.PI / 2
  const size2 = worldBox(obj).getSize(new THREE.Vector3())
  obj.scale.setScalar(length / Math.max(size2.z, 0.001))
  const box = worldBox(obj)
  const center = box.getCenter(new THREE.Vector3())
  obj.position.sub(center)
}

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
  leftLeg: THREE.Object3D
  rightLeg: THREE.Object3D
  bodyMat: THREE.MeshStandardMaterial
}

export function makeSoldier(kind: EnemyKind | 'player' | 'vip'): SoldierRig {
  const model = cloneSkinned(template('soldier'))
  const group = new THREE.Group()
  const size = worldBox(model).getSize(new THREE.Vector3())
  const height = Math.max(size.y, 0.001)
  model.scale.setScalar(1.82 / height)
  const box = worldBox(model)
  model.position.y -= box.min.y
  const mid = worldBox(model).getCenter(new THREE.Vector3())
  model.position.x -= mid.x
  model.position.z -= mid.z
  group.add(model)

  const drop = (name: string, z: number) => {
    const bone = model.getObjectByName(name)
    if (bone) bone.rotation.z = z
  }
  drop('LeftArm', 1.25)
  drop('RightArm', -1.25)
  const fore = model.getObjectByName('RightForeArm')
  if (fore) fore.rotation.y = -0.45

  let bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 })
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const src = mesh.material
    const mat = (Array.isArray(src) ? src[0] : src) as THREE.MeshStandardMaterial
    if (mat && 'emissive' in mat) {
      bodyMat = mat.clone()
      if (kind !== 'player') bodyMat.color.multiply(new THREE.Color(kind === 'vip' ? 0x9eb4c4 : 0x8d8468))
      mesh.material = bodyMat
    }
  })

  const gun = new THREE.Group()
  gun.position.set(0.16, 1.22, -0.28)
  group.add(gun)
  const leftLeg = model.getObjectByName('LeftUpLeg') ?? new THREE.Group()
  const rightLeg = model.getObjectByName('RightUpLeg') ?? new THREE.Group()
  leftLeg.userData.restX = leftLeg.rotation.x
  rightLeg.userData.restX = rightLeg.rotation.x
  if (kind === 'heavy') group.scale.setScalar(1.08)
  return { group, gun, leftLeg, rightLeg, bodyMat }
}

export function setWeaponVisual(gun: THREE.Group, id: WeaponId | 'none'): void {
  gun.clear()
  if (id === 'none') return
  const key = id === 'pistol' ? 'pistol' : id === 'rocket' ? 'grenade' : 'm4'
  const model = template(key).clone(true)
  fitCarried(model, id === 'pistol' ? 0.32 : id === 'rocket' ? 0.22 : 0.84)
  model.rotateY(Math.PI)
  gun.add(model)
}

export interface RideRig {
  group: THREE.Group
  wheels: THREE.Object3D[]
  mainRotor: THREE.Object3D | null
  tailRotor: THREE.Object3D | null
}

function makeRide(name: string, longest: number): RideRig {
  const model = template(name).clone(true)
  const group = new THREE.Group()
  fitUpright(model, longest)
  group.add(model)
  const wheels: THREE.Object3D[] = []
  let mainRotor: THREE.Object3D | null = null
  model.traverse((obj) => {
    const n = obj.name.toLowerCase()
    if (n.includes('wheel')) {
      obj.userData.spin = 'x'
      wheels.push(obj)
    }
    if (n.includes('rotor')) mainRotor = obj
  })
  return { group, wheels, mainRotor, tailRotor: null }
}

export function makeJeep(): RideRig {
  return makeRide('jeep', 4.35)
}

export function makeTruck(): RideRig {
  return makeRide('truck', 6.4)
}

export function makeHeli(): RideRig {
  return makeRide('helicopter', 12)
}

export function makePickupMesh(kind: 'ammo' | 'health' | 'grenade'): THREE.Group {
  if (kind === 'grenade') {
    const g = new THREE.Group()
    const model = template('grenade').clone(true)
    fitUpright(model, 0.34)
    g.add(model)
    return g
  }
  const g = new THREE.Group()
  const color = kind === 'health' ? 0xd8d2c6 : 0x8a7a42
  addBox(g, 0.55, 0.4, 0.55, 0, 0.35, 0, stdMat(color, 0.6, 0.15))
  if (kind === 'health') addBox(g, 0.22, 0.08, 0.08, 0, 0.58, 0, stdMat(0xb3392c), false)
  return g
}

export function makeGrenadeMesh(): THREE.Object3D {
  const model = template('grenade').clone(true)
  fitCarried(model, 0.18)
  return model
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
