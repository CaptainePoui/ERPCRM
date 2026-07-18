import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import NewTaskModal from '../components/NewTaskModal'
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
  if (min < 0) return `-${fmtMins(-min)}`
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
  const [sendingSum, setSendingSum] = useState(false)
  const [sumMsg, setSumMsg] = useState('')
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [taskRefreshKey, setTaskRefreshKey] = useState(0)

  // ── Timer permanent ──
  const timerIntervalRef = useRef(null)
  const timerStartRef = useRef(Date.now())
  const timerBaseRef = useRef(0)
  const lastNoteSecsRef = useRef(0)   // valeur du chrono au moment de la dernière note enregistrée
  const [timerSecs, setTimerSecs] = useState(0)
  const [timerRunning, setTimerRunning] = useState(true)

  // ── Note inline ──
  const [noteDesc, setNoteDesc] = useState('')
  const [noteBillable, setNoteBillable] = useState(false)
  const [noteCatItem, setNoteCatItem] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  // ── Donner du temps ──
  const [showDonner, setShowDonner] = useState(false)

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

  // Timer — démarre automatiquement, utilise Date.now() pour précision même en arrière-plan
  useEffect(() => {
    if (!timerRunning) {
      clearInterval(timerIntervalRef.current)
      return
    }
    timerIntervalRef.current = setInterval(() => {
      setTimerSecs(timerBaseRef.current + Math.floor((Date.now() - timerStartRef.current) / 1000))
    }, 1000)
    return () => clearInterval(timerIntervalRef.current)
  }, [timerRunning])

  // Recalcul immédiat quand la page redevient visible (après arrière-plan)
  useEffect(() => {
    const onVisible = () => {
      if (timerRunning) {
        setTimerSecs(timerBaseRef.current + Math.floor((Date.now() - timerStartRef.current) / 1000))
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [timerRunning])

  function pauseTimer() {
    timerBaseRef.current = timerSecs
    setTimerRunning(false)
  }

  function resumeTimer() {
    timerStartRef.current = Date.now()
    setTimerRunning(true)
  }

  // Un clic n'importe où sur la page relance le chrono s'il est en pause
  // (sauf sur le bouton Pause/Reprendre, qui gère déjà son propre clic)
  useEffect(() => {
    function onAnyClick(e) {
      if (!timerRunning && !e.target.closest('[data-timer-btn]')) {
        resumeTimer()
      }
    }
    document.addEventListener('click', onAnyClick)
    return () => document.removeEventListener('click', onAnyClick)
  }, [timerRunning])

  async function saveNote() {
    const deltaSecs = timerSecs - lastNoteSecsRef.current
    if (!noteDesc.trim() || deltaSecs < 1) return
    const mins = Math.max(1, Math.ceil(deltaSecs / 60))
    lastNoteSecsRef.current = timerSecs   // chrono continue, on avance juste le marqueur
    setSavingNote(true)
    try {
      const r = await api.post(`/v1/tickets/${id}/entries`, {
        description: noteDesc,
        duration_minutes: mins,
        is_billable: noteBillable,
        catalogue_item_id: noteCatItem || null,
      })
      setTicket(r.data)
      setNoteDesc('')
      setNoteBillable(false)
      setNoteCatItem('')
    } finally { setSavingNote(false) }
  }

  async function donnerTemps(mins) {
    const r = await api.post(`/v1/tickets/${id}/entries`, {
      description: `Temps offert (${mins} min)`,
      duration_minutes: -mins,
      is_billable: true,
      catalogue_item_id: null,
    })
    setTicket(r.data)
  }

  async function changeStatus(s) {
    const r = await api.put(`/v1/tickets/${id}`, { status: s })
    setTicket(r.data)
  }

  async function changePriority(p) {
    const r = await api.put(`/v1/tickets/${id}`, { priority: p })
    setTicket(r.data)
  }

  async function toggleBillable(v) {
    const r = await api.put(`/v1/tickets/${id}`, { is_billable: v })
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
  const deltaSecs = timerSecs - lastNoteSecsRef.current
  const deltaMins = Math.ceil(deltaSecs / 60)
  const totalSecs = Math.max(0, ticket.total_minutes * 60 + timerSecs)

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
          <button className="btn-secondary" onClick={() => setShowTaskModal(true)} style={{ fontSize: 12 }}>+ Tâche</button>
          {!closed && <button className="btn-danger" onClick={deleteTicket}>Supprimer</button>}
        </div>
      </div>

      {/* ── Barre de timer permanente ── */}
      {!closed && (
        <div style={{ background: '#1E293B', color: '#fff', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, letterSpacing: 2, color: timerRunning ? '#4ADE80' : '#FCA5A5', minWidth: 80 }}>
            {fmtSecs(totalSecs)}
          </span>
          {timerRunning
            ? <button data-timer-btn onClick={pauseTimer} style={{ fontSize: 12, padding: '4px 14px', background: 'transparent', border: '1px solid #94A3B8', borderRadius: 6, color: '#94A3B8', cursor: 'pointer' }}>⏸ Pause</button>
            : <button data-timer-btn onClick={resumeTimer} style={{ fontSize: 12, padding: '4px 14px', background: 'transparent', border: '1px solid #4ADE80', borderRadius: 6, color: '#4ADE80', cursor: 'pointer' }}>▶ Reprendre</button>
          }
          <span style={{ fontSize: 12, color: '#64748B' }}>Temps total du ticket — inclut toutes les saisies</span>
          <button onClick={() => setShowDonner(true)} style={{ marginLeft: 'auto', fontSize: 12, padding: '5px 14px', background: '#059669', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
            🎁 Donner du temps
          </button>
        </div>
      )}

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
          {!closed && (
            <div className="tkt-info-row">
              <span>Temps réponse</span>
              <strong style={{ fontFamily: 'monospace' }}>{fmtSecs(deltaSecs)}</strong>
            </div>
          )}
          <div className="tkt-info-row">
            <span>Facturable</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={ticket.is_billable} onChange={e => toggleBillable(e.target.checked)} style={{ accentColor: '#184FA0' }} />
            </label>
          </div>
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

      <TicketTachesSection ticketId={id} onNewTask={() => setShowTaskModal(true)} refreshKey={taskRefreshKey} />

      {/* ── Note de travail inline (remplace le modal AddEntry) ── */}
      {!closed && (
          <div className="tkt-entries-section" style={{ marginTop: 0 }}>
            <div className="tkt-section-title" style={{ marginBottom: 10 }}>
              Note de travail
            </div>
            <textarea
              rows={3}
              value={noteDesc}
              onChange={e => {
                setNoteDesc(e.target.value)
                if (!timerRunning && e.target.value.trim()) resumeTimer()
              }}
              placeholder="Décrivez ce que vous avez fait… (le chrono reprend automatiquement si vous commencez à taper)"
              style={{ width: '100%', borderRadius: 8, border: '1px solid #D1D5DB', padding: '10px 12px', fontSize: 13, color: '#374151', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5 }}
            />
            <div style={{ display: 'flex', gap: 12, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {catalogue.length > 0 && (
                <select value={noteCatItem} onChange={e => setNoteCatItem(e.target.value)} style={{ fontSize: 13, padding: '6px 10px', border: '1px solid #D1D5DB', borderRadius: 6, minWidth: 160 }}>
                  <option value="">Service : Aucun</option>
                  {catalogue.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={noteBillable} onChange={e => setNoteBillable(e.target.checked)} style={{ accentColor: '#184FA0' }} />
                Facturable
              </label>
              <button
                className="btn-primary"
                onClick={saveNote}
                disabled={savingNote || !noteDesc.trim() || deltaSecs < 1}
                style={{ marginLeft: 'auto', fontSize: 13 }}
              >
                {savingNote ? '...' : deltaSecs >= 60 ? `Enregistrer (${deltaMins} min)` : 'Enregistrer (< 1 min)'}
              </button>
            </div>
          </div>
      )}

      <div className="tkt-entries-section">
        <div className="tkt-section-title" style={{ marginBottom: 12 }}>
          Saisies de temps
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
            <span style={{ color: ticket.is_billable ? '#059669' : '#9CA3AF' }}>
              {ticket.is_billable ? `Facturable : ${fmtMins(Math.max(0, ticket.total_minutes))}` : 'Ticket non facturable'}
            </span>
          </div>
        )}
      </div>

      {showDonner && (
        <DonnerDuTempsModal
          onClose={() => setShowDonner(false)}
          onSave={donnerTemps}
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
      {showTaskModal && (
        <NewTaskModal
          prefillTicket={{ id: ticket.id, label: ticket.title }}
          prefillCompany={ticket.company_id ? { id: ticket.company_id, label: ticket.company_name } : null}
          prefillContact={ticket.contact_id ? { id: ticket.contact_id, label: ticket.contact_name } : null}
          onClose={() => setShowTaskModal(false)}
          onCreated={() => { setShowTaskModal(false); setTaskRefreshKey(k => k + 1) }}
        />
      )}
    </div>
  )
}

function DonnerDuTempsModal({ onClose, onSave }) {
  const [minsInput, setMinsInput] = useState('')
  const [saving, setSaving] = useState(false)

  const mins = parseInt(minsInput) || 0
  const rounded = Math.floor(mins / 5) * 5

  async function submit() {
    if (rounded < 5) return
    setSaving(true)
    try {
      await onSave(rounded)
      onClose()
    } catch { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Donner du temps</h3>
        <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
          Le temps offert est arrondi au 5 min inférieur (avantage du tarif). Il crée un crédit négatif facturable sur le ticket.
        </p>
        <div className="form-group">
          <label>Minutes à offrir</label>
          <input
            type="number"
            min={1}
            value={minsInput}
            onChange={e => setMinsInput(e.target.value)}
            placeholder="Ex: 60"
            autoFocus
          />
        </div>
        {mins > 0 && (
          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 14, color: '#166534' }}>
            {rounded > 0
              ? <><strong>{rounded} min</strong> offertes (arrondi depuis {mins} min) → crédit de <strong>-{rounded} min</strong> sur le ticket</>
              : <span style={{ color: '#DC2626' }}>Minimum 5 minutes</span>
            }
          </div>
        )}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={saving || rounded < 5}
            style={{ background: '#059669' }}
          >
            {saving ? '...' : `Offrir ${rounded > 0 ? rounded : '?'} min`}
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
  const workMins = ticket.is_billable ? Math.max(0, totalMins) : 0
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
            {!ticket.is_billable
              ? 'Ticket non facturable — ligne main d\'œuvre omise'
              : workMins > 0
                ? `${Math.floor(rounded / 60)}h${String(rounded % 60).padStart(2,'0')}min arrondi → ${labour.toFixed(2)} $ (à 145$/h)`
                : 'Aucun temps saisi — ligne main d\'œuvre omise'}
          </div>
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

// ── Tâches liées au ticket ────────────────────────────────────────────────────
function TicketTachesSection({ ticketId, onNewTask, refreshKey }) {
  const [tasks, setTasks] = useState([])
  const [showCompleted, setShowCompleted] = useState(false)

  useEffect(() => {
    api.get(`/v1/tasks?ticket_id=${ticketId}`).then(r => setTasks(r.data))
  }, [ticketId, refreshKey])

  async function toggleComplete(task) {
    const r = task.completed
      ? await api.put(`/v1/tasks/${task.id}`, { completed: false, status: 'en_cours' })
      : await api.post(`/v1/tasks/${task.id}/complete`)
    setTasks(prev => prev.map(t => t.id === r.data.id ? r.data : t))
  }

  const filtered = tasks.filter(t => showCompleted || !t.completed)

  return (
    <div className="tkt-entries-section" style={{ marginTop: 0 }}>
      <div className="tkt-section-title" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        Tâches liées
        {tasks.length > 0 && (
          <label style={{ fontSize: 12, fontWeight: 400, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} style={{ accentColor: '#184FA0' }} />
            Voir complétées
          </label>
        )}
        <button className="btn-secondary" onClick={onNewTask} style={{ fontSize: 12, padding: '4px 10px', marginLeft: 'auto' }}>+ Tâche</button>
      </div>
      {filtered.length === 0 && (
        <div style={{ color: '#9CA3AF', fontSize: 13, padding: '8px 0' }}>Aucune tâche liée à ce ticket.</div>
      )}
      {filtered.map(t => {
        const overdue = t.due_date && !t.completed && new Date(t.due_date) < new Date(new Date().toDateString())
        return (
          <div key={t.id} style={{ display: 'flex', gap: 8, padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', marginBottom: 6, background: t.completed ? '#F9FAFB' : '#fff', alignItems: 'center' }}>
            <input type="checkbox" checked={t.completed} onChange={() => toggleComplete(t)} style={{ width: 14, height: 14, accentColor: '#184FA0', cursor: 'pointer', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: t.completed ? '#9CA3AF' : '#111827', textDecoration: t.completed ? 'line-through' : 'none' }}>{t.title}</span>
            {t.subtasks?.length > 0 && (
              <span style={{ fontSize: 11, color: '#9CA3AF' }}>{t.subtasks.filter(s => s.completed).length}/{t.subtasks.length}</span>
            )}
            {t.due_date && <span style={{ fontSize: 12, color: overdue ? '#DC2626' : '#9CA3AF' }}>{overdue ? '⚠ ' : ''}{new Date(t.due_date + 'T12:00:00').toLocaleDateString('fr-CA')}</span>}
            {t.assigned_name && <span style={{ fontSize: 12, color: '#6B7280' }}>· {t.assigned_name}</span>}
          </div>
        )
      })}
    </div>
  )
}
