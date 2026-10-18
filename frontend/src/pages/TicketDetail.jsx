import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import NewTaskModal from '../components/NewTaskModal'
import './Tickets.css'
import { parseDay } from '../utils/date'
import HistoryButton from '../components/HistoryButton'
import { askConfirm } from '../components/Dialog'
import { askNotificationPermission } from '../components/ticketReminder'
import { ZekoText, streamZeko, zekoReducer } from '../components/ZekoChat'

// TASK-006.5 étape 1 (2026-10-17) : le ticket = une conversation libre (texte + images, horodatée) et UN seul temps.
// Le chrono est tenu par le serveur (périodes) ; il démarre au bouton Démarrer ou au début de l'écriture, jamais à
// la simple ouverture ; un clic dessus corrige le temps (correction gardée : avant/après, qui, quand).
// Quitter la page n'arrête rien : les chronos actifs restent visibles en haut de l'écran (Layout).

const PRIORITY_LABELS = {
  faible:   { label: 'Faible',    color: '#6B7280' },
  normal:   { label: 'Normal',    color: 'var(--brand)' },
  urgent:   { label: 'Urgent',    color: '#D97706' },
  critique: { label: 'Critique',  color: '#DC2626' },
}

const STATUS_LABELS = {
  ouvert:              { label: 'Ouvert',                   color: 'var(--brand)' },
  en_cours:            { label: 'En cours',                 color: '#059669' },
  en_attente:          { label: 'En attente',                color: '#D97706' },
  en_attente_client:   { label: "En attente d'une réponse",  color: '#7C3AED' },
  facture:             { label: 'Facturé',                  color: '#0891B2' },
  ferme:               { label: 'Fermé',                    color: '#6B7280' },
}

const QUICK_TRANSITIONS = {
  ouvert:            ['en_cours'],
  en_attente_client: ['en_cours'],
}

export function fmtSecs(s) {
  s = Math.max(0, Math.floor(s))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

function fmtHM(s) {
  const neg = s < 0
  s = Math.abs(Math.round(s / 60))
  const h = Math.floor(s / 60), m = s % 60
  return `${neg ? '−' : ''}${h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`}`
}

function fmtWhen(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-CA') + ' ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })
}

// « 1:20 », « 1h20 », « 1 h 20 » = 1 h 20 min ; « 80 » = 80 minutes
function parseDuration(txt) {
  const t = (txt || '').trim().toLowerCase().replace(/\s+/g, '')
  if (!t) return null
  let m = t.match(/^(\d+)[:h](\d{0,2})(?::(\d{1,2}))?m?i?n?$/)
  if (m) return (parseInt(m[1]) * 3600) + (parseInt(m[2] || '0') * 60) + parseInt(m[3] || '0')
  m = t.match(/^(\d+)(m|min)?$/)
  if (m) return parseInt(m[1]) * 60
  return null
}

const isClosed = t => ['ferme', 'facture'].includes(t?.status)

const STOP_LABELS = { pause: 'pause', fermeture: 'fermeture du ticket', autre_ticket: 'pause au démarrage d’un autre ticket', attente_client: 'en attente du client', navigateur_ferme: 'aucun écran ouvert — pause à la dernière présence' }

export default function TicketDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [ticket, setTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [catalogue, setCatalogue] = useState([])
  const [sendingSum, setSendingSum] = useState(false)
  const [sumMsg, setSumMsg] = useState('')
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [taskRefreshKey, setTaskRefreshKey] = useState(0)
  const [editingContactEmail, setEditingContactEmail] = useState(false)
  const [contactEmailDraft, setContactEmailDraft] = useState('')
  const [savingContactEmail, setSavingContactEmail] = useState(false)
  const [showMissingEmailModal, setShowMissingEmailModal] = useState(false)
  const [showDonner, setShowDonner] = useState(false)
  const [showOpens, setShowOpens] = useState(false)
  const [opens, setOpens] = useState([])
  const [opensLoading, setOpensLoading] = useState(false)
  const [showTimeLog, setShowTimeLog] = useState(false)
  const [zekoLive, setZekoLive] = useState(null)      // réponse de Zéko en cours dans le fil
  const zekoAbortRef = useRef(null)

  // ── Chrono : valeur du serveur + secondes écoulées depuis la réponse (jamais l'heure de l'appareil) ──
  const fetchedAtRef = useRef(Date.now())
  const [tick, setTick] = useState(0)
  const [startAsk, setStartAsk] = useState(null)       // { others: [...] } — fenêtre « un autre ticket est actif »
  const [editTime, setEditTime] = useState(null)       // { value, reason } pendant la correction
  const typingStartDeclinedRef = useRef(false)         // « Annuler » au début de l'écriture : ne pas redemander à chaque touche
  const startingRef = useRef(false)

  // ── Message en cours ──
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState([])               // [{ file, url }]
  const [sending, setSending] = useState(false)
  const lastLocalEditRef = useRef(0)

  function applyTicket(t) {
    setTicket(prev => { if (prev && prev.my_running !== t.my_running) window.dispatchEvent(new Event('erpcrm-timers')); return t })
    fetchedAtRef.current = Date.now()
    setTick(x => x + 1)
    if (Date.now() - lastLocalEditRef.current > 5000) setDraft(t.draft_message || '')
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([api.get(`/v1/tickets/${id}`), api.get('/v1/catalogue')]).then(([r, c]) => {
      applyTicket(r.data)
      setCatalogue(c.data.filter(i => i.is_active && i.type === 'service'))
      setLoading(false)
    })
  }, [id])

  // Suit les changements faits ailleurs (autre appareil, réponse du client par courriel)
  useEffect(() => {
    const iv = setInterval(() => api.get(`/v1/tickets/${id}`).then(r => applyTicket(r.data)).catch(() => {}), 15000)
    return () => clearInterval(iv)
  }, [id])

  useEffect(() => {
    if (!ticket?.open_periods) return
    const iv = setInterval(() => setTick(x => x + 1), 1000)
    return () => clearInterval(iv)
  }, [ticket?.open_periods])

  // Brouillon gardé côté serveur (2 s après la dernière frappe)
  const draftSaveRef = useRef(null)
  function onDraftChange(v) {
    setDraft(v)
    lastLocalEditRef.current = Date.now()
    clearTimeout(draftSaveRef.current)
    draftSaveRef.current = setTimeout(() => api.put(`/v1/tickets/${id}`, { draft_message: v }).catch(() => {}), 2000)
    if (v.trim() && ticket && !ticket.my_running && !isClosed(ticket) && !startAsk && !typingStartDeclinedRef.current) startTimer(true)
  }

  // Démarrer : si d'autres chronos de ce technicien tournent, on demande (pause / laisser tourner / annuler)
  async function startTimer(fromTyping = false) {
    if (startingRef.current) return
    startingRef.current = true
    try {
      const others = (await api.get('/v1/tickets/timers/active')).data.filter(a => a.ticket_id !== id)
      if (others.length) { setStartAsk({ others, fromTyping }); return }
      applyTicket((await api.post(`/v1/tickets/${id}/timer/start`, { pause_others: false })).data)
    } finally { startingRef.current = false }
  }
  async function answerStart(choice) {
    const ask = startAsk
    setStartAsk(null)
    if (choice === 'cancel') { if (ask?.fromTyping) typingStartDeclinedRef.current = true; return }
    applyTicket((await api.post(`/v1/tickets/${id}/timer/start`, { pause_others: choice === 'pause' })).data)
  }
  async function pauseTimer() {
    applyTicket((await api.post(`/v1/tickets/${id}/timer/pause`)).data)
  }

  async function saveTime() {
    const secs = parseDuration(editTime.value)
    if (secs === null) return
    const r = await api.put(`/v1/tickets/${id}/time`, { seconds: secs, reason: editTime.reason })
    setEditTime(null)
    applyTicket(r.data)
    window.dispatchEvent(new Event('erpcrm-timers'))
  }

  // ── Images : coller, glisser ou choisir ──
  function addFiles(list) {
    const arr = Array.from(list || []).filter(f => f.size > 0)
    if (!arr.length) return
    setFiles(prev => [...prev, ...arr.map(f => ({ file: f, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null }))])
    if (ticket && !ticket.my_running && !isClosed(ticket) && !startAsk && !typingStartDeclinedRef.current) startTimer(true)
  }
  function onPaste(e) {
    const imgs = Array.from(e.clipboardData?.items || []).filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean)
    if (imgs.length) { e.preventDefault(); addFiles(imgs.map((f, i) => f.name && f.name !== 'image.png' ? f : new File([f], `capture-${Date.now()}-${i}.png`, { type: f.type || 'image/png' }))) }
  }
  function removeFile(i) {
    setFiles(prev => { const f = prev[i]; if (f?.url) URL.revokeObjectURL(f.url); return prev.filter((_, j) => j !== i) })
  }

  async function sendMessage() {
    if (sending || (!draft.trim() && !files.length)) return
    setSending(true)
    try {
      const fd = new FormData()
      fd.append('body', draft)
      files.forEach(f => fd.append('files', f.file))
      const r = await api.post(`/v1/tickets/${id}/messages`, fd)
      files.forEach(f => f.url && URL.revokeObjectURL(f.url))
      setFiles([])
      lastLocalEditRef.current = 0
      clearTimeout(draftSaveRef.current)
      typingStartDeclinedRef.current = false
      applyTicket(r.data)
      // Zéko répond quand on lui demande quelque chose : une question (« ? ») ou son nom dans le message
      if (/\?|z[ée]ko/i.test(draft)) askZeko()
    } catch (e) {
      setSumMsg(e.response?.data?.detail || 'Erreur à l’envoi du message')
      setTimeout(() => setSumMsg(''), 5000)
    } finally { setSending(false) }
  }

  async function askZeko() {
    const ctrl = new AbortController()
    zekoAbortRef.current = ctrl
    setZekoLive({ text: '', steps: [], thinking: true, error: null })
    try {
      await streamZeko(`/api/v1/zeko/tickets/${id}/reply`, null, ev => {
        if (ev.type === 'erreur') setZekoLive(l => ({ ...l, error: ev.texte }))
        else setZekoLive(l => zekoReducer(l, ev))
      }, ctrl.signal)
    } catch (e) {
      if (e.name !== 'AbortError') { setSumMsg(e.message || 'Zéko n’a pas pu répondre'); setTimeout(() => setSumMsg(''), 6000) }
    } finally {
      zekoAbortRef.current = null
      applyTicket((await api.get(`/v1/tickets/${id}`)).data)
      setZekoLive(l => (l?.error ? l : null))
    }
  }
  useEffect(() => () => zekoAbortRef.current?.abort(), [])

  async function updateMessage(mid, body) {
    applyTicket((await api.put(`/v1/tickets/${id}/messages/${mid}`, { body })).data)
  }
  async function deleteMessage(mid) {
    if (!await askConfirm('Supprimer ce message ?')) return
    applyTicket((await api.delete(`/v1/tickets/${id}/messages/${mid}`)).data)
  }
  async function deleteAttachment(aid) {
    if (!await askConfirm('Supprimer cette image ?')) return
    applyTicket((await api.delete(`/v1/tickets/attachments/${aid}`)).data)
  }
  async function splitToNewTicket(mid) {
    if (!await askConfirm("Déplacer cette réponse vers un nouveau ticket ? Ce ticket sera refermé.")) return
    applyTicket((await api.post(`/v1/tickets/${id}/messages/${mid}/split-to-new-ticket`)).data)
  }

  async function donnerTemps(mins) {
    applyTicket((await api.post(`/v1/tickets/${id}/time/offer`, { seconds: mins * 60 })).data)
  }
  async function cancelOffer(aid) {
    if (!await askConfirm('Retirer ce temps offert ?')) return
    applyTicket((await api.delete(`/v1/tickets/${id}/time/offer/${aid}`)).data)
  }

  async function update(fields) {
    applyTicket((await api.put(`/v1/tickets/${id}`, fields)).data)
  }

  async function deleteTicket() {
    if (!await askConfirm('Supprimer ce ticket ?')) return
    await api.delete(`/v1/tickets/${id}`)
    navigate('/tickets')
  }

  async function saveContactEmail() {
    if (!contactEmailDraft.trim()) return
    setSavingContactEmail(true)
    try {
      await api.patch(`/v1/companies/${ticket.company_id}/contacts/${ticket.contact_id}`, { email: contactEmailDraft.trim() })
      applyTicket((await api.get(`/v1/tickets/${id}`)).data)
      setEditingContactEmail(false)
    } finally { setSavingContactEmail(false) }
  }

  // « En attente d'une réponse » : envoie le résumé et met mon chrono en pause (fait par le serveur)
  async function waitForClientResponse() {
    if (!ticket.contact_email) { setContactEmailDraft(''); setShowMissingEmailModal(true); return }
    await sendWait()
  }
  async function sendWait() {
    setSendingSum(true); setSumMsg('')
    try {
      applyTicket((await api.post(`/v1/tickets/${id}/send-summary`, { wait_for_client: true })).data)
      setSumMsg("Résumé envoyé, en attente d'une réponse ✓")
    } catch (e) {
      setSumMsg(e.response?.data?.detail || 'Erreur envoi courriel')
    } finally { setSendingSum(false); setTimeout(() => setSumMsg(''), 4000) }
  }
  async function saveContactEmailAndSend() {
    if (!contactEmailDraft.trim()) return
    setSavingContactEmail(true)
    try {
      await api.patch(`/v1/companies/${ticket.company_id}/contacts/${ticket.contact_id}`, { email: contactEmailDraft.trim() })
      setShowMissingEmailModal(false)
      await sendWait()
    } finally { setSavingContactEmail(false) }
  }

  async function toggleOpens() {
    if (showOpens) { setShowOpens(false); return }
    setShowOpens(true); setOpensLoading(true)
    try { setOpens((await api.get(`/v1/track/ticket/${id}/opens`)).data) } finally { setOpensLoading(false) }
  }

  if (loading) return <div className="page"><div className="loading">Chargement...</div></div>
  if (!ticket) return null

  const p = PRIORITY_LABELS[ticket.priority] || PRIORITY_LABELS.normal
  const s = STATUS_LABELS[ticket.status] || STATUS_LABELS.ouvert
  const quickTransitions = QUICK_TRANSITIONS[ticket.status] || []
  const closed = isClosed(ticket)
  void tick
  const liveSecs = ticket.worked_seconds + ticket.open_periods * Math.floor((Date.now() - fetchedAtRef.current) / 1000)
  const othersRunning = ticket.open_periods - (ticket.my_running ? 1 : 0)
  const corrections = ticket.adjustments.filter(a => a.kind === 'correction')
  const offers = ticket.adjustments.filter(a => a.kind === 'offert')
  const btn = { fontSize: 13, padding: '6px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }

  return (
    <div className="page">
      <div className="tkt-sticky-header">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn-secondary" onClick={() => navigate('/tickets')} style={{ padding: '6px 12px' }}>← Retour</button>
            <div>
              <h1 className="page-title" style={{ marginBottom: 2 }}>{ticket.title}</h1>
              <p className="page-sub">{ticket.number} · {ticket.company_name}{ticket.contact_name ? ` · ${ticket.contact_name}` : ''}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="tkt-badge" style={{ background: p.color }}>{p.label}</span>
            <span className="tkt-badge" style={{ background: s.color }}>{s.label}</span>
            {!closed && quickTransitions.map(t => (
              <button key={t} className="btn-secondary" onClick={() => update({ status: t })} style={{ fontSize: 12 }}>→ {STATUS_LABELS[t]?.label}</button>
            ))}
            {!closed && <button className="btn-secondary" onClick={waitForClientResponse} disabled={sendingSum} style={{ fontSize: 12 }}>📧 En attente d'une réponse</button>}
            {closed
              ? <button className="btn-secondary" onClick={() => update({ status: 'ouvert' })} style={{ fontSize: 12 }}>↩ Ouvrir</button>
              : <button className="btn-primary" onClick={() => update({ status: 'ferme' })} style={{ fontSize: 12 }}>✓ Fermer</button>}
            <button className="btn-secondary" onClick={() => setShowTaskModal(true)} style={{ fontSize: 12 }}>+ Tâche</button>
            <HistoryButton objectType="tickets" objectId={id} title={ticket.title} compact />
            {!closed && <button className="btn-danger" onClick={deleteTicket}>Supprimer</button>}
          </div>
        </div>
        {sumMsg && <div style={{ padding: '0 0 8px', fontSize: 13, color: sumMsg.includes('✓') ? '#059669' : '#DC2626' }}>{sumMsg}</div>}

        {/* ── Le chrono du ticket : LE temps du ticket ── */}
        <div style={{ background: '#1E293B', color: '#fff', padding: '10px 20px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
          {editTime ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input autoFocus value={editTime.value} onChange={e => setEditTime(x => ({ ...x, value: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') saveTime(); if (e.key === 'Escape') setEditTime(null) }}
                placeholder="1:20 ou 80" style={{ width: 110, fontFamily: 'monospace', fontSize: 20, fontWeight: 700, padding: '2px 8px' }} />
              <input value={editTime.reason} onChange={e => setEditTime(x => ({ ...x, reason: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') saveTime(); if (e.key === 'Escape') setEditTime(null) }}
                placeholder="Raison (facultatif)" style={{ width: 240, fontSize: 13, padding: '5px 8px' }} />
              <button className="btn-primary" style={{ fontSize: 12 }} disabled={parseDuration(editTime.value) === null} onClick={saveTime}>OK</button>
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setEditTime(null)}>Annuler</button>
              {editTime.value && parseDuration(editTime.value) === null && <span style={{ fontSize: 12, color: '#FCA5A5' }}>Format : 1:20, 1h20 ou 80 (minutes)</span>}
            </div>
          ) : (
            <span title="Cliquer pour corriger le temps du ticket"
              onClick={() => setEditTime({ value: fmtSecs(liveSecs).replace(/:\d\d$/, ''), reason: '' })}
              style={{ fontFamily: 'monospace', fontSize: 26, fontWeight: 700, letterSpacing: 2, cursor: 'pointer', borderBottom: '1px dashed #64748B',
                       color: ticket.open_periods ? '#4ADE80' : '#CBD5E1' }}>
              {fmtSecs(liveSecs)}
            </span>
          )}
          {!editTime && !closed && (ticket.my_running
            ? <button onClick={pauseTimer} style={{ ...btn, background: 'transparent', border: '1px solid #CBD5E1', color: '#CBD5E1' }}>⏸ Pause</button>
            : <button onClick={() => { typingStartDeclinedRef.current = false; askNotificationPermission(); startTimer(false) }} style={{ ...btn, background: '#059669', border: 'none', color: '#fff' }}>▶ Démarrer</button>)}
          {!editTime && othersRunning > 0 && <span style={{ fontSize: 12, color: '#4ADE80' }}>{othersRunning === 1 ? 'Le chrono d’un autre technicien tourne' : `${othersRunning} autres chronos tournent`}</span>}
          {!editTime && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={ticket.is_billable} onChange={e => update({ is_billable: e.target.checked })} style={{ accentColor: '#4ADE80' }} />
                Facturable
              </label>
              {ticket.is_billable && (
                <select value={ticket.catalogue_item_id || ''} onChange={e => update({ catalogue_item_id: e.target.value || null })}
                  style={{ fontSize: 13, padding: '4px 8px', borderRadius: 6, minWidth: 180 }}>
                  <option value="">Main d'œuvre (taux horaire)</option>
                  {catalogue.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              {offers.length > 0 && <span style={{ color: '#86EFAC' }}>Offert : {fmtHM(ticket.offered_seconds)}</span>}
              {ticket.invoiced_seconds > 0 && <span style={{ color: '#94A3B8' }}>Déjà facturé : {fmtHM(ticket.invoiced_seconds)}</span>}
              {!closed && <button onClick={() => setShowDonner(true)} style={{ ...btn, fontSize: 12, padding: '5px 12px', background: 'transparent', border: '1px solid #86EFAC', color: '#86EFAC' }}>🎁 Donner du temps</button>}
              <button onClick={() => setShowTimeLog(v => !v)} style={{ ...btn, fontSize: 12, padding: '5px 10px', background: 'transparent', border: '1px solid #475569', color: '#CBD5E1' }}>
                Historique du temps
              </button>
            </div>
          )}
        </div>
      </div>

      {showTimeLog && (
        <div className="tkt-section" style={{ marginBottom: 16, fontSize: 13 }}>
          {ticket.periods.length === 0 && corrections.length === 0 && offers.length === 0 && <div style={{ color: 'var(--c-faint)' }}>Aucun temps encore.</div>}
          {[...ticket.periods.map(x => ({ at: x.started_at, type: 'p', x })), ...ticket.adjustments.map(x => ({ at: x.created_at, type: 'a', x }))]
            .sort((a, b) => a.at.localeCompare(b.at)).map(({ type, x }) => (
              <div key={x.id} style={{ display: 'flex', gap: 12, padding: '4px 0', borderBottom: '1px solid var(--c-surface-3)', alignItems: 'center' }}>
                <span style={{ color: 'var(--c-muted)', minWidth: 130 }}>{fmtWhen(type === 'p' ? x.started_at : x.created_at)}</span>
                {type === 'p'
                  ? <span>Chrono {x.user_name ? `de ${x.user_name}` : ''} : {x.ended_at
                      ? <>jusqu'à {new Date(x.ended_at).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })} ({fmtHM((new Date(x.ended_at) - new Date(x.started_at)) / 1000)}, {STOP_LABELS[x.stop_source] || x.stop_source})</>
                      : <strong style={{ color: '#059669' }}>en cours</strong>}</span>
                  : x.kind === 'correction'
                    ? <span>Temps corrigé par {x.user_name || '—'} : {fmtHM(x.before_seconds)} → <strong>{fmtHM(x.after_seconds)}</strong>{x.reason ? ` — ${x.reason}` : ''}</span>
                    : <span>Temps offert par {x.user_name || '—'} : <strong>{fmtHM(x.delta_seconds)}</strong>{x.reason ? ` — ${x.reason}` : ''}
                        {!closed && <button className="inv-del-btn" style={{ marginLeft: 8 }} title="Retirer ce temps offert" onClick={() => cancelOffer(x.id)}>✕</button>}</span>}
              </div>
            ))}
        </div>
      )}

      <div className="tkt-detail-grid">
        <div className="tkt-section">
          <div className="tkt-info-row"><span>Compagnie</span><strong>{ticket.company_name}</strong></div>
          {ticket.contact_name && (
            <div className="tkt-info-row">
              <span>Contact</span>
              <strong>{ticket.contact_name}{ticket.contact_email && <span style={{ color: 'var(--c-muted)', fontWeight: 400, fontSize: 12, marginLeft: 6 }}>{ticket.contact_email}</span>}</strong>
            </div>
          )}
          <div className="tkt-info-row"><span>Assigné</span><strong>{ticket.assigned_name || '—'}</strong></div>
          <div className="tkt-info-row">
            <span>Priorité</span>
            <select className="tkt-select-inline" value={ticket.priority} onChange={e => update({ priority: e.target.value })}>
              <option value="faible">Faible</option>
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
              <option value="critique">Critique</option>
            </select>
          </div>
          <div className="tkt-info-row"><span>Créé le</span><strong>{new Date(ticket.created_at).toLocaleDateString('fr-CA')}</strong></div>
          {ticket.closed_at && <div className="tkt-info-row"><span>Fermé le</span><strong>{new Date(ticket.closed_at).toLocaleDateString('fr-CA')}</strong></div>}
          {ticket.invoice_id && (
            <div className="tkt-info-row"><span>Facture liée</span><a href={`/invoices/${ticket.invoice_id}`} style={{ color: '#0891B2', fontWeight: 600, fontSize: 13 }}>Voir la facture →</a></div>
          )}
          <div className="tkt-info-row">
            <span>Résumé ouvert</span>
            {ticket.last_opened_at
              ? <span style={{ fontSize: 13, cursor: 'pointer', color: 'var(--c-text-2)' }} onClick={toggleOpens} title="Cliquer pour voir l'historique complet">
                  👁 {fmtWhen(ticket.last_opened_at)}{ticket.open_count > 1 ? ` (×${ticket.open_count})` : ''}
                </span>
              : <span style={{ color: 'var(--c-faint)', fontSize: 13 }}>Jamais</span>}
          </div>
          {showOpens && (
            <div style={{ marginTop: 4, marginBottom: 8, fontSize: 12, color: 'var(--c-muted)', background: 'var(--c-surface-2)', borderRadius: 6, padding: '8px 12px' }}>
              {opensLoading ? 'Chargement...' : opens.length === 0 ? 'Aucune ouverture enregistrée.' : (
                <ul style={{ margin: 0, paddingLeft: 16 }}>{opens.map((o, i) => <li key={i}>{fmtWhen(o.opened_at)}</li>)}</ul>
              )}
            </div>
          )}
          {!ticket.contact_email && ticket.contact_name && (
            <div style={{ marginTop: 12, fontSize: 12 }}>
              {editingContactEmail ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="email" autoFocus value={contactEmailDraft} onChange={e => setContactEmailDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveContactEmail(); if (e.key === 'Escape') setEditingContactEmail(false) }}
                    placeholder="courriel@exemple.com" style={{ fontSize: 12, padding: '4px 8px', flex: 1 }} />
                  <button className="ifield-ok" onClick={saveContactEmail} disabled={savingContactEmail}>✓</button>
                  <button className="ifield-x" onClick={() => setEditingContactEmail(false)}>✕</button>
                </div>
              ) : (
                <span style={{ color: 'var(--c-faint)', cursor: 'pointer' }} onClick={() => { setContactEmailDraft(''); setEditingContactEmail(true) }}>
                  Contact sans courriel — notifications désactivées (cliquer pour ajouter)
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <TicketTachesSection ticketId={id} onNewTask={() => setShowTaskModal(true)} refreshKey={taskRefreshKey} />

      {/* ── La conversation ── */}
      <div className="tkt-entries-section" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ticket.description && <MessageBubble m={{ id: 'desc', author_kind: 'demande', body: ticket.description, created_at: ticket.created_at, attachments: [] }} readOnly />}
        {ticket.messages.map(m => (
          <MessageBubble key={m.id} m={m} readOnly={closed} onSave={body => updateMessage(m.id, body)} onDelete={() => deleteMessage(m.id)}
            onDeleteAttachment={deleteAttachment} onSplit={m.author_kind === 'client' ? () => splitToNewTicket(m.id) : null} />
        ))}
        {!ticket.description && ticket.messages.length === 0 && <div style={{ color: 'var(--c-faint)', fontSize: 13 }}>Aucun message.</div>}
        {zekoLive && (
          <div style={{ alignSelf: 'flex-start', maxWidth: '82%', minWidth: 260, background: 'var(--c-surface)', border: '1px solid var(--brand)', borderRadius: 10, padding: '8px 12px' }}>
            {zekoLive.steps.map((st, i) => <div key={i} style={{ fontSize: 11, color: 'var(--c-faint)' }}>Zéko {st}…</div>)}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--c-muted)', marginBottom: 4 }}>
              <strong style={{ color: 'var(--brand)' }}>Zéko</strong>
              {!zekoLive.error && <button className="btn-secondary" style={{ fontSize: 11, padding: '1px 6px', marginLeft: 'auto' }} onClick={() => zekoAbortRef.current?.abort()}>Arrêter</button>}
              {zekoLive.error && <button className="btn-secondary" style={{ fontSize: 11, padding: '1px 6px', marginLeft: 'auto' }} onClick={() => setZekoLive(null)}>OK</button>}
            </div>
            {zekoLive.error ? <div style={{ color: '#DC2626', fontSize: 13 }}>{zekoLive.error}</div>
              : zekoLive.text ? <div style={{ fontSize: 14, lineHeight: 1.5 }}><ZekoText text={zekoLive.text} /></div>
              : <span style={{ color: 'var(--c-faint)', fontSize: 13 }}>Zéko réfléchit…</span>}
          </div>
        )}

        {!closed && (
          <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
            style={{ border: '1px solid var(--c-border-strong)', borderRadius: 10, padding: 10, marginTop: 6, background: 'var(--c-surface)' }}>
            <textarea rows={4} value={draft} onChange={e => onDraftChange(e.target.value)} onPaste={onPaste}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendMessage() }}
              placeholder="Écrivez librement… collez une capture avec Ctrl+V. Une question (« ? ») ou « Zéko » dans le message : Zéko répond."
              style={{ width: '100%', border: 'none', outline: 'none', fontSize: 14, resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5, background: 'transparent', color: 'var(--c-text)' }} />
            {files.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '6px 0' }}>
                {files.map((f, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    {f.url ? <img src={f.url} alt="" style={{ height: 80, borderRadius: 6, border: '1px solid var(--c-border)' }} />
                           : <div style={{ height: 80, padding: '0 10px', display: 'flex', alignItems: 'center', border: '1px solid var(--c-border)', borderRadius: 6, fontSize: 12 }}>{f.file.name}</div>}
                    <button onClick={() => removeFile(i)} title="Retirer" style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, border: 'none', background: '#DC2626', color: '#fff', cursor: 'pointer', fontSize: 11 }}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px', cursor: 'pointer' }}>
                📎 Image
                <input type="file" multiple accept="image/*,application/pdf,.txt,.log" style={{ display: 'none' }} onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
              </label>
              <span style={{ fontSize: 12, color: 'var(--c-faint)' }}>Ctrl+Entrée pour envoyer</span>
              <button className="btn-primary" onClick={sendMessage} disabled={sending || (!draft.trim() && !files.length)} style={{ marginLeft: 'auto', fontSize: 13 }}>
                {sending ? '...' : 'Envoyer'}
              </button>
            </div>
          </div>
        )}
      </div>

      {startAsk && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ width: 520 }}>
            <h3 className="modal-title">{startAsk.others.length === 1 ? 'Un autre ticket est déjà actif' : 'D’autres tickets sont déjà actifs'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, margin: '4px 0 8px' }}>
              {startAsk.others.map(o => (
                <div key={o.ticket_id}><strong>{o.number}</strong> — {o.company_name} · {o.title} <span style={{ color: 'var(--c-muted)' }}>({fmtHM(o.worked_seconds)})</span></div>
              ))}
            </div>
            <div style={{ fontSize: 14, color: 'var(--c-text-2)' }}>Que voulez-vous faire ?</div>
            <div className="modal-actions" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <button className="btn-primary" onClick={() => answerStart('pause')}>{startAsk.others.length === 1 ? `Mettre ${startAsk.others[0].number} en pause` : 'Les mettre en pause'} et démarrer celui-ci</button>
              <button className="btn-secondary" onClick={() => answerStart('keep')}>{startAsk.others.length === 1 ? `Laisser ${startAsk.others[0].number} tourner` : 'Les laisser tourner'} et démarrer celui-ci</button>
              <button className="btn-secondary" onClick={() => answerStart('cancel')}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {showDonner && <DonnerDuTempsModal onClose={() => setShowDonner(false)} onSave={donnerTemps} />}
      {showTaskModal && (
        <NewTaskModal
          prefillTicket={{ id: ticket.id, label: ticket.title }}
          prefillCompany={ticket.company_id ? { id: ticket.company_id, label: ticket.company_name } : null}
          prefillContact={ticket.contact_id ? { id: ticket.contact_id, label: ticket.contact_name } : null}
          onClose={() => setShowTaskModal(false)}
          onCreated={() => { setShowTaskModal(false); setTaskRefreshKey(k => k + 1) }}
        />
      )}
      {showMissingEmailModal && (
        <div className="modal-overlay">
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Pas de courriel</h3>
            <p style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 12 }}>Ce contact n'a pas de courriel enregistré — impossible d'envoyer le résumé.</p>
            <div className="form-group">
              <label>Courriel du contact</label>
              <input type="email" autoFocus value={contactEmailDraft} onChange={e => setContactEmailDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveContactEmailAndSend() }} placeholder="courriel@exemple.com" />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowMissingEmailModal(false)}>Me le rappeler plus tard</button>
              <button className="btn-primary" onClick={saveContactEmailAndSend} disabled={savingContactEmail || !contactEmailDraft.trim()}>{savingContactEmail ? '...' : 'Enregistrer et envoyer'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Les fichiers demandent le jeton : lus en blob puis montrés par une adresse locale
function AttachmentView({ a, onZoom, onDelete }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let u
    api.get(`/v1/tickets/attachments/${a.id}/file`, { responseType: 'blob' }).then(r => { u = URL.createObjectURL(r.data); setUrl(u) }).catch(() => {})
    return () => u && URL.revokeObjectURL(u)
  }, [a.id])
  const isImg = a.media_type.startsWith('image/')
  return (
    <div style={{ position: 'relative' }}>
      {!url ? <div style={{ width: 160, height: 100, border: '1px solid var(--c-border)', borderRadius: 6 }} />
        : isImg ? <img src={url} alt={a.original_name || ''} onClick={() => onZoom(url)} style={{ maxHeight: 180, maxWidth: 320, borderRadius: 6, border: '1px solid var(--c-border)', cursor: 'zoom-in', display: 'block' }} />
        : <a href={url} target="_blank" rel="noreferrer" download={a.original_name || undefined} style={{ fontSize: 13 }}>📄 {a.original_name || 'Fichier'}</a>}
      {onDelete && <button onClick={() => onDelete(a.id)} title="Supprimer l'image" style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, border: 'none', background: '#DC2626', color: '#fff', cursor: 'pointer', fontSize: 11 }}>✕</button>}
    </div>
  )
}

function MessageBubble({ m, readOnly, onSave, onDelete, onDeleteAttachment, onSplit }) {
  const [editing, setEditing] = useState(null)
  const [zoom, setZoom] = useState(null)
  const [hover, setHover] = useState(false)
  const zeko = m.author_kind === 'zeko'
  const client = m.author_kind === 'client' || m.author_kind === 'demande' || zeko
  const who = zeko ? 'Zéko' : m.author_kind === 'demande' ? 'Demande' : m.author_kind === 'client' ? 'Client' : (m.author_name || 'Technicien')
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ alignSelf: client ? 'flex-start' : 'flex-end', maxWidth: '82%', minWidth: 260,
               background: zeko ? 'var(--c-surface)' : client ? 'var(--c-surface-2)' : 'var(--brand-bg)', border: `1px solid ${zeko ? 'var(--brand)' : 'var(--c-border)'}`, borderRadius: 10, padding: '8px 12px' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--c-muted)', marginBottom: 4 }}>
        <strong style={{ color: zeko ? 'var(--brand)' : 'var(--c-text-2)' }}>{who}</strong>
        {zeko && <span title="Les réponses de Zéko ne sont jamais montrées au client">· interne</span>}
        <span>{fmtWhen(m.created_at)}</span>
        {m.updated_at && m.updated_at.slice(0, 19) !== m.created_at.slice(0, 19) && <span title={`Modifié le ${fmtWhen(m.updated_at)}`}>(modifié)</span>}
        {!readOnly && hover && !editing && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {onSplit && <button className="btn-secondary" style={{ fontSize: 11, padding: '1px 6px' }} title="Déplacer vers un nouveau ticket (dossier différent)" onClick={onSplit}>↗ Nouveau ticket</button>}
            <button className="btn-secondary" style={{ fontSize: 11, padding: '1px 6px' }} onClick={() => setEditing(m.body)}>Modifier</button>
            <button className="inv-del-btn" title="Supprimer le message" onClick={onDelete}>✕</button>
          </span>
        )}
      </div>
      {editing !== null ? (
        <div>
          <textarea autoFocus rows={Math.min(12, Math.max(3, editing.split('\n').length))} value={editing} onChange={e => setEditing(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 14, lineHeight: 1.5, borderRadius: 6, border: '1px solid var(--c-border-strong)', padding: 8 }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setEditing(null)}>Annuler</button>
            <button className="btn-primary" style={{ fontSize: 12 }} onClick={async () => { await onSave(editing); setEditing(null) }}>Enregistrer</button>
          </div>
        </div>
      ) : m.body && (zeko
        ? <div style={{ fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word', color: 'var(--c-text)' }}><ZekoText text={m.body} /></div>
        : <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--c-text)' }}>{m.body}</div>)}
      {m.attachments.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          {m.attachments.map(a => <AttachmentView key={a.id} a={a} onZoom={setZoom} onDelete={!readOnly && hover ? onDeleteAttachment : null} />)}
        </div>
      )}
      {zoom && (
        <div className="modal-overlay" style={{ zIndex: 2000 }}>
          <div className="modal-box" style={{ width: 'auto', maxWidth: '96vw', maxHeight: '94vh', overflow: 'auto' }}>
            <img src={zoom} alt="" style={{ maxWidth: '90vw', maxHeight: '80vh' }} />
            <div className="modal-actions"><button className="btn-secondary" onClick={() => setZoom(null)}>Fermer</button></div>
          </div>
        </div>
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
    try { await onSave(rounded); onClose() } catch { setSaving(false) }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Donner du temps</h3>
        <p style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 16 }}>
          Le temps offert est retiré de la facture (arrondi au 5 min inférieur) ; le temps travaillé du ticket ne change pas.
        </p>
        <div className="form-group">
          <label>Minutes à offrir</label>
          <input type="number" min={1} value={minsInput} onChange={e => setMinsInput(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') submit() }} />
        </div>
        {mins > 0 && rounded < 5 && <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 12 }}>Minimum 5 minutes</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={submit} disabled={saving || rounded < 5} style={{ background: '#059669' }}>
            {saving ? '...' : `Offrir ${rounded > 0 ? rounded : '?'} min`}
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
          <label style={{ fontSize: 12, fontWeight: 400, color: 'var(--c-muted)', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} style={{ accentColor: 'var(--brand)' }} />
            Voir complétées
          </label>
        )}
        <button className="btn-secondary" onClick={onNewTask} style={{ fontSize: 12, padding: '4px 10px', marginLeft: 'auto' }}>+ Tâche</button>
      </div>
      {filtered.length === 0 && (
        <div style={{ color: 'var(--c-faint)', fontSize: 13, padding: '8px 0' }}>Aucune tâche liée à ce ticket.</div>
      )}
      {filtered.map(t => {
        const overdue = t.due_date && !t.completed && parseDay(t.due_date) < new Date(new Date().toDateString())
        return (
          <div key={t.id} style={{ display: 'flex', gap: 8, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--c-border)', marginBottom: 6, background: t.completed ? 'var(--c-surface-2)' : 'var(--c-surface)', alignItems: 'center' }}>
            <input type="checkbox" checked={t.completed} onChange={() => toggleComplete(t)} style={{ width: 14, height: 14, accentColor: 'var(--brand)', cursor: 'pointer', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: t.completed ? 'var(--c-faint)' : 'var(--c-text)', textDecoration: t.completed ? 'line-through' : 'none' }}>{t.title}</span>
            {t.subtasks?.length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--c-faint)' }}>{t.subtasks.filter(s => s.completed).length}/{t.subtasks.length}</span>
            )}
            {t.due_date && <span style={{ fontSize: 12, color: overdue ? '#DC2626' : 'var(--c-faint)' }}>{overdue ? '⚠ ' : ''}{new Date(t.due_date + 'T12:00:00').toLocaleDateString('fr-CA')}</span>}
            {t.assigned_name && <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>· {t.assigned_name}</span>}
          </div>
        )
      })}
    </div>
  )
}
