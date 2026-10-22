import { useState, useEffect } from 'react'
import api from '../services/api'
import Autocomplete from '../components/Autocomplete'
import SignatureEditor from '../components/SignatureEditor'
import SalesRepsPanel from '../components/SalesRepsPanel'
import { useSearchParams } from 'react-router-dom'
import { askConfirm } from '../components/Dialog'

const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
function fmt(n) { return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(n) }

// Deux onglets (TASK-007.2, 2026-10-22) : Employes, et Vendeurs (chacun son module de commission)
export default function Employees() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'vendeurs' ? 'vendeurs' : 'employes'
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>👷 Employés</h2>
        <div className="filter-tabs" style={{ marginBottom: 0 }}>
          <button className={`filter-tab${tab === 'employes' ? ' active' : ''}`} onClick={() => setParams({}, { replace: true })}>Employés</button>
          <button className={`filter-tab${tab === 'vendeurs' ? ' active' : ''}`} onClick={() => setParams({ tab: 'vendeurs' }, { replace: true })}>Vendeurs</button>
        </div>
      </div>
      {tab === 'employes' ? <EmployeesTab /> : <SalesRepsPanel />}
    </div>
  )
}

function EmployeesTab() {
  const [employees, setEmployees] = useState([])
  const [payments, setPayments] = useState([])
  const [contacts, setContacts] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [showPay, setShowPay] = useState(null) // employee contact_id
  const [signatureOf, setSignatureOf] = useState(null) // employe dont on modifie la signature (TASK-007.1)
  const [payForm, setPayForm] = useState({ amount: '', period_year: new Date().getFullYear(), period_month: new Date().getMonth() + 1, notes: '' })
  const [markingPaid, setMarkingPaid] = useState(null) // payment id
  const [interacRef, setInteracRef] = useState({})
  const today = new Date()

  useEffect(() => { load() }, [])

  async function load() {
    const [e, p, c] = await Promise.all([
      api.get('/v1/employees'),
      api.get('/v1/employees/payments'),
      api.get('/v1/contacts'),
    ])
    setEmployees(e.data)
    setPayments(p.data)
    setContacts(c.data)
  }

  const contactItems = contacts
    .filter(c => !employees.find(e => e.contact_id === c.id))
    .map(c => ({ id: c.id, label: `${c.first_name} ${c.last_name}`.trim(), sub: c.email || '' }))

  async function addEmployee(contact) {
    if (!contact) return
    await api.post('/v1/employees', { contact_id: contact.id })
    setShowAdd(false)
    load()
  }

  async function markPaid(payment) {
    setMarkingPaid(payment.id)
    try {
      await api.post(`/v1/employees/payments/${payment.id}/pay`, {
        interac_confirmation: interacRef[payment.id] || null
      })
      load()
    } finally { setMarkingPaid(null) }
  }

  async function createPayment() {
    if (!showPay || !payForm.amount) return
    await api.post('/v1/employees/payments', {
      employee_id: showPay,
      period_year: payForm.period_year,
      period_month: payForm.period_month,
      amount: parseFloat(payForm.amount),
      notes: payForm.notes || null,
    })
    setShowPay(null)
    setPayForm({ amount: '', period_year: today.getFullYear(), period_month: today.getMonth() + 1, notes: '' })
    load()
  }

  const pending = payments.filter(p => p.status === 'a_payer')
  const paid = payments.filter(p => p.status === 'paye')

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Ajouter un employé</button>
      </div>

      {/* ── Liste employés ── */}
      <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, marginBottom: 24 }}>
        {employees.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--c-faint)' }}>Aucun employé.</div>}
        {employees.map(e => (
          <div key={e.contact_id} style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '14px 20px', borderBottom: '1px solid var(--c-surface-3)' }}>
            <div style={{ flex: '1 1 180px', minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{e.first_name} {e.last_name}</div>
              {e.email && <div style={{ fontSize: 12, color: 'var(--c-muted)' }}>{e.email}</div>}
            </div>
            {e.hourly_rate && <div style={{ fontSize: 13, color: 'var(--c-text-2)' }}>{fmt(e.hourly_rate)}/h</div>}
            {e.monthly_salary && <div style={{ fontSize: 13, color: 'var(--c-text-2)' }}>{fmt(e.monthly_salary)}/mois</div>}
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setSignatureOf(e)} title="Courriel professionnel (sa boîte dans Courriels), courriel personnel (paies) et signature">
              ✉ Courriels et signature{e.has_signature ? ' ✓' : ''}
            </button>
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setShowPay(e.contact_id)}>
              + Salaire
            </button>
          </div>
        ))}
      </div>

      {signatureOf && <SignatureModal employee={signatureOf} onClose={() => setSignatureOf(null)} onSaved={() => { setSignatureOf(null); load() }} />}

      {/* ── À payer ── */}
      {pending.length > 0 && (
        <div style={{ background: 'var(--c-tint-amber)', border: '1px solid #FDE047', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-on-amber)', marginBottom: 14 }}>À PAYER ({pending.length})</h3>
          {pending.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #FDE04740' }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600 }}>{p.first_name} {p.last_name}</span>
                <span style={{ color: 'var(--c-on-amber)', fontSize: 13, marginLeft: 10 }}>
                  {MONTHS[p.period_month - 1]} {p.period_year}
                </span>
              </div>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--c-text)' }}>{fmt(p.amount)}</span>
              <input
                placeholder="No confirmation Interac"
                value={interacRef[p.id] || ''}
                onChange={e => setInteracRef(prev => ({ ...prev, [p.id]: e.target.value }))}
                style={{ fontSize: 12, padding: '5px 10px', border: '1px solid var(--c-border-strong)', borderRadius: 6, width: 180 }}
              />
              <button className="btn-primary" style={{ fontSize: 12 }} disabled={markingPaid === p.id} onClick={() => markPaid(p)}>
                {markingPaid === p.id ? '...' : 'Marquer payé'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Historique ── */}
      {paid.length > 0 && (
        <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-muted)', marginBottom: 14 }}>HISTORIQUE</h3>
          {paid.slice(0, 20).map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--c-surface-3)', fontSize: 13 }}>
              <div style={{ flex: 1, color: 'var(--c-text-2)' }}>
                <span style={{ fontWeight: 500 }}>{p.first_name} {p.last_name}</span>
                <span style={{ color: 'var(--c-faint)', marginLeft: 8 }}>{MONTHS[p.period_month - 1]} {p.period_year}</span>
              </div>
              <span style={{ fontWeight: 600 }}>{fmt(p.amount)}</span>
              {p.interac_confirmation && <span style={{ color: 'var(--c-muted)', fontSize: 11 }}>#{p.interac_confirmation}</span>}
              <span style={{ color: '#059669', fontWeight: 600, fontSize: 12 }}>✓ Payé</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal ajouter employé ── */}
      {showAdd && (
        <div className="modal-overlay">
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Ajouter un employé</h3>
            <Autocomplete label="Contact" items={contactItems} value={null} onSelect={addEmployee} placeholder="Rechercher un contact..." autoFocus />
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowAdd(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal créer paiement salaire ── */}
      {showPay && (
        <div className="modal-overlay">
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Ajouter un salaire à payer</h3>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Année</label>
                <input type="number" value={payForm.period_year} onChange={e => setPayForm(p => ({ ...p, period_year: +e.target.value }))} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Mois</label>
                <select value={payForm.period_month} onChange={e => setPayForm(p => ({ ...p, period_month: +e.target.value }))}>
                  {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Montant ($) *</label>
              <input type="number" step="0.01" value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} autoFocus />
            </div>
            <div className="form-group">
              <label>Notes</label>
              <input value={payForm.notes} onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowPay(null)}>Annuler</button>
              <button className="btn-primary" onClick={createPayment} disabled={!payForm.amount}>Créer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Signature des courriels de communication d'un employe (TASK-007.1, 2026-10-08) : reliee a son compte de connexion,
// ajoutee aux courriels de tickets et de taches qu'il envoie -- jamais aux factures, devis ni avis de retard.
function SignatureModal({ employee, onClose, onSaved }) {
  const [users, setUsers] = useState([])
  const [userId, setUserId] = useState(employee.user_id || '')
  const [html, setHtml] = useState(null)
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [mail, setMail] = useState(null)         // courriels de l'employe (TASK-047.2)
  const [mailForm, setMailForm] = useState({ work_email: '', password: '', personal_email: '', sync_since: '' })
  const [testMsg, setTestMsg] = useState(null)
  useEffect(() => {
    api.get('/v1/employees/users').then(r => setUsers(r.data))
    api.get(`/v1/employees/${employee.contact_id}/signature`).then(r => setHtml(r.data.html))
    api.get(`/v1/employees/${employee.contact_id}/mail`).then(r => {
      setMail(r.data)
      setMailForm({ work_email: r.data.work_email || '', password: '', personal_email: r.data.personal_email || '', sync_since: r.data.sync_since || '' })
    })
  }, [employee.contact_id])

  async function testBox() {
    setTestMsg({ busy: true })
    try {
      const r = await api.post(`/v1/mailboxes/${mail.mailbox_id}/test`)
      setTestMsg({ ok: true, text: `Connexion réussie : ${r.data.inbox_count} courriel(s) dans la boîte, envoi OK` })
    } catch (e) { setTestMsg({ ok: false, text: e.response?.data?.detail || 'Connexion impossible' }) }
  }

  async function save() {
    setSaving(true); setError('')
    try {
      if ((employee.user_id || '') !== userId) await api.patch(`/v1/employees/${employee.contact_id}`, { user_id: userId || null })
      if (mail && (mailForm.work_email !== (mail.work_email || '') || mailForm.password || mailForm.personal_email !== (mail.personal_email || '')
          || mailForm.sync_since !== (mail.sync_since || ''))) {
        if (!mailForm.work_email && mail.work_email && !await askConfirm(`Retirer la boîte ${mail.work_email} d'ERPCRM ? Ses courriels copiés n'apparaîtront plus dans Courriels (rien n'est effacé dans la boîte elle-même).`)) { setSaving(false); return }
        await api.put(`/v1/employees/${employee.contact_id}/mail`, { work_email: mailForm.work_email || null, password: mailForm.password || null,
          personal_email: mailForm.personal_email || null, sync_since: mailForm.sync_since || null })
      }
      await api.put(`/v1/employees/${employee.contact_id}/signature`, { html })
      onSaved()
    } catch (e) { setError(e.response?.data?.detail || 'Erreur : non enregistré'); setSaving(false) }
  }

  const previewDoc = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:16px;font-family:Arial,sans-serif;font-size:14px;color:#333}p{margin:0}img{max-width:100%}a{color:#1D4ED8}hr{border:none;border-top:1px solid #D1D5DB;margin:8px 0}</style></head><body>${(html || '').replace(/<p([^>]*)><\/p>/g, '<p$1><br></p>')}</body></html>`
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 820, width: '100%' }}>
        <h3 className="modal-title">Courriels et signature — {employee.first_name} {employee.last_name}</h3>
        <p style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 0 }}>
          La signature est ajoutée au bas des courriels de communication (tickets, tâches) envoyés par son compte de connexion. Jamais sur les factures, devis ou avis de retard.
          Vous pouvez coller votre signature actuelle (Outlook, Gmail) : la mise en forme est gardée.
        </p>
        <div className="form-group">
          <label>Compte de connexion de cet employé</label>
          <select value={userId} onChange={e => setUserId(e.target.value)} style={{ width: '100%' }}>
            <option value="">— Aucun (la signature ne sera pas utilisée) —</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
          </select>
        </div>
        {mail && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Courriel professionnel (connexion et sa boîte)</label>
              <input style={{ width: '100%', boxSizing: 'border-box' }} value={mailForm.work_email} placeholder="prenom@simpleip.tel"
                onChange={e => setMailForm({ ...mailForm, work_email: e.target.value })} />
              {mailForm.work_email && (
                <input style={{ width: '100%', boxSizing: 'border-box', marginTop: 6 }} type="password" autoComplete="new-password" value={mailForm.password}
                  placeholder={mail.has_password && mailForm.work_email === mail.work_email ? '•••••••• (enregistré, chiffré — vide = le garder)' : 'Mot de passe de la boîte (pour la voir dans Courriels)'}
                  onChange={e => setMailForm({ ...mailForm, password: e.target.value })} />
              )}
              <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 4 }}>
                Sert à se connecter à ERPCRM ; sa boîte apparaît dans Courriels, visible seulement par lui et le patron.
                {mail.mailbox_id && <> {' '}<button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '1px 8px' }} onClick={testBox} disabled={testMsg?.busy}>{testMsg?.busy ? '…' : 'Tester'}</button></>}
              </div>
              {mail.sync_error && <div style={{ fontSize: 12, color: '#DC2626' }}>Copie impossible : {mail.sync_error}</div>}
              {testMsg?.text && <div style={{ fontSize: 12, color: testMsg.ok ? '#059669' : '#DC2626' }}>{testMsg.text}</div>}
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Courriel personnel</label>
              <input style={{ width: '100%', boxSizing: 'border-box' }} value={mailForm.personal_email} placeholder="adresse personnelle"
                onChange={e => setMailForm({ ...mailForm, personal_email: e.target.value })} />
              <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 4 }}>Sert seulement à lui envoyer ses paies ou à lui écrire.</div>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button type="button" className={preview ? 'btn-secondary' : 'btn-primary'} style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => setPreview(false)}>Modifier</button>
          <button type="button" className={preview ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => setPreview(true)}>Aperçu</button>
        </div>
        {html === null ? <div style={{ padding: 20, color: 'var(--c-faint)' }}>Chargement…</div>
          : preview ? <iframe title="Aperçu de la signature" sandbox="" srcDoc={previewDoc} style={{ width: '100%', height: 300, border: '1px solid var(--c-border-strong)', borderRadius: 8, background: 'var(--c-surface)' }} />
          : <SignatureEditor value={html} onChange={setHtml} />}
        {error && <div style={{ color: '#DC2626', fontSize: 13, marginTop: 8 }}>{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving || html === null}>{saving ? '…' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}
