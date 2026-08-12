import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

const FREQ_LABELS = { mensuel: 'Mensuelle', bimestriel: 'Bimestrielle', trimestriel: 'Trimestrielle', biannuel: 'Biannuelle', annuel: 'Annuelle' }

export default function Recurrence() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const navigate = useNavigate()

  function load() {
    setLoading(true)
    api.get('/v1/recurring-billing').then(r => setItems(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function generateInvoice(id) {
    if (!confirm('Générer une facture maintenant avec les lignes actuelles de cette récurrence ?')) return
    const r = await api.post(`/v1/recurring-billing/${id}/generate-invoice`)
    load()
    if (r.data?.invoice_id) navigate(`/invoices/${r.data.invoice_id}`)
  }

  async function removeLine(lineId) {
    if (!confirm('Retirer cette ligne de la récurrence ?')) return
    await api.delete(`/v1/recurring-billing/lines/${lineId}`)
    load()
  }

  const fmt = n => `${parseFloat(n || 0).toFixed(2)} $`

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' }}>Récurrence</h1>
      <p style={{ color: '#6B7280', fontSize: 14, marginTop: 8, marginBottom: 24 }}>
        Facturation récurrente liée aux services téléphoniques SIPV — une récurrence par
        compagnie, mise à jour automatiquement quand un service est ajouté ou retiré (avec
        prorata au retrait en cours de cycle). Activée depuis la fiche compagnie
        (case "Tenant téléphonique SIPV").
      </p>

      {loading ? <div className="loading">Chargement...</div> : items.length === 0 ? (
        <div className="empty-tab">Aucune récurrence — active un tenant SIPV depuis une fiche compagnie pour en créer une.</div>
      ) : (
        items.map(rb => (
          <div key={rb.id} style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setExpanded(expanded === rb.id ? null : rb.id)}>
              <div style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>{rb.company_name}</div>
              <span style={{ fontSize: 12, color: rb.is_active ? '#059669' : '#9CA3AF' }}>{rb.is_active ? 'Active' : 'Inactive'}</span>
              <span style={{ fontSize: 12, color: '#6B7280' }}>{FREQ_LABELS[rb.frequency] || rb.frequency}</span>
              <span style={{ fontSize: 12, color: '#6B7280', fontFamily: 'monospace' }}>
                {rb.current_cycle_start} → {rb.current_cycle_end}
              </span>
              <span style={{ fontWeight: 700, fontFamily: 'monospace', minWidth: 90, textAlign: 'right' }}>{fmt(rb.subtotal)}</span>
              <span style={{ color: '#9CA3AF' }}>{expanded === rb.id ? '▾' : '▸'}</span>
            </div>

            {expanded === rb.id && (
              <div style={{ marginTop: 14, borderTop: '1px solid #F3F4F6', paddingTop: 12 }}>
                {rb.lines.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 10 }}>Aucune ligne pour le cycle actuel.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 10 }}>
                    <thead>
                      <tr style={{ background: '#F9FAFB' }}>
                        {['Description', 'Qté', 'Prix unit.', 'Total', ''].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rb.lines.map(l => (
                        <tr key={l.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                          <td style={{ padding: '6px 10px' }}>
                            {l.description}
                            {l.is_prorata_credit && <span style={{ marginLeft: 6, fontSize: 10, color: '#D97706', fontWeight: 600 }}>PRORATA</span>}
                          </td>
                          <td style={{ padding: '6px 10px' }}>{l.qty}</td>
                          <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{fmt(l.unit_price)}</td>
                          <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{fmt(l.qty * l.unit_price)}</td>
                          <td style={{ padding: '6px 10px' }}><button className="inv-del-btn" onClick={() => removeLine(l.id)}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#9CA3AF' }}>Départ : {rb.start_date}</span>
                  <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }}
                    disabled={rb.lines.length === 0} onClick={() => generateInvoice(rb.id)}>
                    Générer une facture maintenant
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
