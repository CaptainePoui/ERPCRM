import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import NewTaskModal from '../components/NewTaskModal'
import Autocomplete from '../components/Autocomplete'

const PRIORITY_LABELS = { basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente' }
const PRIORITY_COLORS = { basse: '#6B7280', normale: '#2563EB', haute: '#D97706', urgente: '#DC2626' }
const STATUS_LABELS = {
  en_cours: 'En cours',
  attente_info_client: 'Attente client',
  attente_info_sip: 'Attente SIP',
  complete: 'Complété',
  annule: 'Annulé',
}
const STATUS_COLORS = {
  en_cours: '#2563EB',
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
        <input type="checkbox" checked={task.completed} onChange={() => onToggle(task)} style={{ width: 15, height: 15, accentColor: '#184FA0', cursor: 'pointer' }} />
      </td>
      <td style={{ padding: '10px 8px', fontSize: 14, color: task.completed ? '#9CA3AF' : '#111827', textDecoration: task.completed ? 'line-through' : 'none', fontWeight: 500 }}>
        {task.title}
        {task.checklist_items?.length > 0 && (
          <span style={{ marginLeft: 8, fontSize: 11, color: '#9CA3AF' }}>
            {task.checklist_items.filter(c => c.completed).length}/{task.checklist_items.length}
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

function taskDate(t) {
  return t.due_date ? new Date(t.due_date + 'T12:00:00') : null
}

// ── Task Detail Panel ─────────────────────────────────────────────────────────

function TaskDetail({ task, onClose, onUpdated, onDeleted, onSelect }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ title: task.title, description: task.description || '', due_date: task.due_date || '', due_time: task.due_time || '', priority: task.priority, status: task.status })
  const [saving, setSaving] = useState(false)
  const [companies, setCompanies] = useState([])
  const [contacts, setContacts] = useState([])
  const [checklist, setChecklist] = useState([])
  const [newCheckItem, setNewCheckItem] = useState('')
  const [reminders, setReminders] = useState([])
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
    setChecklist(task.checklist_items.map(c => ({ label: c.label, completed: c.completed, sort_order: c.sort_order })))
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

  async function toggleItem(item) {
    const r = await api.patch(`/v1/tasks/${task.id}/checklist/${item.id}`, { completed: !item.completed })
    onUpdated(r.data)
  }

  async function save() {
    setSaving(true)
    try {
      const r = await api.put(`/v1/tasks/${task.id}`, {
        ...form,
        due_date: form.due_date || null,
        due_time: form.due_time || null,
        company_id: selectedCompany?.id || null,
        contact_id: selectedContact?.id || null,
        reminders,
        checklist_items: checklist,
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
    const r = st.completed
      ? await api.put(`/v1/tasks/${st.id}`, { completed: false, status: 'en_cours' })
      : await api.post(`/v1/tasks/${st.id}/complete`)
    const parent = await api.get(`/v1/tasks/${task.id}`)
    onUpdated(parent.data)
  }

  async function openSubtask(stId) {
    const r = await api.get(`/v1/tasks/${stId}`)
    onSelect?.(r.data)
  }

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }))

  function addCheckItem() {
    const t = newCheckItem.trim()
    if (!t) return
    setChecklist(prev => [...prev, { label: t, completed: false, sort_order: prev.length }])
    setNewCheckItem('')
  }

  function updateReminder(i, field, val) {
    setReminders(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
  }

  const companyItems = companies.map(c => ({ id: c.id, label: c.name }))
  const contactItems = contacts
    .filter(c => !selectedCompany || (c.companies || []).some(co => co.company_id === selectedCompany.id))
    .map(c => ({ id: c.id, label: `${c.first_name} ${c.last_name}`.trim(), sub: c.email || '' }))

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
              <Autocomplete label="Contact" items={contactItems} value={selectedContact} onSelect={setSelectedContact} placeholder="Rechercher un contact..." openOnFocus={!!selectedCompany} />
            </div>

            <div style={{ borderTop: '1px solid #E5E7EB', margin: '12px 0', paddingTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Checklist</div>
              {checklist.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <input type="checkbox" checked={item.completed} onChange={e => setChecklist(prev => prev.map((c, idx) => idx === i ? { ...c, completed: e.target.checked } : c))} style={{ width: 15, height: 15, accentColor: '#184FA0' }} />
                  <span style={{ flex: 1, fontSize: 13, color: item.completed ? '#9CA3AF' : '#374151', textDecoration: item.completed ? 'line-through' : 'none' }}>{item.label}</span>
                  <button onClick={() => setChecklist(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>×</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input value={newCheckItem} onChange={e => setNewCheckItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCheckItem()} placeholder="Ajouter un élément..." style={{ flex: 1, fontSize: 13, padding: '6px 10px', border: '1px solid #D1D5DB', borderRadius: 6, color: '#374151', background: '#fff' }} />
                <button onClick={addCheckItem} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 13 }}>+</button>
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

            {task.checklist_items?.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Checklist ({task.checklist_items.filter(c => c.completed).length}/{task.checklist_items.length})
                </div>
                {task.checklist_items.map(item => (
                  <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={item.completed} onChange={() => toggleItem(item)} style={{ width: 15, height: 15, accentColor: '#184FA0' }} />
                    <span style={{ fontSize: 13, color: item.completed ? '#9CA3AF' : '#374151', textDecoration: item.completed ? 'line-through' : 'none' }}>{item.label}</span>
                  </label>
                ))}
              </div>
            )}

            <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Sous-tâches
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
                    style={{ width: 14, height: 14, accentColor: '#184FA0', cursor: 'pointer', flexShrink: 0 }}
                  />
                  <span
                    onClick={() => openSubtask(st.id)}
                    style={{ flex: 1, fontSize: 13, cursor: 'pointer', color: st.completed ? '#9CA3AF' : '#111827', textDecoration: st.completed ? 'line-through' : 'none', fontWeight: 500 }}
                  >
                    {st.title}
                  </span>
                  {st.checklist_items?.length > 0 && (
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                      {st.checklist_items.filter(c => c.completed).length}/{st.checklist_items.length}
                    </span>
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
                        {tpl.checklist_items?.length > 0 && (
                          <span style={{ fontSize: 11, color: '#6B7280' }}>{tpl.checklist_items.length} étape{tpl.checklist_items.length > 1 ? 's' : ''}</span>
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
        <button onClick={del} style={{ fontSize: 13, marginLeft: 'auto', background: 'none', border: '1px solid #FCA5A5', color: '#DC2626', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>Supprimer</button>
      </div>
    </div>
  )
}

// ── Calendar Views ────────────────────────────────────────────────────────────

function MonthView({ year, month, tasks, onSelectTask, today }) {
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfWeek(year, month)
  const days = []
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)
  const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: '#E5E7EB', border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
        {DAYS.map(d => (
          <div key={d} style={{ background: '#F9FAFB', padding: '8px 0', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>{d}</div>
        ))}
        {days.map((d, i) => {
          if (!d) return <div key={`e${i}`} style={{ background: '#F9FAFB', minHeight: 90 }} />
          const date = new Date(year, month, d)
          const isToday = isSameDay(date, today)
          const dayTasks = tasks.filter(t => { const td = taskDate(t); return td && isSameDay(td, date) })
          return (
            <div key={d} style={{ background: '#fff', minHeight: 90, padding: 6, position: 'relative' }}>
              <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 400, color: isToday ? '#fff' : '#374151', background: isToday ? '#184FA0' : 'transparent', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>{d}</div>
              {dayTasks.slice(0, 3).map(t => (
                <div key={t.id} onClick={() => onSelectTask(t)} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, marginBottom: 2, background: STATUS_COLORS[t.status] + '20', color: STATUS_COLORS[t.status], cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontWeight: 500 }}>
                  {t.completed ? '✓ ' : ''}{t.title}
                </div>
              ))}
              {dayTasks.length > 3 && <div style={{ fontSize: 10, color: '#9CA3AF', paddingLeft: 4 }}>+{dayTasks.length - 3}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({ weekStart, tasks, onSelectTask, today }) {
  const days = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    days.push(d)
  }
  const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: '#E5E7EB', border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
      {days.map((d, i) => {
        const isToday = isSameDay(d, today)
        const dayTasks = tasks.filter(t => { const td = taskDate(t); return td && isSameDay(td, d) })
        return (
          <div key={i} style={{ background: '#fff', minHeight: 200 }}>
            <div style={{ padding: '8px 8px 4px', borderBottom: '1px solid #E5E7EB', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>{DAYS[i]}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: isToday ? '#184FA0' : '#111827' }}>{d.getDate()}</div>
            </div>
            <div style={{ padding: 6 }}>
              {dayTasks.map(t => (
                <div key={t.id} onClick={() => onSelectTask(t)} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, marginBottom: 4, background: STATUS_COLORS[t.status] + '20', color: STATUS_COLORS[t.status], cursor: 'pointer', fontWeight: 500, overflow: 'hidden' }}>
                  {t.due_time && <span style={{ fontSize: 10, marginRight: 4 }}>{t.due_time}</span>}
                  {t.completed ? '✓ ' : ''}{t.title}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DayView({ day, tasks, onSelectTask }) {
  const dayTasks = tasks.filter(t => { const td = taskDate(t); return td && isSameDay(td, day) })
  const noDateTasks = tasks.filter(t => !t.due_date)
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 16 }}>
        {day.toLocaleDateString('fr-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </div>
      {dayTasks.length === 0 ? (
        <div style={{ color: '#9CA3AF', fontSize: 14, textAlign: 'center', padding: '40px 0' }}>Aucune tâche ce jour</div>
      ) : (
        dayTasks.map(t => (
          <div key={t.id} onClick={() => onSelectTask(t)} style={{ padding: '12px 16px', borderRadius: 8, border: '1px solid #E5E7EB', marginBottom: 8, cursor: 'pointer', background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {t.due_time && <span style={{ fontSize: 13, color: '#184FA0', fontWeight: 600, minWidth: 50 }}>{t.due_time}</span>}
              <span style={{ fontSize: 14, fontWeight: 600, color: t.completed ? '#9CA3AF' : '#111827', textDecoration: t.completed ? 'line-through' : 'none' }}>{t.title}</span>
              <PriorityBadge value={t.priority} />
            </div>
            {t.company_name && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{t.company_name}</div>}
          </div>
        ))
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
              <input type="checkbox" checked={t.completed} onChange={() => onToggle(t)} onClick={e => e.stopPropagation()} style={{ width: 15, height: 15, accentColor: '#184FA0', cursor: 'pointer' }} />
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
              <input type="checkbox" checked={t.completed} onChange={() => onToggle(t)} onClick={e => e.stopPropagation()} style={{ width: 15, height: 15, accentColor: '#184FA0', cursor: 'pointer' }} />
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

  const pending = tasks.filter(t => !t.completed && t.status !== 'annule').length
  const overdue = tasks.filter(t => !t.completed && t.due_date && new Date(t.due_date) < new Date(new Date().toDateString())).length

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' }}>
            {isAgenda ? 'Agenda' : 'Tâches'}
          </h1>
          <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
            {pending} en cours{overdue > 0 && <span style={{ color: '#DC2626', fontWeight: 600, marginLeft: 8 }}>· {overdue} en retard</span>}
          </div>
        </div>
        <button className="btn-primary" onClick={() => setShowNew(true)} style={{ fontSize: 14 }}>+ Nouvelle tâche</button>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        {isAgenda ? (
          <div style={{ display: 'flex', border: '1px solid #D1D5DB', borderRadius: 8, overflow: 'hidden' }}>
            {['month', 'week', 'day'].map(v => (
              <button key={v} onClick={() => setView(v)} style={{ padding: '7px 16px', fontSize: 13, background: view === v ? '#184FA0' : '#fff', color: view === v ? '#fff' : '#374151', border: 'none', cursor: 'pointer', fontWeight: view === v ? 600 : 400 }}>
                {v === 'month' ? 'Mois' : v === 'week' ? 'Semaine' : 'Jour'}
              </button>
            ))}
          </div>
        ) : null}

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ fontSize: 13, padding: '7px 12px', border: '1px solid #D1D5DB', borderRadius: 6, color: '#374151' }}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>

        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ fontSize: 13, padding: '7px 12px', border: '1px solid #D1D5DB', borderRadius: 6, color: '#374151' }}>
          <option value="">Toutes les priorités</option>
          {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
          <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} style={{ accentColor: '#184FA0' }} />
          Voir complétées
        </label>
      </div>

      {view === 'month' && (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={prevMonth} className="btn-secondary" style={{ fontSize: 13 }}>‹ Préc.</button>
          <span style={{ fontWeight: 700, fontSize: 16, minWidth: 160, textAlign: 'center' }}>{MONTH_NAMES[calMonth]} {calYear}</span>
          <button onClick={nextMonth} className="btn-secondary" style={{ fontSize: 13 }}>Suiv. ›</button>
          <button onClick={() => { setCalYear(today.getFullYear()); setCalMonth(today.getMonth()) }} className="btn-secondary" style={{ fontSize: 13, marginLeft: 8 }}>Aujourd'hui</button>
        </div>
      )}
      {view === 'week' && (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={prevWeek} className="btn-secondary" style={{ fontSize: 13 }}>‹ Préc.</button>
          <span style={{ fontWeight: 700, fontSize: 16, minWidth: 220, textAlign: 'center' }}>
            {calWeekStart.toLocaleDateString('fr-CA', { month: 'short', day: 'numeric' })} — {new Date(calWeekStart.getFullYear(), calWeekStart.getMonth(), calWeekStart.getDate() + 6).toLocaleDateString('fr-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <button onClick={nextWeek} className="btn-secondary" style={{ fontSize: 13 }}>Suiv. ›</button>
          <button onClick={() => setCalWeekStart(getWeekStart(today))} className="btn-secondary" style={{ fontSize: 13, marginLeft: 8 }}>Aujourd'hui</button>
        </div>
      )}
      {view === 'day' && (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={prevDay} className="btn-secondary" style={{ fontSize: 13 }}>‹ Préc.</button>
          <span style={{ fontWeight: 700, fontSize: 16, minWidth: 200, textAlign: 'center' }}>
            {calDay.toLocaleDateString('fr-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
          <button onClick={nextDay} className="btn-secondary" style={{ fontSize: 13 }}>Suiv. ›</button>
          <button onClick={() => setCalDay(new Date(today.getFullYear(), today.getMonth(), today.getDate()))} className="btn-secondary" style={{ fontSize: 13, marginLeft: 8 }}>Aujourd'hui</button>
        </div>
      )}

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
          {view === 'month' && <MonthView year={calYear} month={calMonth} tasks={filtered} onSelectTask={setSelectedTask} today={today} />}
          {view === 'week' && <WeekView weekStart={calWeekStart} tasks={filtered} onSelectTask={setSelectedTask} today={today} />}
          {view === 'day' && <DayView day={calDay} tasks={filtered} onSelectTask={setSelectedTask} />}
        </>
      )}

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
    </div>
  )
}
