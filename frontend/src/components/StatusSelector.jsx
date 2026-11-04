import { useEffect, useRef, useState } from 'react'
import api from '../services/api'
import { contrastText } from '../utils/color'

// Pastilles d'une fiche compagnie ou contact (TASK-002.13 ; contacts : TASK-002.15, Philippe 2026-11-02 « les pastilles
// des contacts, je veux le + comme les pastilles de compagnie, je ne veux pas toutes les avoir »).
// TASK-002.13 : seulement les pastilles de la fiche (✕ pour en enlever une), et un « + » pour en ajouter une à partir de
// la liste. onChange : les onglets de la fiche suivent ses pastilles.
// TASK-002.20 (2026-11-04) : Ctrl (ou Cmd) enfoncé en cliquant = la liste reste ouverte pour en ajouter plusieurs ; une
// pastille-menu (« Système numérique ») demande son choix (Norstar MICS…), affiché sur la pastille, changeable d'un clic.

function ChoicePicker({ status, value, onPick, onCancel }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <select autoFocus value={value || ''} onChange={e => onPick(e.target.value || null)}
        style={{ fontSize: 13, padding: '3px 6px', maxWidth: 360 }}>
        <option value="">{status.name} : choisir…</option>
        {(status.choices || []).map((g, i) => g.group
          ? <optgroup key={i} label={g.group}>{g.options.map(o => <option key={o} value={o}>{o}</option>)}</optgroup>
          : g.options.map(o => <option key={o} value={o}>{o}</option>))}
      </select>
      <button type="button" className="btn-secondary" style={{ fontSize: 12, padding: '3px 8px' }} onClick={onCancel}>Annuler</button>
    </span>
  )
}

export default function StatusSelector({ entityId, statuses: initialStatuses, allStatuses, apiPath, onChange }) {
  const [current, setCurrent] = useState(initialStatuses)
  const [saving, setSaving] = useState(null)
  const [adding, setAdding] = useState(false)
  const [picking, setPicking] = useState(null)      // { status, isNew } : choix du menu à faire
  const ref = useRef()

  useEffect(() => { setCurrent(initialStatuses) }, [entityId])

  useEffect(() => {
    if (!adding) return
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setAdding(false) }   // simple liste, rien à perdre
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [adding])

  async function add(status, choice = null) {
    setSaving(status.id)
    const next = [...current.filter(s => s.id !== status.id), { ...status, choice }]
    setCurrent(next)
    try {
      await api.post(`${apiPath}/${entityId}/statuses/${status.id}`, choice ? { choice } : undefined)
      onChange?.(next)      // la fiche garde la liste à jour : changer d'onglet et revenir ne remet plus l'ancienne (2026-11-02)
    } catch {
      setCurrent(prev => prev.filter(s => s.id !== status.id))
    } finally { setSaving(null) }
  }

  async function remove(status) {
    setSaving(status.id)
    const next = current.filter(s => s.id !== status.id)
    setCurrent(next)
    try {
      await api.delete(`${apiPath}/${entityId}/statuses/${status.id}`)
      onChange?.(next)
    } catch {
      setCurrent(prev => [...prev, status])
    } finally { setSaving(null) }
  }

  async function setChoice(status, choice) {
    setSaving(status.id)
    const before = current
    const next = current.map(s => (s.id === status.id ? { ...s, choice } : s))
    setCurrent(next)
    try {
      await api.post(`${apiPath}/${entityId}/statuses/${status.id}`, { choice })
      onChange?.(next)
    } catch { setCurrent(before) } finally { setSaving(null) }
  }

  function offer(e, status) {
    const keep = e.ctrlKey || e.metaKey
    if (!keep) setAdding(false)
    if (status.choice_menu && (status.choices || []).length) { setAdding(false); setPicking({ status, isNew: true }); return }
    add(status)
  }

  function picked(choice) {
    const { status, isNew } = picking
    setPicking(null)
    if (isNew) add(status, choice)
    else setChoice(status, choice)
  }

  const worn = [...current].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  const offered = allStatuses.filter(s => !current.some(c => c.id === s.id))   // actives seulement (ref/statuses)
  return (
    <div className="status-selector" ref={ref} style={{ position: 'relative', alignItems: 'center' }}>
      {worn.map(s => {
        const menu = s.choice_menu || s.choice
        return (
          <span key={s.id} className="status-option selected" style={{ '--sc': s.color, '--sc-text': contrastText(s.color), cursor: 'default',
            display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {saving === s.id ? '…' : menu ? (
              <span style={{ cursor: 'pointer' }} title={`Changer le choix de « ${s.name} »`}
                onClick={() => setPicking({ status: allStatuses.find(x => x.id === s.id) || s, isNew: false, value: s.choice })}>
                {s.name} · <span style={{ textTransform: 'none', fontWeight: 600 }}>{s.choice || 'choisir…'}</span>
              </span>
            ) : s.name}
            <button type="button" onClick={() => remove(s)} disabled={saving === s.id} title={`Enlever la pastille « ${s.name} »`}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1, opacity: 0.8 }}>✕</button>
          </span>
        )
      })}
      {worn.length === 0 && <span style={{ color: 'var(--c-faint)', fontSize: 13 }}>Aucune pastille</span>}
      {offered.length > 0 && (
        <button type="button" className="status-option" onClick={() => setAdding(a => !a)}
          title="Ajouter une pastille (Ctrl enfoncé en cliquant : en ajouter plusieurs)" style={{ padding: '4px 10px' }}>+</button>
      )}
      {picking && <ChoicePicker status={picking.status} value={picking.value} onPick={picked} onCancel={() => setPicking(null)} />}
      {adding && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50, background: 'var(--c-surface)',
                      border: '1px solid var(--c-border-strong)', borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,.18)', padding: 8,
                      display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 420 }}>
          {offered.map(s => (
            <button key={s.id} type="button" className="status-option" onClick={e => offer(e, s)}
              style={{ '--sc': s.color, borderColor: s.color }}>{s.name}{s.choice_menu ? ' ▾' : ''}</button>
          ))}
          <div style={{ width: '100%', fontSize: 11, color: 'var(--c-faint)', marginTop: 2 }}>Ctrl enfoncé en cliquant : en ajouter plusieurs</div>
        </div>
      )}
    </div>
  )
}
