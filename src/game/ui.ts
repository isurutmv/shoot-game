import type { BoardSlot } from './missions.ts'
import type { MissionDef } from './types.ts'
import type { SaveData } from './save.ts'
import { WEAPONS } from './weapons.ts'

export interface HudHooks {
  onDeploy: () => void
  onHowTo: () => void
  onSelect: (id: number) => void
  onBoardBack: () => void
  onBriefBack: () => void
  onStart: () => void
  onResume: () => void
  onRetry: () => void
  onAbort: () => void
  onNext: () => void
  onWipe: () => void
  onSkip: () => void
}

export type Mode = 'title' | 'missions' | 'brief' | 'intro' | 'play' | 'pause' | 'result'

function must<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`missing #${id}`)
  return node as T
}

export class Hud {
  private title = must<HTMLElement>('screen-title')
  private missions = must<HTMLElement>('screen-missions')
  private brief = must<HTMLElement>('screen-brief')
  private pause = must<HTMLElement>('screen-pause')
  private result = must<HTMLElement>('screen-result')
  private hud = must<HTMLElement>('hud')
  private grid = must<HTMLElement>('mission-grid')
  private letter = must<HTMLElement>('letterbox')
  private toastEl = must<HTMLElement>('toast')
  private toastTimer = 0

  constructor(hooks: HudHooks) {
    must<HTMLButtonElement>('btn-deploy').onclick = () => hooks.onDeploy()
    must<HTMLButtonElement>('btn-howto').onclick = () => hooks.onHowTo()
    must<HTMLButtonElement>('btn-board-back').onclick = () => hooks.onBoardBack()
    must<HTMLButtonElement>('btn-brief-back').onclick = () => hooks.onBriefBack()
    must<HTMLButtonElement>('btn-start').onclick = () => hooks.onStart()
    must<HTMLButtonElement>('btn-resume').onclick = () => hooks.onResume()
    must<HTMLButtonElement>('btn-retry').onclick = () => hooks.onRetry()
    must<HTMLButtonElement>('btn-abort').onclick = () => hooks.onAbort()
    must<HTMLButtonElement>('btn-next').onclick = () => hooks.onNext()
    must<HTMLButtonElement>('btn-again').onclick = () => hooks.onRetry()
    must<HTMLButtonElement>('btn-result-board').onclick = () => hooks.onAbort()
    must<HTMLButtonElement>('btn-wipe').onclick = () => hooks.onWipe()
    must<HTMLButtonElement>('btn-skip').onclick = () => hooks.onSkip()
    this.onSelect = hooks.onSelect
    this.syncTouch()
    window.addEventListener('resize', () => this.syncTouch())
  }

  syncTouch(): void {
    const show = window.innerWidth < 900 || window.matchMedia('(pointer: coarse)').matches
    must<HTMLElement>('touch').classList.toggle('hidden', !show)
  }

  setMode(mode: Mode): void {
    this.title.classList.toggle('hidden', mode !== 'title')
    this.missions.classList.toggle('hidden', mode !== 'missions')
    this.brief.classList.toggle('hidden', mode !== 'brief')
    this.pause.classList.toggle('hidden', mode !== 'pause')
    this.result.classList.toggle('hidden', mode !== 'result')
    const live = mode === 'play' || mode === 'intro'
    this.hud.classList.toggle('hidden', !live)
    this.letter.classList.toggle('on', mode === 'intro')
    must<HTMLElement>('btn-skip').classList.toggle('hidden', mode !== 'intro')
    must<HTMLElement>('crosshair').classList.toggle('hidden', mode !== 'play')
    must<HTMLElement>('lower').classList.toggle('hidden', mode !== 'play')
    must<HTMLElement>('obj-panel').classList.toggle('hidden', mode !== 'play')
    must<HTMLElement>('minimap').classList.toggle('hidden', mode !== 'play')
    must<HTMLElement>('compass').classList.toggle('hidden', mode !== 'play')
  }

  toggleHowTo(): void {
    must<HTMLElement>('howto').classList.toggle('hidden')
  }

  renderBoard(slots: BoardSlot[], save: SaveData): void {
    const closed = save.completed.includes(1)
    must<HTMLElement>('board-progress').textContent = closed
      ? 'Hot LZ is closed. Contracts 2–20 are not built yet.'
      : 'One contract is open. The other nineteen slots are not built yet.'
    this.grid.replaceChildren()
    for (const slot of slots) {
      const complete = slot.built && save.completed.includes(slot.id)
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = `card${complete ? ' done' : ''}${slot.built ? '' : ' locked'}`
      btn.disabled = !slot.built
      const num = document.createElement('div')
      num.className = 'num'
      num.textContent = `${slot.id.toString().padStart(2, '0')}  ${complete ? 'CLOSED' : slot.built ? 'OPEN' : 'NOT BUILT YET'}`
      const name = document.createElement('strong')
      name.textContent = slot.name
      const meta = document.createElement('em')
      meta.textContent = slot.location
      const obj = document.createElement('em')
      obj.textContent = slot.objective
      btn.append(num, name, meta, obj)
      if (slot.built) btn.onclick = () => this.onSelect?.(slot.id)
      this.grid.append(btn)
    }
  }

  onSelect: ((id: number) => void) | null = null

  showBrief(m: MissionDef): void {
    must<HTMLElement>('brief-kicker').textContent = `Contract ${m.id.toString().padStart(2, '0')} · ${m.location}`
    must<HTMLElement>('brief-name').textContent = m.name
    must<HTMLElement>('brief-meta').textContent = m.meta
    must<HTMLElement>('brief-body').textContent = m.briefing
    must<HTMLElement>('brief-obj').textContent = m.objective
    must<HTMLElement>('brief-fail').textContent = m.failure
    const kit = m.weapons.map((id) => WEAPONS[id].short).join(' · ')
    must<HTMLElement>('brief-kit').textContent =
      `Kit: ${kit}${m.grenades ? ` · frag ×${m.grenades}` : ''}${m.intro ? ' · helicopter insertion' : ''}`
  }

  showResult(win: boolean, title: string, body: string, stats: string, canNext: boolean): void {
    must<HTMLElement>('result-kicker').textContent = win ? 'Contract closed' : 'Contract failed'
    must<HTMLElement>('result-title').textContent = title
    must<HTMLElement>('result-body').textContent = body
    must<HTMLElement>('result-stats').textContent = stats
    must<HTMLButtonElement>('btn-next').classList.toggle('hidden', !canNext)
  }

  subtitle(text: string): void {
    must<HTMLElement>('subtitle').textContent = text
  }

  toast(text: string): void {
    this.toastEl.textContent = text
    this.toastTimer = 2.4
  }

  tickToast(dt: number): void {
    if (this.toastTimer <= 0) return
    this.toastTimer -= dt
    if (this.toastTimer <= 0) this.toastEl.textContent = ''
  }

  playHud(data: {
    kicker: string
    objective: string
    sub: string
    heading: string
    hp: number
    weapon: string
    mag: string
    reserve: string
    grenades: number
    reload: number
    prompt: string
    channel: number
    channelLabel: string
    vehicle: string
    weapons: { key: string; name: string; on: boolean }[]
    hurt: number
    hit: boolean
    showHint: boolean
  }): void {
    must<HTMLElement>('obj-kicker').textContent = data.kicker
    must<HTMLElement>('obj-text').textContent = data.objective
    must<HTMLElement>('obj-sub').textContent = data.sub
    must<HTMLElement>('compass-read').textContent = data.heading
    must<HTMLElement>('health-fill').style.width = `${Math.max(0, data.hp)}%`
    must<HTMLElement>('health-fill').style.background = data.hp < 35 ? '#e15a3a' : '#9dcc6a'
    must<HTMLElement>('health-num').textContent = `${Math.ceil(Math.max(0, data.hp))}`
    must<HTMLElement>('weapon-name').textContent = data.weapon
    must<HTMLElement>('mag').textContent = data.mag
    must<HTMLElement>('reserve').textContent = data.reserve
    must<HTMLElement>('grenade-count').textContent = `FRAG ${data.grenades}`
    must<HTMLElement>('reload-fill').style.width = `${data.reload * 100}%`
    must<HTMLElement>('prompt').textContent = data.prompt
    const channel = must<HTMLElement>('channel')
    channel.classList.toggle('hidden', data.channel <= 0)
    must<HTMLElement>('channel-fill').style.width = `${data.channel * 100}%`
    must<HTMLElement>('channel-label').textContent = data.channelLabel
    const veh = must<HTMLElement>('veh-line')
    veh.classList.toggle('hidden', !data.vehicle)
    veh.textContent = data.vehicle
    const list = must<HTMLElement>('weapon-list')
    list.replaceChildren()
    for (const w of data.weapons) {
      const li = document.createElement('li')
      li.className = w.on ? 'on' : ''
      li.textContent = `${w.key}  ${w.name}`
      list.append(li)
    }
    must<HTMLElement>('vignette').style.opacity = String(Math.min(0.85, data.hurt + (data.hp < 30 ? 0.25 : 0)))
    const hit = must<HTMLElement>('hitmark')
    hit.style.opacity = data.hit ? '1' : '0'
    must<HTMLElement>('hint').classList.toggle('hidden', !data.showHint)
  }

  setMarker(x: number, y: number, dist: string, visible: boolean, angle: number): void {
    const marker = must<HTMLElement>('marker')
    marker.classList.toggle('hidden', !visible)
    if (!visible) return
    marker.style.transform = `translate(${x}px, ${y}px)`
    must<HTMLElement>('marker-arrow').style.transform = `rotate(${angle}rad)`
    must<HTMLElement>('marker-dist').textContent = dist
  }
}
