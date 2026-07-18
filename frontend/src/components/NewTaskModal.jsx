import { useState, useEffect } from 'react'
import api from '../services/api'
import Autocomplete from './Autocomplete'

const PRIORITIES = [
  { value: 'basse', label: 'Basse' },
  { value: 'normale', label: 'Normale' },
  { value: 'haute', label: 'Haute' },
  { value: 'urgente', label: 'Urgente' },
]
const STATUSES = [
  { value: 'en_cours', label: 'En cours' },
  { value: 'attente_info_client', label: 'En attente info client' },
  { value: 'attente_info_sip', label: 'En attente info SIP' },
  { value: 'complete', label: 'Complété' },
  { value: 'annule', label: 'Annulé' },
]
const REMINDER_DELAYS = [
  { value: 0,     label: 'À l\'heure exacte' },
  { value: 5,     label: '5 minutes avant' },
  { value: 15,    label: '15 minutes avant' },
  { value: 30,    label: '30 minutes avant' },
  { value: 60,    label: '1 heure avant' },
  { value: 1440,  label: '1 jour avant' },
  { value: 10080, label: '1 semaine avant' },
  { value: -1,    label: 'Personnalisé' },
]

export default function NewTaskModal({
  onClose,
  onCreated,
  prefillCompany = null,
  prefillContact = null,
  prefillTicket = null,
  prefillInvoice = null,
  prefillParentTask = null,
  templateId = null,
}) {
  const [companies, setCompanies] = useState([])
  const [contacts, setContacts] = useState([])
  const [users, setUsers] = useState([])
  const [templates, setTemplates] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  const [selectedCompany, setSelectedCompany] = useState(prefillCompany)
  const [selectedContact, setSelectedContact] = useState(prefillContact)
  const [selectedTicket, setSelectedTicket] = useState(prefillTicket)
  const [selectedInvoice, setSelectedInvoice] = useState(prefillInvoice)

  const [form, setForm] = useState({
    title: '',
    description: '',
    due_date: '',
    due_time: '',
    priority: 'normale',
    status: 'en_cours',
    assigned_to_id: '',
    is_template: false,
    template_name: '',
  })
  const [checklist, setChecklist] = useState([])
  const [newCheckItem, setNewCheckItem] = useState('')
  const [reminders, setReminders] = useState([])
  const [saving, setSaving] = useState(false)
  const [chosenTemplate, setChosenTemplate] = useState(templateId ? String(templateId) : '')

  useEffect(() => {
    api.get('/v1/companies').then(r => setCompanies(r.data))
    api.get('/v1/contacts').then(r => setContacts(r.data))
    api.get('/v1/tasks/assignees').then(r => setUsers(r.data))
    api.get('/v1/tasks/templates').then(r => setTemplates(r.data))
  }, [])

  // Handle templateId prop on load
  useEffect(() => {
    if (!templateId || !templates.length) return
    const tpl = templates.find(t => String(t.id) === String(templateId))
    if (tpl) applyTemplate(tpl)
  }, [templateId, templates])

  // Suggestions: filter templates by typed title
  const titleSuggestions = form.title.length > 0
    ? templates.filter(t =>
        (t.template_name || t.title).toLowerCase().includes(form.title.toLowerCase())
      ).slice(0, 8)
    : templates.slice(0, 8)

  function applyTemplate(tpl) {
    setChosenTemplate(String(tpl.id))
    setForm(f => ({
      ...f,
      title: tpl.title,
      description: tpl.description || '',
      due_time: tpl.due_time || '',
      priority: tpl.priority,
      status: 'en_cours',
    }))
    setChecklist(tpl.checklist_items.map(c => ({ label: c.label, completed: false, sort_order: c.sort_order })))
    setReminders(tpl.reminders.map(r => ({ reminder_type: r.reminder_type, minutes_before: r.minutes_before, custom_minutes: r.custom_minutes })))
    setShowSuggestions(false)
  }

  function resetTemplate() {
    setChosenTemplate('')
    setForm(f => ({ ...f, title: '', description: '', due_time: '', priority: 'normale' }))
    setChecklist([])
    setReminders([])
  }

  const companyItems = companies.map(c => ({ id: c.id, label: c.name }))
  const contactItems = contacts
    .filter(c => !selectedCompany || (c.companies || []).some(co => co.company_id === selectedCompany.id))
    .map(c => ({ id: c.id, label: `${c.first_name} ${c.last_name}`.trim(), sub: c.email || '' }))

  function addCheckItem() {
    const t = newCheckItem.trim()
    if (!t) return
    setChecklist(prev => [...prev, { label: t, completed: false, sort_order: prev.length }])
    setNewCheckItem('')
  }

  function removeCheckItem(i) {
    setChecklist(prev => prev.filter((_, idx) => idx !== i))
  }

  function addReminder() {
    setReminders(prev => [...prev, { reminder_type: 'local', minutes_before: 0, custom_minutes: null }])
  }

  function updateReminder(i, field, val) {
    setReminders(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
  }

  function removeReminder(i) {
    setReminders(prev => prev.filter((_, idx) => idx !== i))
  }

  async function save() {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const payload = {
        title: form.title,
        description: form.description || null,
        company_id: selectedCompany?.id || null,
        contact_id: selectedContact?.id || null,
        ticket_id: selectedTicket?.id || null,
        invoice_id: selectedInvoice?.id || null,
        parent_task_id: prefillParentTask?.id || null,
        due_date: form.due_date || null,
        due_time: form.due_time || null,
        priority: form.priority,
        status: form.status,
        assigned_to_id: form.assigned_to_id || null,
        is_template: form.is_template,
        template_name: form.is_template ? form.template_name || null : null,
        reminders,
        checklist_items: checklist,
      }
      let r
      if (chosenTemplate) {
        r = await api.post(`/v1/tasks/from-template/${chosenTemplate}`, payload)
      } else {
        r = await api.post('/v1/tasks', payload)
      }
      onCreated(r.data)
    } finally {
      setSaving(false)
    }
  }

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }))

  const appliedTpl = chosenTemplate ? templates.find(t => String(t.id) === chosenTemplate) : null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 580, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Nouvelle tâche</h3>

        {/* Title field with template search */}
        <div className="form-group">
          <label>Titre *</label>
          <input
            value={form.title}
            onChange={e => {
              set('title', e.target.value)
              setShowSuggestions(true)
              if (chosenTemplate && e.target.value !== (appliedTpl?.title || '')) setChosenTemplate('')
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Titre ou recherche un template..."
            autoFocus
          />

          {/* Applied template indicator */}
          {appliedTpl && (
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#059669' }}>
              <span style={{ background: '#D1FAE5', padding: '2px 8px', borderRadius: 6 }}>
                Template : {appliedTpl.template_name || appliedTpl.title}
              </span>
              <button
                onClick={resetTemplate}
                style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 13, padding: 0 }}
              >
                × Retirer
              </button>
            </div>
          )}

          {/* Template suggestions — inline (not absolute) to avoid overflow clipping */}
          {showSuggestions && !appliedTpl && titleSuggestions.length > 0 && (
            <div style={{
              background: '#fff', border: '1px solid #D1D5DB', borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxHeight: 260, overflowY: 'auto',
              marginTop: 4,
            }}>
              <div style={{ padding: '6px 12px', fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #F3F4F6' }}>
                Templates disponibles
              </div>
              {titleSuggestions.map(tpl => (
                <div
                  key={tpl.id}
                  onMouseDown={() => applyTemplate(tpl)}
                  style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #F9FAFB' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#EEF4FF'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                    {tpl.template_name || tpl.title}
                  </div>
                  {tpl.description && (
                    <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
                      {tpl.description.length > 80 ? tpl.description.slice(0, 80) + '…' : tpl.description}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    {tpl.checklist_items?.length > 0 && (
                      <span style={{ fontSize: 11, color: '#6B7280', background: '#F3F4F6', padding: '1px 7px', borderRadius: 8 }}>
                        {tpl.checklist_items.length} étape{tpl.checklist_items.length > 1 ? 's' : ''}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>{tpl.priority}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Date prévue</label>
            <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Heure prévue</label>
            <input type="time" value={form.due_time} onChange={e => set('due_time', e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Priorité</label>
            <select value={form.priority} onChange={e => set('priority', e.target.value)}>
              {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Statut</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}>
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Assigné à</label>
          <select value={form.assigned_to_id} onChange={e => set('assigned_to_id', e.target.value)}>
            <option value="">— Non assigné —</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        </div>

        <div style={{ borderTop: '1px solid #E5E7EB', margin: '16px 0', paddingTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>Liens</div>
          <Autocomplete label="Compagnie" items={companyItems} value={selectedCompany} onSelect={v => { setSelectedCompany(v); if (!v) setSelectedContact(null) }} placeholder="Rechercher une compagnie..." />
          <Autocomplete label="Contact" items={contactItems} value={selectedContact} onSelect={setSelectedContact} placeholder="Rechercher un contact..." openOnFocus={!!selectedCompany} />
          {prefillTicket && (
            <div className="form-group">
              <label>Ticket</label>
              <div style={{ padding: '8px 12px', background: '#F3F4F6', borderRadius: 6, fontSize: 13, color: '#374151' }}>
                {prefillTicket.label}
              </div>
            </div>
          )}
          {prefillInvoice && (
            <div className="form-group">
              <label>Facture</label>
              <div style={{ padding: '8px 12px', background: '#F3F4F6', borderRadius: 6, fontSize: 13, color: '#374151' }}>
                {prefillInvoice.label}
              </div>
            </div>
          )}
          {prefillParentTask && (
            <div className="form-group">
              <label>Sous-tâche de</label>
              <div style={{ padding: '8px 12px', background: '#F3F4F6', borderRadius: 6, fontSize: 13, color: '#374151' }}>
                {prefillParentTask.label}
              </div>
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px solid #E5E7EB', margin: '16px 0', paddingTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>Checklist</div>
          {checklist.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <input type="checkbox" checked={item.completed} onChange={e => setChecklist(prev => prev.map((c, idx) => idx === i ? { ...c, completed: e.target.checked } : c))} style={{ width: 15, height: 15, accentColor: '#184FA0' }} />
              <span style={{ flex: 1, fontSize: 13, color: item.completed ? '#9CA3AF' : '#374151', textDecoration: item.completed ? 'line-through' : 'none' }}>{item.label}</span>
              <button onClick={() => removeCheckItem(i)} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>×</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input value={newCheckItem} onChange={e => setNewCheckItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCheckItem()} placeholder="Ajouter un élément..." style={{ flex: 1, fontSize: 13, padding: '6px 10px', border: '1px solid #D1D5DB', borderRadius: 6 }} />
            <button onClick={addCheckItem} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 13 }}>+</button>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #E5E7EB', margin: '16px 0', paddingTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Rappels</div>
            <button onClick={addReminder} className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}>+ Ajouter</button>
          </div>
          {reminders.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <select value={r.reminder_type} onChange={e => updateReminder(i, 'reminder_type', e.target.value)} style={{ flex: 1, fontSize: 12, padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 6 }}>
                <option value="local">Local (ERPCRM)</option>
                <option value="email" disabled>Email (bientôt)</option>
                <option value="popup" disabled>Popup (bientôt)</option>
                <option value="sms" disabled>Texto (bientôt)</option>
              </select>
              <select value={r.minutes_before} onChange={e => updateReminder(i, 'minutes_before', parseInt(e.target.value))} style={{ flex: 1, fontSize: 12, padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 6 }}>
                {REMINDER_DELAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              {r.minutes_before === -1 && (
                <input type="number" placeholder="Min" value={r.custom_minutes || ''} onChange={e => updateReminder(i, 'custom_minutes', parseInt(e.target.value) || null)} style={{ width: 70, fontSize: 12, padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 6 }} />
              )}
              <button onClick={() => removeReminder(i)} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 14, marginTop: 4 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151', marginBottom: 12 }}>
            <input type="checkbox" checked={form.is_template} onChange={e => set('is_template', e.target.checked)} style={{ width: 15, height: 15, accentColor: '#184FA0' }} />
            Sauvegarder comme template réutilisable
          </label>
          {form.is_template && (
            <div className="form-group">
              <label>Nom du template</label>
              <input value={form.template_name} onChange={e => set('template_name', e.target.value)} placeholder="Ex: Procédure nouveau client" />
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving || !form.title.trim()}>
            {saving ? '...' : 'Créer la tâche'}
          </button>
        </div>
      </div>
    </div>
  )
}
