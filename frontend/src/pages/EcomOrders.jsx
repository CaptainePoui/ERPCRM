import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import api from '../services/api'
import './EcomOrders.css'

const STATUS_STYLES = {
  nouveau:        { color: '#2563EB', bg: '#EFF6FF', label: 'Nouveau' },
  en_traitement:  { color: '#D97706', bg: '#FFFBEB', label: 'En traitement' },
  confirme:       { color: '#059669', bg: '#F0FDF4', label: 'Confirmé' },
  expedie:        { color: '#7C3AED', bg: '#F5F3FF', label: 'Expédié' },
  livre:          { color: '#374151', bg: '#F3F4F6', label: 'Livré' },
  annule:         { color: '#DC2626', bg: '#FEF2F2', label: 'Annulé' },
}

const NEXT_STATUS = { nouveau: 'en_traitement', en_traitement: 'confirme', confirme: 'expedie', expedie: 'livre' }

const fmt = n => `${parseFloat(n || 0).toFixed(2)} $`
const fmtDate = s => s ? new Date(s).toLocaleDateString('fr-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export function EcomOrderList() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/v1/ecom/orders').then(r => setOrders(r.data)).finally(() => setLoading(false))
  }, [])

  return (
    <div className="ecom-page">
      <div className="ecom-header">
        <h1 className="ecom-title">Commandes web</h1>
      </div>
      {loading ? <div className="loading">Chargement...</div> : (
        <table className="ecom-table">
          <thead>
            <tr>{['Numéro', 'Client', 'Courriel', 'Statut', 'Total', 'Date', ''].map(h => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {orders.map(o => {
              const st = STATUS_STYLES[o.status] || STATUS_STYLES.nouveau
              return (
                <tr key={o.id} className="ecom-row" onClick={() => navigate(`/ecom-orders/${o.id}`)}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563EB' }}>{o.order_number}</td>
                  <td style={{ fontWeight: 600 }}>{o.customer_name}</td>
                  <td style={{ color: '#6B7280', fontSize: 13 }}>{o.customer_email}</td>
                  <td><span style={{ background: st.bg, color: st.color, fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '3px 8px' }}>{st.label}</span></td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{fmt(o.total)}</td>
                  <td style={{ color: '#9CA3AF', fontSize: 13 }}>{fmtDate(o.created_at)}</td>
                  <td><span style={{ color: '#D1D5DB' }}>→</span></td>
                </tr>
              )
            })}
            {orders.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9CA3AF', padding: '48px 0' }}>Aucune commande web.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function EcomOrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    api.get(`/v1/ecom/orders/${id}`).then(r => setOrder(r.data)).catch(() => navigate('/ecom-orders')).finally(() => setLoading(false))
  }, [id])

  async function advance() {
    const next = NEXT_STATUS[order.status]
    if (!next) return
    setUpdating(true)
    try {
      const r = await api.put(`/v1/ecom/orders/${id}/status`, { status: next })
      setOrder(r.data)
    } finally { setUpdating(false) }
  }

  async function cancel() {
    if (!confirm('Annuler cette commande ?')) return
    setUpdating(true)
    try {
      const r = await api.put(`/v1/ecom/orders/${id}/status`, { status: 'annule' })
      setOrder(r.data)
    } finally { setUpdating(false) }
  }

  if (loading) return <div className="loading">Chargement...</div>
  if (!order) return null

  const st = STATUS_STYLES[order.status] || STATUS_STYLES.nouveau
  const nextStatus = NEXT_STATUS[order.status]

  return (
    <div className="ecom-detail-page">
      <Link to="/ecom-orders" className="ecom-back">← Commandes web</Link>
      <div className="ecom-detail-header">
        <div>
          <h1 style={{ font: '700 22px/1 system-ui', margin: '0 0 6px' }}>{order.order_number}</h1>
          <span style={{ background: st.bg, color: st.color, fontSize: 12, fontWeight: 700, borderRadius: 10, padding: '4px 10px' }}>{st.label}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {nextStatus && (
            <button className="btn-primary" onClick={advance} disabled={updating}>
              → {STATUS_STYLES[nextStatus]?.label}
            </button>
          )}
          {!['annule', 'livre'].includes(order.status) && (
            <button style={{ background: '#FEF2F2', color: '#DC2626', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }} onClick={cancel} disabled={updating}>Annuler</button>
          )}
        </div>
      </div>

      <div className="ecom-detail-grid">
        <div className="ecom-info-card">
          <div className="ecom-card-title">Client</div>
          <div className="ecom-info-row"><span>Nom</span><strong>{order.customer_name}</strong></div>
          <div className="ecom-info-row"><span>Courriel</span><a href={`mailto:${order.customer_email}`}>{order.customer_email}</a></div>
          {order.customer_phone && <div className="ecom-info-row"><span>Téléphone</span>{order.customer_phone}</div>}
          {order.company_name && <div className="ecom-info-row"><span>Compagnie</span>{order.company_name}</div>}
        </div>
        <div className="ecom-info-card">
          <div className="ecom-card-title">Détails</div>
          <div className="ecom-info-row"><span>Commande</span>{new Date(order.created_at).toLocaleString('fr-CA')}</div>
          <div className="ecom-info-row"><span>Total</span><strong style={{ fontFamily: 'monospace', fontSize: 16 }}>{fmt(order.total)}</strong></div>
          {order.customer_notes && (
            <>
              <div className="ecom-card-title" style={{ marginTop: 12 }}>Notes client</div>
              <div style={{ color: '#4B5563', fontSize: 14 }}>{order.customer_notes}</div>
            </>
          )}
        </div>
      </div>

      <div className="ecom-lines-card">
        <div className="ecom-card-title">Articles commandés</div>
        <table className="ecom-lines-table">
          <thead><tr><th>Description</th><th style={{ textAlign: 'right' }}>Quantité</th><th style={{ textAlign: 'right' }}>Prix unit.</th><th style={{ textAlign: 'right' }}>Sous-total</th></tr></thead>
          <tbody>
            {order.lines.map(l => (
              <tr key={l.id}>
                <td style={{ fontWeight: 600 }}>{l.description}</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{l.quantity}</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(l.unit_price)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{fmt(l.subtotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ textAlign: 'right', padding: '12px 14px', fontWeight: 700, fontSize: 15 }}>Total</td>
              <td style={{ textAlign: 'right', padding: '12px 14px', fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: '#1E3A5F' }}>{fmt(order.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
