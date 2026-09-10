import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../services/api'
import NewTaskModal from '../components/NewTaskModal'
import Autocomplete from '../components/Autocomplete'
import QuickNewCompany from '../components/QuickNewCompany'
import QuickNewContact from '../components/QuickNewContact'
import UnsavedChangesPrompt from '../components/UnsavedChangesPrompt'
import useUnsavedChangesGuard from '../hooks/useUnsavedChangesGuard'

const PRIORITY_LABELS = { basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente' }
const PRIORITY_COLORS = { basse: '#6B7280', normale: 'var(--brand)', haute: '#D97706', urgente: '#DC2626' }
const STATUS_LABELS = {
  en_cours: 'En cours',
  attente_info_client: 'Attente client',
  attente_info_sip: 'Attente SIP',
  complete: 'Complété',
  annule: 'Annulé',
}
const STATUS_COLORS = {
  en_cours: 'var(--brand)',
  attente_info_client: '#D97706',
  attente_info_sip: '#7C3AED',
  complete: '#16A34A',
  annule: '#9CA3AF',
}

const REMINDER_DELAYS = [
  { value: 0,     label: "À l'heure exacte" },
  { value: 5,     label: '5 minutes avant' },
  { value: 15,    label: '15 minutes avant' },
  { value: 30,    label: '30 minutes avant' },
  { value: 60,    label: '1 heure avant' },
  { value: 1440,  label: '1 jour avant' },
  { value: 10080, label: '1 semaine avant' },
  { value: -1,    label: 'Personnalisé' },
]

function PriorityBadge({ value }) {
  return <span style={{ fontSize: 11, fontWeight: 600, color: PRIORITY_COLORS[value] || '#6B7280', background: '#F3F4F6', padding: '2px 7px', borderRadius: 10 }}>{PRIORITY_LABELS[value] || value}</span>
}

function StatusBadge({ value }) {
  return <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLORS[value] || '#6B7280', background: '#F3F4F6', padding: '2px 7px', borderRadius: 10 }}>{STATUS_LABELS[value] || value}</span>
}

function TaskRow({ task, onToggle, onSelect }) {
  const overdue = task.due_date && !task.completed && new Date(task.due_date) < new Date(new Date().toDateString())
  return (
    <tr style={{ background: task.completed ? '#F9FAFB' : '#fff', cursor: 'pointer' }} onClick={() => onSelect(task)}>
      <td style={{ width: 36, padding: '10px 8px' }} onClick={e => e.stopPropagation()}>
        <input type="checkbox" checked={task.completed} onChange={() => onToggle(task)} style={{ width: 15, height: 15, accentColor: 'var(--brand)', cursor: 'pointer' }} />
      </td>
      <td style={{ padding: '10px 8px', fontSize: 14, color: task.completed ? '#9CA3AF' : '#111827', textDecoration: task.completed ? 'line-through' : 'none', fontWeight: 500 }}>
        {task.title}
        {task.subtasks?.length > 0 && (
          <span style={{ marginLeft: 8, fontSize: 11, color: '#9CA3AF' }}>
            {task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}
          </span>
        )}
      </td>
      <td style={{ padding: '10px 8px', fontSize: 12, color: '#6B7280' }}>{task.company_name || '—'}</td>
      <td style={{ padding: '10px 8px', fontSize: 12, color: '#6B7280' }}>{task.assigned_name || '—'}</td>
      <td style={{ padding: '10px 8px' }}><PriorityBadge value={task.priority} /></td>
      <td style={{ padding: '10px 8px' }}><StatusBadge value={task.status} /></td>
      <td style={{ padding: '10px 8px', fontSize: 12, color: overdue ? '#DC2626' : '#6B7280', fontWeight: overdue ? 600 : 400 }}>
        {task.due_date ? new Date(task.due_date + 'T12:00:00').toLocaleDateString('fr-CA') : '—'}
        {task.due_time ? ` ${task.due_time}` : ''}
      </td>
    </tr>
  )
}

// ── Calendar helpers ──────────────────────────────────────────────────────────

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfWeek(year, month) {
  const d = new Date(year, month, 1).getDay()
  return d === 0 ? 6 : d - 1  // Monday=0
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function googleEventDate(e) {
  return e.all_day ? new Date(e.start + 'T12:00:00') : new Date(e.start)
}

function dayOnly(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

// Plage [debut, fin] inclusive en jours -- l'API Google donne une "end" exclusive
// pour les evenements sur plusieurs jours (le lendemain du dernier jour reel).
function googleEventRange(e) {
  const start = dayOnly(googleEventDate(e))
  let end
  if (e.all_day) {
    end = dayOnly(new Date(e.end + 'T00:00:00'))
    end.setDate(end.getDate() - 1)
  } else {
    end = dayOnly(new Date(e.end))
  }
  return { start, end }
}

function eventCoversDay(e, date) {
  const { start, end } = googleEventRange(e)
  const d = dayOnly(date)
  return d >= start && d <= end
}

function isMultiDayEvent(e) {
  const { start, end } = googleEventRange(e)
  return start.getTime() !== end.getTime()
}

function isHoliday(e) {
  return typeof e.calendar_id === 'string' && e.calendar_id.includes('#holiday@group.v.calendar.google.com')
}

function HolidayDot({ e }) {
  return <span title={e.title} style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', display: 'inline-block', flexShrink: 0 }} />
}

const BAR_HEIGHT = 16
const BAR_GAP = 2

// Decompose la semaine en segments de jours consecutifs ayant exactement la
// meme combinaison d'evenements actifs. Sur un segment a 1 seul evenement :
// pleine hauteur, titre affiche. Sur un segment a 2 evenements qui se
// chevauchent : une seule rangee partagee en 2 moities (pas de lane
// supplementaire empilee) -- le plus "etabli" (plus long, puis commence le
// plus tot) garde le haut, l'autre prend le bas, sans titre (trop etroit).
// 3+ simultanes (rare) : repli sur un empilement classique par lane.
function weekMultiDayBars(weekDates, googleEvents) {
  const weekStart = dayOnly(weekDates[0])
  const weekEnd = dayOnly(weekDates[6])
  const items = googleEvents
    .filter(isMultiDayEvent)
    .map(e => {
      const { start, end } = googleEventRange(e)
      if (end < weekStart || start > weekEnd) return null
      const startIdx = Math.max(0, Math.round((start - weekStart) / 86400000))
      const endIdx = Math.min(6, Math.round((end - weekStart) / 86400000))
      return { event: e, startIdx, endIdx }
    })
    .filter(Boolean)

  if (items.length === 0) return { bars: [], rowsNeeded: 0 }

  const priorityOrder = items.slice().sort((a, b) => (b.endIdx - b.startIdx) - (a.endIdx - a.startIdx) || a.startIdx - b.startIdx)
  const priority = new Map(priorityOrder.map((it, i) => [it.event.id, i]))

  const activeByDay = []
  for (let day = 0; day < 7; day++) {
    const active = items.filter(it => it.startIdx <= day && it.endIdx >= day)
    active.sort((a, b) => priority.get(a.event.id) - priority.get(b.event.id))
    activeByDay.push(active)
  }

  const segments = []
  let current = null
  for (let day = 0; day < 7; day++) {
    const key = activeByDay[day].map(it => it.event.id).join(',')
    if (!current || current.key !== key) {
      current = { key, startIdx: day, endIdx: day, active: activeByDay[day] }
      segments.push(current)
    } else {
      current.endIdx = day
    }
  }

  const bars = []
  let rowsNeeded = 1
  for (const seg of segments) {
    if (seg.active.length === 0) continue
    if (seg.active.length <= 2) {
      seg.active.forEach((it, idx) => {
        const half = seg.active.length === 2
        bars.push({
          event: it.event,
          startIdx: seg.startIdx,
          endIdx: seg.endIdx,
          top: half && idx === 1 ? BAR_HEIGHT / 2 : 0,
          height: half ? BAR_HEIGHT / 2 : BAR_HEIGHT,
          showTitle: !half,
        })
      })
    } else {
      rowsNeeded = Math.max(rowsNeeded, seg.active.length)
      seg.active.forEach((it, idx) => {
        bars.push({ event: it.event, startIdx: seg.startIdx, endIdx: seg.endIdx, top: idx * (BAR_HEIGHT + BAR_GAP), height: BAR_HEIGHT, showTitle: true })
      })
    }
  }

  // Quand le meme evenement continue sur le segment adjacent (jour suivant),
  // on retire l'espacement/arrondi a cette jonction pour que ca reste une
  // seule pastille visuellement continue, meme si l'epaisseur change.
  for (const bar of bars) {
    bar.joinLeft = bars.some(b => b !== bar && b.event.id === bar.event.id && b.endIdx === bar.startIdx - 1)
    bar.joinRight = bars.some(b => b !== bar && b.event.id === bar.event.id && b.startIdx === bar.endIdx + 1)
  }

  return { bars, rowsNeeded }
}

function MultiDayBarsOverlay({ bars, top, onEventClick }) {
  if (bars.length === 0) return null
  return (
    <div style={{ position: 'absolute', top, left: 0, right: 0 }}>
      {bars.map(({ event: e, startIdx, endIdx, top: barTop, height, showTitle, joinLeft, joinRight }, i) => {
        const leftInset = joinLeft ? 0 : 3
        const rightInset = joinRight ? 0 : 3
        const r = showTitle ? 4 : 2
        return (
          <div
            key={`${e.id}-${i}`}
            title={`${e.title}${e.location ? ' — ' + e.location : ''}`}
            onClick={e.editable ? () => onEventClick(e) : undefined}
            style={{
              position: 'absolute',
              left: `calc(${(startIdx / 7) * 100}% + ${leftInset}px)`,
              width: `calc(${((endIdx - startIdx + 1) / 7) * 100}% - ${leftInset + rightInset}px)`,
              top: barTop,
              height,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: (e.color || '#6B7280') + 'CC',
              color: '#fff',
              fontSize: 10,
              fontWeight: 600,
              borderTopLeftRadius: joinLeft ? 0 : r,
              borderBottomLeftRadius: joinLeft ? 0 : r,
              borderTopRightRadius: joinRight ? 0 : r,
              borderBottomRightRadius: joinRight ? 0 : r,
              padding: showTitle ? '0 6px' : 0,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              cursor: e.editable ? 'pointer' : 'default',
            }}
          >
            {showTitle ? e.title : ''}
          </div>
        )
      })}
    </div>
  )
}

function GoogleEventChip({ e, onClick }) {
  const color = e.color || '#6B7280'
  const clickable = e.editable && onClick
  const time = !e.all_day ? googleEventDate(e).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }) : null
  return (
    <div
      title={`${e.title}${e.location ? ' — ' + e.location : ''}`}
      onClick={clickable ? evt => { evt.stopPropagation(); onClick(e) } : evt => evt.stopPropagation()}
      style={{ fontSize: 10, height: BAR_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: '0 6px', borderRadius: 4, marginBottom: BAR_GAP, background: color + '22', color, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', cursor: clickable ? 'pointer' : 'default' }}
    >
      {time && `${time} `}{e.title}
    </div>
  )
}

// ── Task Detail Panel ─────────────────────────────────────────────────────────

function fmtOpened(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('fr-CA') + ' ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// Confirme (et corrige au besoin) le temps chronometre avant de cocher une
// tache de checklist -- TASK-015.15 phase 2. L'ecart avec le temps
// chronometre se repercute sur le chrono du ticket lie (cote backend).
function ConfirmTimeModal({ subtask, onClose, onConfirm }) {
  const rawMinutes = Math.round((subtask.elapsed_seconds || 0) / 60)
  const [minutes, setMinutes] = useState(rawMinutes || subtask.estimated_minutes || 0)
  const [saving, setSaving] = useState(false)

  async function confirm() {
    setSaving(true)
    try { await onConfirm(minutes) } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Combien de temps ça a pris ?</h3>
        <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 12 }}>{subtask.title}</p>
        <div className="form-group">
          <label>Minutes</label>
          <input type="number" min="0" autoFocus value={minutes} onChange={e => setMinutes(parseInt(e.target.value) || 0)} />
        </div>
        {rawMinutes > 0 && rawMinutes !== minutes && (
          <p style={{ fontSize: 12, color: '#9CA3AF' }}>Chronométré : {rawMinutes} min</p>
        )}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={confirm} disabled={saving}>{saving ? '...' : 'Confirmer'}</button>
        </div>
      </div>
    </div>
  )
}

function SendTaskModal({ task, onClose, onSent }) {
  const [email, setEmail] = useState(task.contact_email || '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function send() {
    if (!email.trim()) return
    setSending(true)
    setError('')
    try {
      const r = await api.post(`/v1/tasks/${task.id}/send`, { to_email: email.trim() })
      onSent(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Erreur envoi courriel')
      setSending(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Envoyer le rendez-vous</h3>
        {error && <div style={{ color: '#DC2626', marginBottom: 12, fontSize: 13 }}>{error}</div>}
        <div className="form-group">
          <label>Courriel du destinataire</label>
          <input type="email" autoFocus value={email} onChange={e => setEmail(e.target.value)} placeholder="courriel@exemple.com" style={{ color: '#374151', background: '#fff' }} />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={send} disabled={sending || !email.trim()}>{sending ? '...' : 'Envoyer'}</button>
        </div>
      </div>
    </div>
  )
}

function TaskDetail({ task, onClose, onUpdated, onDeleted, onSelect }) {
  const [editing, setEditing] = useState(false)
  const [showSend, setShowSend] = useState(false)
  const [showOpens, setShowOpens] = useState(false)
  const [opens, setOpens] = useState([])
  const [opensLoading, setOpensLoading] = useState(false)

  async function toggleOpens() {
    if (showOpens) { setShowOpens(false); return }
    setShowOpens(true)
    setOpensLoading(true)
    try {
      const r = await api.get(`/v1/track/task/${task.id}/opens`)
      setOpens(r.data)
    } finally {
      setOpensLoading(false)
    }
  }
  const [form, setForm] = useState({ title: task.title, description: task.description || '', due_date: task.due_date || '', due_time: task.due_time || '', priority: task.priority, status: task.status, link_url: task.link_url || '', estimated_minutes: task.estimated_minutes ?? '' })
  const [saving, setSaving] = useState(false)
  const [companies, setCompanies] = useState([])
  const [contacts, setContacts] = useState([])
  const [reminders, setReminders] = useState([])
  const [confirmTimeSubtask, setConfirmTimeSubtask] = useState(null)
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [selectedContact, setSelectedContact] = useState(null)
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [addingSubtask, setAddingSubtask] = useState(false)
  const [templates, setTemplates] = useState([])
  const [showSubSugg, setShowSubSugg] = useState(false)

  useEffect(() => {
    api.get('/v1/tasks/templates').then(r => setTemplates(r.data))
  }, [])

  const subSuggestions = newSubtaskTitle.length > 0
    ? templates.filter(t => (t.template_name || t.title).toLowerCase().includes(newSubtaskTitle.toLowerCase())).slice(0, 6)
    : templates.slice(0, 6)

  function startEditing() {
    setReminders(task.reminders.map(r => ({ reminder_type: r.reminder_type, minutes_before: r.minutes_before, custom_minutes: r.custom_minutes })))
    setSelectedCompany(task.company_id ? { id: task.company_id, label: task.company_name } : null)
    setSelectedContact(task.contact_id ? { id: task.contact_id, label: task.contact_name } : null)
    api.get('/v1/companies').then(r => setCompanies(r.data))
    api.get('/v1/contacts').then(r => setContacts(r.data))
    setEditing(true)
  }

  async function toggleComplete() {
    const r = await api.post(`/v1/tasks/${task.id}/complete`)
    onUpdated(r.data)
  }

  async function save() {
    setSaving(true)
    try {
      const r = await api.put(`/v1/tasks/${task.id}`, {
        ...form,
        due_date: form.due_date || null,
        due_time: form.due_time || null,
        estimated_minutes: form.estimated_minutes === '' ? null : parseInt(form.estimated_minutes),
        link_url: form.link_url || null,
        company_id: selectedCompany?.id || null,
        contact_id: selectedContact?.id || null,
        reminders,
      })
      onUpdated(r.data)
      setEditing(false)
    } finally { setSaving(false) }
  }

  async function del() {
    if (!window.confirm('Supprimer cette tâche ?')) return
    await api.delete(`/v1/tasks/${task.id}`)
    onDeleted(task.id)
  }

  async function addSubtask() {
    const t = newSubtaskTitle.trim()
    if (!t) return
    setAddingSubtask(true)
    setShowSubSugg(false)
    try {
      await api.post('/v1/tasks', { title: t, parent_task_id: task.id, priority: 'normale', status: 'en_cours' })
      const r = await api.get(`/v1/tasks/${task.id}`)
      onUpdated(r.data)
      setNewSubtaskTitle('')
    } finally { setAddingSubtask(false) }
  }

  async function addSubtaskFromTemplate(tpl) {
    setAddingSubtask(true)
    setShowSubSugg(false)
    setNewSubtaskTitle('')
    try {
      await api.post(`/v1/tasks/from-template/${tpl.id}`, {
        title: tpl.title,
        parent_task_id: task.id,
        priority: tpl.priority,
        status: 'en_cours',
      })
      const r = await api.get(`/v1/tasks/${task.id}`)
      onUpdated(r.data)
    } finally { setAddingSubtask(false) }
  }

  async function toggleSubtask(st) {
    if (st.completed) {
      await api.put(`/v1/tasks/${st.id}`, { completed: false, status: 'en_cours' })
      const parent = await api.get(`/v1/tasks/${task.id}`)
      onUpdated(parent.data)
      return
    }
    if (st.link_url) {
      // Tache liee a une page -- on demande/corrige le temps pris plutot que
      // de cocher directement (TASK-015.15 phase 2, demande de Philippe).
      setConfirmTimeSubtask(st)
      return
    }
    await api.post(`/v1/tasks/${st.id}/complete`)
    const parent = await api.get(`/v1/tasks/${task.id}`)
    onUpdated(parent.data)
  }

  async function openSubtaskLink(st) {
    window.open(st.link_url, '_blank', 'noopener,noreferrer')
    await api.post(`/v1/tasks/${st.id}/timer/start`)
    const parent = await api.get(`/v1/tasks/${task.id}`)
    onUpdated(parent.data)
  }

  async function confirmSubtaskTime(minutes) {
    if (!confirmTimeSubtask) return
    await api.post(`/v1/tasks/${confirmTimeSubtask.id}/complete-with-time`, { minutes })
    setConfirmTimeSubtask(null)
    const parent = await api.get(`/v1/tasks/${task.id}`)
    onUpdated(parent.data)
  }

  async function openSubtask(stId) {
    const r = await api.get(`/v1/tasks/${stId}`)
    onSelect?.(r.data)
  }

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }))

  function updateReminder(i, field, val) {
    setReminders(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
  }

  const companyItems = companies.map(c => ({ id: c.id, label: c.name }))
  const contactItems = contacts
    .filter(c => !selectedCompany || (c.companies || []).some(co => co.company_id === selectedCompany.id))
    .map(c => ({ id: c.id, label: `${c.first_name} ${c.last_name}`.trim(), sub: c.email || '' }))
  const selectedContactCompanyId = selectedContact
    ? contacts.find(c => c.id === selectedContact.id)?.companies?.[0]?.company_id
    : null

  return (
    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, background: '#fff', boxShadow: '-4px 0 20px rgba(0,0,0,0.12)', zIndex: 300, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <div style={{ padding: '20px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          {editing ? (
            <input value={form.title} onChange={e => set('title', e.target.value)} style={{ fontSize: 18, fontWeight: 700, width: '100%', border: '1px solid #D1D5DB', borderRadius: 6, padding: '4px 8px', color: '#111827', background: '#fff' }} />
          ) : (
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: task.completed ? '#9CA3AF' : '#111827', textDecoration: task.completed ? 'line-through' : 'none' }}>{task.title}</h2>
          )}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9CA3AF', marginLeft: 12, padding: 0 }}>×</button>
      </div>

      {!editing && (
        <div style={{ padding: '12px 20px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <PriorityBadge value={task.priority} />
          <StatusBadge value={task.status} />
          {task.ticket_id && (
            <a href={`/tickets/${task.ticket_id}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--brand)', background: 'var(--brand)11', padding: '2px 7px', borderRadius: 10, textDecoration: 'none' }}>
              🎫 {task.ticket_title || 'Ticket lié'}
            </a>
          )}
          {task.company_name && <span style={{ fontSize: 11, color: '#6B7280', background: '#F3F4F6', padding: '2px 7px', borderRadius: 10 }}>{task.company_name}</span>}
          {task.assigned_name && <span style={{ fontSize: 11, color: '#6B7280', background: '#F3F4F6', padding: '2px 7px', borderRadius: 10 }}>👤 {task.assigned_name}</span>}
        </div>
      )}

      {!editing && task.due_date && (
        <div style={{ padding: '0 20px 12px', fontSize: 13, color: '#6B7280' }}>
          📅 {new Date(task.due_date + 'T12:00:00').toLocaleDateString('fr-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          {task.due_time && ` à ${task.due_time}`}
        </div>
      )}

      {!editing && (
        <div style={{ padding: '0 20px 12px', fontSize: 13 }}>
          {task.last_opened_at ? (
            <span style={{ color: '#6B7280', cursor: 'pointer' }} onClick={toggleOpens} title="Cliquer pour voir l'historique complet">
              👁 Ouvert le {fmtOpened(task.last_opened_at)}{task.open_count > 1 ? ` (×${task.open_count})` : ''}
            </span>
          ) : <span style={{ color: '#9CA3AF' }}>Jamais ouvert</span>}
          {showOpens && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#6B7280', background: '#F9FAFB', borderRadius: 6, padding: '8px 12px' }}>
              {opensLoading ? 'Chargement...' : opens.length === 0 ? 'Aucune ouverture enregistrée.' : (
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {opens.map((o, i) => <li key={i}>{fmtOpened(o.opened_at)}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ padding: '0 20px', flex: 1 }}>
        {editing ? (
          <>
            <div className="form-group">
              <label style={{ fontSize: 12 }}>Description</label>
              <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} style={{ color: '#374151', background: '#fff' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label style={{ fontSize: 12 }}>Date</label>
                <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} style={{ color: '#374151', background: '#fff' }} />
              </div>
              <div className="form-group">
                <label style={{ fontSize: 12 }}>Heure</label>
                <input type="time" value={form.due_time} onChange={e => set('due_time', e.target.value)} style={{ color: '#374151', background: '#fff' }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label style={{ fontSize: 12 }}>Priorité</label>
                <select value={form.priority} onChange={e => set('priority', e.target.value)} style={{ color: '#374151', background: '#fff' }}>
                  <option value="basse">Basse</option>
                  <option value="normale">Normale</option>
                  <option value="haute">Haute</option>
                  <option value="urgente">Urgente</option>
                </select>
              </div>
              <div className="form-group">
                <label style={{ fontSize: 12 }}>Statut</label>
                <select value={form.status} onChange={e => set('status', e.target.value)} style={{ color: '#374151', background: '#fff' }}>
                  <option value="en_cours">En cours</option>
                  <option value="attente_info_client">Attente client</option>
                  <option value="attente_info_sip">Attente SIP</option>
                  <option value="complete">Complété</option>
                  <option value="annule">Annulé</option>
                </select>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #E5E7EB', margin: '12px 0', paddingTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Liens</div>
              <Autocomplete label="Compagnie" items={companyItems} value={selectedCompany} onSelect={v => { setSelectedCompany(v); if (!v) setSelectedContact(null) }} placeholder="Rechercher une compagnie..." />
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <Autocomplete label="Contact" items={contactItems} value={selectedContact} onSelect={setSelectedContact} placeholder="Rechercher un contact..." openOnFocus={!!selectedCompany} />
                </div>
                {selectedContactCompanyId && (
                  <a
                    href={`/companies/${selectedContactCompanyId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Ouvrir la fiche de l'entreprise dans un nouvel onglet"
                    style={{ marginBottom: 10, fontSize: 18, textDecoration: 'none' }}
                  >
                    🔗
                  </a>
                )}
              </div>
            </div>

            <div style={{ borderTop: '1px solid #E5E7EB', margin: '12px 0', paddingTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Exécution</div>
              <div className="form-group">
                <label style={{ fontSize: 12 }}>Page liée (optionnel)</label>
                <input value={form.link_url} onChange={e => set('link_url', e.target.value)} placeholder="https://portail.simpleip.tel/companies" style={{ color: '#374151', background: '#fff' }} />
              </div>
              <div className="form-group">
                <label style={{ fontSize: 12 }}>
                  Durée approximative (minutes)
                  {task.suggested_estimated_minutes != null && (
                    <span style={{ fontWeight: 400, color: '#9CA3AF' }}> — suggestion : {task.suggested_estimated_minutes} min</span>
                  )}
                </label>
                <input type="number" min="0" value={form.estimated_minutes} onChange={e => set('estimated_minutes', e.target.value)} style={{ color: '#374151', background: '#fff' }} />
              </div>
            </div>

            <div style={{ borderTop: '1px solid #E5E7EB', margin: '12px 0', paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rappels</div>
                <button onClick={() => setReminders(prev => [...prev, { reminder_type: 'local', minutes_before: 0, custom_minutes: null }])} className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }}>+ Ajouter</button>
              </div>
              {reminders.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                  <select value={r.minutes_before} onChange={e => updateReminder(i, 'minutes_before', parseInt(e.target.value))} style={{ flex: 1, fontSize: 12, padding: '5px 6px', border: '1px solid #D1D5DB', borderRadius: 6, color: '#374151', background: '#fff' }}>
                    {REMINDER_DELAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                  {r.minutes_before === -1 && (
                    <input type="number" placeholder="Min" value={r.custom_minutes || ''} onChange={e => updateReminder(i, 'custom_minutes', parseInt(e.target.value) || null)} style={{ width: 60, fontSize: 12, padding: '5px 6px', border: '1px solid #D1D5DB', borderRadius: 6, color: '#374151', background: '#fff' }} />
                  )}
                  <button onClick={() => setReminders(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 16 }}>×</button>
                </div>
              ))}
            </div>

            <div className="modal-actions" style={{ justifyContent: 'flex-start', padding: 0, marginBottom: 16 }}>
              <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '...' : 'Sauvegarder'}</button>
              <button className="btn-secondary" onClick={() => setEditing(false)}>Annuler</button>
            </div>
          </>
        ) : (
          <>
            {task.description && <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, marginBottom: 16 }}>{task.description}</p>}

            <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Checklist
                {task.subtasks?.length > 0 && (
                  <span style={{ marginLeft: 6, fontWeight: 400, color: '#9CA3AF' }}>
                    ({task.subtasks.filter(s => s.completed).length}/{task.subtasks.length})
                  </span>
                )}
              </div>
              {task.subtasks?.map(st => (
                <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #F3F4F6' }}>
                  <input
                    type="checkbox"
                    checked={st.completed}
                    onChange={() => toggleSubtask(st)}
                    style={{ width: 14, height: 14, accentColor: 'var(--brand)', cursor: 'pointer', flexShrink: 0 }}
                  />
                  <span
                    onClick={() => openSubtask(st.id)}
                    style={{ flex: 1, fontSize: 13, cursor: 'pointer', color: st.completed ? '#9CA3AF' : '#111827', textDecoration: st.completed ? 'line-through' : 'none', fontWeight: 500 }}
                  >
                    {st.title}
                  </span>
                  {st.link_url && (
                    <button
                      onClick={() => openSubtaskLink(st)}
                      title={`Ouvrir ${st.link_url}`}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0 }}
                    >
                      🔗
                    </button>
                  )}
                  {st.timer_running && <span title="Chrono en cours" style={{ fontSize: 12 }}>⏱</span>}
                  {st.actual_minutes != null ? (
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>{st.actual_minutes} min</span>
                  ) : st.estimated_minutes != null && (
                    <span style={{ fontSize: 11, color: '#C1C7D0' }}>~{st.estimated_minutes} min</span>
                  )}
                  {st.assigned_name && <span style={{ fontSize: 11, color: '#9CA3AF' }}>{st.assigned_name}</span>}
                  <span style={{ fontSize: 11, color: STATUS_COLORS[st.status] || '#9CA3AF', fontWeight: 600 }}>{STATUS_LABELS[st.status] || st.status}</span>
                </div>
              ))}
              <div style={{ marginTop: 8 }}>
                {/* Suggestions inline above the input — avoids overflow:auto clipping */}
                {showSubSugg && subSuggestions.length > 0 && (
                  <div style={{ background: '#fff', border: '1px solid #D1D5DB', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto', marginBottom: 4 }}>
                    <div style={{ padding: '5px 12px', fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #F3F4F6' }}>
                      Templates disponibles
                    </div>
                    {subSuggestions.map(tpl => (
                      <div
                        key={tpl.id}
                        onMouseDown={() => addSubtaskFromTemplate(tpl)}
                        style={{ padding: '8px 14px', cursor: 'pointer', borderBottom: '1px solid #F9FAFB' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#EEF4FF'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{tpl.template_name || tpl.title}</div>
                        {tpl.subtasks?.length > 0 && (
                          <span style={{ fontSize: 11, color: '#6B7280' }}>{tpl.subtasks.length} étape{tpl.subtasks.length > 1 ? 's' : ''}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={newSubtaskTitle}
                    onChange={e => { setNewSubtaskTitle(e.target.value); setShowSubSugg(true) }}
                    onFocus={() => setShowSubSugg(true)}
                    onBlur={() => setTimeout(() => setShowSubSugg(false), 150)}
                    onKeyDown={e => e.key === 'Enter' && addSubtask()}
                    placeholder="Ajouter ou chercher un template..."
                    style={{ flex: 1, fontSize: 13, padding: '5px 10px', border: '1px solid #D1D5DB', borderRadius: 6, color: '#374151', background: '#fff' }}
                  />
                  <button onClick={addSubtask} disabled={addingSubtask || !newSubtaskTitle.trim()} className="btn-secondary" style={{ padding: '5px 10px', fontSize: 13 }}>
                    {addingSubtask ? '...' : '+'}
                  </button>
                </div>
              </div>
            </div>

            {(task.ticket_title || task.invoice_number || task.contact_name) && (
              <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Liens</div>
                {task.contact_name && <div style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>👤 {task.contact_name}</div>}
                {task.ticket_title && <div style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>🎫 {task.ticket_title}</div>}
                {task.invoice_number && <div style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>🧾 {task.invoice_number}</div>}
              </div>
            )}

            {task.reminders?.length > 0 && (
              <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rappels</div>
                {task.reminders.map(r => {
                  const delay = r.minutes_before === 0 ? "À l'heure" : r.minutes_before === 5 ? '5 min avant' : r.minutes_before === 15 ? '15 min avant' : r.minutes_before === 30 ? '30 min avant' : r.minutes_before === 60 ? '1h avant' : r.minutes_before === 1440 ? '1 jour avant' : r.minutes_before === 10080 ? '1 semaine avant' : `${r.custom_minutes} min avant`
                  return <div key={r.id} style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>🔔 {delay} — {r.reminder_type}</div>
                })}
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ padding: 20, borderTop: '1px solid #E5E7EB', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!task.completed && <button className="btn-primary" onClick={toggleComplete} style={{ fontSize: 13 }}>✓ Compléter</button>}
        {!editing && <button className="btn-secondary" onClick={startEditing} style={{ fontSize: 13 }}>Modifier</button>}
        {!editing && <button className="btn-secondary" onClick={() => setShowSend(true)} style={{ fontSize: 13 }}>📧 Envoyer</button>}
        <button onClick={del} style={{ fontSize: 13, marginLeft: 'auto', background: 'none', border: '1px solid #FCA5A5', color: '#DC2626', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>Supprimer</button>
      </div>

      {showSend && (
        <SendTaskModal
          task={task}
          onClose={() => setShowSend(false)}
          onSent={data => { onUpdated(data); setShowSend(false) }}
        />
      )}

      {confirmTimeSubtask && (
        <ConfirmTimeModal
          subtask={confirmTimeSubtask}
          onClose={() => setConfirmTimeSubtask(null)}
          onConfirm={confirmSubtaskTime}
        />
      )}
    </div>
  )
}

// ── Calendar Views ────────────────────────────────────────────────────────────

function MonthView({ year, month, googleEvents, onEventClick, onDayClick, today }) {
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfWeek(year, month)
  const totalCells = Math.ceil((daysInMonth + firstDay) / 7) * 7
  const cellDates = []
  for (let i = 0; i < totalCells; i++) cellDates.push(new Date(year, month, i - firstDay + 1))
  const weeks = []
  for (let i = 0; i < cellDates.length; i += 7) weeks.push(cellDates.slice(i, i + 7))
  const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
  const singleDayEvents = googleEvents.filter(e => !isMultiDayEvent(e))
  const DAY_HEADER_H = 34 // hauteur du numero de jour + marge, pour aligner les bandes juste en dessous

  // Pas de "gap" sur les grilles ci-dessous : avec 7 colonnes egales, un gap
  // fausse le calcul en % des bandes multi-jours (les colonnes ne font plus
  // exactement 1/7 chacune) -- les traits de grille viennent des bordures.
  function cellBorder(colIndex, isLastRow) {
    return { borderRight: colIndex < 6 ? '1px solid #E5E7EB' : 'none', borderBottom: isLastRow ? 'none' : '1px solid #E5E7EB' }
  }

  return (
    <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', flexShrink: 0 }}>
        {DAYS.map((d, i) => (
          <div key={d} style={{ background: '#F9FAFB', padding: '8px 0', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6B7280', ...cellBorder(i, false) }}>{d}</div>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {weeks.map((week, wi) => {
          const { bars, rowsNeeded } = weekMultiDayBars(week, googleEvents)
          const barsSpace = bars.length ? rowsNeeded * (BAR_HEIGHT + BAR_GAP) : 0
          const isLastRow = wi === weeks.length - 1
          return (
            <div key={wi} style={{ position: 'relative', flex: 1, minHeight: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: '1fr', height: '100%' }}>
                {week.map((date, di) => {
                  const inMonth = date.getMonth() === month
                  const isToday = isSameDay(date, today)
                  const dayEventsAll = singleDayEvents.filter(e => isSameDay(googleEventDate(e), date))
                  const dayGoogleEvents = dayEventsAll.filter(e => !isHoliday(e))
                  const dayHolidays = dayEventsAll.filter(isHoliday)
                  return (
                    <div key={di} onClick={() => onDayClick(date)} style={{ background: inMonth ? '#fff' : '#F9FAFB', padding: 6, position: 'relative', minWidth: 0, overflowY: 'auto', cursor: 'pointer', ...cellBorder(di, isLastRow) }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                        <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 400, color: isToday ? '#fff' : inMonth ? '#374151' : '#9CA3AF', background: isToday ? 'var(--brand)' : 'transparent', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{date.getDate()}</div>
                        {dayHolidays.map(h => <HolidayDot key={h.id} e={h} />)}
                      </div>
                      {barsSpace > 0 && <div style={{ height: barsSpace }} />}
                      {dayGoogleEvents.slice(0, 2).map(e => <GoogleEventChip key={e.id} e={e} onClick={onEventClick} />)}
                      {dayGoogleEvents.length > 2 && <div style={{ fontSize: 10, color: '#9CA3AF', paddingLeft: 4 }}>+{dayGoogleEvents.length - 2} agenda</div>}
                    </div>
                  )
                })}
              </div>
              <MultiDayBarsOverlay bars={bars} top={DAY_HEADER_H} onEventClick={onEventClick} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({ weekStart, googleEvents, onEventClick, onDayClick, today }) {
  const days = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    days.push(d)
  }
  const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
  const singleDayEvents = googleEvents.filter(e => !isMultiDayEvent(e))
  const { bars, rowsNeeded } = weekMultiDayBars(days, googleEvents)
  const barsSpace = bars.length ? rowsNeeded * (BAR_HEIGHT + BAR_GAP) : 0
  const WEEK_HEADER_H = 54 // jour + date, avant les bandes multi-jours

  return (
    <div style={{ position: 'relative', border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: '1fr', flex: 1, minHeight: 0 }}>
        {days.map((d, i) => {
          const isToday = isSameDay(d, today)
          const dayEventsAll = singleDayEvents.filter(e => isSameDay(googleEventDate(e), d))
          const dayGoogleEvents = dayEventsAll.filter(e => !isHoliday(e))
          const dayHolidays = dayEventsAll.filter(isHoliday)
          return (
            <div key={i} onClick={() => onDayClick(d)} style={{ background: '#fff', minWidth: 0, display: 'flex', flexDirection: 'column', cursor: 'pointer', borderRight: i < 6 ? '1px solid #E5E7EB' : 'none' }}>
              <div style={{ padding: '8px 8px 4px', borderBottom: '1px solid #E5E7EB', textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>{DAYS[i]}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: isToday ? 'var(--brand)' : '#111827' }}>{d.getDate()}</div>
                  {dayHolidays.map(h => <HolidayDot key={h.id} e={h} />)}
                </div>
              </div>
              <div style={{ padding: 6, flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {barsSpace > 0 && <div style={{ height: barsSpace }} />}
                {dayGoogleEvents.map(e => <GoogleEventChip key={e.id} e={e} onClick={onEventClick} />)}
              </div>
            </div>
          )
        })}
      </div>
      <MultiDayBarsOverlay bars={bars} top={WEEK_HEADER_H} onEventClick={onEventClick} />
    </div>
  )
}

function DayView({ day, googleEvents, onEventClick, onDayClick }) {
  const dayGoogleEvents = googleEvents.filter(e => eventCoversDay(e, day))
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>
          {day.toLocaleDateString('fr-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
        <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => onDayClick(day)}>+ Ajouter</button>
      </div>
      {dayGoogleEvents.length === 0 ? (
        <div style={{ color: '#9CA3AF', fontSize: 14, textAlign: 'center', padding: '40px 0' }}>Aucun RDV ce jour</div>
      ) : (
        <>
          {dayGoogleEvents.map(e => (
            <div
              key={e.id}
              onClick={e.editable ? () => onEventClick(e) : undefined}
              style={{ padding: '12px 16px', borderRadius: 8, border: `1px solid ${(e.color || '#E5E7EB')}44`, marginBottom: 8, background: (e.color || '#9CA3AF') + '11', cursor: e.editable ? 'pointer' : 'default' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {!e.all_day && <span style={{ fontSize: 13, color: e.color || '#6B7280', fontWeight: 600, minWidth: 50 }}>{googleEventDate(e).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}</span>}
                <span style={{ fontSize: 14, fontWeight: 600, color: e.color || '#6B7280', fontStyle: 'italic' }}>{e.title}</span>
              </div>
              {e.location && <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>{e.location}</div>}
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// Rapport de compétence par employé (TASK-015.15 phase 2) : temps moyen par
// type de tâche, comparé à la moyenne d'équipe -- pour ajuster le planing
// (durée approximative +15%) sans pénaliser les employés plus lents.
function CompetencyReportSection() {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    api.get('/v1/tasks/report/competency').then(r => setRows(r.data)).finally(() => setLoading(false))
  }, [open])

  const byEmployee = rows.reduce((acc, r) => {
    (acc[r.assigned_name] ||= []).push(r)
    return acc
  }, {})

  return (
    <div style={{ marginTop: 24, border: '1px solid #E5E7EB', borderRadius: 8 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', textAlign: 'left', padding: '12px 16px', background: '#F9FAFB', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#374151', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        Rapport de compétence par employé
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ padding: 16 }}>
          {loading ? (
            <div style={{ color: '#9CA3AF', fontSize: 13 }}>Chargement...</div>
          ) : Object.keys(byEmployee).length === 0 ? (
            <div style={{ color: '#9CA3AF', fontSize: 13 }}>Pas encore assez de tâches complétées avec temps enregistré.</div>
          ) : (
            Object.entries(byEmployee).map(([name, tasks]) => (
              <div key={name} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 6 }}>{name}</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: '#6B7280', textAlign: 'left' }}>
                      <th style={{ padding: '4px 8px' }}>Tâche</th>
                      <th style={{ padding: '4px 8px' }}>Son temps moyen</th>
                      <th style={{ padding: '4px 8px' }}>Moyenne équipe</th>
                      <th style={{ padding: '4px 8px' }}>Nb fois</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map(t => {
                      const diff = t.employee_avg_minutes - t.team_avg_minutes
                      return (
                        <tr key={t.template_id} style={{ borderTop: '1px solid #F3F4F6' }}>
                          <td style={{ padding: '4px 8px' }}>{t.template_title}</td>
                          <td style={{ padding: '4px 8px', color: diff > 0 ? '#DC2626' : diff < 0 ? '#059669' : '#374151', fontWeight: 600 }}>{t.employee_avg_minutes} min</td>
                          <td style={{ padding: '4px 8px', color: '#9CA3AF' }}>{t.team_avg_minutes} min</td>
                          <td style={{ padding: '4px 8px', color: '#9CA3AF' }}>{t.employee_count}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function ListView({ tasks, onToggle, onSelect }) {
  if (tasks.length === 0) return <div style={{ color: '#9CA3AF', fontSize: 14, textAlign: 'center', padding: '40px 0' }}>Aucune tâche</div>
  const withDate = tasks.filter(t => t.due_date).sort((a, b) => a.due_date.localeCompare(b.due_date))
  const noDate = tasks.filter(t => !t.due_date)
  const groups = {}
  withDate.forEach(t => {
    const k = t.due_date
    if (!groups[k]) groups[k] = []
    groups[k].push(t)
  })
  return (
    <div>
      {Object.entries(groups).map(([d, ts]) => (
        <div key={d} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8, paddingBottom: 4, borderBottom: '2px solid #E5E7EB' }}>
            {new Date(d + 'T12:00:00').toLocaleDateString('fr-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          {ts.map(t => (
            <div key={t.id} onClick={() => onSelect(t)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB', marginBottom: 6, cursor: 'pointer', background: t.completed ? '#F9FAFB' : '#fff' }}>
              <input type="checkbox" checked={t.completed} onChange={() => onToggle(t)} onClick={e => e.stopPropagation()} style={{ width: 15, height: 15, accentColor: 'var(--brand)', cursor: 'pointer' }} />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: t.completed ? '#9CA3AF' : '#111827', textDecoration: t.completed ? 'line-through' : 'none' }}>{t.title}</span>
              {t.due_time && <span style={{ fontSize: 12, color: '#6B7280' }}>{t.due_time}</span>}
              {t.company_name && <span style={{ fontSize: 12, color: '#6B7280' }}>{t.company_name}</span>}
              <PriorityBadge value={t.priority} />
              <StatusBadge value={t.status} />
            </div>
          ))}
        </div>
      ))}
      {noDate.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8, paddingBottom: 4, borderBottom: '2px solid #E5E7EB' }}>Sans date</div>
          {noDate.map(t => (
            <div key={t.id} onClick={() => onSelect(t)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB', marginBottom: 6, cursor: 'pointer', background: t.completed ? '#F9FAFB' : '#fff' }}>
              <input type="checkbox" checked={t.completed} onChange={() => onToggle(t)} onClick={e => e.stopPropagation()} style={{ width: 15, height: 15, accentColor: 'var(--brand)', cursor: 'pointer' }} />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: t.completed ? '#9CA3AF' : '#111827', textDecoration: t.completed ? 'line-through' : 'none' }}>{t.title}</span>
              {t.company_name && <span style={{ fontSize: 12, color: '#6B7280' }}>{t.company_name}</span>}
              <PriorityBadge value={t.priority} />
              <StatusBadge value={t.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Tasks({ defaultView = 'list' }) {
  const isAgenda = defaultView !== 'list'
  const today = new Date()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState(defaultView)
  // React Router ne demonte pas forcement ce composant en passant de /agenda
  // a /tasks (meme type de composant a la meme position) -- sans ce reset,
  // le state `view` d'une visite precedente survit et le calendrier peut
  // s'afficher sur /tasks (ou l'inverse sur /agenda). Le garde-fou isAgenda
  // sur le rendu du calendrier (plus bas) est la 2e moitie du fix.
  useEffect(() => { setView(defaultView) }, [defaultView])
  const [showNew, setShowNew] = useState(false)
  const [selectedTask, setSelectedTask] = useState(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)
  const [calYear, setCalYear] = useState(today.getFullYear())
  const [calMonth, setCalMonth] = useState(today.getMonth())
  const [calDay, setCalDay] = useState(new Date(today.getFullYear(), today.getMonth(), today.getDate()))

  function getWeekStart(d) {
    const day = d.getDay()
    const diff = d.getDate() - (day === 0 ? 6 : day - 1)
    return new Date(d.getFullYear(), d.getMonth(), diff)
  }
  const [calWeekStart, setCalWeekStart] = useState(getWeekStart(today))
  const [googleEvents, setGoogleEvents] = useState([])
  const [quickAddDate, setQuickAddDate] = useState(null)
  const [editingGoogleEvent, setEditingGoogleEvent] = useState(null)

  const loadGoogleEvents = useCallback(() => {
    if (!isAgenda) return
    let start, end
    if (view === 'month') {
      // Meme grille que MonthView (semaines completes) : inclut les jours du
      // mois precedent/suivant affiches pour combler le tableau, sinon leurs
      // RDV ne sont jamais charges et ces cases restent vides.
      const daysInMonth = getDaysInMonth(calYear, calMonth)
      const firstDay = getFirstDayOfWeek(calYear, calMonth)
      const totalCells = Math.ceil((daysInMonth + firstDay) / 7) * 7
      start = new Date(calYear, calMonth, 1 - firstDay)
      end = new Date(calYear, calMonth, 1 - firstDay + totalCells, 23, 59, 59)
    } else if (view === 'week') {
      start = new Date(calWeekStart)
      end = new Date(calWeekStart)
      end.setDate(end.getDate() + 7)
    } else {
      start = new Date(calDay)
      end = new Date(calDay)
      end.setDate(end.getDate() + 1)
    }
    api.get('/v1/google-calendar/events', { params: { start: start.toISOString(), end: end.toISOString() } })
      .then(r => setGoogleEvents(r.data))
      .catch(() => setGoogleEvents([]))
  }, [isAgenda, view, calYear, calMonth, calWeekStart, calDay])

  useEffect(() => {
    loadGoogleEvents()
    if (!isAgenda) return
    const interval = setInterval(loadGoogleEvents, 5000)
    return () => clearInterval(interval)
  }, [loadGoogleEvents, isAgenda])

  function dateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  function pickRdv(dateOverride) {
    const d = dateOverride || quickAddDate
    setQuickAddDate(null)
    setEditingGoogleEvent({ mode: 'create', date: d, endDate: d, title: 'RDV - ', description: '', location: '', startTime: '09:00', endTime: '10:00' })
  }
  function pickAppel(dateOverride) {
    const d = dateOverride || quickAddDate
    setQuickAddDate(null)
    setEditingGoogleEvent({ mode: 'create', date: d, endDate: d, title: 'Appel - ', description: '', location: '', startTime: '09:00', endTime: '09:30' })
  }
  function openEditGoogleEvent(e) {
    const start = googleEventDate(e)
    const end = e.all_day ? start : new Date(e.end)
    setEditingGoogleEvent({
      mode: 'edit', calendar_id: e.calendar_id, event_id: e.id,
      title: e.title, description: e.description || '', location: e.location || '',
      date: dateStr(start),
      endDate: dateStr(end),
      startTime: start.toTimeString().slice(0, 5),
      endTime: end.toTimeString().slice(0, 5),
    })
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/v1/tasks')
      setTasks(r.data)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleToggle(task) {
    if (task.completed) {
      const r = await api.put(`/v1/tasks/${task.id}`, { completed: false, status: 'en_cours' })
      setTasks(prev => prev.map(t => t.id === r.data.id ? r.data : t))
    } else {
      const r = await api.post(`/v1/tasks/${task.id}/complete`)
      setTasks(prev => prev.map(t => t.id === r.data.id ? r.data : t))
    }
    if (selectedTask?.id === task.id) setSelectedTask(null)
  }

  function handleUpdated(updated) {
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
    setSelectedTask(updated)
  }

  function handleDeleted(id) {
    setTasks(prev => prev.filter(t => t.id !== id))
    setSelectedTask(null)
  }

  const filtered = tasks.filter(t => {
    if (!showCompleted && t.completed) return false
    if (filterStatus && t.status !== filterStatus) return false
    if (filterPriority && t.priority !== filterPriority) return false
    return true
  })

  const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

  function prevMonth() { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) } else setCalMonth(m => m - 1) }
  function nextMonth() { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) } else setCalMonth(m => m + 1) }
  function prevWeek() { const d = new Date(calWeekStart); d.setDate(d.getDate() - 7); setCalWeekStart(d) }
  function nextWeek() { const d = new Date(calWeekStart); d.setDate(d.getDate() + 7); setCalWeekStart(d) }
  function prevDay() { const d = new Date(calDay); d.setDate(d.getDate() - 1); setCalDay(d) }
  function nextDay() { const d = new Date(calDay); d.setDate(d.getDate() + 1); setCalDay(d) }

  function goPrev() { if (view === 'month') prevMonth(); else if (view === 'week') prevWeek(); else prevDay() }
  function goNext() { if (view === 'month') nextMonth(); else if (view === 'week') nextWeek(); else nextDay() }
  function goToday() {
    if (view === 'month') { setCalYear(today.getFullYear()); setCalMonth(today.getMonth()) }
    else if (view === 'week') setCalWeekStart(getWeekStart(today))
    else setCalDay(new Date(today.getFullYear(), today.getMonth(), today.getDate()))
  }

  const agendaDateLabel = view === 'month'
    ? `${MONTH_NAMES[calMonth]} ${calYear}`
    : view === 'week'
      ? `${calWeekStart.toLocaleDateString('fr-CA', { month: 'short', day: 'numeric' })} — ${new Date(calWeekStart.getFullYear(), calWeekStart.getMonth(), calWeekStart.getDate() + 6).toLocaleDateString('fr-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : calDay.toLocaleDateString('fr-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const pending = tasks.filter(t => !t.completed && t.status !== 'annule').length
  const overdue = tasks.filter(t => !t.completed && t.due_date && new Date(t.due_date) < new Date(new Date().toDateString())).length

  return (
    <div style={{ padding: 24, maxWidth: isAgenda ? '100%' : 1100, margin: isAgenda ? 0 : '0 auto', height: isAgenda ? '100%' : 'auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      {isAgenda ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <button onClick={goPrev} className="btn-secondary" style={{ fontSize: 13 }}>‹ Préc.</button>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>Agenda</h1>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#6B7280', whiteSpace: 'nowrap' }}>{agendaDateLabel}</span>

          <div style={{ display: 'flex', border: '1px solid #D1D5DB', borderRadius: 8, overflow: 'hidden' }}>
            {['month', 'week', 'day'].map(v => (
              <button key={v} onClick={() => setView(v)} style={{ padding: '6px 14px', fontSize: 13, background: view === v ? 'var(--brand)' : '#fff', color: view === v ? '#fff' : '#374151', border: 'none', cursor: 'pointer', fontWeight: view === v ? 600 : 400 }}>
                {v === 'month' ? 'Mois' : v === 'week' ? 'Semaine' : 'Jour'}
              </button>
            ))}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={goNext} className="btn-secondary" style={{ fontSize: 13 }}>Suiv. ›</button>
            <button onClick={goToday} className="btn-secondary" style={{ fontSize: 13 }}>Aujourd'hui</button>
            <button className="btn-primary" onClick={() => pickRdv(dateStr(today))} style={{ fontSize: 13 }}>+ RDV</button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' }}>Tâches</h1>
              <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
                {pending} en cours{overdue > 0 && <span style={{ color: '#DC2626', fontWeight: 600, marginLeft: 8 }}>· {overdue} en retard</span>}
              </div>
            </div>
            <button className="btn-primary" onClick={() => setShowNew(true)} style={{ fontSize: 14 }}>+ Nouvelle tâche</button>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ fontSize: 13, padding: '7px 12px', border: '1px solid #D1D5DB', borderRadius: 6, color: '#374151' }}>
              <option value="">Tous les statuts</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>

            <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ fontSize: 13, padding: '7px 12px', border: '1px solid #D1D5DB', borderRadius: 6, color: '#374151' }}>
              <option value="">Toutes les priorités</option>
              {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
              <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} style={{ accentColor: 'var(--brand)' }} />
              Voir complétées
            </label>
          </div>
        </>
      )}

      <div style={isAgenda ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : undefined}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Chargement...</div>
      ) : (
        <>
          {!isAgenda && (
            <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                    <th style={{ width: 36 }} />
                    <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>Titre</th>
                    <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>Compagnie</th>
                    <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>Assigné</th>
                    <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>Priorité</th>
                    <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>Statut</th>
                    <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>Date prévue</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t => (
                    <TaskRow key={t.id} task={t} onToggle={handleToggle} onSelect={setSelectedTask} />
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: '#9CA3AF', fontSize: 14 }}>Aucune tâche</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {!isAgenda && <CompetencyReportSection />}
          {isAgenda && view === 'month' && <MonthView year={calYear} month={calMonth} googleEvents={googleEvents} onEventClick={openEditGoogleEvent} onDayClick={d => setQuickAddDate(dateStr(d))} today={today} />}
          {isAgenda && view === 'week' && <WeekView weekStart={calWeekStart} googleEvents={googleEvents} onEventClick={openEditGoogleEvent} onDayClick={d => setQuickAddDate(dateStr(d))} today={today} />}
          {isAgenda && view === 'day' && <DayView day={calDay} googleEvents={googleEvents} onEventClick={openEditGoogleEvent} onDayClick={d => setQuickAddDate(dateStr(d))} />}
        </>
      )}
      </div>

      {showNew && (
        <NewTaskModal
          onClose={() => setShowNew(false)}
          onCreated={t => { setTasks(prev => [t, ...prev]); setShowNew(false) }}
        />
      )}

      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          onSelect={setSelectedTask}
        />
      )}

      {quickAddDate && (
        <QuickAddChooser
          date={quickAddDate}
          onClose={() => setQuickAddDate(null)}
          onPickRdv={pickRdv}
          onPickAppel={pickAppel}
        />
      )}

      {editingGoogleEvent && (
        <GoogleEventModal
          data={editingGoogleEvent}
          onClose={() => setEditingGoogleEvent(null)}
          onSaved={() => { setEditingGoogleEvent(null); loadGoogleEvents(); load() }}
        />
      )}
    </div>
  )
}

function QuickAddChooser({ date, onClose, onPickRdv, onPickAppel }) {
  return (
    <div className="modal-overlay">
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 340 }}>
        <h3 className="modal-title">Ajouter le {new Date(date + 'T12:00:00').toLocaleDateString('fr-CA', { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn-secondary" style={{ textAlign: 'left', padding: '10px 14px' }} onClick={onPickRdv}>🧑‍🔧 RDV</button>
          <button className="btn-secondary" style={{ textAlign: 'left', padding: '10px 14px' }} onClick={onPickAppel}>📞 Appel</button>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  )
}

function formatAddress(a) {
  const line2 = a.street_2 ? ` ${a.street_2}` : ''
  return `${a.street_1}${line2}, ${a.city} ${a.province} ${a.postal_code}`
}

function GoogleEventModal({ data, onClose, onSaved }) {
  const isEdit = data.mode === 'edit'
  const [title, setTitle] = useState(data.title || '')
  const [description, setDescription] = useState(data.description || '')
  const [location, setLocation] = useState(data.location || '')
  const [date, setDate] = useState(data.date)
  const [endDate, setEndDate] = useState(data.endDate || data.date)
  const [startTime, setStartTime] = useState(data.startTime)
  const [endTime, setEndTime] = useState(data.endTime)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    setDirty(true)
  }, [title, description, location, date, endDate, startTime, endTime])

  // Si l'evenement etait sur une seule journee (cas le plus courant), deplacer
  // la date de debut deplace aussi la date de fin -- sinon changer juste le
  // debut creerait un evenement multi-jours non voulu. Une fois les deux
  // dates rendues differentes volontairement, ce lien s'arrete.
  function changeDate(newDate) {
    if (date === endDate) setEndDate(newDate)
    setDate(newDate)
  }
  const blocker = useUnsavedChangesGuard(dirty)

  const [companies, setCompanies] = useState([])
  const [contacts, setContacts] = useState([])
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [selectedContact, setSelectedContact] = useState(null)
  const [quickCompanyName, setQuickCompanyName] = useState(null)
  const [quickContactName, setQuickContactName] = useState(null)
  const [companyAddresses, setCompanyAddresses] = useState([])
  const [sendConfirmation, setSendConfirmation] = useState(true)

  // Ticket auto-cree par ce RDV (TASK-015.15) -- en edition, on le retrouve
  // via l'evenement Google Calendar deja lie ; en creation, il n'existe
  // qu'apres le premier "Enregistrer".
  const [ticket, setTicket] = useState(null)
  const [savedEvent, setSavedEvent] = useState(isEdit ? { event_id: data.event_id, calendar_id: data.calendar_id } : null)

  useEffect(() => {
    if (isEdit) return
    api.get('/v1/companies').then(r => setCompanies(r.data))
    api.get('/v1/contacts').then(r => setContacts(r.data))
  }, [isEdit])

  useEffect(() => {
    if (!isEdit) return
    api.get(`/v1/google-calendar/events/${data.event_id}/ticket`, { params: { calendar_id: data.calendar_id } })
      .then(r => setTicket(r.data))
      .catch(() => setTicket(null))
  }, [isEdit, data.event_id, data.calendar_id])

  useEffect(() => {
    if (!selectedCompany) { setCompanyAddresses([]); return }
    api.get(`/v1/companies/${selectedCompany.id}`).then(r => setCompanyAddresses((r.data.addresses || []).filter(a => a.is_active)))
  }, [selectedCompany])

  const companyItems = companies.map(c => ({ id: c.id, label: c.name }))
  const contactItems = contacts
    .filter(c => !selectedCompany || (c.companies || []).some(co => co.company_id === selectedCompany.id))
    .map(c => ({ id: c.id, label: `${c.first_name} ${c.last_name}`.trim(), sub: c.email || '' }))
  const selectedContactCompanyId = selectedContact
    ? contacts.find(c => c.id === selectedContact.id)?.companies?.[0]?.company_id
    : null

  function afterCompanyCreated(company) {
    setCompanies(prev => [...prev, company])
    setQuickCompanyName(null)
    setSelectedCompany({ id: company.id, label: company.name })
  }
  function afterContactCreated(contact) {
    setContacts(prev => [...prev, contact])
    setQuickContactName(null)
    setSelectedContact({ id: contact.id, label: `${contact.first_name} ${contact.last_name}`.trim() })
  }

  async function save() {
    if (!title.trim()) return
    setSaving(true)
    setError('')
    try {
      const start = new Date(`${date}T${startTime}:00`)
      const end = new Date(`${endDate}T${endTime}:00`)
      if (end <= start) {
        setError('La date/heure de fin doit être après le début')
        setSaving(false)
        return
      }
      const startIso = start.toISOString()
      const endIso = end.toISOString()
      if (isEdit) {
        await api.put('/v1/google-calendar/events', { calendar_id: data.calendar_id, event_id: data.event_id, title, description, location, start: startIso, end: endIso })
        setDirty(false)
        onSaved()
      } else {
        const r = await api.post('/v1/google-calendar/events', {
          title, description, location, start: startIso, end: endIso,
          company_id: selectedCompany?.id || null,
          contact_id: selectedContact?.id || null,
          send_confirmation: sendConfirmation,
        })
        setDirty(false)
        setSavedEvent({ event_id: r.data.id, calendar_id: r.data.calendar_id })
        if (r.data.ticket_id) {
          setTicket({ id: r.data.ticket_id, title, company_name: selectedCompany?.label || '' })
        } else {
          // Aucune compagnie/contact -- rien a lier, le RDV est simple et complet.
          onSaved()
        }
      }
    } catch (e) {
      setError(e.response?.data?.detail || 'Erreur lors de l\'enregistrement')
      throw e
    } finally { setSaving(false) }
  }

  async function del() {
    if (!confirm('Supprimer cet événement Google ?')) return
    setDeleting(true)
    try {
      await api.delete('/v1/google-calendar/events', { data: { calendar_id: data.calendar_id, event_id: data.event_id } })
      onSaved()
    } catch (e) {
      setError(e.response?.data?.detail || 'Erreur lors de la suppression')
      setDeleting(false)
    }
  }

  const justCreated = !isEdit && !!savedEvent
  const locked = justCreated // champs verrouilles -- RDV deja enregistre, plus rien a re-sauvegarder ici

  return (
    <>
    <div className="modal-overlay">
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 480 }}>
        <h3 className="modal-title">{isEdit ? 'Modifier' : justCreated ? 'RDV créé ✓' : 'Ajouter'} un événement</h3>
        {error && <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        <div className="form-group"><label>Titre</label><input value={title} onChange={e => setTitle(e.target.value)} autoFocus disabled={locked} style={{ color: '#374151', background: '#fff' }} /></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="form-group" style={{ flex: 1.3 }}><label>Date début</label><input type="date" value={date} onChange={e => changeDate(e.target.value)} disabled={locked} style={{ color: '#374151', background: '#fff' }} /></div>
          <div className="form-group" style={{ flex: 1 }}><label>Heure début</label><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} disabled={locked} style={{ color: '#374151', background: '#fff' }} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="form-group" style={{ flex: 1.3 }}><label>Date fin</label><input type="date" value={endDate} min={date} onChange={e => setEndDate(e.target.value)} disabled={locked} style={{ color: '#374151', background: '#fff' }} /></div>
          <div className="form-group" style={{ flex: 1 }}><label>Heure fin</label><input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} disabled={locked} style={{ color: '#374151', background: '#fff' }} /></div>
        </div>
        {!isEdit && !justCreated && (
          <>
            <Autocomplete label="Compagnie" items={companyItems} value={selectedCompany} onSelect={v => { setSelectedCompany(v); if (!v) setSelectedContact(null) }} onCreate={name => setQuickCompanyName(name)} placeholder="Rechercher une compagnie..." />
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <Autocomplete label="Contact" items={contactItems} value={selectedContact} onSelect={setSelectedContact} onCreate={name => setQuickContactName(name)} placeholder="Rechercher un contact..." openOnFocus={!!selectedCompany} />
              </div>
              {selectedContactCompanyId && (
                <a
                  href={`/companies/${selectedContactCompanyId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Ouvrir la fiche de l'entreprise dans un nouvel onglet"
                  style={{ marginBottom: 10, fontSize: 18, textDecoration: 'none' }}
                >
                  🔗
                </a>
              )}
            </div>
          </>
        )}
        <div className="form-group">
          <label>Lieu (optionnel)</label>
          <input value={location} onChange={e => setLocation(e.target.value)} disabled={locked} style={{ color: '#374151', background: '#fff' }} />
          {!locked && companyAddresses.map(a => (
            <button key={a.id} type="button" onClick={() => setLocation(formatAddress(a))} style={{ marginTop: 6, marginRight: 6, background: 'none', border: '1px solid #D1D5DB', color: 'var(--brand)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>
              📍 Utiliser {a.address_type === 'service' ? "l'adresse de service" : a.address_type === 'billing' ? "l'adresse de facturation" : "cette adresse"} de la compagnie
            </button>
          ))}
        </div>
        <div className="form-group"><label>Description (optionnel)</label><textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} disabled={locked} style={{ color: '#374151', background: '#fff' }} /></div>
        {!isEdit && !justCreated && selectedContact && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151', marginBottom: 12 }}>
            <input type="checkbox" checked={sendConfirmation} onChange={e => setSendConfirmation(e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--brand)' }} />
            Envoyer une confirmation de rendez-vous par courriel au client
          </label>
        )}

        {ticket && (
          <div style={{ borderTop: '1px solid #E5E7EB', margin: '16px 0', paddingTop: 16 }}>
            <a href={`/tickets/${ticket.id}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginBottom: 12, fontSize: 13, color: 'var(--brand)', textDecoration: 'none', background: 'var(--brand)11', padding: '4px 10px', borderRadius: 8 }}>
              🎫 Ticket lié : {ticket.title}
            </a>
            <RdvTasksSection ticketId={ticket.id} ticketTitle={ticket.title} />
          </div>
        )}

        <div className="modal-actions">
          {isEdit && <button onClick={del} disabled={deleting} style={{ marginRight: 'auto', background: 'none', border: '1px solid #FCA5A5', color: '#DC2626', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 14 }}>{deleting ? '...' : 'Supprimer'}</button>}
          {justCreated ? (
            <button className="btn-primary" onClick={onSaved}>Terminé</button>
          ) : (
            <>
              <button className="btn-secondary" onClick={onClose}>Annuler</button>
              <button className="btn-primary" onClick={save} disabled={saving || !title.trim()}>{saving ? '...' : 'Enregistrer'}</button>
            </>
          )}
        </div>
      </div>
    </div>
    {quickCompanyName && (
      <QuickNewCompany initialName={quickCompanyName} onCreated={afterCompanyCreated} onClose={() => setQuickCompanyName(null)} />
    )}
    {quickContactName && (
      <QuickNewContact initialName={quickContactName} companyId={selectedCompany?.id} onCreated={afterContactCreated} onClose={() => setQuickContactName(null)} />
    )}
    {!justCreated && <UnsavedChangesPrompt blocker={blocker} onSave={save} />}
    </>
  )
}

// ── Tâches liées au ticket d'un RDV (TASK-015.15) ────────────────────────────
function RdvTasksSection({ ticketId, ticketTitle }) {
  const [tasks, setTasks] = useState([])
  const [showNewTask, setShowNewTask] = useState(false)

  const load = useCallback(() => {
    api.get('/v1/tasks', { params: { ticket_id: ticketId } }).then(r => setTasks(r.data))
  }, [ticketId])

  useEffect(() => { load() }, [load])

  async function toggleComplete(task) {
    const r = task.completed
      ? await api.put(`/v1/tasks/${task.id}`, { completed: false, status: 'en_cours' })
      : await api.post(`/v1/tasks/${task.id}/complete`)
    setTasks(prev => prev.map(t => t.id === r.data.id ? r.data : t))
  }

  async function unlink(task) {
    await api.put(`/v1/tasks/${task.id}`, { ticket_id: null })
    setTasks(prev => prev.filter(t => t.id !== task.id))
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Tâches</div>
        <button className="btn-secondary" onClick={() => setShowNewTask(true)} style={{ fontSize: 12, padding: '4px 10px', marginLeft: 'auto' }}>+ Tâche</button>
      </div>
      {tasks.length === 0 && (
        <div style={{ color: '#9CA3AF', fontSize: 13, padding: '4px 0 8px' }}>Aucune tâche liée.</div>
      )}
      {tasks.map(t => (
        <div key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 6, border: '1px solid #E5E7EB', marginBottom: 6, background: t.completed ? '#F9FAFB' : '#fff' }}>
          <input type="checkbox" checked={t.completed} onChange={() => toggleComplete(t)} style={{ width: 14, height: 14, accentColor: 'var(--brand)', cursor: 'pointer', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: t.completed ? '#9CA3AF' : '#111827', textDecoration: t.completed ? 'line-through' : 'none' }}>{t.title}</span>
          {t.subtasks?.length > 0 && (
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>{t.subtasks.filter(s => s.completed).length}/{t.subtasks.length}</span>
          )}
          <button onClick={() => unlink(t)} title="Retirer du ticket" style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 15, padding: '0 4px' }}>×</button>
        </div>
      ))}
      {showNewTask && (
        <NewTaskModal
          prefillTicket={{ id: ticketId, label: ticketTitle }}
          onClose={() => setShowNewTask(false)}
          onCreated={() => { setShowNewTask(false); load() }}
        />
      )}
    </div>
  )
}
