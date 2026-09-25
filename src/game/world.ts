import * as THREE from 'three'
import { A, KEEPOUT, SANDBAGS, STRUCTURES } from './landmarks.ts'
import type { Collider } from './collision.ts'
import { makeWreck, stdMat } from './models.ts'
import type { Weather } from './types.ts'

export interface WorldHandle {
  colliders: Collider[]
  cover: { x: number; z: number }[]
  sun: THREE.DirectionalLight
  hemi: THREE.HemisphereLight
  ambient: THREE.AmbientLight
  lamps: THREE.PointLight[]
  rain: THREE.Points
  rainPos: Float32Array
  flashlight: THREE.SpotLight
  wash: THREE.Mesh
  washMat: THREE.MeshBasicMaterial
  sunOffset: THREE.Vector3
  flashOn: boolean
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function onRoad(x: number, z: number): boolean {
  if (Math.abs(x) < 8 && z > -152 && z < 92) return true
  if (Math.abs(z) < 8 && x > -102 && x < 104) return true
  if (Math.abs(z + 70) < 8 && x > -92 && x < 108) return true
  return false
}

function addBox(
  scene: THREE.Scene,
  cols: Collider[],
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  color: number,
  y = 0,
): void {
  if (w < 0.25 || d < 0.25) return
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stdMat(color))
  mesh.position.set(x, y + h / 2, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  scene.add(mesh)
  cols.push({ x, z, hw: w / 2, hd: d / 2, y, h, active: true })
}

function wallAlongX(
  scene: THREE.Scene,
  cols: Collider[],
  x0: number,
  x1: number,
  z: number,
  thick: number,
  h: number,
  color: number,
): void {
  if (x1 < x0) {
    const s = x0
    x0 = x1
    x1 = s
  }
  addBox(scene, cols, (x0 + x1) / 2, z, x1 - x0, thick, h, color)
}

function wallAlongZ(
  scene: THREE.Scene,
  cols: Collider[],
  z0: number,
  z1: number,
  x: number,
  thick: number,
  h: number,
  color: number,
): void {
  if (z1 < z0) {
    const s = z0
    z0 = z1
    z1 = s
  }
  addBox(scene, cols, x, (z0 + z1) / 2, thick, z1 - z0, h, color)
}

function walled(
  scene: THREE.Scene,
  cols: Collider[],
  cx: number,
  cz: number,
  hw: number,
  hd: number,
  thick: number,
  h: number,
  color: number,
  gap: number,
): void {
  const x0 = cx - hw
  const x1 = cx + hw
  const z0 = cz - hd
  const z1 = cz + hd
  const g0 = cx - gap / 2
  const g1 = cx + gap / 2
  wallAlongX(scene, cols, x0, x1, z0, thick, h, color)
  if (g0 - x0 > 0.4) wallAlongX(scene, cols, x0, g0, z1, thick, h, color)
  if (x1 - g1 > 0.4) wallAlongX(scene, cols, g1, x1, z1, thick, h, color)
  wallAlongZ(scene, cols, z0, z1, x0, thick, h, color)
  wallAlongZ(scene, cols, z0, z1, x1, thick, h, color)
}

export function buildWorld(scene: THREE.Scene): WorldHandle {
  const colliders: Collider[] = []
  scene.background = new THREE.Color(0x87b4d6)
  scene.fog = new THREE.Fog(0xc4b496, 40, 180)

  const groundCanvas = document.createElement('canvas')
  groundCanvas.width = 512
  groundCanvas.height = 512
  const g = groundCanvas.getContext('2d')
  if (g) {
    g.fillStyle = '#8d774c'
    g.fillRect(0, 0, 512, 512)
    for (let i = 0; i < 5000; i++) {
      const shade = Math.random()
      g.fillStyle = `rgba(${shade > 0.5 ? 90 : 40},${shade > 0.5 ? 70 : 36},${30},${0.05 + Math.random() * 0.08})`
      g.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 3, 2)
    }
  }
  const tex = new THREE.CanvasTexture(groundCanvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(32, 28)
  tex.colorSpace = THREE.SRGBColorSpace
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(460, 420),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const roadMat = stdMat(0x4a4c48, 0.95, 0.02)
  const road = (x: number, z: number, w: number, d: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat)
    m.rotation.x = -Math.PI / 2
    m.position.set(x, 0.03, z)
    m.receiveShadow = true
    scene.add(m)
  }
  road(0, -30, 12, 240)
  road(0, 0, 200, 12)
  road(8, -70, 196, 12)

  for (const s of STRUCTURES) addBox(scene, colliders, s.x, s.z, s.w, s.d, s.h, s.color)

  for (const sb of SANDBAGS) addBox(scene, colliders, sb.x, sb.z, sb.w, sb.d, 1.05, 0x8a7a52)

  const fuelMat = stdMat(0x6e6454, 0.55, 0.35)
  for (const f of [
    { x: -32, z: 40 },
    { x: -36, z: 34 },
  ]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 3.1, 12), fuelMat)
    tank.position.set(f.x, 1.55, f.z)
    tank.castShadow = true
    scene.add(tank)
    colliders.push({ x: f.x, z: f.z, hw: 1.2, hd: 1.2, y: 0, h: 3.1, active: true })
  }

  walled(scene, colliders, A.compound.x, A.compound.z, 15, 12, 0.8, 3.1, 0x8d7b62, 5)
  walled(scene, colliders, A.fortress.x, A.fortress.z, 22, 18, 1, 4.2, 0x6e6a60, 6.5)
  addBox(scene, colliders, 58, 44, 2.2, 2.2, 1.2, 0x6a5c40)
  addBox(scene, colliders, 70, 50, 3, 1.2, 1.15, 0x5c5140)
  addBox(scene, colliders, -50, -124, 6, 5, 3.2, 0x6a6660)
  addBox(scene, colliders, -26, -128, 5, 7, 3.4, 0x615e58)

  wallAlongX(scene, colliders, -32, -12, -106, 0.8, 3.2, 0x7a756c)
  wallAlongZ(scene, colliders, -106, -88, -32, 0.8, 3.2, 0x7a756c)
  wallAlongZ(scene, colliders, -106, -90, -12, 0.8, 3.2, 0x7a756c)
  addBox(scene, colliders, -22, -100, 3, 1.2, 1.1, 0x6e6248)

  wallAlongX(scene, colliders, 82, 112, -78, 0.45, 0.9, 0x5c5850)
  wallAlongX(scene, colliders, 82, 112, -62, 0.45, 0.9, 0x5c5850)
  addBox(scene, colliders, 104, -7.2, 0.7, 0.7, 2.4, 0x5a5348)
  addBox(scene, colliders, 104, 7.2, 0.7, 0.7, 2.4, 0x5a5348)

  const pad = new THREE.Mesh(new THREE.CircleGeometry(7.2, 28), stdMat(0x3e4038, 0.9, 0.05))
  pad.rotation.x = -Math.PI / 2
  pad.position.set(A.pad.x, 0.04, A.pad.z)
  scene.add(pad)
  addBox(scene, colliders, A.pad.x, A.pad.z - 2.2, 0.35, 2.4, 0.08, 0xd7b36a, 0.05)
  addBox(scene, colliders, A.pad.x, A.pad.z + 0.4, 1.6, 0.35, 0.08, 0xd7b36a, 0.05)
  // Those H marks are too short to block feet (h 0.08). They were added as colliders.
  // Remove them from collision — pop the last two if h < 0.2
  colliders.splice(colliders.length - 2, 2)

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 14, 6), stdMat(0x8d9290, 0.4, 0.6))
  mast.position.set(A.comms.x, 7, A.comms.z)
  mast.castShadow = true
  scene.add(mast)
  const beacon = mast.clone()
  beacon.position.set(A.beacon.x, 8, A.beacon.z)
  scene.add(beacon)

  const wreck = makeWreck()
  wreck.position.set(A.crash.x, 0, A.crash.z)
  scene.add(wreck)

  const rng = mulberry32(11)
  const trunkCount = 46
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.16, 0.24, 1.5, 5),
    stdMat(0x5c4634),
    trunkCount,
  )
  const leaves = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1.25, 2.6, 6),
    stdMat(0x4d5e38),
    trunkCount,
  )
  trunks.castShadow = false
  const dummy = new THREE.Object3D()
  let placed = 0
  let guard = 0
  while (placed < trunkCount && guard < 800) {
    guard++
    const x = -115 + rng() * 230
    const z = -145 + rng() * 230
    if (onRoad(x, z)) continue
    if (KEEPOUT.some((k) => Math.hypot(x - k.x, z - k.z) < k.r)) continue
    if (STRUCTURES.some((s) => Math.abs(x - s.x) < s.w / 2 + 2 && Math.abs(z - s.z) < s.d / 2 + 2)) continue
    dummy.position.set(x, 0.75, z)
    dummy.rotation.y = rng() * 6
    dummy.scale.setScalar(0.8 + rng() * 0.7)
    dummy.updateMatrix()
    trunks.setMatrixAt(placed, dummy.matrix)
    dummy.position.y = 2.2
    dummy.updateMatrix()
    leaves.setMatrixAt(placed, dummy.matrix)
    if (rng() > 0.35) colliders.push({ x, z, hw: 0.35, hd: 0.35, y: 0, h: 1.6, active: true })
    placed++
  }
  trunks.count = placed
  leaves.count = placed
  scene.add(trunks)
  scene.add(leaves)

  const rocks = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.7, 0),
    stdMat(0x7a7268, 0.95, 0.02),
    28,
  )
  let rcount = 0
  guard = 0
  while (rcount < 28 && guard < 400) {
    guard++
    const x = -110 + rng() * 220
    const z = -140 + rng() * 220
    if (onRoad(x, z)) continue
    if (KEEPOUT.some((k) => Math.hypot(x - k.x, z - k.z) < k.r * 0.85)) continue
    dummy.position.set(x, 0.35, z)
    dummy.rotation.set(rng(), rng(), rng())
    dummy.scale.set(0.6 + rng(), 0.4 + rng() * 0.5, 0.6 + rng())
    dummy.updateMatrix()
    rocks.setMatrixAt(rcount, dummy.matrix)
    if (rng() > 0.4) colliders.push({ x, z, hw: 0.6, hd: 0.6, y: 0, h: 0.9, active: true })
    rcount++
  }
  rocks.count = rcount
  scene.add(rocks)

  const ridge = mulberry32(4)
  for (let i = 0; i < 9; i++) {
    const ang = ridge() * Math.PI * 2
    const rad = 200 + ridge() * 30
    const h = 28 + ridge() * 36
    const cone = new THREE.Mesh(new THREE.ConeGeometry(16 + ridge() * 14, h, 5), stdMat(0x6e6456, 1, 0))
    cone.position.set(Math.cos(ang) * rad, h * 0.28, Math.sin(ang) * rad)
    scene.add(cone)
  }

  const hemi = new THREE.HemisphereLight(0xc5d4e8, 0x6a5434, 0.55)
  scene.add(hemi)
  const ambient = new THREE.AmbientLight(0xfff2d0, 0.28)
  scene.add(ambient)
  const sun = new THREE.DirectionalLight(0xfff2d6, 1.25)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  const cam = sun.shadow.camera
  cam.left = -48
  cam.right = 48
  cam.top = 48
  cam.bottom = -48
  cam.near = 2
  cam.far = 130
  sun.shadow.bias = -0.0004
  scene.add(sun)
  scene.add(sun.target)

  const lamps: THREE.PointLight[] = []
  for (const p of [
    A.pad,
    { x: -56, z: 20 },
    { x: 76, z: -26 },
    A.bridge,
    A.compound,
    A.fortress,
  ]) {
    const lamp = new THREE.PointLight(0xffc58a, 0, 22, 2)
    lamp.position.set(p.x, 4.5, p.z)
    scene.add(lamp)
    lamps.push(lamp)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.2, 5), stdMat(0x333))
    pole.position.set(p.x, 2.1, p.z)
    scene.add(pole)
  }

  const rainCount = 700
  const rainPos = new Float32Array(rainCount * 3)
  for (let i = 0; i < rainCount; i++) {
    rainPos[i * 3] = (Math.random() - 0.5) * 80
    rainPos[i * 3 + 1] = Math.random() * 30
    rainPos[i * 3 + 2] = (Math.random() - 0.5) * 80
  }
  const rainGeo = new THREE.BufferGeometry()
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3))
  const rain = new THREE.Points(
    rainGeo,
    new THREE.PointsMaterial({ color: 0xd5e4ee, size: 0.08, transparent: true, opacity: 0.55 }),
  )
  rain.visible = false
  scene.add(rain)

  const flashlight = new THREE.SpotLight(0xfff1d0, 0, 42, 0.55, 0.4, 1.1)
  flashlight.castShadow = false
  scene.add(flashlight)
  scene.add(flashlight.target)

  const washMat = new THREE.MeshBasicMaterial({
    color: 0xc2b08a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })
  const wash = new THREE.Mesh(new THREE.CircleGeometry(1, 18), washMat)
  wash.rotation.x = -Math.PI / 2
  wash.position.y = 0.05
  wash.visible = false
  scene.add(wash)

  const cover = coverPoints(colliders)
  return {
    colliders,
    cover,
    sun,
    hemi,
    ambient,
    lamps,
    rain,
    rainPos,
    flashlight,
    wash,
    washMat,
    sunOffset: new THREE.Vector3(28, 42, 16),
    flashOn: false,
  }
}

function coverPoints(boxes: Collider[]): { x: number; z: number }[] {
  const pts: { x: number; z: number }[] = []
  for (const b of boxes) {
    if (!b.active || b.h < 0.9 || b.h > 6) continue
    if (b.hw > 12 || b.hd > 12) continue
    const spots = [
      { x: b.x - b.hw - 1.15, z: b.z },
      { x: b.x + b.hw + 1.15, z: b.z },
      { x: b.x, z: b.z - b.hd - 1.15 },
      { x: b.x, z: b.z + b.hd + 1.15 },
    ]
    for (const s of spots) {
      let blocked = false
      for (const o of boxes) {
        if (o === b || !o.active) continue
        if (Math.abs(s.x - o.x) < o.hw + 0.4 && Math.abs(s.z - o.z) < o.hd + 0.4 && o.h > 0.8) {
          blocked = true
          break
        }
      }
      if (!blocked) pts.push(s)
    }
  }
  return pts
}

export function applySky(world: WorldHandle, scene: THREE.Scene, hour: number, weather: Weather): void {
  const keys = [
    { h: 0, sky: 0x070912, fog: 0x10141c, sun: 0x334455, amb: 0x222838, hemi: 0x223, ground: 0x1a140e, sunI: 0.08, ambI: 0.22, hemiI: 0.15 },
    { h: 5.2, sky: 0x243454, fog: 0x3a3c48, sun: 0xff7a45, amb: 0x3a3048, hemi: 0x445, ground: 0x2a2018, sunI: 0.35, ambI: 0.25, hemiI: 0.22 },
    { h: 6.6, sky: 0xe38a62, fog: 0xd7a07a, sun: 0xffb070, amb: 0xffd0b0, hemi: 0xf0c0a0, ground: 0x6a4a32, sunI: 0.95, ambI: 0.38, hemiI: 0.4 },
    { h: 12, sky: 0x87b4d6, fog: 0xc9b89a, sun: 0xfff4dc, amb: 0xe4eef8, hemi: 0xc5d8ee, ground: 0x6a5434, sunI: 1.35, ambI: 0.32, hemiI: 0.55 },
    { h: 17.2, sky: 0xe07a48, fog: 0xc48462, sun: 0xff9050, amb: 0xf0b090, hemi: 0xe0a080, ground: 0x5a4030, sunI: 0.85, ambI: 0.34, hemiI: 0.42 },
    { h: 19.4, sky: 0x1c2438, fog: 0x2a242c, sun: 0xff6030, amb: 0x3a3040, hemi: 0x334, ground: 0x241810, sunI: 0.28, ambI: 0.2, hemiI: 0.18 },
    { h: 22, sky: 0x070912, fog: 0x10141e, sun: 0x445566, amb: 0x222838, hemi: 0x223044, ground: 0x14120e, sunI: 0.08, ambI: 0.2, hemiI: 0.12 },
    { h: 24, sky: 0x070912, fog: 0x10141c, sun: 0x334455, amb: 0x222838, hemi: 0x223, ground: 0x1a140e, sunI: 0.08, ambI: 0.22, hemiI: 0.15 },
  ]
  let i = 0
  while (i < keys.length - 1 && hour > (keys[i + 1]?.h ?? 24)) i++
  const a = keys[i] ?? keys[0]
  const b = keys[Math.min(keys.length - 1, i + 1)] ?? a
  if (!a || !b) return
  const span = b.h - a.h || 1
  const t = Math.min(1, Math.max(0, (hour - a.h) / span))
  const mix = (c1: number, c2: number) => new THREE.Color(c1).lerp(new THREE.Color(c2), t)
  let sky = mix(a.sky, b.sky)
  let fogC = mix(a.fog, b.fog)
  let near = 36
  let far = 175
  let sunI = a.sunI + (b.sunI - a.sunI) * t
  let ambI = a.ambI + (b.ambI - a.ambI) * t
  let hemiI = a.hemiI + (b.hemiI - a.hemiI) * t
  const night = hour < 5.6 || hour >= 19.5
  world.flashOn = night || weather === 'fog' || weather === 'mist'

  if (weather === 'storm') {
    sky = sky.multiplyScalar(0.45)
    fogC = new THREE.Color(0x2a3340)
    sunI *= 0.35
    near = 18
    far = 90
  } else if (weather === 'rain') {
    sky = sky.lerp(new THREE.Color(0x6d7c88), 0.45)
    fogC = fogC.lerp(new THREE.Color(0x7d8b96), 0.4)
    sunI *= 0.55
    far = 120
  } else if (weather === 'fog') {
    sky = new THREE.Color(0xc5c8cc)
    fogC = new THREE.Color(0xd0d3d6)
    sunI *= 0.4
    near = 4
    far = 28
  } else if (weather === 'mist') {
    fogC = fogC.lerp(new THREE.Color(0xd5d0c6), 0.55)
    near = 16
    far = 78
    sunI *= 0.75
  } else if (weather === 'cloudy') {
    sky = sky.lerp(new THREE.Color(0x9aa6b0), 0.35)
    sunI *= 0.7
    far = 140
  }

  scene.background = sky
  scene.fog = new THREE.Fog(fogC, near, far)
  world.sun.color.copy(mix(a.sun, b.sun))
  world.sun.intensity = sunI
  world.ambient.color.copy(mix(a.amb, b.amb))
  world.ambient.intensity = ambI
  world.hemi.color.copy(mix(a.hemi, b.hemi))
  world.hemi.groundColor.copy(mix(a.ground, b.ground))
  world.hemi.intensity = hemiI
  const az = ((hour - 6) / 12) * Math.PI
  world.sunOffset.set(Math.cos(az) * 36, 28 + Math.sin(az) * 18, Math.sin(az) * 24)
  const lampI = night ? 2.4 : weather === 'storm' ? 1.2 : 0
  for (const lamp of world.lamps) lamp.intensity = lampI
  world.rain.visible = weather === 'rain' || weather === 'storm'
  world.flashlight.intensity = world.flashOn ? (weather === 'fog' ? 18 : 12) : 0
}

export function updateRain(world: WorldHandle, dt: number, focus: THREE.Vector3): void {
  if (!world.rain.visible) return
  const arr = world.rainPos
  for (let i = 0; i < arr.length; i += 3) {
    let y = (arr[i + 1] ?? 0) - dt * 26
    if (y < 0) y = 18 + Math.random() * 12
    arr[i] = focus.x + ((((arr[i] ?? 0) - focus.x) % 80) + 80) % 80 - 40
    arr[i + 1] = y
    arr[i + 2] = focus.z + ((((arr[i + 2] ?? 0) - focus.z) % 80) + 80) % 80 - 40
  }
  const attr = world.rain.geometry.getAttribute('position') as THREE.BufferAttribute
  attr.needsUpdate = true
  world.rain.position.set(0, 0, 0)
}
