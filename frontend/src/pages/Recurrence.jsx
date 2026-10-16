import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import AutoRecurringToggle from '../components/AutoRecurringToggle'
import { todayIso } from '../utils/date'

const FREQ_LABELS = { hebdomadaire: 'Hebdomadaire', mensuel: 'Mensuelle', bimestriel: 'Bimestrielle', trimestriel: 'Trimestrielle', biannuel: 'Biannuelle', annuel: 'Annuelle' }

// Pause de facturation (TASK-005.26) : debut + fin, ou debut + duree (mois et jours) -- l'un calcule l'autre
function addPeriod(iso, months, days) {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + (months || 0), 1))
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  t.setUTCDate(Math.min(d, last) + (days || 0))
  return t.toISOString().slice(0, 10)
}
function diffPeriod(a, b) {
  let months = 0
  while (addPeriod(a, months + 1, 0) <= b) months++
  const base = addPeriod(a, months, 0)
  return { months, days: Math.round((Date.parse(b) - Date.parse(base)) / 86400000) }
}

function PauseBox({ rb, onChanged }) {
  const today = todayIso()
  const [start, setStart] = useState(rb.pause_start || (rb.unpaused_next > today ? rb.unpaused_next : rb.unpaused_next))
  const [end, setEnd] = useState(rb.pause_end || '')
  const dur = start && end && end > start ? diffPeriod(start, end) : { months: '', days: '' }
  const [err, setErr] = useState(null)
  const setDur = (months, days) => setEnd(addPeriod(start, parseInt(months) || 0, parseInt(days) || 0))
  async function save() {
    setErr(null)
    try { await api.put(`/v1/recurring-billing/${rb.id}/pause`, { pause_start: start, pause_end: end }); onChanged() }
    catch (e) { setErr(e.response?.data?.detail || 'Pause impossible') }
  }
  async function clear() {
    if (!confirm('Annuler la pause ? La facturation reprend au cycle normal.')) return
    await api.delete(`/v1/recurring-billing/${rb.id}/pause`); onChanged()
  }
  const left = rb.pause_end ? Math.max(0, Math.round((Date.parse(rb.pause_end) - Date.parse(today)) / 86400000)) : 0
  const inp = { padding: '4px 6px', fontSize: 13 }
  return (
    <div style={{ border: '1px dashed var(--c-border)', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Pause de facturation</div>
      {rb.pause_start && (
        <div style={{ color: '#D97706', marginBottom: 8 }}>
          En pause du {rb.pause_start} au {rb.pause_end} — reprise le {rb.pause_end}{left > 0 ? ` (reste ${left} jour${left > 1 ? 's' : ''})` : ''}
          <button className="btn-secondary" style={{ fontSize: 11, padding: '2px 8px', marginLeft: 8 }} onClick={clear}>Annuler la pause</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label>Début <input type="date" style={inp} value={start} onChange={e => setStart(e.target.value)} /></label>
        <label>Fin (reprise) <input type="date" style={inp} value={end} onChange={e => setEnd(e.target.value)} /></label>
        <span style={{ color: 'var(--c-muted)' }}>ou durée</span>
        <label><input type="number" min="0" style={{ ...inp, width: 60 }} value={dur.months} onChange={e => setDur(e.target.value, dur.days)} /> mois</label>
        <label><input type="number" min="0" style={{ ...inp, width: 60 }} value={dur.days} onChange={e => setDur(dur.months, e.target.value)} /> jours</label>
        <button className="btn-primary" style={{ fontSize: 12, padding: '4px 12px' }} disabled={!start || !end || end <= start} onClick={save}>
          {rb.pause_start ? 'Modifier la pause' : 'Mettre en pause'}</button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--c-faint)', marginTop: 6 }}>Aucune facture pour les cycles qui commencent pendant la pause ; à la reprise, la facturation repart de cette date, au même rythme.</div>
      {err && <div style={{ color: '#DC2626', marginTop: 6 }}>{err}</div>}
    </div>
  )
}

// La prochaine facture de la facture periodique, rendue comme une vraie facture (TASK-005.26) -- rien n'est enregistre
function RecurringDocument({ rb }) {
  const [pages, setPages] = useState(null)
  const [err, setErr] = useState(false)
  const version = `${rb.subtotal}|${rb.current_cycle_start}|${rb.lines.length}|${rb.pause_end}`
  useEffect(() => {
    let alive = true
    setErr(false)
    api.get(`/v1/recurring-billing/${rb.id}/preview`).then(r => alive && setPages(r.data.pages)).catch(() => alive && setErr(true))
    return () => { alive = false }
  }, [rb.id, version])
  if (err) return <div style={{ color: 'var(--c-faint)', padding: 16 }}>Document non disponible.</div>
  if (!pages) return <div className="loading">Chargement de la facture...</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, background: 'var(--c-surface-2)', borderRadius: 8, padding: 16 }}>
      {pages.map((src, n) => <img key={n} src={src} alt={`Page ${n + 1}`} style={{ width: '100%', maxWidth: 900, background: '#fff', borderRadius: 4, boxShadow: '0 4px 18px rgba(0,0,0,.25)' }} />)}
    </div>
  )
}

export default function Recurrence({ companyId = null }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const navigate = useNavigate()

  function load() {
    setLoading(true)
    api.get('/v1/recurring-billing', { params: companyId ? { company_id: companyId } : {} }).then(r => setItems(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function generateInvoice(id) {
    if (!confirm('Générer une facture maintenant avec les lignes actuelles de cette récurrence ?')) return
    try {
      const r = await api.post(`/v1/recurring-billing/${id}/generate-invoice`)
      load()
      if (r.data?.covered) alert(r.data.detail)   // cycle couvert par un echange (troc) : aucune facture
      if (r.data?.invoice_id) navigate(`/invoices/${r.data.invoice_id}`)   // redirige dans la fiche du client
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
    <div>
      {!companyId && <>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--c-text)' }}>Factures périodiques</h1>
      <p style={{ color: 'var(--c-muted)', fontSize: 14, marginTop: 8, marginBottom: 16 }}>
        Une compagnie peut avoir plusieurs factures périodiques (ex. une par succursale). Celle marquée
        « Téléphonie » est liée au tenant SIPV : mise à jour automatiquement quand un poste ou un DID est
        ajouté ou retiré. Une date de fin (optionnelle) arrête la facturation ; un cycle déjà facturé ne peut
        pas être généré deux fois, et un cycle oublié est rattrapé (le plus ancien d'abord).
      </p>
      <AutoRecurringToggle settingKey="recurring_auto_sales"
        onText="Chaque cycle dû crée sa facture, émise mais « non transmise » : rien n'est envoyé au client tant que vous ne l'envoyez pas (filtre « Non transmises » dans Factures)."
        offText="Les factures se génèrent à la main (« Générer une facture maintenant » sur chaque récurrence)." />
      <input className="search-input" placeholder="Rechercher (client, nom, succursale)..." value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 16 }} />
      </>}

      {loading ? <div className="loading">Chargement...</div> : items.length === 0 ? (
        <div className="empty-tab">{companyId ? 'Aucune facture périodique pour ce client.' : 'Aucune récurrence — active un tenant SIPV depuis une fiche compagnie pour en créer une.'}</div>
      ) : (
        shown.map(rb => companyId && expanded !== rb.id ? (
          <div key={rb.id} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              {rb.pause_start && <span style={{ fontSize: 12, fontWeight: 600, color: '#D97706' }}>En pause jusqu'au {rb.pause_end}</span>}
              {!rb.is_active && <span style={{ fontSize: 12, color: 'var(--c-faint)' }}>Inactive</span>}
              <span style={{ flex: 1 }} />
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setExpanded(rb.id)}>Modifier</button>
            </div>
            <RecurringDocument rb={rb} />
          </div>
        ) : (
          <div key={rb.id} style={{ border: '1px solid var(--c-border)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
              onClick={() => companyId ? setExpanded(expanded === rb.id ? null : rb.id) : navigate(`/companies/${rb.company_id}?tab=entente`)}>
              <span style={{ fontSize: 12, color: 'var(--c-text-2)', fontFamily: 'monospace', whiteSpace: 'nowrap' }} title="Date de début → date de fin">
                {rb.start_date} → {rb.end_date || '…'}
              </span>
              <div style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>
                {companyId ? (rb.name || rb.company_name) : <span style={{ color: 'var(--brand)' }} title="Ouvrir l'entente dans la fiche du client"
                  onClick={e => { e.stopPropagation(); navigate(`/companies/${rb.company_id}?tab=entente`) }}>{rb.company_name}</span>}
                {!companyId && rb.name && rb.name !== rb.company_name && <span style={{ fontWeight: 400, color: 'var(--c-muted)' }}> · {rb.name}</span>}
                {rb.site_label && <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--c-faint)' }}> (succursale {rb.site_label})</span>}
                {rb.is_telephony && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: '#2563EB', border: '1px solid #BFDBFE', background: 'var(--c-tint-blue)', borderRadius: 10, padding: '1px 7px' }}>Téléphonie</span>}
              </div>
              <span style={{ fontSize: 12, color: 'var(--c-muted)', whiteSpace: 'nowrap' }} title="Début du dernier cycle facturé">{rb.last_invoice_date ? `dernière : ${rb.last_invoice_date}` : 'jamais facturée'}</span>
              {rb.pause_start && <span style={{ fontSize: 11, fontWeight: 600, color: '#D97706', border: '1px solid #D97706', borderRadius: 10, padding: '1px 7px' }} title={`Reprise le ${rb.pause_end}`}>En pause</span>}
              <span style={{ fontSize: 12, color: rb.is_active ? '#059669' : 'var(--c-faint)' }}>{rb.is_active ? 'Active' : 'Inactive'}</span>
              <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>{FREQ_LABELS[rb.frequency] || rb.frequency}</span>
              <span style={{ fontSize: 12, fontFamily: 'monospace', whiteSpace: 'nowrap', color: rb.is_active && rb.current_cycle_start <= todayIso() && rb.lines.length ? '#D97706' : 'var(--c-muted)' }}
                title="Prochain cycle à facturer (le plus ancien pas encore facturé)">
                prochaine : {rb.current_cycle_start}
              </span>
              <span style={{ fontWeight: 700, fontFamily: 'monospace', minWidth: 90, textAlign: 'right' }}>{fmt(rb.subtotal)}</span>
              <span style={{ color: 'var(--c-faint)' }}>{expanded === rb.id ? '▾' : '▸'}</span>
            </div>

            {expanded === rb.id && (
              <div style={{ marginTop: 14, borderTop: '1px solid var(--c-surface-3)', paddingTop: 12 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--c-text-2)', marginBottom: 10 }}>
                  Date de fin (optionnelle)
                  <input type="date" defaultValue={rb.end_date || ''} onBlur={e => { if ((e.target.value || null) !== (rb.end_date || null)) saveEndDate(rb, e.target.value) }} />
                </label>
                <PauseBox key={`${rb.pause_start}|${rb.pause_end}|${rb.unpaused_next}`} rb={rb} onChanged={load} />
                {rb.lines.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--c-faint)', marginBottom: 10 }}>Aucune ligne pour le cycle actuel.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 10 }}>
                    <thead>
                      <tr style={{ background: 'var(--c-surface-2)' }}>
                        {['Description', 'Qté', 'Prix unit.', 'Total', ''].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, fontWeight: 600, color: 'var(--c-muted)', borderBottom: '1px solid var(--c-border)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rb.lines.map(l => (
                        <tr key={l.id} style={{ borderBottom: '1px solid var(--c-surface-3)' }}>
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
                  <span style={{ fontSize: 12, color: 'var(--c-faint)' }}>Départ : {rb.start_date}
                    {companyId && <button className="btn-secondary" style={{ fontSize: 12, marginLeft: 12 }} onClick={() => setExpanded(null)}>Terminé</button>}</span>
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
