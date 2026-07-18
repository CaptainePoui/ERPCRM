import { useState, useEffect } from 'react'
import api from '../services/api'
import Autocomplete from '../components/Autocomplete'

const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
function fmt(n) { return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(n) }

export default function Employees() {
  const [employees, setEmployees] = useState([])
  const [payments, setPayments] = useState([])
  const [contacts, setContacts] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [showPay, setShowPay] = useState(null) // employee contact_id
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
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>👷 Employés</h2>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Ajouter un employé</button>
      </div>

      {/* ── Liste employés ── */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, marginBottom: 24 }}>
        {employees.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF' }}>Aucun employé.</div>}
        {employees.map(e => (
          <div key={e.contact_id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', borderBottom: '1px solid #F3F4F6' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{e.first_name} {e.last_name}</div>
              {e.email && <div style={{ fontSize: 12, color: '#6B7280' }}>{e.email}</div>}
            </div>
            {e.hourly_rate && <div style={{ fontSize: 13, color: '#374151' }}>{fmt(e.hourly_rate)}/h</div>}
            {e.monthly_salary && <div style={{ fontSize: 13, color: '#374151' }}>{fmt(e.monthly_salary)}/mois</div>}
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setShowPay(e.contact_id)}>
              + Salaire
            </button>
          </div>
        ))}
      </div>

      {/* ── À payer ── */}
      {pending.length > 0 && (
        <div style={{ background: '#FEF9C3', border: '1px solid #FDE047', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#78350F', marginBottom: 14 }}>À PAYER ({pending.length})</h3>
          {pending.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #FDE04740' }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600 }}>{p.first_name} {p.last_name}</span>
                <span style={{ color: '#78350F', fontSize: 13, marginLeft: 10 }}>
                  {MONTHS[p.period_month - 1]} {p.period_year}
                </span>
              </div>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{fmt(p.amount)}</span>
              <input
                placeholder="No confirmation Interac"
                value={interacRef[p.id] || ''}
                onChange={e => setInteracRef(prev => ({ ...prev, [p.id]: e.target.value }))}
                style={{ fontSize: 12, padding: '5px 10px', border: '1px solid #D1D5DB', borderRadius: 6, width: 180 }}
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
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#6B7280', marginBottom: 14 }}>HISTORIQUE</h3>
          {paid.slice(0, 20).map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #F3F4F6', fontSize: 13 }}>
              <div style={{ flex: 1, color: '#374151' }}>
                <span style={{ fontWeight: 500 }}>{p.first_name} {p.last_name}</span>
                <span style={{ color: '#9CA3AF', marginLeft: 8 }}>{MONTHS[p.period_month - 1]} {p.period_year}</span>
              </div>
              <span style={{ fontWeight: 600 }}>{fmt(p.amount)}</span>
              {p.interac_confirmation && <span style={{ color: '#6B7280', fontSize: 11 }}>#{p.interac_confirmation}</span>}
              <span style={{ color: '#059669', fontWeight: 600, fontSize: 12 }}>✓ Payé</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal ajouter employé ── */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
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
        <div className="modal-overlay" onClick={() => setShowPay(null)}>
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
