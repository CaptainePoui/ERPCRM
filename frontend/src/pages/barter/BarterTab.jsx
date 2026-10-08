// Echanges (troc) d'une compagnie -- TASK-005.13. Le credit hors taxes (valeur de l'echange + ajustements) paie
// des mois de service de la facture periodique ; sa facturation repart a la date de reprise. Suivi du jour en haut.
// Les pieces justificatives (facture du fournisseur, photo) restent jointes : preuve de l'echange.
import { useState, useEffect, useRef, Fragment } from 'react'
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
    deductions: initial.deductions.map(d => ({ description: d.description, qty: String(d.qty), unit_price: String(d.unit_price), direction: d.direction, note: d.note || '' })),
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
  const signed = d => (d.direction === 'client' ? 1 : -1) * num(d.qty) * num(d.unit_price)
  const adjTotal = f.deductions.reduce((s, d) => s + signed(d), 0)
  const credit = num(f.received_value) + adjTotal
  const locked = initial?.applications?.length > 0

  async function save() {
    setSaving(true); setError(null)
    const body = {
      exchange_date: f.exchange_date, description: f.description, received_value: num(f.received_value),
      recurring_billing_id: f.recurring_billing_id || null, notes: f.notes,
      deductions: f.deductions.map(d => ({ description: d.description, qty: num(d.qty), unit_price: num(d.unit_price), direction: d.direction, note: d.note })),
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

        <div style={{ fontWeight: 600, fontSize: 13, margin: '6px 0' }}>Ajustements <span style={{ fontWeight: 400, color: C.muted }}>(à part de l'échange : ex. un service oublié de facturer)</span></div>
        {f.deductions.map((d, i) => (
          <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 8, marginBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 60px 90px 90px 28px', gap: 8, alignItems: 'center' }}>
              <input style={small} value={d.description} placeholder="ex. Texto 500 non facturé" onChange={e => setDed(i, 'description', e.target.value)} />
              <select style={small} value={d.direction} onChange={e => setDed(i, 'direction', e.target.value)}>
                <option value="simpleip">En ma faveur (−)</option>
                <option value="client">En faveur du client (+)</option>
              </select>
              <input style={small} inputMode="decimal" value={d.qty} title="Quantité" onChange={e => setDed(i, 'qty', e.target.value)} />
              <input style={small} inputMode="decimal" value={d.unit_price} title="Prix unitaire" placeholder="Prix" onChange={e => setDed(i, 'unit_price', e.target.value)} />
              <span style={{ textAlign: 'right', fontSize: 13, color: d.direction === 'client' ? C.green : C.red }}>{signed(d) >= 0 ? '+' : '−'}{fmtMoney(Math.abs(signed(d)))}</span>
              <button type="button" className="btn-secondary" style={{ padding: '2px 6px' }} onClick={() => set('deductions', f.deductions.filter((_, j) => j !== i))}>×</button>
            </div>
            <input style={{ ...small, width: '100%', boxSizing: 'border-box', marginTop: 6 }} value={d.note} placeholder="Note : pourquoi cet ajustement" onChange={e => setDed(i, 'note', e.target.value)} />
          </div>
        ))}
        <button type="button" className="btn-secondary" style={{ fontSize: 12 }} onClick={() => set('deductions', [...f.deductions, { description: '', qty: '1', unit_price: '', direction: 'simpleip', note: '' }])}>+ Ajouter un ajustement</button>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, margin: '12px 0', fontSize: 14 }}>
          <span>Valeur {fmtMoney(num(f.received_value))} {adjTotal >= 0 ? '+' : '−'} ajustements {fmtMoney(Math.abs(adjTotal))} = crédit pour le service : <b style={{ color: credit < 0 ? C.red : C.green }}>{fmtMoney(credit)}</b></span>
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
const longDate = iso => iso ? toD(iso).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : EMPTY

function Gauge({ rb }) {
  const g = rb.projection.gauge
  const pct = g.credit_total > 0 ? Math.min(100, (g.consumed / g.credit_total) * 100) : 0
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 13, marginBottom: 8 }}>
        <b>Aujourd'hui, {longDate(g.today)}</b>
        <span style={{ color: C.muted }}>
          {g.state === 'a_venir' ? `L'échange commence le ${longDate(rb.projection.since)}`
            : g.state === 'termine' ? `Échange remboursé au complet le ${longDate(g.last_day)}`
            : `Jour ${g.day_index} sur ${g.total_days}`}
        </span>
      </div>
      {rb.paid_until && (
        <div style={{ fontSize: 13, background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '6px 10px', marginBottom: 10 }}>
          Période déjà payée : <b>du {longDate(rb.paid_from)} au {longDate(rb.paid_until)}</b> ({rb.last_invoice_number || 'dernière facture'}) — pas comptée dans l'échange
        </div>
      )}
      <div style={{ height: 12, background: '#E5E7EB', borderRadius: 6, overflow: 'hidden' }}>
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
    <div style={{ ...box, background: '#F0FDF4', borderColor: '#BBF7D0' }}>
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
        <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13 }}>
          <div>Il recommence à payer le <b style={{ fontSize: 15 }}>{longDate(p.resume_on)}</b> — son cycle repart de cette date, {FREQ_LABEL[rb.frequency] || rb.frequency}.</div>
          <div style={{ marginTop: 4 }}>Prochaines factures : {p.next_invoices.map(longDate).join(' · ')} ({fmtMoney(rb.cycle_amount)} hors taxes + taxes chacune, au prix actuel)</div>
        </div>
      )}

      {children}
    </div>
  )
}

function MonthsBox({ rb }) {
  const p = rb.projection
  const th = { textAlign: 'left', padding: '6px 8px', fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${C.border}` }
  const td = { padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 13 }
  const full = p.months.filter(m => !m.days).length
  const part = p.months.find(m => m.days)
  return (
    <div style={box}>
      <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 8, border: `1px solid ${C.border}` }}>
        <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>Mois de service</th><th style={th}>Durée</th><th style={{ ...th, textAlign: 'right' }}>Payé par l'échange</th><th style={th}>État</th>
          </tr></thead>
          <tbody>
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
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmtMoney(p.months.reduce((t, m) => t + m.amount, 0))}</td>
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

function ExchangeCard({ b, onEdit, onChanged }) {
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
          <div style={{ fontSize: 12, color: C.muted }}>Échange du {b.exchange_date}{b.recurring_name ? ` · paie « ${b.recurring_name} »` : ' · aucune facture périodique'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={onEdit}>Modifier</button>
          {!b.applications.length && <button className="btn-secondary" style={{ color: C.red }} onClick={remove}>Supprimer</button>}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 24 }}>
        <div>
          {row("Valeur de l'échange (hors taxes)", fmtMoney(b.received_value), { bold: true })}
          {b.deductions.length > 0 && row('Ajustements (voir ci-dessous)', `${b.adjustments_total >= 0 ? '+' : '−'}${fmtMoney(Math.abs(b.adjustments_total))}`, { color: C.muted })}
          <div style={{ borderTop: `1px solid ${C.border}`, margin: '4px 0' }} />
          {row('Crédit pour le service', fmtMoney(b.credit), { bold: true })}
          {row('Utilisé', fmtMoney(b.used))}
          {row('Restant', fmtMoney(b.remaining), { bold: true, color: b.remaining > 0 ? C.green : C.muted })}
          {b.notes && <div style={{ fontSize: 12, color: C.muted, marginTop: 8, whiteSpace: 'pre-wrap' }}>{b.notes}</div>}
          {b.deductions.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 4 }}>AJUSTEMENTS</div>
              {b.deductions.map(d => (
                <div key={d.id} style={{ fontSize: 13, background: '#F9FAFB', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 8px', marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span>{d.description}{d.qty !== 1 ? ` (${d.qty} × ${fmtMoney(d.unit_price)})` : ''}</span>
                    <b style={{ color: d.total >= 0 ? C.green : C.red, whiteSpace: 'nowrap' }}>{d.total >= 0 ? '+' : '−'}{fmtMoney(Math.abs(d.total))}</b>
                  </div>
                  <div style={{ fontSize: 11, color: C.muted }}>{d.direction === 'client' ? 'En faveur du client' : 'En faveur de Simple IP'}</div>
                  {d.note && <div style={{ fontSize: 12, marginTop: 2, whiteSpace: 'pre-wrap' }}>{d.note}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 4 }}>MOIS DÉJÀ COMPTÉS</div>
          {b.remaining <= 0 && b.applications.length > 0 && (
            <div style={{ fontSize: 13, color: C.green, fontWeight: 600, marginBottom: 4 }}>
              Remboursé au complet : service fourni du {longDate(b.applications[0].cycle_start)} au {longDate(b.applications[b.applications.length - 1].covered_until)}
            </div>
          )}
          {b.applications.length ? b.applications.map((a, i) => (
            <div key={i} style={{ fontSize: 13, marginBottom: 2 }}>{longDate(a.cycle_start)} → {longDate(a.covered_until)} : {fmtMoney(a.amount)}</div>
          )) : <div style={{ fontSize: 13, color: C.faint }}>Aucun encore — le premier mois se compte au premier jour pas encore facturé</div>}
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
          Ce que la compagnie donne en échange de nos services. Le crédit hors taxes paie ses mois de service à partir du premier jour pas encore facturé ; sa facturation repart quand le crédit est épuisé.
        </div>
        <button className="btn-primary" onClick={() => setEdit('new')}>+ Nouvel échange</button>
      </div>
      {/* Boite verte : suivi, puis la fiche de l'echange ; le tableau des mois en dessous */}
      {data.recurrences.filter(rb => rb.projection).map(rb => (
        <Fragment key={rb.id}>
          <Projection rb={rb}>
            {data.exchanges.filter(b => b.recurring_billing_id === rb.id).map(b => <ExchangeCard key={b.id} b={b} onEdit={() => setEdit(b)} onChanged={load} />)}
          </Projection>
          <MonthsBox rb={rb} />
        </Fragment>
      ))}
      {data.exchanges.filter(b => !data.recurrences.some(rb => rb.projection && rb.id === b.recurring_billing_id))
        .map(b => <ExchangeCard key={b.id} b={b} onEdit={() => setEdit(b)} onChanged={load} />)}
      {!data.exchanges.length && <div style={{ color: C.faint, fontSize: 13, padding: '20px 0' }}>Aucun échange.</div>}
      {edit && (
        <BarterModal companyId={companyId} initial={edit === 'new' ? null : edit} recurrences={data.recurrences.filter(r => r.is_active || r.id === edit?.recurring_billing_id)}
          onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await load() }} />
      )}
    </div>
  )
}
