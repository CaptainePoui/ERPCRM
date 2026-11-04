import { useState, useEffect } from 'react'
import api from '../services/api'
import Autocomplete from './Autocomplete'
import QuickNewContact from './QuickNewContact'
import QuickNewCompany from './QuickNewCompany'

function CompanyPickerModal({ companies, onPick, onClose }) {
  return (
    <div className="modal-overlay" style={{ zIndex: 300 }}>
      <div className="modal-box" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Choisir la compagnie</h3>
        <p style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 14 }}>Ce contact est lié à plusieurs compagnies :</p>
        {companies.map(c => (
          <button key={c.company_id} onClick={() => onPick(c)}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', marginBottom: 8, border: '1px solid var(--c-border-strong)', borderRadius: 8, background: 'var(--c-surface)', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
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

export default function NewTicketModal({ onClose, onCreated, prefillCompany = null, prefillContact = null, prefillTitle = '', prefillDescription = '' }) {
  const [companies, setCompanies] = useState([])
  const [contacts, setContacts] = useState([])
  const [selectedCompany, setSelectedCompany] = useState(prefillCompany)
  const [selectedContact, setSelectedContact] = useState(prefillContact)
  const [pickerCompanies, setPickerCompanies] = useState(null)
  const [quickContact, setQuickContact] = useState(null)
  const [quickCompany, setQuickCompany] = useState(null)
  const [form, setForm] = useState({ title: prefillTitle, priority: 'normal', description: prefillDescription })
  // Captures d'écran collées (Ctrl+V) ou glissées dans la description (2026-11-03, Philippe : « je ne peux pas copier de
  // capture d'écran dans le ticket ») : jointes au ticket à sa création, gardées dans les Photos de la compagnie (TASK-024.2)
  const [shots, setShots] = useState([])
  const addShots = list => {
    const imgs = Array.from(list || []).filter(f => f && f.type.startsWith('image/'))
    if (imgs.length) setShots(p => [...p, ...imgs.map((f, i) => ({ file: f.name && f.name !== 'image.png' ? f : new File([f], `capture-${Date.now()}-${i}.png`, { type: f.type || 'image/png' }), url: URL.createObjectURL(f) }))])
  }
  useEffect(() => () => shots.forEach(x => URL.revokeObjectURL(x.url)), [])
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

  async function afterContactCreated(contact) {
    // 2026-11-04 (Philippe : « je l'avais pourtant créé avec le ticket… j'avais inscrit la compagnie ») : le contact
    // créé ou choisi (« Utiliser ce contact ») est relié à la compagnie du ticket ; avant, il restait sans compagnie.
    if (selectedCompany && !(contact.companies || []).some(co => co.company_id === selectedCompany.id)) {
      try {
        await api.post(`/v1/companies/${selectedCompany.id}/contacts`, { contact_id: contact.id })
        contact = (await api.get(`/v1/contacts/${contact.id}`)).data
      } catch (e) { if (e.response?.status !== 409) throw e }
    }
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
      if (shots.length) {
        const fd = new FormData()
        fd.append('body', '')
        shots.forEach(x => fd.append('files', x.file))
        await api.post(`/v1/tickets/${r.data.id}/messages`, fd).catch(() => {})
      }
      onCreated(r.data)
    } finally { setSaving(false) }
  }

  return (
    <>
      <div className="modal-overlay">
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
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3}
              onPaste={e => { const f = Array.from(e.clipboardData?.items || []).filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean); if (f.length) { e.preventDefault(); addShots(f) } }}
              onDragOver={e => e.preventDefault()} onDrop={e => { if (e.dataTransfer.files.length) { e.preventDefault(); addShots(e.dataTransfer.files) } }}
              placeholder="Ctrl+V ou glisser pour joindre une capture d'écran" />
            {shots.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                {shots.map((x, i) => (
                  <span key={i} style={{ position: 'relative' }}>
                    <img src={x.url} alt="" style={{ height: 60, borderRadius: 4, border: '1px solid var(--c-border)' }} />
                    <button type="button" title="Retirer" onClick={() => setShots(p => p.filter((_, j) => j !== i))}
                      style={{ position: 'absolute', top: -6, right: -6, borderRadius: 10, border: 'none', background: '#DC2626', color: '#fff', cursor: 'pointer', fontSize: 11, width: 18, height: 18 }}>✕</button>
                  </span>
                ))}
              </div>
            )}
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
        <QuickNewContact initialName={quickContact} companyId={selectedCompany?.id} onCreated={afterContactCreated} onClose={() => setQuickContact(null)} />
      )}
      {quickCompany && (
        <QuickNewCompany initialName={quickCompany} onCreated={afterCompanyCreated} onClose={() => setQuickCompany(null)} />
      )}
    </>
  )
}
