import { A } from './landmarks.ts'
import type { MissionDef } from './types.ts'

/** Only contract 1 is playable. Slots 2–20 are board placeholders. */
export interface BoardSlot {
  id: number
  name: string
  location: string
  objective: string
  built: boolean
}

const mission1: MissionDef = {
  id: 1,
  name: 'Hot LZ',
  location: 'Forward Pad',
  meta: 'Dawn · Clear',
  briefing:
    'Dustoff is bringing you in over the south road. The pad was supposed to be cold. A six-man reception is already in the ditches north of the skids. The bird will set down. You get out. Then you make the pad yours.',
  objective: 'Eliminate the six-man reception.',
  failure: 'You die on the pad.',
  winLine: 'The pad is quiet. That is the only contract on this board.',
  hour: 6.3,
  weather: 'clear',
  weapons: ['pistol', 'ar'],
  primary: 'ar',
  grenades: 2,
  start: { x: 4.2, z: 51, yaw: 0 },
  intro: true,
  steps: [{ kind: 'kill', need: 6, tag: 'host', label: 'Eliminate the reception' }],
  enemies: [
    { x: -3, z: 42, tag: 'host', behavior: 'aggressive' },
    { x: 2.6, z: 39, tag: 'host', behavior: 'sniper' },
    { x: 6, z: 41, tag: 'host', behavior: 'guard' },
    { x: 0, z: 36, tag: 'host', behavior: 'aggressive' },
    { x: 4, z: 34, tag: 'host', behavior: 'guard' },
    { x: -1, z: 45, tag: 'host', behavior: 'aggressive' },
  ],
  vehicles: [
    { kind: 'heli', x: A.pad.x, z: A.pad.z, yaw: 0, team: 'player', tag: 'insert-heli', scripted: true },
    { kind: 'jeep', x: 10, z: 64, yaw: 0, team: 'player', tag: 'jeep' },
    { kind: 'truck', x: A.truckPark.x, z: A.truckPark.z, yaw: Math.PI, team: 'player', tag: 'truck' },
  ],
  pickups: [
    { kind: 'health', x: -8, z: 48 },
    { kind: 'ammo', x: 14, z: 44 },
  ],
  props: [],
  waves: [],
  protect: [],
  arrivals: null,
  barrage: null,
  heliOnly: [],
}

export const MISSIONS: MissionDef[] = [mission1]

export function getMission(id: number): MissionDef | undefined {
  return MISSIONS.find((m) => m.id === id)
}

export function boardSlots(): BoardSlot[] {
  const slots: BoardSlot[] = [
    {
      id: 1,
      name: mission1.name,
      location: mission1.location,
      objective: mission1.objective,
      built: true,
    },
  ]
  for (let id = 2; id <= 20; id++) {
    slots.push({
      id,
      name: 'Not built yet',
      location: 'Kesh Valley',
      objective: 'This contract is not built yet.',
      built: false,
    })
  }
  return slots
}
