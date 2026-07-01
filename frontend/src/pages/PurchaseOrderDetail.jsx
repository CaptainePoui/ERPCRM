import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import api from '../services/api'
import './PurchaseOrderDetail.css'

const STATUS_STYLES = {
  brouillon:          { color: '#6B7280', bg: '#F3F4F6', label: 'Brouillon' },
  envoye:             { color: '#2563EB', bg: '#EFF6FF', label: 'Envoyé' },
  partiellement_recu: { color: '#D97706', bg: '#FFFBEB', label: 'Partiellement reçu' },
  recu:               { color: '#059669', bg: '#F0FDF4', label: 'Reçu' },
  annule:             { color: '#DC2626', bg: '#FEF2F2', label: 'Annulé' },
}

const STATUS_TRANSITIONS = {
  brouillon:          ['envoye', 'annule'],
  envoye:             ['partiellement_recu', 'recu', 'annule'],
  partiellement_recu: ['recu', 'annule'],
  recu:               [],
  annule:             [],
}

const fmt = n => `${parseFloat(n || 0).toFixed(2)} $`
const fmtDate = s => s ? new Date(s).toLocaleDateString('fr-CA') : '—'

export default function PurchaseOrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [po, setPo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actioning, setActioning] = useState(false)
  const [showAddLine, setShowAddLine] = useState(false)

  useEffect(() => { load() }, [id])

  async function load() {
    try {
      const r = await api.get(`/v1/purchase-orders/${id}`)
      setPo(r.data)
    } catch { navigate('/purchase-orders') }
    finally { setLoading(false) }
  }

  async function changeStatus(newStatus) {
    if (!confirm(`Passer le BC en statut « ${STATUS_STYLES[newStatus]?.label} » ?`)) return
    setActioning(true)
    try {
      const r = await api.post(`/v1/purchase-orders/${id}/status`, { status: newStatus })
      setPo(r.data)
    } finally { setActioning(false) }
  }

  async function deletePO() {
    if (!confirm('Supprimer ce bon de commande ?')) return
    await api.delete(`/v1/purchase-orders/${id}`)
    navigate('/purchase-orders')
  }

  async function deleteLine(lineId) {
    const r = await api.delete(`/v1/purchase-orders/${id}/lines/${lineId}`)
    setPo(r.data)
  }

  async function updateReceivedQty(lineId, qty) {
    const r = await api.put(`/v1/purchase-orders/${id}/lines/${lineId}`, { received_qty: parseFloat(qty) })
    setPo(r.data)
  }

  if (loading) return <div className="loading">Chargement...</div>
  if (!po) return null

  const st = STATUS_STYLES[po.status] || STATUS_STYLES.brouillon
  const transitions = STATUS_TRANSITIONS[po.status] || []
  const editable = !['recu', 'annule'].includes(po.status)

  return (
    <div className="pod-page">
      <div className="pod-header">
        <div className="pod-breadcrumb">
          <Link to="/purchase-orders" className="pod-back">← Bons de commande</Link>
        </div>
        <div className="pod-title-row">
          <h1 className="pod-title">{po.po_number}</h1>
          <span className="pod-badge" style={{ color: st.color, background: st.bg }}>{st.label}</span>
        </div>
        <div className="pod-actions">
          {transitions.map(s => (
            <button key={s} className={s === 'annule' ? 'btn-danger' : 'btn-primary'} style={{ fontSize: 13 }}
              onClick={() => changeStatus(s)} disabled={actioning}>
              {STATUS_STYLES[s]?.label}
            </button>
          ))}
          {po.status === 'brouillon' && (
            <button className="btn-danger" style={{ fontSize: 13 }} onClick={deletePO}>Supprimer</button>
          )}
        </div>
      </div>

      <div className="pod-grid">
        <div className="pod-info-card">
          <div className="pod-section-title">Fournisseur</div>
          <div className="pod-info-row"><span className="pod-info-label">Nom</span><strong>{po.supplier_name}</strong></div>
          {po.supplier_email && <div className="pod-info-row"><span className="pod-info-label">Courriel</span>{po.supplier_email}</div>}
          {po.supplier_phone && <div className="pod-info-row"><span className="pod-info-label">Téléphone</span>{po.supplier_phone}</div>}
          {po.invoice_id && (
            <div className="pod-info-row"><span className="pod-info-label">Facture</span>
              <Link to={`/invoices/${po.invoice_id}`} style={{ color: '#2563EB' }}>Voir facture</Link>
            </div>
          )}
          {po.company_id && (
            <div className="pod-info-row"><span className="pod-info-label">Client</span>
              <Link to={`/companies/${po.company_id}`} style={{ color: '#2563EB' }}>Voir client</Link>
            </div>
          )}
        </div>
        <div className="pod-info-card">
          <div className="pod-section-title">Dates</div>
          <div className="pod-info-row"><span className="pod-info-label">Créé le</span>{fmtDate(po.created_at)}</div>
          <div className="pod-info-row"><span className="pod-info-label">Envoyé le</span>{fmtDate(po.ordered_at)}</div>
          <div className="pod-info-row"><span className="pod-info-label">Reçu le</span>{fmtDate(po.received_at)}</div>
          {po.notes && (
            <>
              <div className="pod-section-title" style={{ marginTop: 12 }}>Notes</div>
              <div style={{ color: '#4B5563', fontSize: 14, whiteSpace: 'pre-wrap' }}>{po.notes}</div>
            </>
          )}
        </div>
      </div>

      <div className="pod-lines-section">
        <div className="pod-lines-header">
          <div className="pod-section-title">Lignes de commande</div>
          {editable && (
            <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowAddLine(true)}>+ Ajouter</button>
          )}
        </div>
        {po.lines.length === 0 ? (
          <div style={{ color: '#9CA3AF', textAlign: 'center', padding: '32px 0', fontSize: 14 }}>Aucune ligne.</div>
        ) : (
          <table className="pod-table">
            <thead>
              <tr>
                <th>Description</th>
                <th style={{ textAlign: 'right' }}>Qté commandée</th>
                {po.status !== 'brouillon' && <th style={{ textAlign: 'right' }}>Qté reçue</th>}
                <th style={{ textAlign: 'right' }}>Coût unit.</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                {editable && <th></th>}
              </tr>
            </thead>
            <tbody>
              {po.lines.map(line => (
                <tr key={line.id}>
                  <td>{line.description}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{line.quantity}</td>
                  {po.status !== 'brouillon' && (
                    <td style={{ textAlign: 'right' }}>
                      {editable ? (
                        <input type="number" min="0" max={line.quantity} step="1"
                          defaultValue={line.received_qty}
                          style={{ width: 60, textAlign: 'right', border: '1px solid #D1D5DB', borderRadius: 4, padding: '2px 6px' }}
                          onBlur={e => { if (parseFloat(e.target.value) !== line.received_qty) updateReceivedQty(line.id, e.target.value) }}
                        />
                      ) : <span style={{ fontFamily: 'monospace' }}>{line.received_qty}</span>}
                    </td>
                  )}
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(line.unit_cost)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{fmt(line.total)}</td>
                  {editable && (
                    <td><button className="inv-del-btn" onClick={() => deleteLine(line.id)}>✕</button></td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={po.status !== 'brouillon' ? 4 : 3} style={{ textAlign: 'right', padding: '12px 14px', fontWeight: 700, fontSize: 15 }}>Total</td>
                <td style={{ textAlign: 'right', padding: '12px 14px', fontWeight: 700, fontFamily: 'monospace', fontSize: 15, color: '#1E3A5F' }}>{fmt(po.total)}</td>
                {editable && <td></td>}
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {showAddLine && (
        <AddLineModal poId={id} onClose={() => setShowAddLine(false)}
          onAdded={updatedPo => { setPo(updatedPo); setShowAddLine(false) }} />
      )}
    </div>
  )
}

function AddLineModal({ poId, onClose, onAdded }) {
  const [catalogue, setCatalogue] = useState([])
  const [form, setForm] = useState({ catalogue_item_id: '', description: '', quantity: 1, unit_cost: '' })
  const [saving, setSaving] = useState(false)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    api.get('/v1/catalogue/').then(r => setCatalogue(r.data.filter(i => i.is_active)))
  }, [])

  function selectItem(id) {
    const item = catalogue.find(i => i.id === id)
    if (item) {
      f('catalogue_item_id', id)
      if (!form.description) f('description', item.name)
      if (!form.unit_cost) f('unit_cost', item.price || '')
    } else {
      f('catalogue_item_id', '')
    }
  }

  async function save() {
    if (!form.description.trim() || !form.quantity) return
    setSaving(true)
    try {
      const r = await api.post(`/v1/purchase-orders/${poId}/lines`, {
        catalogue_item_id: form.catalogue_item_id || null,
        description: form.description,
        quantity: parseFloat(form.quantity),
        unit_cost: parseFloat(form.unit_cost || 0),
      })
      onAdded(r.data)
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Ajouter une ligne</h3>
        <div className="form-group">
          <label>Article catalogue (optionnel)</label>
          <select value={form.catalogue_item_id} onChange={e => selectItem(e.target.value)} autoFocus>
            <option value="">— Sélectionner —</option>
            {catalogue.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Description *</label><input value={form.description} onChange={e => f('description', e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="form-group" style={{ flex: 1 }}><label>Quantité</label><input type="number" min="1" step="1" value={form.quantity} onChange={e => f('quantity', e.target.value)} /></div>
          <div className="form-group" style={{ flex: 1 }}><label>Coût unitaire ($)</label><input type="number" min="0" step="0.01" value={form.unit_cost} onChange={e => f('unit_cost', e.target.value)} /></div>
        </div>
        {form.quantity && form.unit_cost && (
          <div style={{ textAlign: 'right', color: '#6B7280', fontSize: 13, marginBottom: 12 }}>
            Total: <strong>{(parseFloat(form.quantity) * parseFloat(form.unit_cost)).toFixed(2)} $</strong>
          </div>
        )}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving || !form.description.trim()}>{saving ? '...' : 'Ajouter'}</button>
        </div>
      </div>
    </div>
  )
}
