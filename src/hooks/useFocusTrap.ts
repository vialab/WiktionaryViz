import { useEffect, type RefObject } from 'react'

const focusableSelector =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const getFocusableElements = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    element => !element.hasAttribute('disabled') && element.tabIndex !== -1,
  )

const useFocusTrap = (active: boolean, containerRef: RefObject<HTMLElement | null>) => {
  useEffect(() => {
    if (!active) return

    const container = containerRef.current
    if (!container) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusables = getFocusableElements(container)
    const target = focusables[0] ?? container
    window.setTimeout(() => {
      target.focus({ preventScroll: true })
    }, 0)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return

      const currentContainer = containerRef.current
      if (!currentContainer) return

      const elements = getFocusableElements(currentContainer)
      if (!elements.length) {
        event.preventDefault()
        currentContainer.focus({ preventScroll: true })
        return
      }

      const first = elements[0]
      const last = elements[elements.length - 1]
      const activeElement = document.activeElement as HTMLElement | null

      if (event.shiftKey) {
        if (activeElement === first || !currentContainer.contains(activeElement)) {
          event.preventDefault()
          last.focus({ preventScroll: true })
        }
        return
      }

      if (activeElement === last) {
        event.preventDefault()
        first.focus({ preventScroll: true })
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus({ preventScroll: true })
    }
  }, [active, containerRef])
}

export default useFocusTrap
