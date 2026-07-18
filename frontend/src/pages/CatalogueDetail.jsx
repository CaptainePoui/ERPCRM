import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import './CatalogueDetail.css'

const API_BASE = import.meta.env.VITE_API_BASE || ''

function InlineField({ label, value, onSave, type = 'text', multiline, options }) {
  const [active, setActive] = useState(false)
  const [val, setVal] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef()

  useEffect(() => { setVal(value ?? '') }, [value])
  useEffect(() => { if (active && inputRef.current) inputRef.current.focus() }, [active])

  async function confirm() {
    setSaving(true)
    try { await onSave(val === '' ? null : val) } finally { setSaving(false); setActive(false) }
  }
  function cancel() { setVal(value ?? ''); setActive(false) }

  return (
    <div className={`ifield${active ? ' ifield-active' : ''}`}>
      <div className="ifield-label">{label}</div>
      {active ? (
        <div className="ifield-edit">
          {options ? (
            <select ref={inputRef} value={val ?? ''} onChange={e => setVal(e.target.value)}>
              {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : multiline ? (
            <textarea ref={inputRef} value={val ?? ''} onChange={e => setVal(e.target.value)} rows={4} />
          ) : (
            <input ref={inputRef} type={type} value={val ?? ''} onChange={e => setVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') cancel() }} />
          )}
          <button className="ifield-ok" onClick={confirm} disabled={saving}>✓</button>
          <button className="ifield-x" onClick={cancel}>✕</button>
        </div>
      ) : (
        <div className="ifield-view" onClick={() => setActive(true)}>
          {value != null && value !== ''
            ? <span className="ifield-value">{value}</span>
            : <span className="ifield-empty">Non indiqué</span>}
          <span className="ifield-pencil">✎</span>
        </div>
      )}
    </div>
  )
}

export default function CatalogueDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    api.get(`/v1/catalogue/${id}`).then(r => setItem(r.data)).finally(() => setLoading(false))
  }, [id])

  async function save(field, value) {
    const r = await api.put(`/v1/catalogue/${id}`, { [field]: value })
    setItem(r.data)
  }

  async function uploadImage(file) {
    const fd = new FormData()
    fd.append('file', file)
    const r = await api.post(`/v1/catalogue/${id}/image`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    setItem(r.data)
  }

  function onDrop(e) {
    e.preventDefault(); setDrag(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadImage(file)
  }

  if (loading) return <div className="page"><div className="loading">Chargement...</div></div>
  if (!item) return null

  const imgSrc = item.image_url ? `${API_BASE}${item.image_url}` : null

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-secondary" onClick={() => navigate('/catalogue')} style={{ padding: '6px 12px' }}>← Retour</button>
          <div>
            <h1 className="page-title" style={{ marginBottom: 2 }}>{item.name}</h1>
            <p className="page-sub">
              <span className={`cat-type-badge ${item.type}`}>{item.type === 'service' ? 'Service' : 'Matériel'}</span>
              {' '}{item.price.toFixed(2)} $ CAD
            </p>
          </div>
        </div>
        <button
          className={item.is_active ? 'btn-secondary' : 'btn-primary'}
          onClick={() => save('is_active', !item.is_active)}
        >
          {item.is_active ? 'Désactiver' : 'Activer'}
        </button>
      </div>

      <div className="catd-grid">
        <div className="catd-left">
          <div className={`catd-img${drag ? ' drag-over' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false) }}
            onDrop={onDrop}
          >
            {imgSrc
              ? <img src={imgSrc} alt={item.name} draggable={false} />
              : <span className="catd-img-placeholder">Cliquer ou glisser une image</span>}
            <div className="catd-img-overlay">Changer l'image</div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => { if (e.target.files[0]) { uploadImage(e.target.files[0]); e.target.value = '' } }} />

          <div className="catd-section">
            <div className="catd-section-title">Informations</div>
            <InlineField label="Nom" value={item.name} onSave={v => save('name', v)} />
            <InlineField label="Type" value={item.type} onSave={v => save('type', v)}
              options={[{ value: 'service', label: 'Service' }, { value: 'materiel', label: 'Matériel' }]} />
            <InlineField label="Prix (CAD)" value={String(item.price)} onSave={v => save('price', parseFloat(v) || 0)} type="number" />
            {item.type === 'service' && (
              <div className="ifield" style={{ cursor: 'default' }}>
                <div className="ifield-label">Catégorie</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!item.linked_to_hourly_rate}
                    onChange={async e => {
                      const r = await api.put(`/v1/catalogue/${id}`, { linked_to_hourly_rate: e.target.checked })
                      setItem(r.data)
                    }}
                    style={{ width: 16, height: 16, accentColor: '#184FA0', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 14, color: '#374151' }}>
                    Connaissance Simple IP <span style={{ fontSize: 12, color: '#6B7280' }}>(lié au taux horaire)</span>
                  </span>
                </label>
                {!item.linked_to_hourly_rate && (
                  <div style={{ fontSize: 12, color: '#6B7280', paddingLeft: 26 }}>Service serveur — lié à l'inflation</div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="catd-right">
          <div className="catd-section">
            <div className="catd-section-title">Description</div>
            <InlineField label="Description" value={item.description} onSave={v => save('description', v)} multiline />
          </div>

          <div className="catd-section">
            <div className="catd-section-title">Notes internes</div>
            <InlineField label="Notes" value={item.notes} onSave={v => save('notes', v)} multiline />
          </div>
        </div>
      </div>
    </div>
  )
}
