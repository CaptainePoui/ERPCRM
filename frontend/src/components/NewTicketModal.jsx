import { useState, useEffect } from 'react'
import api from '../services/api'
import Autocomplete from './Autocomplete'
import QuickNewContact from './QuickNewContact'
import QuickNewCompany from './QuickNewCompany'

function CompanyPickerModal({ companies, onPick, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 300 }}>
      <div className="modal-box" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Choisir la compagnie</h3>
        <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 14 }}>Ce contact est lié à plusieurs compagnies :</p>
        {companies.map(c => (
          <button key={c.company_id} onClick={() => onPick(c)}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', marginBottom: 8, border: '1px solid #D1D5DB', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
            {c.company_name}
          </button>
        ))}
        <div className="modal-actions" style={{ marginTop: 8 }}>
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  )
}

export default function NewTicketModal({ onClose, onCreated, prefillCompany = null, prefillContact = null }) {
  const [companies, setCompanies] = useState([])
  const [contacts, setContacts] = useState([])
  const [selectedCompany, setSelectedCompany] = useState(prefillCompany)
  const [selectedContact, setSelectedContact] = useState(prefillContact)
  const [pickerCompanies, setPickerCompanies] = useState(null)
  const [quickContact, setQuickContact] = useState(null)
  const [quickCompany, setQuickCompany] = useState(null)
  const [form, setForm] = useState({ title: '', priority: 'normal', description: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/v1/companies').then(r => setCompanies(r.data))
    api.get('/v1/contacts').then(r => setContacts(r.data))
  }, [])

  const companyItems = companies.map(c => ({ id: c.id, label: c.name }))
  const contactItems = contacts
    .filter(c => !selectedCompany || (c.companies || []).some(co => co.company_id === selectedCompany.id))
    .map(c => ({
      id: c.id,
      label: `${c.first_name} ${c.last_name}`.trim(),
      sub: c.email || c.companies?.[0]?.company_name || '',
      companies: c.companies || [],
    }))

  function handleContactSelect(item) {
    setSelectedContact(item)
    if (!item) return
    if (item.companies.length === 1) {
      setSelectedCompany({ id: item.companies[0].company_id, label: item.companies[0].company_name })
    } else if (item.companies.length > 1) {
      setPickerCompanies(item.companies)
    }
  }

  function handleCompanyPick(c) {
    setSelectedCompany({ id: c.company_id, label: c.company_name })
    setPickerCompanies(null)
  }

  function afterContactCreated(contact) {
    const item = {
      id: contact.id,
      label: `${contact.first_name} ${contact.last_name}`.trim(),
      sub: contact.email || '',
      companies: contact.companies || [],
    }
    setContacts(prev => [...prev, contact])
    setQuickContact(null)
    handleContactSelect(item)
  }

  function afterCompanyCreated(company) {
    const item = { id: company.id, label: company.name }
    setCompanies(prev => [...prev, company])
    setQuickCompany(null)
    setSelectedCompany(item)
  }

  async function save() {
    if (!selectedCompany || !form.title.trim()) return
    setSaving(true)
    try {
      const r = await api.post('/v1/tickets', {
        company_id: selectedCompany.id,
        contact_id: selectedContact?.id || null,
        title: form.title,
        priority: form.priority,
        description: form.description || null,
      })
      onCreated(r.data)
    } finally { setSaving(false) }
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-box" onClick={e => e.stopPropagation()}>
          <h3 className="modal-title">Nouveau ticket</h3>
          <Autocomplete
            label="Compagnie" required
            items={companyItems}
            value={selectedCompany}
            onSelect={setSelectedCompany}
            onCreate={name => setQuickCompany(name)}
            placeholder="Rechercher une compagnie..."
            autoFocus={!prefillCompany && !prefillContact}
          />
          <Autocomplete
            label="Contact"
            items={contactItems}
            value={selectedContact}
            onSelect={handleContactSelect}
            onCreate={name => setQuickContact(name)}
            placeholder="Rechercher un contact..."
            openOnFocus={!!selectedCompany}
          />
          <div className="form-group">
            <label>Titre *</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Titre du ticket"
              autoFocus={!!(prefillCompany || prefillContact)} />
          </div>
          <div className="form-group">
            <label>Priorité</label>
            <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
              <option value="faible">Faible</option>
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
              <option value="critique">Critique</option>
            </select>
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} />
          </div>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>Annuler</button>
            <button className="btn-primary" onClick={save} disabled={saving || !selectedCompany || !form.title.trim()}>
              {saving ? '...' : 'Créer'}
            </button>
          </div>
        </div>
      </div>

      {pickerCompanies && (
        <CompanyPickerModal companies={pickerCompanies} onPick={handleCompanyPick} onClose={() => setPickerCompanies(null)} />
      )}
      {quickContact && (
        <QuickNewContact initialName={quickContact} onCreated={afterContactCreated} onClose={() => setQuickContact(null)} />
      )}
      {quickCompany && (
        <QuickNewCompany initialName={quickCompany} onCreated={afterCompanyCreated} onClose={() => setQuickCompany(null)} />
      )}
    </>
  )
}
