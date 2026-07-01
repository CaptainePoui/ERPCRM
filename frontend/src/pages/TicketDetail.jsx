import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import './Tickets.css'

const PRIORITY_LABELS = {
  faible:   { label: 'Faible',    color: '#6B7280' },
  normal:   { label: 'Normal',    color: '#2563EB' },
  urgent:   { label: 'Urgent',    color: '#D97706' },
  critique: { label: 'Critique',  color: '#DC2626' },
}

const STATUS_LABELS = {
  ouvert:              { label: 'Ouvert',              color: '#184FA0' },
  en_cours:            { label: 'En cours',            color: '#059669' },
  en_attente:          { label: 'En attente',          color: '#D97706' },
  fermer_a_facturer:   { label: 'À facturer',          color: '#7C3AED' },
  facture:             { label: 'Facturé',             color: '#0891B2' },
  ferme:               { label: 'Fermé',               color: '#6B7280' },
  annule:              { label: 'Annulé',              color: '#9CA3AF' },
}

const STATUS_TRANSITIONS = {
  ouvert:            ['en_cours', 'en_attente', 'fermer_a_facturer', 'ferme', 'annule'],
  en_cours:          ['en_attente', 'fermer_a_facturer', 'ferme', 'annule'],
  en_attente:        ['en_cours', 'fermer_a_facturer', 'ferme', 'annule'],
  fermer_a_facturer: ['en_cours', 'ferme', 'annule'],
  facture:           ['ferme'],
  ferme:             ['ouvert'],
  annule:            [],
}

function fmtMins(min) {
  if (!min) return '0m'
  const h = Math.floor(min / 60), m = min % 60
  return h > 0 ? `${h}h${m > 0 ? m + 'm' : ''}` : `${m}m`
}

function fmtSecs(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60
  return h > 0
    ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`
}

export default function TicketDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [ticket, setTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [catalogue, setCatalogue] = useState([])
  const [showAddEntry, setShowAddEntry] = useState(false)
  const [sendingSum, setSendingSum] = useState(false)
  const [sumMsg, setSumMsg] = useState('')
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [catalogue, setCatalogue] = useState([])

  useEffect(() => {
    Promise.all([
      api.get(`/v1/tickets/${id}`),
      api.get('/v1/catalogue'),
    ]).then(([r, c]) => {
      setTicket(r.data)
      const services = c.data.filter(i => i.is_active && i.type === 'service')
      setCatalogue(services)
      setLoading(false)
    })
  }, [id])

  async function changeStatus(s) {
    const r = await api.put(`/v1/tickets/${id}`, { status: s })
    setTicket(r.data)
  }

  async function changePriority(p) {
    const r = await api.put(`/v1/tickets/${id}`, { priority: p })
    setTicket(r.data)
  }

  async function deleteEntry(eid) {
    const r = await api.delete(`/v1/tickets/${id}/entries/${eid}`)
    setTicket(r.data)
  }

  async function deleteTicket() {
    if (!confirm('Supprimer ce ticket ?')) return
    await api.delete(`/v1/tickets/${id}`)
    navigate('/tickets')
  }

  async function sendSummary(close) {
    setSendingSum(true)
    setSumMsg('')
    try {
      const r = await api.post(`/v1/tickets/${id}/send-summary`, { close })
      setTicket(r.data)
      setSumMsg(close ? 'Résumé envoyé et ticket fermé ✓' : 'Résumé envoyé ✓')
    } catch (e) {
      setSumMsg(e.response?.data?.detail || 'Erreur envoi courriel')
    } finally {
      setSendingSum(false)
      setTimeout(() => setSumMsg(''), 4000)
    }
  }

  if (loading) return <div className="page"><div className="loading">Chargement...</div></div>
  if (!ticket) return null

  const p = PRIORITY_LABELS[ticket.priority] || PRIORITY_LABELS.normal
  const s = STATUS_LABELS[ticket.status] || STATUS_LABELS.ouvert
  const transitions = STATUS_TRANSITIONS[ticket.status] || []
  const closed = ['ferme', 'annule', 'facture'].includes(ticket.status)
  const canInvoice = ticket.status === 'fermer_a_facturer' && !ticket.invoice_id
  const hasContactEmail = !!ticket.contact_email

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-secondary" onClick={() => navigate('/tickets')} style={{ padding: '6px 12px' }}>← Retour</button>
          <div>
            <h1 className="page-title" style={{ marginBottom: 2 }}>{ticket.title}</h1>
            <p className="page-sub">{ticket.company_name}{ticket.contact_name ? ` · ${ticket.contact_name}` : ''}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="tkt-badge" style={{ background: p.color }}>{p.label}</span>
          <span className="tkt-badge" style={{ background: s.color }}>{s.label}</span>
          {transitions.map(t => (
            <button key={t} className="btn-secondary" onClick={() => changeStatus(t)} style={{ fontSize: 12 }}>
              → {STATUS_LABELS[t]?.label}
            </button>
          ))}
          {canInvoice && (
            <button className="btn-primary" onClick={() => setShowInvoiceModal(true)} style={{ fontSize: 12, background: '#7C3AED' }}>
              🧾 Créer facture
            </button>
          )}
          {!closed && <button className="btn-danger" onClick={deleteTicket}>Supprimer</button>}
        </div>
      </div>

      <div className="tkt-detail-grid">
        <div className="tkt-section">
          <div className="tkt-section-title">Informations</div>
          <div className="tkt-info-row"><span>Compagnie</span><strong>{ticket.company_name}</strong></div>
          {ticket.contact_name && (
            <div className="tkt-info-row">
              <span>Contact</span>
              <strong>
                {ticket.contact_name}
                {ticket.contact_email && <span style={{ color: '#6B7280', fontWeight: 400, fontSize: 12, marginLeft: 6 }}>{ticket.contact_email}</span>}
              </strong>
            </div>
          )}
          <div className="tkt-info-row"><span>Assigné</span><strong>{ticket.assigned_name || '—'}</strong></div>
          <div className="tkt-info-row">
            <span>Priorité</span>
            <select className="tkt-select-inline" value={ticket.priority} onChange={e => changePriority(e.target.value)}>
              <option value="faible">Faible</option>
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
              <option value="critique">Critique</option>
            </select>
          </div>
          <div className="tkt-info-row">
            <span>Créé le</span>
            <strong>{new Date(ticket.created_at).toLocaleDateString('fr-CA')}</strong>
          </div>
          {ticket.closed_at && (
            <div className="tkt-info-row">
              <span>Fermé le</span>
              <strong>{new Date(ticket.closed_at).toLocaleDateString('fr-CA')}</strong>
            </div>
          )}
          <div className="tkt-info-row"><span>Temps total</span><strong>{fmtMins(ticket.total_minutes)}</strong></div>
          {ticket.invoice_id && (
            <div className="tkt-info-row">
              <span>Facture liée</span>
              <a href={`/invoices/${ticket.invoice_id}`} style={{ color: '#0891B2', fontWeight: 600, fontSize: 13 }}>Voir la facture →</a>
            </div>
          )}

          {hasContactEmail && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #E5E7EB' }}>
              {sumMsg && (
                <div style={{ marginBottom: 8, fontSize: 13, color: sumMsg.includes('✓') ? '#059669' : '#DC2626' }}>{sumMsg}</div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn-secondary"
                  onClick={() => sendSummary(false)}
                  disabled={sendingSum}
                  style={{ fontSize: 12 }}
                >
                  📧 Envoyer résumé
                </button>
                {!closed && (
                  <button
                    className="btn-primary"
                    onClick={() => sendSummary(true)}
                    disabled={sendingSum}
                    style={{ fontSize: 12, background: '#059669' }}
                  >
                    ✅ Envoyer résumé + Fermer ticket
                  </button>
                )}
              </div>
            </div>
          )}
          {!hasContactEmail && ticket.contact_name && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#9CA3AF' }}>Contact sans courriel — notifications désactivées</div>
          )}
        </div>

        <div className="tkt-section">
          <div className="tkt-section-title">Description</div>
          {ticket.description
            ? <p className="tkt-desc">{ticket.description}</p>
            : <span style={{ color: '#9CA3AF', fontSize: 13 }}>Aucune description</span>}
        </div>
      </div>

      <div className="tkt-entries-section">
        <div className="tkt-section-title" style={{ marginBottom: 12 }}>
          Saisies de temps
          {!closed && <button className="btn-primary" style={{ marginLeft: 12, padding: '5px 12px', fontSize: 12 }} onClick={() => setShowAddEntry(true)}>+ Ajouter</button>}
        </div>
        <table className="tkt-entries-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Technicien</th>
              <th>Service</th>
              <th style={{ textAlign: 'right' }}>Durée</th>
              <th style={{ width: 80 }}>Facturable</th>
              {!closed && <th style={{ width: 40 }}></th>}
            </tr>
          </thead>
          <tbody>
            {ticket.entries.map(e => (
              <tr key={e.id}>
                <td>{new Date(e.worked_at + 'T00:00:00').toLocaleDateString('fr-CA')}</td>
                <td>{e.description}</td>
                <td style={{ color: '#6B7280' }}>{e.user_name || '—'}</td>
                <td style={{ color: '#6B7280', fontSize: 12 }}>{catalogue.find(c => c.id === e.catalogue_item_id)?.name || '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMins(e.duration_minutes)}</td>
                <td>{e.is_billable ? <span className="tkt-billable">Fact.</span> : '—'}</td>
                {!closed && <td><button className="inv-del-btn" onClick={() => deleteEntry(e.id)}>✕</button></td>}
              </tr>
            ))}
            {ticket.entries.length === 0 && (
              <tr><td colSpan={closed ? 6 : 7} style={{ textAlign: 'center', color: '#9CA3AF', padding: 16 }}>Aucune saisie</td></tr>
            )}
          </tbody>
        </table>
        {ticket.entries.length > 0 && (
          <div className="tkt-time-total">
            <span>Total : {fmtMins(ticket.total_minutes)}</span>
            <span style={{ color: '#059669' }}>Facturable : {fmtMins(ticket.entries.filter(e => e.is_billable).reduce((s, e) => s + e.duration_minutes, 0))}</span>
          </div>
        )}
      </div>

      {showAddEntry && (
        <AddEntryModal
          catalogue={catalogue}
          onClose={() => setShowAddEntry(false)}
          onSave={async (data) => {
            const r = await api.post(`/v1/tickets/${id}/entries`, data)
            setTicket(r.data)
            setShowAddEntry(false)
          }}
        />
      )}

      {showInvoiceModal && (
        <InvoiceModal
          ticket={ticket}
          catalogue={catalogue}
          onClose={() => setShowInvoiceModal(false)}
          onCreated={(data) => {
            setTicket(data.ticket)
            setShowInvoiceModal(false)
          }}
        />
      )}
    </div>
  )
}

function AddEntryModal({ catalogue, onClose, onSave }) {
  const [form, setForm] = useState({ description: '', duration_minutes: 0, is_billable: false, catalogue_item_id: '' })
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef(null)
  const startRef = useRef(null)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const startTimer = useCallback(() => {
    startRef.current = Date.now() - elapsed * 1000
    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - startRef.current) / 1000)
      setElapsed(secs)
    }, 1000)
    setRunning(true)
  }, [elapsed])

  const stopTimer = useCallback(() => {
    clearInterval(timerRef.current)
    setRunning(false)
    const mins = Math.max(1, Math.ceil(elapsed / 60))
    setForm(p => ({ ...p, duration_minutes: mins }))
  }, [elapsed])

  const resetTimer = () => {
    clearInterval(timerRef.current)
    setRunning(false)
    setElapsed(0)
    setForm(p => ({ ...p, duration_minutes: 0 }))
  }

  useEffect(() => () => clearInterval(timerRef.current), [])

  async function save() {
    if (!form.description.trim()) return
    if (running) stopTimer()
    const mins = form.duration_minutes || Math.max(1, Math.ceil(elapsed / 60))
    if (!mins) return
    setSaving(true)
    try {
      await onSave({ ...form, catalogue_item_id: form.catalogue_item_id || null, duration_minutes: parseInt(mins) })
    } finally { setSaving(false) }
  }

  const h = Math.floor(form.duration_minutes / 60), m = form.duration_minutes % 60

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Saisie de temps</h3>

        {/* Chrono */}
        <div className="tkt-chrono">
          <div className="tkt-chrono-display" style={{ color: running ? '#059669' : elapsed > 0 ? '#D97706' : '#374151' }}>
            {fmtSecs(elapsed)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!running
              ? <button type="button" className="btn-primary" style={{ fontSize: 12, padding: '4px 14px' }} onClick={startTimer}>▶ Démarrer</button>
              : <button type="button" className="btn-secondary" style={{ fontSize: 12, padding: '4px 14px', color: '#D97706', borderColor: '#D97706' }} onClick={stopTimer}>⏹ Arrêter</button>
            }
            {elapsed > 0 && !running && (
              <button type="button" className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={resetTimer}>↺ Reset</button>
            )}
          </div>
          {elapsed > 0 && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{Math.max(1, Math.ceil(elapsed / 60))} minute{Math.ceil(elapsed/60) > 1 ? 's' : ''} arrondi</div>}
        </div>

        <div className="form-group">
          <label>Durée (minutes) — {h > 0 ? `${h}h ` : ''}{m > 0 ? `${m}m` : form.duration_minutes === 0 ? '0m' : ''}</label>
          <input type="number" min={1} value={form.duration_minutes} onChange={e => f('duration_minutes', parseInt(e.target.value) || 0)} placeholder="Ex: 30" />
        </div>

        <div className="form-group">
          <label>Description *</label>
          <textarea rows={3} value={form.description} onChange={e => f('description', e.target.value)} autoFocus placeholder="Ex: Remplacement routeur, configuration VPN..." />
        </div>
        {catalogue.length > 0 && (
          <div className="form-group">
            <label>Service associé</label>
            <select value={form.catalogue_item_id} onChange={e => f('catalogue_item_id', e.target.value)}>
              <option value="">-- Aucun --</option>
              {catalogue.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div style={{ marginTop: 4 }}>
          <label className="tax-check" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.is_billable} onChange={e => f('is_billable', e.target.checked)} />
            <span>Facturable</span>
          </label>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving || !form.description.trim() || (form.duration_minutes < 1 && elapsed < 1)}>
            {saving ? '...' : 'Ajouter'}
          </button>
        </div>
      </div>
    </div>
  )
}

function InvoiceModal({ ticket, catalogue, onClose, onCreated }) {
  const [catItemId, setCatItemId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const totalMins = ticket.entries.reduce((s, e) => s + e.duration_minutes, 0)
  const billableMins = ticket.entries.filter(e => e.is_billable).reduce((s, e) => s + e.duration_minutes, 0)
  const workMins = billableMins > 0 ? billableMins : totalMins
  const rounded = Math.ceil(workMins / 15) * 15
  const hours = rounded / 60
  const labour = Math.round(hours * 145 * 100) / 100

  async function submit() {
    setSaving(true)
    setError('')
    try {
      const r = await api.post(`/v1/tickets/${ticket.id}/create-invoice`, {
        catalogue_item_id: catItemId || null,
      })
      onCreated(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Erreur')
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Créer une facture</h3>
        {error && <div style={{ color: '#DC2626', marginBottom: 12, fontSize: 13 }}>{error}</div>}

        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#166534', marginBottom: 4 }}>Résumé du temps</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {workMins > 0
              ? `${Math.floor(rounded / 60)}h${String(rounded % 60).padStart(2,'0')}min arrondi → ${labour.toFixed(2)} $ (à 145$/h)`
              : 'Aucun temps saisi — ligne main d\'œuvre omise'}
          </div>
          {billableMins > 0 && billableMins !== totalMins && (
            <div style={{ fontSize: 12, color: '#166534', marginTop: 2 }}>Uniquement le temps facturable ({Math.floor(billableMins/60)}h{billableMins%60}min)</div>
          )}
        </div>

        <div className="form-group">
          <label>Service à inclure (optionnel)</label>
          <select value={catItemId} onChange={e => setCatItemId(e.target.value)}>
            <option value="">-- Aucun --</option>
            {catalogue.map(c => <option key={c.id} value={c.id}>{c.name} — {c.price ? `${c.price} $` : 'gratuit'}</option>)}
          </select>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={submit} disabled={saving} style={{ background: '#7C3AED' }}>
            {saving ? '...' : '🧾 Créer la facture'}
          </button>
        </div>
      </div>
    </div>
  )
}
