// Echanges (troc) d'une compagnie -- TASK-005.13. Le credit hors taxes (la valeur de l'echange) paie
// des mois de service de la facture periodique ; sa facturation repart a la date de reprise. Suivi du jour en haut.
// Les pieces justificatives (facture du fournisseur, photo) restent jointes : preuve de l'echange.
import { useState, useEffect, useRef, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { C, EMPTY, fmtMoney } from '../Bank'
import { todayIso } from '../../utils/date'
import useRowSelection from '../../hooks/useRowSelection'
import BulkInvoiceBar from '../../components/BulkInvoiceBar'
import { downloadFile } from '../../utils/download'
import { askConfirm, showAlert } from '../../components/Dialog'

const today = () => todayIso()
const errText = e => e.response?.data?.detail || 'Erreur'
const small = { padding: '6px 8px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, minWidth: 0 }
const box = { border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 14, background: 'var(--c-surface)' }

async function openFile(id) {
  const r = await api.get(`/v1/barter/files/${id}`, { responseType: 'blob' })
  window.open(URL.createObjectURL(r.data), '_blank')
}

// invoices (TASK-046) : echange cree depuis des factures cochees -- il paie d'abord exactement celles-ci ; valeur
// proposee = leur reste.
export function BarterModal({ companyId, initial, recurrences, invoices, onClose, onSaved }) {
  const [f, setF] = useState(() => initial ? {
    exchange_date: initial.exchange_date, description: initial.description, received_value: String(initial.received_value),
    recurring_billing_id: initial.recurring_billing_id || '', notes: initial.notes || '',
  } : {
    exchange_date: today(), description: '', recurring_billing_id: recurrences.length === 1 ? recurrences[0].id : '',
    received_value: invoices?.length ? invoices.reduce((t, i) => t + i.remaining, 0).toFixed(2) : '',
    notes: '',
  })
  const [files, setFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const num = v => parseFloat(String(v).replace(',', '.')) || 0
  const locked = initial?.applications?.length > 0

  async function save() {
    setSaving(true); setError(null)
    const body = {
      exchange_date: f.exchange_date, description: f.description, received_value: num(f.received_value),
      recurring_billing_id: f.recurring_billing_id || null, notes: f.notes,
      ...(invoices?.length && !initial ? { invoice_ids: invoices.map(i => i.id) } : {}),
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
            <label>Facture périodique payée par l'échange</label>
            <select style={input} value={f.recurring_billing_id} disabled={locked} onChange={e => set('recurring_billing_id', e.target.value)}>
              <option value="">— Aucune (crédit gardé en note seulement) —</option>
              {recurrences.map(r => <option key={r.id} value={r.id}>{r.name} · {r.frequency} · {fmtMoney(r.cycle_amount)} HT par cycle</option>)}
            </select>
            {locked && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Le crédit a déjà servi : la facture périodique ne peut plus changer.</div>}
          </div>
        </div>

        {invoices?.length > 0 && !initial && (
          <div style={{ fontSize: 13, background: 'var(--c-tint-green)', border: '1px solid #A7F3D0', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
            Paie d'abord {invoices.length > 1 ? 'les factures choisies' : 'la facture choisie'} : {invoices.map(i => `${i.number} (${fmtMoney(i.remaining)})`).join(', ')}.
            {' '}Ce qui dépasse paie ses autres factures ouvertes, puis ses mois de service.
          </div>
        )}
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
const longDate = iso => iso ? toD(iso).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : EMPTY

function Gauge({ rb }) {
  const g = rb.projection.gauge
  const pct = g.credit_total > 0 ? Math.min(100, (g.consumed / g.credit_total) * 100) : 0
  return (
    <div style={{ background: 'var(--c-surface)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 13, marginBottom: 8 }}>
        <b>Aujourd'hui, {longDate(g.today)}</b>
        <span style={{ color: C.muted }}>
          {g.state === 'a_venir' ? `L'échange commence le ${longDate(rb.projection.since)}`
            : g.state === 'termine' ? `Échange remboursé au complet le ${longDate(g.last_day)}`
            : `Jour ${g.day_index} sur ${g.total_days}`}
        </span>
      </div>
      {rb.paid_until && (
        <div style={{ fontSize: 13, background: 'var(--c-tint-blue)', border: '1px solid #BFDBFE', borderRadius: 6, padding: '6px 10px', marginBottom: 10 }}>
          Période déjà payée : <b>du {longDate(rb.paid_from)} au {longDate(rb.paid_until)}</b> ({rb.last_invoice_number || 'dernière facture'}) — pas comptée dans l'échange
        </div>
      )}
      <div style={{ height: 12, background: 'var(--c-border)', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: C.green }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginTop: 10, fontSize: 13 }}>
        <div><div style={{ color: C.muted, fontSize: 11 }}>CRÉDIT POUR LE SERVICE</div><b>{fmtMoney(g.credit_total)}</b></div>
        <div><div style={{ color: C.muted, fontSize: 11 }}>SERVICE DÉJÀ FOURNI</div><b>{fmtMoney(g.consumed)}</b> ({Math.round(pct)} %)</div>
        <div><div style={{ color: C.muted, fontSize: 11 }}>ENCORE DÛ AU CLIENT</div><b style={{ color: g.remaining > 0 ? C.red : C.green }}>{fmtMoney(g.remaining)}</b>{g.last_day && g.remaining > 0 && <div style={{ fontSize: 12, color: C.muted }}>service jusqu'au {longDate(g.last_day)}</div>}</div>
        <div><div style={{ color: C.muted, fontSize: 11 }}>IL RECOMMENCE À PAYER</div><b>{longDate(rb.projection.resume_on)}</b></div>
      </div>
    </div>
  )
}

function Projection({ rb, children }) {
  const p = rb.projection
  if (!p) return null
  return (
    <div style={{ ...box, background: 'var(--c-tint-green)', borderColor: '#BBF7D0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ fontWeight: 600 }}>Facture périodique « {rb.name} » — suivi de l'échange</div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em' }}>Valeur de l'échange</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtMoney(p.gauge.exchange_value)} <span style={{ fontSize: 12, fontWeight: 400, color: C.muted }}>hors taxes</span></div>
        </div>
      </div>
      <Gauge rb={rb} />
      <div style={{ marginBottom: 10 }} />

      {p.resume_on && (
        <div style={{ background: 'var(--c-surface)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13 }}>
          <div style={{ marginBottom: 4 }}>Durée de l'échange : <b>{p.months.filter(m => !m.days).length} mois{p.months.some(m => m.days) ? ` et ${p.months.find(m => m.days).days} jours` : ''}</b></div>
          <div>Il recommence à payer le <b style={{ fontSize: 15 }}>{longDate(p.resume_on)}</b> — son cycle repart de cette date, {FREQ_LABEL[rb.frequency] || rb.frequency}.</div>
          <div style={{ marginTop: 4 }}>Prochaines factures : {p.next_invoices.map(longDate).join(' · ')} ({fmtMoney(rb.cycle_amount)} hors taxes + taxes chacune, au prix actuel)</div>
        </div>
      )}

      {children}
    </div>
  )
}

function MonthsBox({ rb }) {
  const navigate = useNavigate()
  const p = rb.projection
  const th = { textAlign: 'left', padding: '6px 8px', fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${C.border}` }
  const td = { padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 13 }
  const full = p.months.filter(m => !m.days).length
  const part = p.months.find(m => m.days)
  return (
    <div style={box}>
      <div style={{ overflowX: 'auto', background: 'var(--c-surface)', borderRadius: 8, border: `1px solid ${C.border}` }}>
        <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>Mois de service</th><th style={th}>Durée</th><th style={{ ...th, textAlign: 'right' }}>Payé par l'échange</th><th style={th}>État</th>
          </tr></thead>
          <tbody>
            {p.paid_invoices.map(x => (
              <tr key={x.invoice_id}>
                <td style={td}>Facture <span style={{ color: C.link, cursor: 'pointer' }} onClick={() => navigate(`/invoices/${x.invoice_id}`)}>{x.number}</span> (payée le {longDate(x.date)})</td>
                <td style={td}>{EMPTY}</td>
                <td style={{ ...td, textAlign: 'right' }}>{fmtMoney(x.amount)}</td>
                <td style={{ ...td, color: C.green }}>Payée</td>
              </tr>
            ))}
            {p.months.map(m => (
              <tr key={m.start}>
                <td style={td}>{longDate(m.start)} → {longDate(m.covered_until)}</td>
                <td style={td}>{m.days ? `${m.days} jours` : '1 mois'}</td>
                <td style={{ ...td, textAlign: 'right' }}>{fmtMoney(m.amount)}</td>
                <td style={{ ...td, color: m.done ? C.green : C.muted }}>{m.done ? 'Compté' : 'À venir'}</td>
              </tr>
            ))}
            {p.resume_on && (
              <tr>
                <td style={{ ...td, fontWeight: 600 }}>Total</td>
                <td style={{ ...td, fontWeight: 600 }}>{full} mois{part ? ` et ${part.days} jours` : ''}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmtMoney(p.months.reduce((t, m) => t + m.amount, 0) + p.paid_invoices.reduce((t, x) => t + x.amount, 0))}</td>
                <td style={td}></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
        Chaque mois est compté au prix de ses services au début du mois : si les services augmentent, les mois suivants coûtent plus cher et la reprise arrive plus tôt. Le jour entamé à la fin est laissé au client.
      </div>
      {p.skipped.length > 0 && <div style={{ fontSize: 13, marginTop: 10 }}>Factures sautées : {p.skipped.map(longDate).join(' · ')}</div>}
    </div>
  )
}

function ExchangeCard({ b, companyName, onEdit, onChanged }) {
  const navigate = useNavigate()
  const fileRef = useRef()
  const [busy, setBusy] = useState(false)
  async function upload(list) {
    if (!list.length) return
    setBusy(true)
    const fd = new FormData()
    ;[...list].forEach(x => fd.append('files', x))
    try { await api.post(`/v1/barter/${b.id}/files`, fd); await onChanged() } catch (e) { showAlert(errText(e)) } finally { setBusy(false) }
  }
  async function removeFile(fl) {
    if (!await askConfirm(`Retirer la pièce « ${fl.filename} » ?`)) return
    await api.delete(`/v1/barter/files/${fl.id}`); await onChanged()
  }
  async function remove() {
    if (!await askConfirm(`Supprimer l'échange « ${b.description} » ?`)) return
    try { await api.delete(`/v1/barter/${b.id}`); await onChanged() } catch (e) { showAlert(errText(e)) }
  }
  const row = (l, v, opts = {}) => <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 13, fontWeight: opts.bold ? 700 : 400, color: opts.color }}><span>{l}</span><span>{v}</span></div>
  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 600 }}>{b.description}</div>
          <div style={{ fontSize: 12, color: C.muted }}>Échange du {b.exchange_date}{b.recurring_name ? ` · paie « ${b.recurring_name} »` : ' · aucune facture périodique'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={() => downloadFile(`/v1/barter/${b.id}/pdf`, `echange-${(companyName || '').replace(/[^\p{L}\p{N}]+/gu, '-')}-${b.exchange_date}.pdf`).catch(() => showAlert('PDF non disponible'))}>⬇ PDF</button>
          <button className="btn-secondary" onClick={onEdit}>Modifier</button>
          {!b.applications.length && <button className="btn-secondary" style={{ color: C.red }} onClick={remove}>Supprimer</button>}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 24 }}>
        <div>
          {row("Valeur de l'échange (hors taxes)", fmtMoney(b.received_value), { bold: true })}
          <div style={{ borderTop: `1px solid ${C.border}`, margin: '4px 0' }} />
          {row('Utilisé', fmtMoney(b.used))}
          {row('Restant', fmtMoney(b.remaining), { bold: true, color: b.remaining > 0 ? C.green : C.muted })}
          {b.notes && <div style={{ fontSize: 12, color: C.muted, marginTop: 8, whiteSpace: 'pre-wrap' }}>{b.notes}</div>}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 4 }}>DÉJÀ UTILISÉ</div>
          {b.remaining <= 0 && b.applications.length > 0 && (
            <div style={{ fontSize: 13, color: C.green, fontWeight: 600, marginBottom: 4 }}>
              Remboursé au complet : service fourni du {longDate(b.applications[0].cycle_start)} au {longDate(b.applications[b.applications.length - 1].covered_until)}
            </div>
          )}
          {b.applications.length ? b.applications.map((a, i) => (
            <div key={i} style={{ fontSize: 13, marginBottom: 2 }}>
              {a.invoice_id
                ? <>Facture <span style={{ color: C.link, cursor: 'pointer' }} onClick={() => navigate(`/invoices/${a.invoice_id}`)}>{a.invoice_number}</span> payée le {longDate(a.cycle_start)} : {fmtMoney(a.amount)}</>
                : <>{longDate(a.cycle_start)} → {longDate(a.covered_until)} : {fmtMoney(a.amount)}</>}
            </div>
          )) : <div style={{ fontSize: 13, color: C.faint }}>Rien encore — le crédit paie d'abord les factures ouvertes, puis les mois à partir du premier jour pas encore facturé</div>}
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

// Factures « a regler en troc » encore ouvertes (TASK-046) : leur reste est calcule par le serveur a chaque
// affichage -- un paiement, un avoir ou un echange l'ajuste tout seul. Cocher -> barre d'actions (creer un echange...).
function TrocDebt({ rows, companyId, companyName, onChanged }) {
  const navigate = useNavigate()
  const sel = useRowSelection(rows)
  if (!rows.length) return null
  const total = rows.reduce((t, i) => t + i.remaining, 0)
  const picked = sel.visible.map(i => ({ ...i, company_id: companyId, company_name: companyName, status: 'envoyee', is_credit: false, barter_settlement: true, late_fee: false }))
  return (
    <div style={{ ...box, borderColor: '#FCD34D', background: 'var(--c-tint-amber)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
        <label style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={sel.allChecked} onChange={sel.toggleAll} title="Tout sélectionner" /> À régler en troc
        </label>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{fmtMoney(total)}</div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <tbody>
          {rows.map(i => (
            <tr key={i.id} style={{ borderTop: `1px solid #FDE68A`, cursor: 'pointer', background: sel.selected.has(i.id) ? 'var(--c-tint-blue)' : undefined }}
              onClick={e => sel.rowClick(e, i.id, () => navigate(`/invoices/${i.id}`))} onMouseDown={sel.noTextSelect}>
              <td style={{ padding: '5px 6px', width: 24 }} onClick={e => e.stopPropagation()}><input type="checkbox" checked={sel.selected.has(i.id)} onChange={e => sel.toggle(i.id, e.nativeEvent)} /></td>
              <td style={{ padding: '5px 6px', fontWeight: 600 }}>{i.number}</td>
              <td style={{ padding: '5px 6px', color: C.muted }}>{longDate(i.issue_date)}</td>
              <td style={{ padding: '5px 6px', textAlign: 'right', color: C.muted }}>{fmtMoney(i.total)}{i.paid > 0 && ` · payé ${fmtMoney(i.paid)}`}</td>
              <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>reste {fmtMoney(i.remaining)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <BulkInvoiceBar items={picked} onClear={sel.clear} onDone={onChanged} />
    </div>
  )
}

export default function BarterTab({ companyId, companyName }) {
  const [data, setData] = useState(null)
  const [edit, setEdit] = useState(null)        // null | 'new' | echange
  const load = () => api.get(`/v1/barter/companies/${companyId}`).then(r => setData(r.data))
  useEffect(() => { load() }, [companyId])
  if (!data) return <div className="loading">Chargement...</div>
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: C.muted, maxWidth: 640 }}>
          Ce que la compagnie donne en échange de nos services. Le crédit hors taxes paie ses mois de service à partir du premier jour pas encore facturé ; sa facturation repart quand le crédit est épuisé.
        </div>
        <button className="btn-primary" onClick={() => setEdit('new')}>+ Nouvel échange</button>
      </div>
      <TrocDebt rows={data.troc_invoices || []} companyId={companyId} companyName={companyName} onChanged={load} />
      {/* Boite verte : suivi, puis la fiche de l'echange ; le tableau des mois en dessous */}
      {data.recurrences.filter(rb => rb.projection).map(rb => (
        <Fragment key={rb.id}>
          <Projection rb={rb}>
            {data.exchanges.filter(b => b.recurring_billing_id === rb.id).map(b => <ExchangeCard key={b.id} b={b} companyName={companyName} onEdit={() => setEdit(b)} onChanged={load} />)}
          </Projection>
          <MonthsBox rb={rb} />
        </Fragment>
      ))}
      {data.exchanges.filter(b => !data.recurrences.some(rb => rb.projection && rb.id === b.recurring_billing_id))
        .map(b => <ExchangeCard key={b.id} b={b} companyName={companyName} onEdit={() => setEdit(b)} onChanged={load} />)}
      {!data.exchanges.length && <div style={{ color: C.faint, fontSize: 13, padding: '20px 0' }}>Aucun échange.</div>}
      {edit && (
        <BarterModal companyId={companyId} initial={edit === 'new' ? null : edit} recurrences={data.recurrences.filter(r => r.is_active || r.id === edit?.recurring_billing_id)}
          onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await load() }} />
      )}
    </div>
  )
}
