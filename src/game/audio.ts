import type { WeaponId } from './types.ts'

export class AudioBus {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private rotorGain: GainNode | null = null
  private engineGain: GainNode | null = null
  private engineOsc: OscillatorNode | null = null

  resume(): void {
    this.ensure()
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume()
  }

  private ensure(): void {
    if (this.ctx) return
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const master = ctx.createGain()
    master.gain.value = 0.32
    master.connect(ctx.destination)
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    this.ctx = ctx
    this.master = master
    this.noiseBuf = noise

    const rotor = ctx.createOscillator()
    rotor.type = 'sawtooth'
    rotor.frequency.value = 62
    const rg = ctx.createGain()
    rg.gain.value = 0
    const rf = ctx.createBiquadFilter()
    rf.type = 'lowpass'
    rf.frequency.value = 220
    rotor.connect(rf)
    rf.connect(rg)
    rg.connect(master)
    rotor.start()
    this.rotorGain = rg

    const eng = ctx.createOscillator()
    eng.type = 'triangle'
    eng.frequency.value = 74
    const eg = ctx.createGain()
    eg.gain.value = 0
    eng.connect(eg)
    eg.connect(master)
    eng.start()
    this.engineGain = eg
    this.engineOsc = eng
  }

  setRotor(amount: number): void {
    if (!this.ctx || !this.rotorGain) return
    this.rotorGain.gain.setTargetAtTime(Math.max(0, amount) * 0.07, this.ctx.currentTime, 0.12)
  }

  setEngine(amount: number, heavy: boolean): void {
    if (!this.ctx || !this.engineGain || !this.engineOsc) return
    this.engineOsc.frequency.setTargetAtTime(heavy ? 48 : 78, this.ctx.currentTime, 0.1)
    this.engineGain.gain.setTargetAtTime(Math.max(0, amount) * 0.05, this.ctx.currentTime, 0.1)
  }

  gun(id: WeaponId): void {
    this.ensure()
    if (id === 'rocket') {
      this.noise(0.35, 0.35, 500)
      this.tone(180, 0.28, 'sawtooth', 0.12)
      return
    }
    if (id === 'shotgun') {
      this.noise(0.22, 0.5, 420)
      this.tone(90, 0.18, 'triangle', 0.16)
      return
    }
    if (id === 'sniper') {
      this.noise(0.16, 0.42, 1400)
      this.tone(140, 0.2, 'square', 0.08)
      return
    }
    if (id === 'smg') {
      this.noise(0.05, 0.22, 1600)
      return
    }
    if (id === 'pistol') {
      this.noise(0.07, 0.28, 1800)
      this.tone(220, 0.06, 'square', 0.05)
      return
    }
    this.noise(0.08, 0.3, 980)
    this.tone(120, 0.07, 'triangle', 0.06)
  }

  dry(): void {
    this.tone(420, 0.04, 'square', 0.04)
  }

  reload(): void {
    this.tone(640, 0.05, 'square', 0.04)
  }

  reloadDone(): void {
    this.tone(880, 0.06, 'square', 0.05)
  }

  explosion(): void {
    this.noise(0.45, 0.55, 180)
    this.tone(55, 0.4, 'sine', 0.2)
  }

  hit(): void {
    this.tone(1200, 0.04, 'square', 0.03)
  }

  blip(): void {
    this.tone(520, 0.05, 'square', 0.04)
  }

  sting(): void {
    this.tone(330, 0.12, 'triangle', 0.06)
    window.setTimeout(() => this.tone(440, 0.16, 'triangle', 0.06), 120)
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number): void {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.45), t + dur)
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(g)
    g.connect(this.master)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  private noise(dur: number, gain: number, freq: number): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return
    const t = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const f = this.ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = freq
    f.Q.value = 0.7
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    src.connect(f)
    f.connect(g)
    g.connect(this.master)
    src.start(t)
    src.stop(t + dur + 0.02)
  }
}
