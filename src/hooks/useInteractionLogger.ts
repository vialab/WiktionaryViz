import { useEffect, useRef } from 'react'
import {
  flushInteractionEvents,
  getInteractionSessionId,
  recordInteractionEvent,
  type InteractionContext,
  type InteractionEventType,
} from '@/utils/eventLogger'

const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, summary, [role="button"], [data-event-target], [data-bubble-id], [data-map-entity], .leaflet-marker-icon, .leaflet-interactive'
const TEXT_LIMIT = 160

const targetFor = (element: Element) => {
  const target = element.closest(INTERACTIVE_SELECTOR) || element
  const data = target as HTMLElement
  const text = (target.textContent || '').replace(/\s+/g, ' ').trim().slice(0, TEXT_LIMIT)
  const label = target.getAttribute('aria-label') || target.getAttribute('title') || undefined
  const mapEntity = target.getAttribute('data-map-entity') || target.getAttribute('data-bubble-id') || undefined
  return {
    element: target,
    target: {
      tag: target.tagName.toLowerCase(),
      id: target.id || undefined,
      role: target.getAttribute('role') || undefined,
      label,
      text: text || undefined,
      testId: data.dataset.testid || undefined,
      href: target instanceof HTMLAnchorElement ? target.href : undefined,
      eventTarget: data.dataset.eventTarget || undefined,
      mapEntity,
    },
  }
}

const isTextInput = (target: EventTarget | null) => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement

export default function useInteractionLogger(context: InteractionContext) {
  const contextRef = useRef(context)
  contextRef.current = context
  useEffect(() => {
    if (typeof document === 'undefined') return
    getInteractionSessionId()
    recordInteractionEvent({
      type: 'session_start',
      route: window.location.pathname,
      target: { tag: 'document', eventTarget: 'app' },
      context: contextRef.current,
    })

    let lastHoverTarget: Element | null = null
    const record = (type: InteractionEventType, event: Event, key?: string) => {
      const resolved = targetFor(event.target instanceof Element ? event.target : document.body)
      if (resolved.element.closest('[data-event-ignore="true"]')) return
      const pointerEvent = event instanceof PointerEvent || event instanceof MouseEvent ? event : null
      recordInteractionEvent({
        type,
        route: window.location.pathname,
        target: resolved.target,
        context: contextRef.current,
        pointer: pointerEvent ? { x: pointerEvent.clientX, y: pointerEvent.clientY } : undefined,
        key,
      })
    }

    const onPointerOver = (event: PointerEvent) => {
      const resolved = targetFor(event.target instanceof Element ? event.target : document.body)
      if (resolved.element === lastHoverTarget || resolved.element.closest('[data-event-ignore="true"]')) return
      if (event.relatedTarget instanceof Node && resolved.element.contains(event.relatedTarget)) return
      if (lastHoverTarget) record('hover_end', { target: lastHoverTarget } as unknown as Event)
      lastHoverTarget = resolved.element
      record('hover_start', event)
    }
    const onPointerOut = (event: PointerEvent) => {
      if (!lastHoverTarget || (event.relatedTarget instanceof Node && lastHoverTarget.contains(event.relatedTarget))) return
      record('hover_end', event)
      lastHoverTarget = null
    }
    const onClick = (event: MouseEvent) => record('click', event)
    const onFocus = (event: FocusEvent) => record('focus', event)
    const onChange = (event: Event) => record('change', event)
    const onSubmit = (event: SubmitEvent) => record('submit', event)
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextInput(event.target)) return
      record('keydown', event, event.key)
    }

    document.addEventListener('pointerover', onPointerOver, true)
    document.addEventListener('pointerout', onPointerOut, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('focusin', onFocus, true)
    document.addEventListener('change', onChange, true)
    document.addEventListener('submit', onSubmit, true)
    document.addEventListener('keydown', onKeyDown, true)
    void flushInteractionEvents()

    const onPageHide = () => void flushInteractionEvents()
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('pointerover', onPointerOver, true)
      document.removeEventListener('pointerout', onPointerOut, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('focusin', onFocus, true)
      document.removeEventListener('change', onChange, true)
      document.removeEventListener('submit', onSubmit, true)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('pagehide', onPageHide)
      void flushInteractionEvents()
    }
  }, [])

  return { sessionId: getInteractionSessionId() }
}
