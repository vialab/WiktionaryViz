import { deserializeVisualizationState, restoreMapStateFromVisualizationState, serializeVisualizationState, type VisualizationStateEnvelope } from '@/utils/visualizationState'
import type { MapState } from '@/types/mapState'

export interface SavedViewRecord {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  state: VisualizationStateEnvelope
}

export interface SavedViewSequence {
  id: string
  name: string
  viewIds: string[]
  createdAt: string
  updatedAt: string
}

const SAVED_VIEWS_STORAGE_KEY = 'wiktionaryviz.saved-views.v1'
const SAVED_SEQUENCES_STORAGE_KEY = 'wiktionaryviz.saved-view-sequences.v1'

const hasLocalStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage)

const readJson = <T>(raw: string | null): T | null => {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

const writeJson = (key: string, value: unknown) => {
  if (!hasLocalStorage()) return
  window.localStorage.setItem(key, JSON.stringify(value))
}

const readStorageArray = <T>(key: string): T[] => {
  if (!hasLocalStorage()) return []
  const parsed = readJson<unknown>(window.localStorage.getItem(key))
  return Array.isArray(parsed) ? parsed as T[] : []
}

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `saved-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const buildTimestamp = () => new Date().toISOString()

const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ')

const cloneSequence = (sequence: SavedViewSequence): SavedViewSequence => ({
  ...sequence,
  viewIds: [...sequence.viewIds],
})

const normalizeSavedViewRecord = (record: unknown, fallbackWord = '', fallbackLanguage = ''): SavedViewRecord | null => {
  if (typeof record !== 'object' || record === null) return null
  const raw = record as Partial<SavedViewRecord> & { state?: unknown }
  const state = deserializeVisualizationState(raw.state, fallbackWord, fallbackLanguage)
  if (!state) return null

  if (typeof raw.id !== 'string' || typeof raw.name !== 'string' || typeof raw.createdAt !== 'string' || typeof raw.updatedAt !== 'string') {
    return null
  }

  return {
    id: raw.id,
    name: normalizeName(raw.name) || 'Untitled view',
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    state,
  }
}

const normalizeSavedViewSequence = (sequence: unknown): SavedViewSequence | null => {
  if (typeof sequence !== 'object' || sequence === null) return null
  const raw = sequence as Partial<SavedViewSequence>
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string' || !Array.isArray(raw.viewIds) || typeof raw.createdAt !== 'string' || typeof raw.updatedAt !== 'string') {
    return null
  }

  return {
    id: raw.id,
    name: normalizeName(raw.name) || 'Untitled sequence',
    viewIds: raw.viewIds.filter((viewId): viewId is string => typeof viewId === 'string' && Boolean(viewId.trim())).map(viewId => viewId.trim()),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }
}

export const loadSavedViews = (): SavedViewRecord[] => {
  if (!hasLocalStorage()) return []
  const parsed = readStorageArray<unknown>(SAVED_VIEWS_STORAGE_KEY)
  return parsed
    .map(entry => normalizeSavedViewRecord(entry))
    .filter((entry): entry is SavedViewRecord => entry !== null)
}

export const persistSavedViews = (views: SavedViewRecord[]) => {
  writeJson(SAVED_VIEWS_STORAGE_KEY, views)
}

export const loadSavedViewSequences = (): SavedViewSequence[] => {
  if (!hasLocalStorage()) return []
  const parsed = readStorageArray<unknown>(SAVED_SEQUENCES_STORAGE_KEY)
  return parsed
    .map(entry => normalizeSavedViewSequence(entry))
    .filter((entry): entry is SavedViewSequence => entry !== null)
}

export const persistSavedViewSequences = (sequences: SavedViewSequence[]) => {
  writeJson(SAVED_SEQUENCES_STORAGE_KEY, sequences.map(cloneSequence))
}

export const createSavedViewRecord = (name: string, mapState: MapState): SavedViewRecord => {
  const timestamp = buildTimestamp()
  return {
    id: createId(),
    name: normalizeName(name) || 'Untitled view',
    createdAt: timestamp,
    updatedAt: timestamp,
    state: serializeVisualizationState(mapState),
  }
}

export const updateSavedViewRecord = (record: SavedViewRecord, mapState: MapState): SavedViewRecord => ({
  ...record,
  updatedAt: buildTimestamp(),
  state: serializeVisualizationState(mapState),
})

export const renameSavedViewRecord = (record: SavedViewRecord, name: string): SavedViewRecord => ({
  ...record,
  name: normalizeName(name) || record.name,
  updatedAt: buildTimestamp(),
})

export const duplicateSavedViewRecord = (record: SavedViewRecord): SavedViewRecord => {
  const timestamp = buildTimestamp()
  return {
    ...record,
    id: createId(),
    name: `${record.name} Copy`,
    createdAt: timestamp,
    updatedAt: timestamp,
    state: deserializeVisualizationState(JSON.stringify(record.state), record.state.mapState.currentWord.word, record.state.mapState.currentWord.language) ?? record.state,
  }
}

export const exportSavedViewRecord = (record: SavedViewRecord): string => JSON.stringify(record, null, 2)

export const importSavedViewRecord = (rawJson: string): SavedViewRecord | null => {
  const parsed = readJson<unknown>(rawJson)
  return normalizeSavedViewRecord(parsed)
}

export const createSequence = (name: string, viewIds: string[] = []): SavedViewSequence => {
  const timestamp = buildTimestamp()
  return {
    id: createId(),
    name: normalizeName(name) || 'Untitled sequence',
    viewIds: [...viewIds],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export const addViewToSequence = (sequence: SavedViewSequence, viewId: string): SavedViewSequence => ({
  ...sequence,
  viewIds: sequence.viewIds.includes(viewId) ? sequence.viewIds : [...sequence.viewIds, viewId],
  updatedAt: buildTimestamp(),
})

export const removeViewFromSequence = (sequence: SavedViewSequence, viewId: string): SavedViewSequence => ({
  ...sequence,
  viewIds: sequence.viewIds.filter(candidate => candidate !== viewId),
  updatedAt: buildTimestamp(),
})

export const reorderSequenceView = (sequence: SavedViewSequence, viewId: string, direction: 'up' | 'down'): SavedViewSequence => {
  const index = sequence.viewIds.indexOf(viewId)
  if (index < 0) return sequence

  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= sequence.viewIds.length) return sequence

  const nextViewIds = [...sequence.viewIds]
  const [item] = nextViewIds.splice(index, 1)
  nextViewIds.splice(targetIndex, 0, item)

  return {
    ...sequence,
    viewIds: nextViewIds,
    updatedAt: buildTimestamp(),
  }
}

export const restoreMapStateFromSavedView = (
  record: SavedViewRecord,
  fallbackWord: string,
  fallbackLanguage: string,
) => restoreMapStateFromVisualizationState(record.state, fallbackWord, fallbackLanguage)
