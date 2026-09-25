# Iron Line

A third-person military shooter in the browser. You come in by helicopter over the Kesh Valley forward pad, step onto the ground, and fight **Hot LZ** — the only playable contract in this build.

Contracts 2–20 are listed on the board as **not built yet**. They have no gameplay.

## Run

```bash
npm install
npm run dev
```

The dev server binds to `0.0.0.0:4178`. Open [http://127.0.0.1:4178](http://127.0.0.1:4178).

## What you can play

1. **Deploy** opens the contract board. Only **01 Hot LZ** can be started.
2. The insertion bird descends and you get out on the pad. Enter skips the landing after it has started.
3. Eliminate the six-man reception. Death fails the contract. Progress for that contract is stored in `localStorage`.

On the pad you can use an **M9** and an **M4**, plus two frag grenades. A **jeep**, an **armored truck**, and the insertion **helicopter** can be boarded after you are on the ground.

## Controls

| Action | Key |
| --- | --- |
| Move | W A S D |
| Look | Mouse (click the view) or arrow keys |
| Sprint | Shift |
| Fire | Left mouse or J |
| Reload | R |
| Weapons | 1–6 or scroll |
| Grenade | G |
| Board / exit a vehicle | F |
| Helicopter | Space climbs, C descends |
| Ground vehicles | W/S throttle, A/D steer, Space brake |
| Pause | Esc |

Narrow windows show on-screen move, look, and fire controls. Keyboard still works.
