import { useEffect } from 'react'
import { useBlocker } from 'react-router-dom'

export default function useUnsavedChangesGuard(isDirty) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => isDirty && currentLocation.pathname !== nextLocation.pathname
  )

  useEffect(() => {
    function handler(e) {
      if (!isDirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  return blocker
}
