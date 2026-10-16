import { useState, useEffect } from 'react'
import api from '../../services/api'
import Autocomplete from '../../components/Autocomplete'
import { todayIso } from '../../utils/date'

// Onglet « Entente » de la fiche client (TASK-005.26), sur le modele de l'ancien logiciel que Philippe aime :
// en-tete (Modifier, Creer une facture, Plus), montant / prochaine date / periode, Details + notes du client a gauche,
// « Toutes les factures enfants » a droite. Jamais de fiche descriptive : « Modifier » montre la prochaine facture
// elle-meme, modifiable.

const FREQ = { hebdomadaire: 'Hebdomadaire', mensuel: 'Mensuel', bimestriel: 'Bimestriel', trimestriel: 'Trimestriel', biannuel: 'Semestriel', annuel: 'Annuel' }
const money = v => `${(parseFloat(v) || 0).toFixed(2)} $`
const errText = e => e.response?.data?.detail || 'Erreur'

export function addPeriod(iso, months, days) {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + (months || 0), 1))
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  t.setUTCDate(Math.min(d, last) + (days || 0))
  return t.toISOString().slice(0, 10)
}
export function diffPeriod(a, b) {
  let months = 0
  while (addPeriod(a, months + 1, 0) <= b) months++
  return { months, days: Math.round((Date.parse(b) - Date.parse(addPeriod(a, months, 0))) / 86400000) }
}

// ── Pause de facturation (fenetre moderne) ─────────────────────────────────────
// Philippe : la pause commence quand on la donne et repousse le cycle de sa duree (23 jours restants = 23 jours apres)
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`
export function spell(a, b) {
  const { months, days } = diffPeriod(a, b)
  const y = Math.floor(months / 12), m = months % 12
  const parts = [y && plural(y, 'an', 'ans'), m && `${m} mois`, days && plural(days, 'jour', 'jours')].filter(Boolean)
  return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' et ' + parts[parts.length - 1] : (parts[0] || '0 jour')
}
function PauseModal({ rb, onClose, onSaved }) {
  // Tout se compte a partir d'aujourd'hui : rouverte apres quelques jours, la fenetre montre ce qui reste (Philippe)
  const today = todayIso()
  const base = rb.pause_start && rb.pause_start > today ? rb.pause_start : today
  const [mode, setMode] = useState('duree')
  const [end, setEnd] = useState(rb.pause_end && rb.pause_end > base ? rb.pause_end : base)
  const d = end > base ? diffPeriod(base, end) : { months: 0, days: 0 }
  const y = Math.floor(d.months / 12), m = d.months % 12
  const setDur = (yy, mm, dd) => setEnd(addPeriod(base, (parseInt(yy) || 0) * 12 + (parseInt(mm) || 0), parseInt(dd) || 0))
  const days = Math.max(0, Math.round((Date.parse(end) - Date.parse(base)) / 86400000))
  // Montant offert <-> duree : au prix de la facture periodique (taxes comprises) par jour de son cycle
  const cycleDays = Math.max(1, Math.round((Date.parse(rb.current_cycle_end) - Date.parse(rb.current_cycle_start)) / 86400000))
  const perDay = (rb.next_total || 0) / cycleDays
  const amount = perDay > 0 ? (days * perDay).toFixed(2) : ''
  const [amountText, setAmountText] = useState(null)       // pendant la saisie du montant
  const setAmount = v => { setAmountText(v); const a = parseFloat(String(v).replace(',', '.')); setEnd(addPeriod(base, 0, perDay > 0 && a > 0 ? Math.round(a / perDay) : 0)) }
  // jours deja ecoules de la pause : la prochaine facture garde ce qui restait avant la pause
  const elapsed = rb.pause_start && rb.pause_start < base ? Math.round((Date.parse(base) - Date.parse(rb.pause_start)) / 86400000) : 0
  const newNext = rb.unpaused_next ? addPeriod(rb.unpaused_next, 0, elapsed + days) : null
  const [err, setErr] = useState(null)
  async function save() {
    setErr(null)
    try {
      if (days === 0) await api.delete(`/v1/recurring-billing/${rb.id}/pause`)          // remis a 0 : plus de pause
      else await api.put(`/v1/recurring-billing/${rb.id}/pause`, { pause_start: rb.pause_start || base, pause_end: end })
      onSaved()
    } catch (e) { setErr(errText(e)) }
  }
  const seg = on => ({ flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
    background: on ? 'var(--brand)' : 'transparent', color: on ? '#fff' : 'var(--c-muted)' })
  const field = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--c-muted)', fontWeight: 600, flex: '1 1 0', minWidth: 0 }
  const inp = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface-2)', color: 'var(--c-text)', fontSize: 14 }
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 'min(560px, 94vw)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <h3 className="modal-title" style={{ margin: 0 }}>Mettre la facturation en pause</h3>
          <div style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 4 }}>La pause repousse le cycle : les jours qui restaient avant la prochaine facture restent après la pause.</div>
        </div>
        <div style={{ display: 'flex', gap: 4, background: 'var(--c-surface-2)', borderRadius: 10, padding: 4 }}>
          <button style={seg(mode === 'duree')} onClick={() => setMode('duree')}>Pour une durée</button>
          <button style={seg(mode === 'date')} onClick={() => setMode('date')}>Jusqu'à une date</button>
        </div>
        {mode === 'date' ? (
          <label style={field}>Fin de la pause<input type="date" style={inp} value={end} min={base} onChange={e => { setAmountText(null); setEnd(e.target.value < base ? base : e.target.value) }} /></label>
        ) : (
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={field}>Années<input type="number" min="0" style={inp} value={y} onChange={e => { setAmountText(null); setDur(e.target.value, m, d.days) }} /></label>
            <label style={field}>Mois<input type="number" min="0" style={inp} value={m} onChange={e => { setAmountText(null); setDur(y, e.target.value, d.days) }} /></label>
            <label style={field}>Jours<input type="number" min="0" style={inp} value={d.days} onChange={e => { setAmountText(null); setDur(y, m, e.target.value) }} /></label>
          </div>
        )}
        <label style={field}>Ou un montant offert ($) — au prix de sa facture périodique ({money(rb.next_total)} par {cycleDays} jours)
          <input type="text" inputMode="decimal" style={inp} value={amountText ?? amount} placeholder="0.00" onChange={e => setAmount(e.target.value)} /></label>
        {days > 0 && (
          <div style={{ background: 'var(--c-tint-blue)', borderRadius: 10, padding: '12px 14px', fontSize: 14 }}>
            <strong>{spell(base, end)} offerts</strong>{newNext ? <> — la prochaine facture passe du {rb.unpaused_next} au <strong>{newNext}</strong></> : null}
          </div>
        )}
        {err && <div style={{ color: '#DC2626', fontSize: 13 }}>{err}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" disabled={!rb.pause_start && days === 0} onClick={save}>
            {rb.pause_start ? (days === 0 ? 'Retirer la pause' : 'Modifier la pause') : 'Mettre en pause'}</button>
        </div>
      </div>
    </div>
  )
}

// ── La prochaine facture, modifiable (papier de facture, pas une fiche) ──────────
function NextInvoiceEditor({ rb, company, onDone, onChanged }) {
  const [catalogue, setCatalogue] = useState([])
  const [adding, setAdding] = useState(false)
  useEffect(() => { api.get('/v1/catalogue').then(r => setCatalogue(r.data.filter(i => i.is_active))) }, [])
  async function saveLine(l, data) {
    if (Object.keys(data).every(k => String(data[k]) === String(l[k]))) return
    await api.put(`/v1/recurring-billing/lines/${l.id}`, data); onChanged()
  }
  async function removeLine(l) {
    if (!confirm('Retirer cette ligne de la facture périodique ?')) return
    await api.delete(`/v1/recurring-billing/lines/${l.id}`); onChanged()
  }
  async function addItem(item) {
    if (!item) return
    const c = catalogue.find(x => x.id === item.id)
    await api.post(`/v1/recurring-billing/${rb.id}/lines`, { description: c ? `${c.name}${c.description ? ' — ' + c.description : ''}` : item.label, qty: 1, unit_price: c ? parseFloat(c.price || c.unit_price || 0) : 0, catalogue_item_id: c?.id })
    setAdding(false); onChanged()
  }
  const sub = rb.lines.reduce((s, l) => s + l.qty * l.unit_price, 0)
  const taxed = company.is_taxable !== false
  const tps = taxed ? Math.round(sub * 5) / 100 : 0
  const tvq = taxed && company.tvq_applicable !== false ? Math.round(sub * 9.975) / 100 : 0
  const cell = { padding: '10px 8px', borderBottom: '1px solid #e2e8f0', verticalAlign: 'top' }
  const edit = { width: '100%', border: '1px solid transparent', borderRadius: 4, padding: '3px 5px', font: 'inherit', color: '#0f172a', background: 'transparent' }
  return (
    <div style={{ background: 'var(--c-surface-2)', borderRadius: 8, padding: 16 }}>
      <div style={{ background: '#fff', color: '#1e293b', maxWidth: 900, margin: '0 auto', borderRadius: 4, boxShadow: '0 4px 18px rgba(0,0,0,.25)', padding: '36px 40px', fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div><div style={{ fontWeight: 700, fontSize: 15 }}>Facturer à</div><div style={{ fontWeight: 700, color: '#0f172a' }}>{company.name}</div></div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#1e3a8a' }}>FACTURE</div>
            <div style={{ color: '#475569' }}>Prochaine facture : <strong>{rb.current_cycle_start}</strong></div>
            <div style={{ color: '#475569' }}>Échéance : {rb.current_cycle_end}</div>
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 24 }}>
          <thead><tr style={{ background: '#1e3a8a', color: '#fff', fontSize: 12 }}>
            <th style={{ padding: 8, textAlign: 'left', width: 28 }}>#</th><th style={{ padding: 8, textAlign: 'left' }}>Article &amp; description</th>
            <th style={{ padding: 8, textAlign: 'right', width: 80 }}>Quantité</th><th style={{ padding: 8, textAlign: 'right', width: 100 }}>Taux</th>
            <th style={{ padding: 8, textAlign: 'right', width: 100 }}>Montant</th><th style={{ width: 28 }}></th></tr></thead>
          <tbody>
            {rb.lines.map((l, n) => (
              <tr key={l.id}>
                <td style={{ ...cell, color: '#94a3b8' }}>{n + 1}</td>
                <td style={cell}><textarea rows={Math.min(8, Math.max(2, l.description.split('\n').length))} style={{ ...edit, resize: 'vertical' }} defaultValue={l.description}
                  onBlur={e => saveLine(l, { description: e.target.value })} /></td>
                <td style={cell}><input type="number" step="0.01" style={{ ...edit, textAlign: 'right' }} defaultValue={l.qty} onBlur={e => saveLine(l, { qty: parseFloat(e.target.value) || 0 })} /></td>
                <td style={cell}><input type="number" step="0.01" style={{ ...edit, textAlign: 'right' }} defaultValue={l.unit_price} onBlur={e => saveLine(l, { unit_price: parseFloat(e.target.value) || 0 })} /></td>
                <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>{money(l.qty * l.unit_price)}</td>
                <td style={cell}><button className="inv-del-btn" title="Retirer" onClick={() => removeLine(l)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 10 }}>
          {adding
            ? <div style={{ maxWidth: 420 }}><Autocomplete items={catalogue.map(c => ({ id: c.id, label: c.name }))} value={null} onSelect={addItem} openOnFocus autoFocus placeholder="Article du catalogue..." /></div>
            : <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setAdding(true)}>+ Ajouter une ligne</button>}
        </div>
        <table style={{ marginLeft: 'auto', marginTop: 12, borderCollapse: 'collapse', minWidth: 260 }}>
          <tbody>
            <tr><td style={{ padding: '3px 0', color: '#475569', textAlign: 'right' }}>Sous-total</td><td style={{ padding: '3px 0 3px 24px', textAlign: 'right' }}>{money(sub)}</td></tr>
            {tps > 0 && <tr><td style={{ padding: '3px 0', color: '#475569', textAlign: 'right' }}>TPS 5%</td><td style={{ padding: '3px 0 3px 24px', textAlign: 'right' }}>{money(tps)}</td></tr>}
            {tvq > 0 && <tr><td style={{ padding: '3px 0', color: '#475569', textAlign: 'right' }}>TVQ 9.975%</td><td style={{ padding: '3px 0 3px 24px', textAlign: 'right' }}>{money(tvq)}</td></tr>}
            <tr><td style={{ padding: '7px 0', fontWeight: 700, textAlign: 'right', borderTop: '2px solid #1e3a8a' }}>Total</td><td style={{ padding: '7px 0 7px 24px', fontWeight: 700, textAlign: 'right', borderTop: '2px solid #1e3a8a' }}>{money(sub + tps + tvq)}</td></tr>
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button className="btn-primary" onClick={onDone}>Terminé</button></div>
    </div>
  )
}

// ── Vue d'ensemble de l'entente ─────────────────────────────────────────────────
export default function EntenteView({ company, onRefresh, onOpenInvoice, oldExchanges }) {
  const [profiles, setProfiles] = useState(null)
  const [sel, setSel] = useState(null)
  const [children, setChildren] = useState(null)
  const [editing, setEditing] = useState(false)
  const [menu, setMenu] = useState(false)
  const [pause, setPause] = useState(false)
  const [busy, setBusy] = useState(false)
  const load = () => api.get('/v1/recurring-billing', { params: { company_id: company.id } }).then(r => {
    setProfiles(r.data)
    setSel(s => r.data.find(p => p.id === s?.id) || r.data.find(p => p.is_active) || r.data[0] || null)
  })
  useEffect(() => { load() }, [company.id])
  useEffect(() => { if (sel) api.get(`/v1/recurring-billing/${sel.id}/invoices`).then(r => setChildren(r.data)); else setChildren(null) }, [sel?.id])

  async function run(fn) { setBusy(true); try { await fn(); await load(); await onRefresh() } catch (e) { alert(errText(e)) } finally { setBusy(false) } }
  const createNow = () => run(async () => {
    if (!confirm('Créer maintenant la prochaine facture de cette entente ?')) return
    const r = await api.post(`/v1/recurring-billing/${sel.id}/generate-invoice`)
    if (r.data?.covered) alert(r.data.detail)
    if (r.data?.invoice_id) onOpenInvoice(r.data.invoice_id)
  })
  const createProfile = () => run(() => api.post(`/v1/companies/${company.id}/recurring-billing`, { start_date: todayIso(), frequency: 'mensuel' }))

  if (!profiles) return <div className="loading">Chargement...</div>
  const box = { background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 10 }
  const label = { fontSize: 13, color: 'var(--c-muted)' }
  const row = (k, v) => <div style={{ display: 'flex', padding: '7px 0', fontSize: 13 }}><span style={{ ...label, minWidth: 190 }}>{k}</span><span>{v}</span></div>
  const today = todayIso()
  const state = !sel ? null : !sel.is_active ? ['Arrêtée', '#6B7280'] : sel.pause_start ? ['En pause', '#D97706'] : ['Active', '#059669']
  const item = { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '9px 14px', fontSize: 13, color: 'var(--c-text)', cursor: 'pointer', borderRadius: 6 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {profiles.length === 0 && (
        <div style={{ ...box, padding: 24, textAlign: 'center' }}>
          <div style={{ color: 'var(--c-muted)', marginBottom: 12 }}>Aucune facture périodique pour ce client.</div>
          <button className="btn-primary" disabled={busy} onClick={createProfile}>Créer une facture périodique</button>
        </div>
      )}
      {profiles.length > 1 && (
        <div className="filter-tabs">{profiles.map(p => <button key={p.id} className={`filter-tab${sel?.id === p.id ? ' active' : ''}`} onClick={() => { setSel(p); setEditing(false) }}>{p.name || company.name}{p.site_label ? ` (${p.site_label})` : ''}</button>)}</div>
      )}
      {sel && (
        <div style={box}>
          {/* en-tete */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px', borderBottom: '1px solid var(--c-border)' }}>
            <div style={{ fontSize: 20, fontWeight: 600, flex: 1 }}>{sel.name || company.name}</div>
            <button className="btn-secondary" title="Modifier la prochaine facture" onClick={() => setEditing(e => !e)} style={{ fontSize: 13 }}>✎ {editing ? 'Fermer' : 'Modifier'}</button>
            <button className="btn-secondary" disabled={busy || !sel.lines.length} onClick={createNow} style={{ fontSize: 13 }}>Créer une facture</button>
            <div style={{ position: 'relative' }}>
              <button className="btn-secondary" onClick={() => setMenu(m => !m)} style={{ fontSize: 13 }}>Plus ▾</button>
              {menu && (
                <div style={{ position: 'absolute', right: 0, top: '110%', zIndex: 50, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,.35)', minWidth: 240, padding: 6 }}>
                  <button style={item} onClick={() => { setMenu(false); setPause(true) }}>{sel.pause_start ? 'Modifier la pause…' : 'Mettre en pause…'}</button>
                  {sel.pause_start && <button style={item} onClick={() => { setMenu(false); if (confirm('Annuler la pause ? La facturation reprend au cycle normal.')) run(() => api.delete(`/v1/recurring-billing/${sel.id}/pause`)) }}>Annuler la pause</button>}
                  {sel.is_active
                    ? <button style={{ ...item, color: '#DC2626' }} onClick={() => { setMenu(false); if (confirm('Arrêter la facturation de cette entente ? Plus aucune facture ne sera créée.')) run(() => api.put(`/v1/recurring-billing/${sel.id}`, { is_active: false })) }}>Arrêter la facturation</button>
                    : <button style={item} onClick={() => { setMenu(false); run(() => api.put(`/v1/recurring-billing/${sel.id}`, { is_active: true })) }}>Réactiver la facturation</button>}
                </div>
              )}
            </div>
          </div>
          {/* chiffres */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: '1px solid var(--c-border)' }}>
            {[['Montant de la facture', money(sel.next_total)],
              ['Prochaine date de facturation', sel.is_active ? sel.current_cycle_start : '—'],
              ['Période récurrente', FREQ[sel.frequency] || sel.frequency]].map(([k, v], i) => (
              <div key={k} style={{ padding: '14px 18px', textAlign: 'center', borderLeft: i ? '1px solid var(--c-border)' : 'none' }}>
                <div style={label}>{k}</div><div style={{ fontSize: 16, fontWeight: 600, marginTop: 4, color: i === 1 ? 'var(--brand)' : undefined }}>{v}</div>
              </div>
            ))}
          </div>
          {editing ? (
            <div style={{ padding: 18 }}><NextInvoiceEditor rb={sel} company={company} onDone={() => setEditing(false)} onChanged={load} /></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) 1.4fr', gap: 0 }}>
              <div style={{ padding: 18, borderRight: '1px solid var(--c-border)' }}>
                <div style={{ fontWeight: 600, fontSize: 12, letterSpacing: '.06em', color: 'var(--c-muted)', marginBottom: 6 }}>DÉTAILS</div>
                {row('Statut du profil', <span style={{ background: state[1], color: '#fff', borderRadius: 4, padding: '1px 8px', fontSize: 12, fontWeight: 600 }}>{state[0]}</span>)}
                {sel.pause_start && row('Pause', `${spell(sel.pause_start, sel.pause_end)} offerts, depuis le ${sel.pause_start}`)}
                {row('Date de début', sel.start_date)}
                {row('Date de fin', sel.end_date || "N'expire jamais")}
                {row('Conditions de paiement', `${sel.terms_days} net`)}
                {row('Frais de retard', <input type="checkbox" checked={!company.no_late_fees} style={{ cursor: 'pointer' }}
                  onChange={e => run(() => api.put(`/v1/companies/${company.id}`, { no_late_fees: !e.target.checked }))} />)}
                <div style={{ fontWeight: 600, fontSize: 12, letterSpacing: '.06em', color: 'var(--c-muted)', margin: '16px 0 6px' }}>NOTES</div>
                <textarea key={company.notes_internal || ''} rows={5} defaultValue={company.notes_internal || ''} placeholder="Notes sur l'entreprise (les mêmes que dans Général)"
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface-2)', color: 'var(--c-text)', font: 'inherit', fontSize: 13, resize: 'vertical' }}
                  onBlur={e => { if (e.target.value !== (company.notes_internal || '')) run(() => api.put(`/v1/companies/${company.id}`, { notes_internal: e.target.value })) }} />
              </div>
              <div style={{ padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <div style={{ fontWeight: 600 }}>Toutes les factures enfants</div>
                  {children && <div style={{ fontSize: 13, color: 'var(--c-muted)' }}>Factures impayées : <strong style={{ color: children.unpaid > 0 ? '#D97706' : 'var(--c-text)' }}>{money(children.unpaid)}</strong></div>}
                </div>
                {!children ? <div className="loading">Chargement...</div> : children.invoices.length === 0 ? <div style={{ color: 'var(--c-faint)', fontSize: 13 }}>Aucune facture encore.</div> : (
                  <div style={{ maxHeight: 520, overflowY: 'auto' }}>
                    {children.invoices.map(i => {
                      const days = i.due_date ? Math.round((Date.parse(i.due_date) - Date.parse(today)) / 86400000) : null
                      const st = i.status === 'payee' ? ['PAYÉE', '#059669'] : i.status === 'annulee' ? ['ANNULÉE', 'var(--c-faint)']
                        : i.status === 'en_retard' || (days !== null && days < 0) ? ['EN RETARD', '#DC2626'] : [days === 0 ? "ÉCHÉANCE AUJOURD'HUI" : `ÉCHÉANCE DANS ${days} JOUR${days > 1 ? 'S' : ''}`, '#2563EB']
                      return (
                        <div key={i.id} onClick={() => onOpenInvoice(i.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 4px', borderBottom: '1px solid var(--c-border)', cursor: 'pointer' }}>
                          <div><div style={{ fontWeight: 600, fontSize: 13 }}>{company.name}</div>
                            <div style={{ fontSize: 13 }}><span style={{ color: 'var(--brand)' }}>{i.number}</span><span style={{ color: 'var(--c-muted)' }}> · {i.issue_date}</span></div></div>
                          <div style={{ textAlign: 'right' }}><div style={{ fontWeight: 600 }}>{money(i.total)}</div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: st[1] }}>{st[0]}</div></div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {oldExchanges}
      {pause && sel && <PauseModal rb={sel} onClose={() => setPause(false)} onSaved={async () => { setPause(false); await load() }} />}
    </div>
  )
}
