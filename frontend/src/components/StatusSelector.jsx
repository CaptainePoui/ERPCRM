import { useEffect, useRef, useState } from 'react'
import api from '../services/api'
import { contrastText } from '../utils/color'

// Pastilles d'une fiche compagnie ou contact (TASK-002.13 ; contacts : TASK-002.15, Philippe 2026-11-02 « les pastilles
// des contacts, je veux le + comme les pastilles de compagnie, je ne veux pas toutes les avoir »).
// TASK-002.13 : seulement les pastilles de la fiche (✕ pour en enlever une), et un « + » pour en ajouter une à partir de
// la liste. onChange : les onglets de la fiche suivent ses pastilles.
export default function StatusSelector({ entityId, statuses: initialStatuses, allStatuses, apiPath, onChange }) {
  const [current, setCurrent] = useState(initialStatuses)
  const [saving, setSaving] = useState(null)
  const [adding, setAdding] = useState(false)
  const ref = useRef()

  useEffect(() => { setCurrent(initialStatuses) }, [entityId])

  useEffect(() => {
    if (!adding) return
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setAdding(false) }   // simple liste, rien à perdre
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [adding])

  async function toggle(status) {
    setSaving(status.id)
    setAdding(false)
    const isActive = current.find(s => s.id === status.id)
    const next = isActive ? current.filter(s => s.id !== status.id) : [...current, status]
    setCurrent(next)
    try {
      if (isActive) {
        await api.delete(`${apiPath}/${entityId}/statuses/${status.id}`)
      } else {
        await api.post(`${apiPath}/${entityId}/statuses/${status.id}`)
      }
      onChange?.(next)      // la fiche garde la liste à jour : changer d'onglet et revenir ne remet plus l'ancienne (2026-11-02)
    } catch {
      setCurrent(prev => isActive ? [...prev, status] : prev.filter(s => s.id !== status.id))
    } finally { setSaving(null) }
  }

  const worn = [...current].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  const offered = allStatuses.filter(s => !current.some(c => c.id === s.id))   // actives seulement (ref/statuses)
  return (
    <div className="status-selector" ref={ref} style={{ position: 'relative', alignItems: 'center' }}>
      {worn.map(s => (
        <span key={s.id} className="status-option selected" style={{ '--sc': s.color, '--sc-text': contrastText(s.color), cursor: 'default',
          display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {saving === s.id ? '…' : s.name}
          <button type="button" onClick={() => toggle(s)} disabled={saving === s.id} title={`Enlever la pastille « ${s.name} »`}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1, opacity: 0.8 }}>✕</button>
        </span>
      ))}
      {worn.length === 0 && <span style={{ color: 'var(--c-faint)', fontSize: 13 }}>Aucune pastille</span>}
      {offered.length > 0 && (
        <button type="button" className="status-option" onClick={() => setAdding(a => !a)} title="Ajouter une pastille"
          style={{ padding: '4px 10px' }}>+</button>
      )}
      {adding && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50, background: 'var(--c-surface)',
                      border: '1px solid var(--c-border-strong)', borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,.18)', padding: 8,
                      display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 420 }}>
          {offered.map(s => (
            <button key={s.id} type="button" className="status-option" onClick={() => toggle(s)}
              style={{ '--sc': s.color, borderColor: s.color }}>{s.name}</button>
          ))}
        </div>
      )}
    </div>
  )
}

