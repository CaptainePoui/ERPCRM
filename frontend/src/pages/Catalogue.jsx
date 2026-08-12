import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import './Catalogue.css'

const API_BASE = import.meta.env.VITE_API_BASE || ''

export default function Catalogue() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [classifying, setClassifying] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/v1/catalogue').then(r => setItems(r.data)).finally(() => setLoading(false))
  }, [])

  const filtered = items.filter(i => {
    const matchType = filter === 'all' || i.type === filter
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase())
    return matchType && matchSearch
  })

  async function saveEdit(id, field, value) {
    await api.put(`/v1/catalogue/${id}`, { [field]: value })
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Catalogue</h1>
          <p className="page-sub">{items.length} items</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={() => setClassifying(true)}>Classer les articles</button>
          <button className="btn-primary" onClick={() => setEditing('new')}>+ Ajouter</button>
        </div>
      </div>

      <div className="page-toolbar" style={{ gap: 10 }}>
        <input className="search-input" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="filter-tabs">
          {[['all','Tous'],['service','Services'],['materiel','Matériel'],['connaissance','Connaissance']].map(([val, label]) => (
            <button key={val} className={`filter-tab${filter === val ? ' active' : ''}`} onClick={() => setFilter(val)}>{label}</button>
          ))}
        </div>
      </div>

      {loading ? <div className="loading">Chargement...</div> : (
        <div className="cat-grid">
          {filtered.map(item => (
            <CatalogueCard key={item.id} item={item} onSave={saveEdit} onDetail={() => navigate(`/catalogue/${item.id}`)} />
          ))}
          {filtered.length === 0 && <div className="empty-cat">Aucun résultat</div>}
        </div>
      )}

      {editing === 'new' && <NewItemModal onClose={() => setEditing(null)} onCreated={item => { setItems(p => [...p, item]); setEditing(null) }} />}
      {classifying && <ClassifyModal items={items} onSave={saveEdit} onClose={() => setClassifying(false)} />}
    </div>
  )
}

function CatalogueCard({ item, onSave, onDetail }) {
  const [drag, setDrag] = useState(false)
  const fileRef = useRef(null)

  async function uploadImage(file) {
    const fd = new FormData()
    fd.append('file', file)
    const r = await api.post(`/v1/catalogue/${item.id}/image`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    onSave(item.id, 'image_url', r.data.image_url)
  }

  function onDrop(e) {
    e.preventDefault(); setDrag(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadImage(file)
  }

  async function toggleActive() {
    await onSave(item.id, 'is_active', !item.is_active)
  }

  const imgSrc = item.image_url ? `${API_BASE}${item.image_url}` : null

  return (
    <div className={`cat-card${!item.is_active ? ' cat-inactive' : ''}`}>
      <div className={`cat-img${drag ? ' drag-over' : ''}`}>
        {imgSrc ? <img src={imgSrc} alt={item.name} draggable={false} style={{ pointerEvents: 'none' }} /> : <span className="cat-img-placeholder">📷</span>}
        <div
          className="cat-img-overlay"
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false) }}
          onDrop={onDrop}
          title="Cliquer ou glisser pour changer l'image"
        >📷 Changer</div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) { uploadImage(e.target.files[0]); e.target.value = '' } }} />
      </div>
      <div className="cat-info" style={{ cursor: 'pointer' }} onClick={onDetail}>
        <div className="cat-name">{item.name}</div>
        <div className="cat-meta">
          <span className={`cat-type ${item.type}`}>{item.type === 'service' ? 'Service' : 'Matériel'}</span>
          <span className="cat-price">{item.price.toFixed(2)} $</span>
        </div>
      </div>
      <button className="cat-toggle" onClick={toggleActive} title={item.is_active ? 'Désactiver' : 'Activer'}>
        {item.is_active ? '✓' : '○'}
      </button>
    </div>
  )
}

function NewItemModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', type: 'service', price: '' })
  const [saving, setSaving] = useState(false)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const r = await api.post('/v1/catalogue', { ...form, price: parseFloat(form.price) || 0 })
      onCreated(r.data)
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Nouvel item</h3>
        <div className="form-group">
          <label>Nom</label>
          <input value={form.name} onChange={e => f('name', e.target.value)} autoFocus />
        </div>
        <div className="form-group">
          <label>Type</label>
          <select value={form.type} onChange={e => f('type', e.target.value)}>
            <option value="service">Service</option>
            <option value="materiel">Matériel</option>
            <option value="connaissance">Connaissance</option>
          </select>
        </div>
        <div className="form-group">
          <label>Prix (CAD)</label>
          <input type="number" step="0.01" value={form.price} onChange={e => f('price', e.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving || !form.name.trim()}>{saving ? '...' : 'Créer'}</button>
        </div>
      </div>
    </div>
  )
}

const CLASSIFY_TYPES = [['materiel', 'Matériel'], ['service', 'Service'], ['connaissance', 'Connaissance']]

function ClassifyModal({ items, onSave, onClose }) {
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box classify-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Classer les articles</h3>
        <div className="classify-list">
          <div className="classify-header">
            <span>Article</span>
            <span>Matériel</span>
            <span>Service</span>
            <span>Connaissance</span>
            <span>Urgence x2</span>
            <span>Cours x3</span>
          </div>
          {sorted.map(item => (
            <ClassifyRow key={item.id} item={item} onSave={onSave} />
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn-primary" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  )
}

function ClassifyRow({ item, onSave }) {
  const [showTip, setShowTip] = useState(false)
  const timerRef = useRef(null)

  function onEnter() {
    timerRef.current = setTimeout(() => setShowTip(true), 3000)
  }
  function onLeave() {
    clearTimeout(timerRef.current)
    setShowTip(false)
  }

  return (
    <div className="classify-row">
      <div className="classify-name" onMouseEnter={onEnter} onMouseLeave={onLeave}>
        {item.name}
        {showTip && item.description && <div className="classify-tooltip">{item.description}</div>}
      </div>
      {CLASSIFY_TYPES.map(([val]) => (
        <div key={val} className="classify-cell">
          <input
            type="checkbox"
            checked={item.type === val}
            onChange={() => onSave(item.id, 'type', val)}
          />
        </div>
      ))}
      <div className="classify-cell">
        <input
          type="checkbox"
          checked={item.rate_multiplier === 2}
          onChange={() => onSave(item.id, 'rate_multiplier', item.rate_multiplier === 2 ? null : 2)}
        />
      </div>
      <div className="classify-cell">
        <input
          type="checkbox"
          checked={item.rate_multiplier === 3}
          onChange={() => onSave(item.id, 'rate_multiplier', item.rate_multiplier === 3 ? null : 3)}
        />
      </div>
    </div>
  )
}
