import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import './CompanyDetail.css'

// ── Inline field (same pattern as CompanyDetail) ──────────────────────────────
function InlineField({ label, value, onSave, type = 'text', multiline }) {
  const [active, setActive] = useState(false)
  const [val, setVal] = useState(value || '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { setVal(value || '') }, [value])
  useEffect(() => { if (active && inputRef.current) inputRef.current.focus() }, [active])

  async function confirm() {
    setSaving(true)
    try { await onSave(val) } finally { setSaving(false); setActive(false) }
  }

  return (
    <div className="ifield">
      <div className="ifield-label">{label}</div>
      {active ? (
        <div className="ifield-edit">
          {multiline
            ? <textarea ref={inputRef} value={val} rows={3} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === 'Escape' && setActive(false)} />
            : <input ref={inputRef} type={type} value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') setActive(false) }} />
          }
          <button className="ifield-ok" onClick={confirm} disabled={saving}>✓</button>
          <button className="ifield-x" onClick={() => { setVal(value || ''); setActive(false) }}>✕</button>
        </div>
      ) : (
        <div className="ifield-view" onClick={() => setActive(true)}>
          {val ? <span className="ifield-value">{val}</span> : <span className="ifield-empty">Non indiqué</span>}
          <span className="ifield-pencil">✎</span>
        </div>
      )}
    </div>
  )
}

// ── Status selector (same as CompanyDetail) ───────────────────────────────────
function StatusSelector({ entityId, statuses: initialStatuses, allStatuses, apiPath }) {
  const [current, setCurrent] = useState(initialStatuses)
  const [saving, setSaving] = useState(null)

  useEffect(() => { setCurrent(initialStatuses) }, [entityId])

  async function toggle(status) {
    setSaving(status.id)
    const isActive = current.find(s => s.id === status.id)
    setCurrent(prev => isActive ? prev.filter(s => s.id !== status.id) : [...prev, status])
    try {
      if (isActive) await api.delete(`${apiPath}/${entityId}/statuses/${status.id}`)
      else await api.post(`${apiPath}/${entityId}/statuses/${status.id}`)
    } catch {
      setCurrent(prev => isActive ? [...prev, status] : prev.filter(s => s.id !== status.id))
    } finally { setSaving(null) }
  }

  return (
    <div className="status-selector">
      {allStatuses.map(s => {
        const active = !!current.find(x => x.id === s.id)
        return (
          <button key={s.id} type="button"
            className={`status-option${active ? ' selected' : ''}`}
            style={{ '--sc': s.color }}
            onClick={() => toggle(s)}
            disabled={saving === s.id}
          >{saving === s.id ? '…' : s.name}</button>
        )
      })}
    </div>
  )
}

// ── New contact form ──────────────────────────────────────────────────────────
function NewContactForm() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', mobile: '', extension: '', email: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function save() {
    if (!form.first_name.trim()) { setError('Le prénom est requis.'); return }
    setSaving(true)
    try {
      const r = await api.post('/v1/contacts', form)
      navigate(`/contacts/${r.data.id}`)
    } catch { setError('Erreur lors de la création.') } finally { setSaving(false) }
  }

  return (
    <div className="new-form">
      {error && <div className="form-error">{error}</div>}
      <div className="form-grid">
        <div className="form-group">
          <label>Prénom *</label>
          <input value={form.first_name} onChange={e => f('first_name', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Nom</label>
          <input value={form.last_name} onChange={e => f('last_name', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Téléphone</label>
          <input value={form.phone} onChange={e => f('phone', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Cellulaire</label>
          <input value={form.mobile} onChange={e => f('mobile', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Poste</label>
          <input value={form.extension} onChange={e => f('extension', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Courriel</label>
          <input type="email" value={form.email} onChange={e => f('email', e.target.value)} />
        </div>
      </div>
      <div className="new-form-actions">
        <button className="btn-secondary" onClick={() => navigate('/contacts')}>Annuler</button>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Création...' : 'Créer le contact'}</button>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ContactDetail({ isNew }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [contact, setContact] = useState(null)
  const [loading, setLoading] = useState(!isNew)
  const [statuses, setStatuses] = useState([])

  useEffect(() => {
    api.get('/v1/ref/statuses').then(r => setStatuses(r.data))
    if (!isNew) load()
  }, [id, isNew])

  async function load() {
    setLoading(true)
    const r = await api.get(`/v1/contacts/${id}`)
    setContact(r.data)
    setLoading(false)
  }

  async function saveField(field, value) {
    await api.put(`/v1/contacts/${id}`, { [field]: value })
    setContact(prev => ({ ...prev, [field]: value }))
  }

  if (loading) return <div className="detail-loading">Chargement...</div>

  const c = contact

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div className="detail-breadcrumb">
          <button className="back-btn" onClick={() => navigate('/contacts')}>← Contacts</button>
          <span className="breadcrumb-sep">›</span>
          <span className="breadcrumb-name">
            {isNew ? 'Nouveau contact' : `${c.first_name} ${c.last_name}`.trim()}
          </span>
        </div>
      </div>

      <div className="detail-body">
        {isNew ? <NewContactForm /> : (
          <div>
            <div className="ifield-section-title">Statuts</div>
            <StatusSelector entityId={id} statuses={c.statuses} allStatuses={statuses} apiPath="/v1/contacts" />

            <div className="ifield-section-title" style={{ marginTop: 20 }}>Coordonnées</div>
            <div className="ifields-grid">
              <InlineField label="Prénom" value={c.first_name} onSave={v => saveField('first_name', v)} />
              <InlineField label="Nom" value={c.last_name} onSave={v => saveField('last_name', v)} />
              <InlineField label="Téléphone bureau" value={c.phone} onSave={v => saveField('phone', v)} />
              <InlineField label="Poste" value={c.extension} onSave={v => saveField('extension', v)} />
              <InlineField label="Cellulaire" value={c.mobile} onSave={v => saveField('mobile', v)} />
              <InlineField label="Courriel" value={c.email} onSave={v => saveField('email', v)} />
              <div className="ifield-full">
                <InlineField label="Notes internes" value={c.notes_internal} multiline onSave={v => saveField('notes_internal', v)} />
              </div>
            </div>

            {c.companies.length > 0 && (
              <>
                <div className="ifield-section-title" style={{ marginTop: 20 }}>Compagnies</div>
                {c.companies.map(co => (
                  <div key={co.contact_company_id} className="comm-row">
                    <button className="contact-name-link" onClick={() => navigate(`/companies/${co.company_id}`)}>{co.company_name}</button>
                    {co.functions.length > 0 && <span className="comm-label">{co.functions.join(', ')}</span>}
                    {co.is_primary && <span className="primary-badge">Principal</span>}
                  </div>
                ))}
              </>
            )}

            <div className="record-meta">
              Créé le {new Date(c.created_at).toLocaleString('fr-CA')}
              {c.updated_at !== c.created_at && <> · Modifié le {new Date(c.updated_at).toLocaleString('fr-CA')}</>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
