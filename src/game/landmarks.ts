/** Shared map anchors so mission objectives sit on the geometry. */

export interface Structure {
  id: string
  x: number
  z: number
  w: number
  d: number
  h: number
  color: number
}

export const A = {
  pad: { x: 0, z: 56 },
  jeep: { x: 16, z: 70 },
  truckPark: { x: 30, z: 86 },
  ridge: { x: 18, z: -36 },
  ridgeZone: { x: 18, z: -40 },
  motor: { x: 24, z: 52 },
  checkpoint: { x: 98, z: 0 },
  depotTruck: { x: 98, z: -16 },
  bridge: { x: 96, z: -70 },
  crash: { x: -96, z: 40 },
  bunker: { x: -22, z: -96 },
  bunkerStart: { x: -22, z: -76 },
  comms: { x: -80, z: -48 },
  commsPlant: { x: -80, z: -39 },
  compound: { x: 62, z: 46 },
  compoundStart: { x: 62, z: 72 },
  beacon: { x: 18, z: -132 },
  fortress: { x: -38, z: -124 },
  gate: { x: -38, z: -98 },
  fortHeli: { x: -38, z: -134 },
  safe: { x: -36, z: 92 },
  vip: { x: -52, z: 88 },
  gen: { x: -18, z: 48 },
  cacheV: { x: -74, z: 18 },
  cacheD: { x: 92, z: -38 },
  cacheR: { x: 34, z: -24 },
  northEnd: { x: 0, z: -140 },
}

export const STRUCTURES: Structure[] = [
  { id: 'v1', x: -66, z: 26, w: 8, d: 6, h: 4, color: 0xb08968 },
  { id: 'v2', x: -54, z: 29, w: 7, d: 7, h: 5.2, color: 0xc4a27a },
  { id: 'v3', x: -42, z: 22, w: 8, d: 5, h: 3.6, color: 0x9a7856 },
  { id: 'v4', x: -62, z: 14, w: 7, d: 6, h: 4, color: 0xa88862 },
  { id: 'v5', x: -48, z: 13, w: 6, d: 5, h: 3.4, color: 0xb59270 },
  { id: 'safe', x: -44, z: 78, w: 7, d: 6, h: 3.6, color: 0x8d6e4c },
  { id: 'lzHut', x: -18, z: 80, w: 5, d: 4, h: 3, color: 0x9c8060 },
  { id: 'tent1', x: 40, z: 80, w: 12, d: 5, h: 2.6, color: 0x6e6848 },
  { id: 'tent2', x: 14, z: 90, w: 6, d: 4, h: 2.3, color: 0x7a7454 },
  { id: 'comms', x: -80, z: -48, w: 7, d: 6, h: 3.2, color: 0x8a8e86 },
  { id: 'depotA', x: 76, z: -26, w: 14, d: 8, h: 5.5, color: 0x7d7568 },
  { id: 'depotB', x: 56, z: -34, w: 10, d: 8, h: 4.5, color: 0x6e675c },
]

export function roof(id: string): { x: number; z: number; y: number } {
  const s = STRUCTURES.find((v) => v.id === id)
  if (!s) throw new Error(`missing roof ${id}`)
  return { x: s.x, z: s.z, y: s.h }
}

export const SANDBAGS: { x: number; z: number; w: number; d: number }[] = [
  { x: -10, z: 42, w: 3.4, d: 0.7 },
  { x: -5.5, z: 42, w: 3.2, d: 0.7 },
  { x: 12, z: 40, w: 4.2, d: 0.75 },
  { x: 20, z: 46, w: 0.75, d: 3.2 },
  { x: 8, z: -43, w: 3.6, d: 0.8 },
  { x: 14, z: -43, w: 3.6, d: 0.8 },
  { x: 20, z: -43, w: 3.6, d: 0.8 },
  { x: 26, z: -43, w: 3.6, d: 0.8 },
  { x: 32, z: -39, w: 0.8, d: 3.4 },
]

export const KEEPOUT: { x: number; z: number; r: number }[] = [
  { x: 0, z: 56, r: 16 },
  { x: 62, z: 46, r: 28 },
  { x: -38, z: -124, r: 34 },
  { x: -22, z: -96, r: 18 },
  { x: -96, z: 40, r: 12 },
  { x: 18, z: -40, r: 18 },
  { x: 18, z: -132, r: 10 },
  { x: -80, z: -48, r: 12 },
  { x: 98, z: 0, r: 8 },
  { x: 96, z: -70, r: 12 },
]
