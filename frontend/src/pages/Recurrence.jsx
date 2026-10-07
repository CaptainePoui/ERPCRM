import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import AutoRecurringToggle from '../components/AutoRecurringToggle'

const FREQ_LABELS = { hebdomadaire: 'Hebdomadaire', mensuel: 'Mensuelle', bimestriel: 'Bimestrielle', trimestriel: 'Trimestrielle', biannuel: 'Biannuelle', annuel: 'Annuelle' }

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
    try {
      const r = await api.post(`/v1/recurring-billing/${id}/generate-invoice`)
      load()
      if (r.data?.covered) alert(r.data.detail)   // cycle couvert par un echange (troc) : aucune facture
      if (r.data?.invoice_id) navigate(`/invoices/${r.data.invoice_id}`)
    } catch (e) { alert(e.response?.data?.detail || 'Génération impossible') }
  }

  async function saveEndDate(rb, value) {
    try {
      await api.put(`/v1/recurring-billing/${rb.id}`, value ? { end_date: value } : { clear_end_date: true })
      load()
    } catch (e) { alert(e.response?.data?.detail || 'Date de fin invalide') }
  }

  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const shown = items.filter(rb => !q || [rb.company_name, rb.name, rb.site_label].some(v => (v || '').toLowerCase().includes(q)))

  async function removeLine(lineId) {
    if (!confirm('Retirer cette ligne de la récurrence ?')) return
    await api.delete(`/v1/recurring-billing/lines/${lineId}`)
    load()
  }

  const fmt = n => `${parseFloat(n || 0).toFixed(2)} $`

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' }}>Factures périodiques</h1>
      <p style={{ color: '#6B7280', fontSize: 14, marginTop: 8, marginBottom: 16 }}>
        Une compagnie peut avoir plusieurs factures périodiques (ex. une par succursale). Celle marquée
        « Téléphonie » est liée au tenant SIPV : mise à jour automatiquement quand un poste ou un DID est
        ajouté ou retiré. Une date de fin (optionnelle) arrête la facturation ; un cycle déjà facturé ne peut
        pas être généré deux fois, et un cycle oublié est rattrapé (le plus ancien d'abord).
      </p>
      <AutoRecurringToggle settingKey="recurring_auto_sales"
        onText="Chaque cycle dû crée sa facture, émise mais « non transmise » : rien n'est envoyé au client tant que vous ne l'envoyez pas (filtre « Non transmises » dans Factures)."
        offText="Les factures se génèrent à la main (« Générer une facture maintenant » sur chaque récurrence)." />
      <input className="search-input" placeholder="Rechercher (client, nom, succursale)..." value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 16 }} />

      {loading ? <div className="loading">Chargement...</div> : items.length === 0 ? (
        <div className="empty-tab">Aucune récurrence — active un tenant SIPV depuis une fiche compagnie pour en créer une.</div>
      ) : (
        shown.map(rb => (
          <div key={rb.id} style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setExpanded(expanded === rb.id ? null : rb.id)}>
              <span style={{ fontSize: 12, color: '#374151', fontFamily: 'monospace', whiteSpace: 'nowrap' }} title="Date de début → date de fin">
                {rb.start_date} → {rb.end_date || '…'}
              </span>
              <div style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>
                {rb.company_name}
                {rb.name && rb.name !== rb.company_name && <span style={{ fontWeight: 400, color: '#6B7280' }}> · {rb.name}</span>}
                {rb.site_label && <span style={{ fontWeight: 400, fontSize: 12, color: '#9CA3AF' }}> (succursale {rb.site_label})</span>}
                {rb.is_telephony && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: '#2563EB', border: '1px solid #BFDBFE', background: '#EFF6FF', borderRadius: 10, padding: '1px 7px' }}>Téléphonie</span>}
              </div>
              <span style={{ fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }} title="Début du dernier cycle facturé">{rb.last_invoice_date ? `dernière : ${rb.last_invoice_date}` : 'jamais facturée'}</span>
              <span style={{ fontSize: 12, color: rb.is_active ? '#059669' : '#9CA3AF' }}>{rb.is_active ? 'Active' : 'Inactive'}</span>
              <span style={{ fontSize: 12, color: '#6B7280' }}>{FREQ_LABELS[rb.frequency] || rb.frequency}</span>
              <span style={{ fontSize: 12, fontFamily: 'monospace', whiteSpace: 'nowrap', color: rb.is_active && rb.current_cycle_start <= new Date().toISOString().slice(0, 10) && rb.lines.length ? '#D97706' : '#6B7280' }}
                title="Prochain cycle à facturer (le plus ancien pas encore facturé)">
                prochaine : {rb.current_cycle_start}
              </span>
              <span style={{ fontWeight: 700, fontFamily: 'monospace', minWidth: 90, textAlign: 'right' }}>{fmt(rb.subtotal)}</span>
              <span style={{ color: '#9CA3AF' }}>{expanded === rb.id ? '▾' : '▸'}</span>
            </div>

            {expanded === rb.id && (
              <div style={{ marginTop: 14, borderTop: '1px solid #F3F4F6', paddingTop: 12 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', marginBottom: 10 }}>
                  Date de fin (optionnelle)
                  <input type="date" defaultValue={rb.end_date || ''} onBlur={e => { if ((e.target.value || null) !== (rb.end_date || null)) saveEndDate(rb, e.target.value) }} />
                </label>
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
