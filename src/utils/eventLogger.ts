export type InteractionEventType = 'session_start' | 'click' | 'hover_start' | 'hover_end' | 'focus' | 'change' | 'submit' | 'keydown'

export interface InteractionContext {
  section?: string
  word?: string
  language?: string
  compareWord?: string
  compareLanguage?: string
}

export interface InteractionEvent {
  eventId: string
  sessionId: string
  timestamp: string
  type: InteractionEventType
  route: string
  target: {
    tag: string
    id?: string
    role?: string
    label?: string
    text?: string
    testId?: string
    href?: string
    eventTarget?: string
    mapEntity?: string
  }
  context: InteractionContext
  pointer?: { x: number; y: number }
  key?: string
}

const STORAGE_KEY = 'wiktionaryviz-interaction-events'
const SESSION_KEY = 'wiktionaryviz-interaction-session'
const MAX_EVENTS = 50000
const BATCH_SIZE = 100
type EventLoggerEnv = { VITE_EVENT_LOG_ENDPOINT?: string }
const eventLoggerEnv = (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: EventLoggerEnv }).env) || {}
const directSinkEndpoint = eventLoggerEnv.VITE_EVENT_LOG_ENDPOINT?.trim() || ''

const makeId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const readEvents = (): InteractionEvent[] => {
  if (typeof window === 'undefined') return []
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed as InteractionEvent[] : []
  } catch {
    return []
  }
}

const writeEvents = (events: InteractionEvent[]) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)))
  } catch {
    // Keep the current interaction usable if browser storage is unavailable or full.
  }
}

export const getInteractionEvents = () => readEvents()
export const getInteractionSessionId = () => {
  if (typeof window === 'undefined') return 'server'
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY)
    if (existing) return existing
  } catch {
    return 'session-unavailable'
  }
  const sessionId = makeId('session')
  try {
    window.sessionStorage.setItem(SESSION_KEY, sessionId)
  } catch {
    return 'session-unavailable'
  }
  return sessionId
}

let pendingFlush: Promise<boolean> = Promise.resolve(true)

export const recordInteractionEvent = (event: Omit<InteractionEvent, 'eventId' | 'sessionId' | 'timestamp'>) => {
  const next: InteractionEvent = {
    ...event,
    eventId: makeId('event'),
    sessionId: getInteractionSessionId(),
    timestamp: new Date().toISOString(),
  }
  const events = [...readEvents(), next].slice(-MAX_EVENTS)
  writeEvents(events)
  if (directSinkEndpoint && events.length >= BATCH_SIZE) void flushInteractionEvents()
  return next
}

export const flushInteractionEvents = () => {
  if (!directSinkEndpoint || typeof window === 'undefined') return Promise.resolve(false)
  pendingFlush = pendingFlush.then(async () => {
    const events = readEvents()
    if (!events.length) return true
    try {
      const response = await fetch(directSinkEndpoint, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ events: events.slice(0, BATCH_SIZE) }),
        keepalive: true,
      })
      if (response.type !== 'opaque' && !response.ok) return false
      const remaining = readEvents().slice(events.slice(0, BATCH_SIZE).length)
      writeEvents(remaining)
      return true
    } catch {
      return false
    }
  })
  return pendingFlush
}

export const clearInteractionEvents = () => {
  if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY)
}
