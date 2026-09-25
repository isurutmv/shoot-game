const KEY = 'iron-line-save-v1'

export interface SaveData {
  completed: number[]
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { completed: [] }
    const parsed = JSON.parse(raw) as SaveData
    const completed = Array.isArray(parsed.completed)
      ? parsed.completed.filter((n) => typeof n === 'number' && n >= 1 && n <= 20)
      : []
    return { completed }
  } catch {
    return { completed: [] }
  }
}

export function writeSave(save: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save))
  } catch {
    /* private mode */
  }
}

export function isUnlocked(_save: SaveData, id: number): boolean {
  return id === 1
}

export function markComplete(save: SaveData, id: number): SaveData {
  if (!save.completed.includes(id)) save.completed.push(id)
  writeSave(save)
  return save
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}
