import { useState, useRef } from 'react'

// Selection multiple dans une liste (TASK-046, 2026-10-08) -- trois facons, comme Philippe l'a demande :
// la case a cocher, Ctrl+clic (une ligne a la fois, separement) et Maj+clic (tout entre la derniere ligne
// ciblee et celle-ci). Un clic simple sur la ligne garde son effet habituel (ouvrir la fiche).
// rows = liste affichee, dans l'ordre (pour la plage Maj+clic).
export default function useRowSelection(rows) {
  const [selected, setSelected] = useState(() => new Set())
  const anchor = useRef(null)

  function range(toId) {
    const ids = rows.map(r => r.id)
    const a = ids.indexOf(anchor.current), b = ids.indexOf(toId)
    if (a < 0 || b < 0) return [toId]
    return ids.slice(Math.min(a, b), Math.max(a, b) + 1)
  }

  // Case a cocher (Maj sur la case = plage aussi)
  function toggle(id, e) {
    setSelected(prev => {
      const n = new Set(prev)
      if (e?.shiftKey && anchor.current) range(id).forEach(x => n.add(x))
      else if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
    anchor.current = id
  }

  // Clic sur la ligne : Ctrl/Cmd = cocher/decocher, Maj = plage ; sinon open()
  function rowClick(e, id, open) {
    if (e.ctrlKey || e.metaKey) { toggle(id); return }
    if (e.shiftKey) {
      setSelected(prev => { const n = new Set(prev); range(id).forEach(x => n.add(x)); return n })
      if (!anchor.current) anchor.current = id
      return
    }
    open?.()
  }

  // Empeche le navigateur de surligner le texte pendant Maj+clic
  const noTextSelect = e => { if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault() }

  const visible = rows.filter(r => selected.has(r.id))
  const allChecked = rows.length > 0 && rows.every(r => selected.has(r.id))
  function toggleAll() {
    setSelected(prev => {
      const n = new Set(prev)
      if (allChecked) rows.forEach(r => n.delete(r.id)); else rows.forEach(r => n.add(r.id))
      return n
    })
  }
  const clear = () => { setSelected(new Set()); anchor.current = null }

  return { selected, visible, toggle, rowClick, noTextSelect, allChecked, toggleAll, clear }
}
