import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import './PurchaseOrders.css'

const STATUS_STYLES = {
  brouillon:           { color: '#6B7280', bg: '#F3F4F6', label: 'Brouillon' },
  envoye:              { color: '#2563EB', bg: '#EFF6FF', label: 'Envoyé' },
  partiellement_recu:  { color: '#D97706', bg: '#FFFBEB', label: 'Partiel' },
  recu:                { color: '#059669', bg: '#F0FDF4', label: 'Reçu' },
  annule:              { color: '#DC2626', bg: '#FEF2F2', label: 'Annulé' },
}

const fmt = n => `${parseFloat(n || 0).toFixed(2)} $`
const fmtDate = s => s ? new Date(s).toLocaleDateString('fr-CA') : '—'

export default function PurchaseOrders() {
  const [pos, setPos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const navigate = useNavigate()

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const r = await api.get('/v1/purchase-orders/')
      setPos(r.data)
    } finally { setLoading(false) }
  }

  return (
    <div className="po-page">
      <div className="po-header">
        <h1 className="po-title">Bons de commande</h1>
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ Nouveau BC</button>
      </div>

      {loading ? (
        <div className="loading">Chargement...</div>
      ) : pos.length === 0 ? (
        <div className="empty-state">Aucun bon de commande.</div>
      ) : (
        <table className="po-table">
          <thead>
            <tr>
              {['Numéro', 'Fournisseur', 'Statut', 'Lignes', 'Total', 'Date', ''].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pos.map(po => {
              const st = STATUS_STYLES[po.status] || STATUS_STYLES.brouillon
              return (
                <tr key={po.id} className="po-row" onClick={() => navigate(`/purchase-orders/${po.id}`)}>
                  <td className="po-num">{po.po_number}</td>
                  <td>{po.supplier_name}</td>
                  <td><span className="po-badge" style={{ color: st.color, background: st.bg }}>{st.label}</span></td>
                  <td style={{ textAlign: 'center', color: '#6B7280' }}>{po.line_count}</td>
                  <td className="po-total">{fmt(po.total)}</td>
                  <td style={{ color: '#9CA3AF', fontSize: 13 }}>{fmtDate(po.created_at)}</td>
                  <td><span className="po-arrow">→</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {showNew && <NewPOModal onClose={() => setShowNew(false)} onCreated={po => { setPos(p => [po, ...p]); navigate(`/purchase-orders/${po.id}`) }} />}
    </div>
  )
}

function NewPOModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ supplier_name: '', supplier_email: '', supplier_phone: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function save() {
    if (!form.supplier_name.trim()) return
    setSaving(true)
    try {
      const r = await api.post('/v1/purchase-orders/', {
        supplier_name: form.supplier_name,
        supplier_email: form.supplier_email || null,
        supplier_phone: form.supplier_phone || null,
        notes: form.notes || null,
      })
      onCreated(r.data)
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Nouveau bon de commande</h3>
        <div className="form-group"><label>Fournisseur *</label><input value={form.supplier_name} onChange={e => f('supplier_name', e.target.value)} autoFocus /></div>
        <div className="form-group"><label>Courriel</label><input type="email" value={form.supplier_email} onChange={e => f('supplier_email', e.target.value)} /></div>
        <div className="form-group"><label>Téléphone</label><input value={form.supplier_phone} onChange={e => f('supplier_phone', e.target.value)} /></div>
        <div className="form-group"><label>Notes</label><textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={3} /></div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving || !form.supplier_name.trim()}>{saving ? '...' : 'Créer'}</button>
        </div>
      </div>
    </div>
  )
}
