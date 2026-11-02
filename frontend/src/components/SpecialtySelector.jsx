import { useEffect, useRef, useState } from 'react'
import api from '../services/api'
import { contrastText } from '../utils/color'

// Spécialisations d'un contact (TASK-002.18, Philippe 2026-11-02 : « le contact n'est pas un fournisseur client ou un
// fournisseur, contact c'est sa spécialisation : TI, réseau, technique, facturation, compte payable/recevable,
// réception… »). Ce sont les fonctions du contact CHEZ une compagnie (une personne peut faire la facturation chez l'une et
// la technique chez l'autre) : pastilles colorées, ✕ pour en enlever, « + » pour en ajouter (choix de la compagnie s'il
// y en a plusieurs). La liste se gère dans Administration -> Configuration -> Spécialisations.
export default function SpecialtySelector({ contactId, companies, onChanged }) {
  const [all, setAll] = useState([])
  const [adding, setAdding] = useState(false)
  const [where, setWhere] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ref = useRef()
  const links = (companies || []).filter(co => co.is_active !== false)
  useEffect(() => { api.get('/v1/ref/functions').then(r => setAll(r.data)).catch(() => setAll([])) }, [])
  useEffect(() => { setWhere((links.find(l => l.is_primary) || links[0])?.company_id || '') }, [contactId, links.length])
  useEffect(() => {
    if (!adding) return
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setAdding(false) }   // simple liste, rien à perdre
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [adding])
  const byName = Object.fromEntries(all.map(f => [f.name, f]))

  async function save(link, names) {
    setBusy(true); setErr('')
    try {
      const ids = names.map(n => byName[n]?.id).filter(Boolean)
      await api.patch(`/v1/companies/${link.company_id}/contacts/${contactId}`, { function_ids: ids })
      setAdding(false)
      await onChanged?.()
    } catch (e) { setErr(e.response?.data?.detail || 'Enregistrement impossible') } finally { setBusy(false) }
  }

  if (!links.length) return <div style={{ fontSize: 13, color: 'var(--c-faint)' }}>Relie le contact à une compagnie pour lui donner une spécialisation (elle dit ce qu'il fait chez cette compagnie).</div>
  const many = links.length > 1
  const target = links.find(l => l.company_id === where) || links[0]
  const offered = all.filter(f => !(target.functions || []).includes(f.name))
  const chip = (name, onRemove, title) => {
    const color = byName[name]?.color || '#6B7280'
    return (
      <span key={name} className="status-option selected" title={title}
        style={{ '--sc': color, '--sc-text': contrastText(color), cursor: 'default', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {name}
        <button type="button" onClick={onRemove} disabled={busy} title={`Enlever « ${name} »`}
          style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1, opacity: 0.8 }}>✕</button>
      </span>
    )
  }
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div className="status-selector" style={{ alignItems: 'center' }}>
        {links.map(l => (l.functions || []).length > 0 && (
          <span key={l.company_id} style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {many && <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>{l.company_name} :</span>}
            {[...l.functions].sort((a, b) => a.localeCompare(b, 'fr')).map(n => chip(n, () => save(l, l.functions.filter(x => x !== n)), `${n} chez ${l.company_name}`))}
          </span>
        ))}
        {links.every(l => !(l.functions || []).length) && <span style={{ color: 'var(--c-faint)', fontSize: 13 }}>Aucune spécialisation</span>}
        <button type="button" className="status-option" onClick={() => setAdding(a => !a)} title="Ajouter une spécialisation" style={{ padding: '4px 10px' }}>+</button>
      </div>
      {adding && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50, background: 'var(--c-surface)', border: '1px solid var(--c-border-strong)',
                      borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,.18)', padding: 8, maxWidth: 480 }}>
          {many && (
            <div style={{ marginBottom: 6, fontSize: 13 }}>
              Chez <select value={where} onChange={e => setWhere(e.target.value)} style={{ fontSize: 13 }}>
                {links.map(l => <option key={l.company_id} value={l.company_id}>{l.company_name}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {offered.map(f => (
              <button key={f.id} type="button" className="status-option" disabled={busy} onClick={() => save(target, [...(target.functions || []), f.name])}
                style={{ '--sc': f.color || '#6B7280', borderColor: f.color || '#6B7280' }}>{f.name}</button>
            ))}
            {!offered.length && <span style={{ fontSize: 12, color: 'var(--c-faint)' }}>Il a déjà toutes les spécialisations ici.</span>}
          </div>
        </div>
      )}
      {err && <div style={{ color: '#DC2626', fontSize: 13, marginTop: 4 }}>{err}</div>}
    </div>
  )
}
