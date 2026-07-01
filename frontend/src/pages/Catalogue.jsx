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
        <button className="btn-primary" onClick={() => setEditing('new')}>+ Ajouter</button>
      </div>

      <div className="page-toolbar" style={{ gap: 10 }}>
        <input className="search-input" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="filter-tabs">
          {[['all','Tous'],['service','Services'],['materiel','Matériel']].map(([val, label]) => (
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
