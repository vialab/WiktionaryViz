export type AnnotationCategoryKey = 'observation' | 'hypothesis' | 'question' | 'teaching' | 'presentation'

export const ANNOTATION_CATEGORIES: Array<{ key: AnnotationCategoryKey; label: string }> = [
  { key: 'observation', label: 'Observation' },
  { key: 'hypothesis', label: 'Hypothesis' },
  { key: 'question', label: 'Question' },
  { key: 'teaching', label: 'Teaching' },
  { key: 'presentation', label: 'Presentation' },
]

export const defaultAnnotationCategory: AnnotationCategoryKey = 'observation'

export function normalizeAnnotationCategory(value: unknown): AnnotationCategoryKey {
  if (typeof value === 'string' && ANNOTATION_CATEGORIES.some(category => category.key === value)) {
    return value as AnnotationCategoryKey
  }

  return defaultAnnotationCategory
}

export function getAnnotationCategoryLabel(category: AnnotationCategoryKey | null | undefined): string {
  const normalized = normalizeAnnotationCategory(category)
  return ANNOTATION_CATEGORIES.find(entry => entry.key === normalized)?.label ?? 'Observation'
}
