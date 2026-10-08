// Echanges (troc) d'une compagnie -- TASK-005.13. Le montant hors taxes de l'echange repousse sa facture
// periodique : cycles couverts sans facture, puis facture au prorata a la date ou le credit s'epuise.
// Les pieces justificatives (facture du fournisseur, photo) restent jointes : preuve de l'echange.
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { C, EMPTY, fmtMoney } from '../Bank'

const today = () => new Date().toISOString().slice(0, 10)
const errText = e => e.response?.data?.detail || 'Erreur'
const small = { padding: '6px 8px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, minWidth: 0 }
const box = { border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 14, background: '#fff' }

async function openFile(id) {
  const r = await api.get(`/v1/barter/files/${id}`, { responseType: 'blob' })
  window.open(URL.createObjectURL(r.data), '_blank')
}

function BarterModal({ companyId, initial, recurrences, onClose, onSaved }) {
  const [f, setF] = useState(() => initial ? {
    exchange_date: initial.exchange_date, description: initial.description, received_value: String(initial.received_value),
    recurring_billing_id: initial.recurring_billing_id || '', notes: initial.notes || '',
    deductions: initial.deductions.map(d => ({ description: d.description, qty: String(d.qty), unit_price: String(d.unit_price) })),
  } : {
    exchange_date: today(), description: '', received_value: '', recurring_billing_id: recurrences.length === 1 ? recurrences[0].id : '',
    notes: '', deductions: [],
  })
  const [files, setFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const setDed = (i, k, v) => setF(p => ({ ...p, deductions: p.deductions.map((d, j) => j === i ? { ...d, [k]: v } : d) }))
  const num = v => parseFloat(String(v).replace(',', '.')) || 0
  const dedTotal = f.deductions.reduce((s, d) => s + num(d.qty) * num(d.unit_price), 0)
  const credit = num(f.received_value) - dedTotal
  const locked = initial?.applications?.length > 0

  async function save() {
    setSaving(true); setError(null)
    const body = {
      exchange_date: f.exchange_date, description: f.description, received_value: num(f.received_value),
      recurring_billing_id: f.recurring_billing_id || null, notes: f.notes,
      deductions: f.deductions.map(d => ({ description: d.description, qty: num(d.qty), unit_price: num(d.unit_price) })),
    }
    try {
      const r = initial ? await api.put(`/v1/barter/${initial.id}`, body) : await api.post(`/v1/barter/companies/${companyId}`, body)
      if (files.length) {
        const fd = new FormData()
        files.forEach(x => fd.append('files', x))
        await api.post(`/v1/barter/${r.data.id}/files`, fd)
      }
      await onSaved()
    } catch (e) { setError(errText(e)); setSaving(false) }
  }

  const input = { width: '100%', boxSizing: 'border-box' }
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 680, width: '100%' }}>
        <div className="modal-title">{initial ? "Modifier l'échange" : 'Nouvel échange (troc)'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12 }}>
          <div className="form-group"><label>Date</label><input type="date" style={input} value={f.exchange_date} onChange={e => set('exchange_date', e.target.value)} /></div>
          <div className="form-group"><label>Ce que la compagnie a donné</label><input style={input} value={f.description} placeholder="ex. Réparation automobile" onChange={e => set('description', e.target.value)} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12 }}>
          <div className="form-group"><label>Valeur hors taxes</label><input style={input} inputMode="decimal" value={f.received_value} onChange={e => set('received_value', e.target.value)} /></div>
          <div className="form-group">
            <label>Facture périodique repoussée</label>
            <select style={input} value={f.recurring_billing_id} disabled={locked} onChange={e => set('recurring_billing_id', e.target.value)}>
              <option value="">— Aucune (crédit gardé en note seulement) —</option>
              {recurrences.map(r => <option key={r.id} value={r.id}>{r.name} · {r.frequency} · {fmtMoney(r.cycle_amount)} HT par cycle</option>)}
            </select>
            {locked && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Le crédit a déjà servi : la facture périodique ne peut plus changer.</div>}
          </div>
        </div>

        <div style={{ fontWeight: 600, fontSize: 13, margin: '6px 0' }}>Déductions <span style={{ fontWeight: 400, color: C.muted }}>(ce qu'elle devait déjà sans avoir été facturée)</span></div>
        {f.deductions.map((d, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 100px 90px 28px', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <input style={small} value={d.description} placeholder="ex. Texto 500 non facturé" onChange={e => setDed(i, 'description', e.target.value)} />
            <input style={small} inputMode="decimal" value={d.qty} title="Quantité" onChange={e => setDed(i, 'qty', e.target.value)} />
            <input style={small} inputMode="decimal" value={d.unit_price} title="Prix unitaire" placeholder="Prix" onChange={e => setDed(i, 'unit_price', e.target.value)} />
            <span style={{ textAlign: 'right', fontSize: 13 }}>−{fmtMoney(num(d.qty) * num(d.unit_price))}</span>
            <button type="button" className="btn-secondary" style={{ padding: '2px 6px' }} onClick={() => set('deductions', f.deductions.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button type="button" className="btn-secondary" style={{ fontSize: 12 }} onClick={() => set('deductions', [...f.deductions, { description: '', qty: '1', unit_price: '' }])}>+ Ajouter une déduction</button>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, margin: '12px 0', fontSize: 14 }}>
          <span>Crédit hors taxes : <b style={{ color: credit < 0 ? C.red : C.green }}>{fmtMoney(credit)}</b></span>
        </div>

        <div className="form-group"><label>Notes</label><textarea rows={2} style={input} value={f.notes} onChange={e => set('notes', e.target.value)} /></div>
        <div className="form-group">
          <label>Pièces justificatives (facture, photo…)</label>
          <input type="file" multiple onChange={e => setFiles([...e.target.files])} />
        </div>
        {error && <div style={{ color: C.red, fontSize: 13, marginBottom: 8 }}>{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}

const FREQ_LABEL = { mensuel: 'chaque mois', bimestriel: 'aux 2 mois', trimestriel: 'aux 3 mois', biannuel: 'aux 6 mois', annuel: 'chaque année', hebdomadaire: 'chaque semaine' }

// Dates « AAAA-MM-JJ » manipulees en UTC (pas de decalage de fuseau)
const toD = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
const toIso = d => d.toISOString().slice(0, 10)
const addDays = (iso, n) => { const d = toD(iso); d.setUTCDate(d.getUTCDate() + n); return toIso(d) }
function addMonths(iso, n) {
  const d = toD(iso), day = d.getUTCDate()
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate()
  r.setUTCDate(Math.min(day, last))
  return toIso(r)
}
const longDate = iso => iso ? toD(iso).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : EMPTY
const dayCount = (a, b) => Math.round((toD(b) - toD(a)) / 86400000) + 1

// Mois de service couverts par le credit : du premier jour non facture au dernier jour couvert, mois par mois
function coveredMonths(rb) {
  const covered = rb.projection.filter(p => !p.normal)
  if (!covered.length || !rb.months_per_cycle) return []
  const first = covered[0].cycle_start, lastDay = covered[covered.length - 1].covered_until
  const monthly = rb.cycle_amount / rb.months_per_cycle
  const totalUsed = covered.reduce((s, p) => s + p.used, 0)
  const out = []
  let from = first, used = 0
  while (from <= lastDay && out.length < 120) {
    const to = addDays(addMonths(from, 1), -1)
    if (to <= lastDay) { out.push({ from, to, amount: monthly }); used += monthly }
    else { out.push({ from, to: lastDay, amount: Math.max(totalUsed - used, 0), partial: dayCount(from, lastDay) }); break }
    from = addMonths(from, 1)
  }
  return out
}

function Projection({ rb }) {
  if (!rb.projection.length) return null
  const th = { textAlign: 'left', padding: '6px 8px', fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${C.border}` }
  const td = { padding: '7px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 13, verticalAlign: 'top' }
  const months = coveredMonths(rb)
  const covered = rb.projection.filter(p => !p.normal)
  const pushed = covered.find(p => !p.full)
  const normal = rb.projection.find(p => p.normal)
  return (
    <div style={{ ...box, background: '#F0FDF4', borderColor: '#BBF7D0' }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Facture périodique « {rb.name} » — calendrier avec l'échange</div>
      <div style={{ fontSize: 13, marginBottom: 2 }}>
        Rythme : <b>{FREQ_LABEL[rb.frequency] || rb.frequency}</b> · {fmtMoney(rb.cycle_amount)} hors taxes par facture
        {rb.months_per_cycle > 1 && <> ({fmtMoney(rb.cycle_amount / rb.months_per_cycle)} par mois)</>}
      </div>
      {rb.last_invoice_date && (
        <div style={{ fontSize: 13, marginBottom: 10 }}>
          Dernière facture : {rb.last_invoice_number || 'facture'} du {longDate(rb.last_invoice_date)} — service déjà payé jusqu'au <b>{longDate(rb.paid_until)}</b> (le troc commence après)
        </div>
      )}
      <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 8, border: `1px solid ${C.border}` }}>
        <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>Date habituelle</th><th style={th}>Période</th><th style={{ ...th, textAlign: 'right' }}>Habituel (HT)</th>
            <th style={{ ...th, textAlign: 'right' }}>Payé par l'échange</th><th style={th}>Ce qui arrive</th>
          </tr></thead>
          <tbody>
            {rb.projection.map(p => (
              <tr key={p.cycle_start}>
                <td style={td}>{longDate(p.cycle_start)}</td>
                <td style={td}>{longDate(p.cycle_start)} au {longDate(addDays(p.cycle_end, -1))}</td>
                <td style={{ ...td, textAlign: 'right' }}>{fmtMoney(rb.cycle_amount)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{p.normal ? EMPTY : fmtMoney(p.used)}</td>
                <td style={td}>
                  {p.normal ? <span>Facture normale — retour au rythme habituel</span>
                    : p.full ? <b style={{ color: C.green }}>Facture sautée — aucune facture</b>
                    : <><b>Repoussée au {longDate(p.billed_from)}</b> : {fmtMoney(p.to_bill)} hors taxes<div style={{ fontSize: 12, color: C.muted }}>couvert jusqu'au {longDate(p.covered_until)}, facturé du {longDate(p.billed_from)} au {longDate(addDays(p.cycle_end, -1))}</div></>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {months.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Mois de service payés par l'échange : du {longDate(covered[0].cycle_start)} au {longDate(covered[covered.length - 1].covered_until)}
            {' '}({months.filter(m => !m.partial).length} mois{months.some(m => m.partial) ? ` et ${months.find(m => m.partial).partial} jours` : ''})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 4 }}>
            {months.map(m => (
              <div key={m.from} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px' }}>
                <span>{longDate(m.from)} → {longDate(m.to)}{m.partial ? ` (${m.partial} j)` : ''}</span><span>{fmtMoney(m.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 13, marginTop: 12 }}>
        {pushed
          ? <>Nouvelle date de facturation : <b>{longDate(pushed.billed_from)}</b> ({fmtMoney(pushed.to_bill)} hors taxes + taxes)</>
          : <>Prochaine facture : <b>{normal ? longDate(normal.cycle_start) : EMPTY}</b></>}
        {pushed && normal && <>, puis le {longDate(normal.cycle_start)} au rythme habituel ({fmtMoney(normal.to_bill)} hors taxes + taxes).</>}
      </div>
    </div>
  )
}

function ExchangeCard({ b, onEdit, onChanged }) {
  const navigate = useNavigate()
  const fileRef = useRef()
  const [busy, setBusy] = useState(false)
  async function upload(list) {
    if (!list.length) return
    setBusy(true)
    const fd = new FormData()
    ;[...list].forEach(x => fd.append('files', x))
    try { await api.post(`/v1/barter/${b.id}/files`, fd); await onChanged() } catch (e) { alert(errText(e)) } finally { setBusy(false) }
  }
  async function removeFile(fl) {
    if (!confirm(`Retirer la pièce « ${fl.filename} » ?`)) return
    await api.delete(`/v1/barter/files/${fl.id}`); await onChanged()
  }
  async function remove() {
    if (!confirm(`Supprimer l'échange « ${b.description} » ?`)) return
    try { await api.delete(`/v1/barter/${b.id}`); await onChanged() } catch (e) { alert(errText(e)) }
  }
  const row = (l, v, opts = {}) => <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 13, fontWeight: opts.bold ? 700 : 400, color: opts.color }}><span>{l}</span><span>{v}</span></div>
  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 600 }}>{b.description}</div>
          <div style={{ fontSize: 12, color: C.muted }}>Échange du {b.exchange_date}{b.recurring_name ? ` · repousse « ${b.recurring_name} »` : ' · aucune facture périodique'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={onEdit}>Modifier</button>
          {!b.applications.length && <button className="btn-secondary" style={{ color: C.red }} onClick={remove}>Supprimer</button>}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 24 }}>
        <div>
          {row('Valeur reçue (hors taxes)', fmtMoney(b.received_value))}
          {b.deductions.map(d => row(`− ${d.description}${d.qty !== 1 ? ` (${d.qty} × ${fmtMoney(d.unit_price)})` : ''}`, `−${fmtMoney(d.total)}`, { color: C.muted }))}
          <div style={{ borderTop: `1px solid ${C.border}`, margin: '4px 0' }} />
          {row('Crédit', fmtMoney(b.credit), { bold: true })}
          {row('Utilisé', fmtMoney(b.used))}
          {row('Restant', fmtMoney(b.remaining), { bold: true, color: b.remaining > 0 ? C.green : C.muted })}
          {b.notes && <div style={{ fontSize: 12, color: C.muted, marginTop: 8, whiteSpace: 'pre-wrap' }}>{b.notes}</div>}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 4 }}>CYCLES COUVERTS</div>
          {b.applications.length ? b.applications.map((a, i) => (
            <div key={i} style={{ fontSize: 13, marginBottom: 2 }}>
              {a.cycle_start} au {a.covered_until} : {fmtMoney(a.amount)}{' '}
              {a.invoice_id
                ? <>— facture <span style={{ color: C.link, cursor: 'pointer' }} onClick={() => navigate(`/invoices/${a.invoice_id}`)}>{a.invoice_number}</span> repoussée</>
                : <span style={{ color: C.muted }}>— aucune facture</span>}
            </div>
          )) : <div style={{ fontSize: 13, color: C.faint }}>{EMPTY} pas encore (au prochain cycle à facturer)</div>}
          <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, margin: '12px 0 4px' }}>PIÈCES JUSTIFICATIVES</div>
          {b.files.map(fl => (
            <div key={fl.id} style={{ fontSize: 13, display: 'flex', gap: 8 }}>
              <span style={{ color: C.link, cursor: 'pointer' }} onClick={() => openFile(fl.id)}>{fl.filename}</span>
              <span style={{ color: C.faint, cursor: 'pointer' }} title="Retirer" onClick={() => removeFile(fl)}>×</span>
            </div>
          ))}
          <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={e => { upload(e.target.files); e.target.value = '' }} />
          <button className="btn-secondary" style={{ fontSize: 12, marginTop: 6 }} disabled={busy} onClick={() => fileRef.current.click()}>{busy ? 'Envoi…' : '+ Joindre une pièce'}</button>
        </div>
      </div>
    </div>
  )
}

export default function BarterTab({ companyId }) {
  const [data, setData] = useState(null)
  const [edit, setEdit] = useState(null)        // null | 'new' | echange
  const load = () => api.get(`/v1/barter/companies/${companyId}`).then(r => setData(r.data))
  useEffect(() => { load() }, [companyId])
  if (!data) return <div className="loading">Chargement...</div>
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: C.muted, maxWidth: 640 }}>
          Ce que la compagnie donne en échange de nos services. Le crédit hors taxes repousse sa facture périodique, à partir du premier cycle pas encore facturé.
        </div>
        <button className="btn-primary" onClick={() => setEdit('new')}>+ Nouvel échange</button>
      </div>
      {data.recurrences.map(rb => <Projection key={rb.id} rb={rb} />)}
      {data.exchanges.length
        ? data.exchanges.map(b => <ExchangeCard key={b.id} b={b} onEdit={() => setEdit(b)} onChanged={load} />)
        : <div style={{ color: C.faint, fontSize: 13, padding: '20px 0' }}>Aucun échange.</div>}
      {edit && (
        <BarterModal companyId={companyId} initial={edit === 'new' ? null : edit} recurrences={data.recurrences.filter(r => r.is_active || r.id === edit?.recurring_billing_id)}
          onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await load() }} />
      )}
    </div>
  )
}
