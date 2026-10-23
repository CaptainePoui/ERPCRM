import { useState, useEffect } from 'react'
import api from '../services/api'
import { askConfirm } from './Dialog'
import { todayIso } from '../utils/date'

// Anciens noms et anciennes coordonnees d'une compagnie ou d'un contact (TASK-002.8, 2026-10-23) : la fiche reste la
// meme ; ces valeurs servent a la retrouver (recherche) et a reconnaitre ses courriels d'une ancienne adresse.
const KIND = { name: 'Ancien nom', email: 'Ancien courriel', phone: 'Ancien téléphone' }
const C = { border: 'var(--c-border)', muted: 'var(--c-muted)', faint: 'var(--c-faint)', red: '#DC2626' }
const EMPTY = { kind: 'name', value: '', valid_from: '', valid_to: '', note: '' }

function errText(e) { return e.response?.data?.detail || 'Erreur' }

function FormerForm({ initial, kinds, onCancel, onSave }) {
  const [f, setF] = useState(initial)
  const [error, setError] = useState(null)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  async function save() {
    setError(null)
    try { await onSave({ ...f, valid_from: f.valid_from || null, valid_to: f.valid_to || null, note: f.note || null }) }
    catch (e) { setError(errText(e)) }
  }
  const field = { flex: '1 1 150px', minWidth: 0, marginBottom: 0 }
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div className="form-group" style={field}><label>Type</label>
          <select value={f.kind} onChange={e => set('kind', e.target.value)}>
            {kinds.map(k => <option key={k} value={k}>{KIND[k]}</option>)}</select></div>
        <div className="form-group" style={{ ...field, flex: '2 1 220px' }}><label>Valeur</label>
          <input value={f.value} onChange={e => set('value', e.target.value)} autoFocus /></div>
        <div className="form-group" style={field}><label>Depuis (optionnel)</label>
          <input type="date" value={f.valid_from || ''} onChange={e => set('valid_from', e.target.value)} /></div>
        <div className="form-group" style={field}><label>Jusqu'au</label>
          <input type="date" value={f.valid_to || ''} onChange={e => set('valid_to', e.target.value)} /></div>
      </div>
      <div className="form-group" style={{ marginTop: 10, marginBottom: 0 }}><label>Note</label>
        <input value={f.note || ''} onChange={e => set('note', e.target.value)} placeholder="ex. Avis par courriel de Jean-François Gagnon" /></div>
      {error && <div style={{ color: C.red, fontSize: 13, marginTop: 6 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10, flexWrap: 'wrap' }}>
        <button className="btn-secondary" onClick={onCancel}>Annuler</button>
        <button className="btn-primary" disabled={!f.value.trim()} onClick={save}>Enregistrer</button>
      </div>
    </div>
  )
}

export default function FormerInfoSection({ entityId, kinds = ['name', 'email', 'phone'], refreshKey }) {
  const [rows, setRows] = useState([])
  const [editing, setEditing] = useState(null)   // null | 'new' | id
  async function load() { setRows((await api.get('/v1/former-infos', { params: { entity_id: entityId } })).data) }
  useEffect(() => { load() }, [entityId, refreshKey])
  async function create(body) { await api.post('/v1/former-infos', { entity_id: entityId, ...body }); setEditing(null); load() }
  async function update(id, body) { await api.put(`/v1/former-infos/${id}`, { entity_id: entityId, ...body }); setEditing(null); load() }
  async function remove(r) {
    if (!await askConfirm(`Retirer « ${r.value} » des anciennes infos ? La fiche ne sera plus retrouvée par cette valeur.`)) return
    await api.delete(`/v1/former-infos/${r.id}`); load()
  }
  return (
    <div>
      {rows.length === 0 && editing !== 'new' && <div style={{ fontSize: 13, color: C.faint, marginBottom: 8 }}>Aucune. Garde ici un ancien nom, courriel ou téléphone : la fiche sera encore retrouvée par celui-ci (recherche, courriels reçus).</div>}
      {rows.map(r => editing === r.id
        ? <FormerForm key={r.id} kinds={kinds} initial={{ ...EMPTY, ...r, valid_from: r.valid_from || '', valid_to: r.valid_to || '', note: r.note || '' }}
            onCancel={() => setEditing(null)} onSave={b => update(r.id, b)} />
        : (
          <div key={r.id} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline', padding: '7px 0', borderBottom: '1px solid var(--c-surface-3)', fontSize: 13 }}>
            <span style={{ color: C.muted, minWidth: 120 }}>{KIND[r.kind]}</span>
            <span style={{ fontWeight: 600, flex: '1 1 180px', minWidth: 0, overflowWrap: 'anywhere' }}>{r.value}</span>
            <span style={{ color: C.muted }}>{r.period}</span>
            {r.note && <span style={{ color: C.faint, flexBasis: '100%', overflowWrap: 'anywhere' }}>{r.note}</span>}
            <span style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              <button className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => setEditing(r.id)}>Modifier</button>
              <button className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px', color: C.red }} onClick={() => remove(r)}>Retirer</button>
            </span>
          </div>
        ))}
      {editing === 'new'
        ? <FormerForm kinds={kinds} initial={{ ...EMPTY, kind: kinds[0], valid_to: todayIso() }} onCancel={() => setEditing(null)} onSave={create} />
        : <button className="btn-secondary" style={{ marginTop: 8 }} onClick={() => setEditing('new')}>+ Ajouter une ancienne info</button>}
    </div>
  )
}

// Fenetre au changement du nom d'une compagnie : changement de nom / achat (l'ancien est garde) ou simple correction
export function RenameCompanyModal({ company, newName, onClose, onDone }) {
  const [until, setUntil] = useState(todayIso())
  const [from, setFrom] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  async function rename() {
    setSaving(true); setError(null)
    try { await api.post(`/v1/former-infos/rename-company/${company.id}`, { name: newName, previous_until: until || null, previous_from: from || null, note: note || null }); onDone() }
    catch (e) { setError(errText(e)) } finally { setSaving(false) }
  }
  async function correct() {
    setSaving(true); setError(null)
    try { await api.put(`/v1/companies/${company.id}`, { name: newName }); onDone() }
    catch (e) { setError(errText(e)) } finally { setSaving(false) }
  }
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 520, width: '100%' }}>
        <h3 className="modal-title">« {company.name} » → « {newName} »</h3>
        <div style={{ fontSize: 14, marginBottom: 12 }}>Est-ce un <b>changement de nom</b> (ou un achat) de la compagnie, ou seulement la <b>correction</b> d'une faute ?</div>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>Changement de nom : « {company.name} » est gardé comme ancien nom (recherche, courriels).</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '1 1 160px', minWidth: 0, marginBottom: 0 }}><label>Ancien nom jusqu'au</label>
              <input type="date" value={until} onChange={e => setUntil(e.target.value)} /></div>
            <div className="form-group" style={{ flex: '1 1 160px', minWidth: 0, marginBottom: 0 }}><label>Depuis (optionnel)</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          </div>
          <div className="form-group" style={{ marginTop: 10, marginBottom: 0 }}><label>Note</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="ex. Avis par courriel du client" /></div>
        </div>
        {error && <div style={{ color: C.red, fontSize: 13 }}>{error}</div>}
        <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
          <button className="btn-secondary" disabled={saving} onClick={onClose}>Annuler</button>
          <button className="btn-secondary" disabled={saving} onClick={correct}>Correction seulement</button>
          <button className="btn-primary" disabled={saving} onClick={rename}>Changement de nom</button>
        </div>
      </div>
    </div>
  )
}
