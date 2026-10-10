// Internet et réseau d'un client (TASK-002.3, 2026-10-10) : la compagnie qui fournit l'Internet et celle qui s'occupe
// du réseau, chacune avec son contact préféré. Des liens vers leurs fiches, jamais une copie : téléphone et courriel
// lus en direct. Sur la fiche du fournisseur : les clients qui dépendent de lui (utile lors d'une panne).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import Autocomplete from './Autocomplete'
import QuickNewCompany from './QuickNewCompany'
import QuickNewContact from './QuickNewContact'

const KINDS = [
  { kind: 'internet', icon: '🌐', label: 'Internet', hint: 'Qui fournit sa connexion Internet' },
  { kind: 'network', icon: '🔌', label: 'Réseau', hint: 'Qui s\'occupe de son réseau (routeur, pare-feu)' },
]
const ROLE_LABELS = { internet: 'Internet', network: 'Réseau' }

function Side({ companyId, def, data, companies, loadCompanies, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [company, setCompany] = useState(null)
  const [contactId, setContactId] = useState('')
  const [contacts, setContacts] = useState([])
  const [newCompany, setNewCompany] = useState(null)
  const [newContact, setNewContact] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function loadContacts(cid, keep = '') {
    if (!cid) { setContacts([]); return }
    const r = await api.get(`/v1/companies/${cid}`)
    setContacts(r.data.contacts.filter(c => c.is_active !== false))
    setContactId(keep)
  }

  function start() {
    loadCompanies()
    setError('')
    const c = data?.company
    setCompany(c ? { id: c.id, label: c.name } : null)
    loadContacts(c?.id, data?.contact?.id || '')
    setEditing(true)
  }

  function pickCompany(item) {
    setCompany(item)
    loadContacts(item?.id)
  }

  async function contactCreated(ct) {
    setNewContact(false)
    await api.post(`/v1/companies/${company.id}/contacts`, { contact_id: ct.id })
    loadContacts(company.id, ct.id)
  }

  async function save(clear = false) {
    setSaving(true); setError('')
    try {
      const r = await api.put(`/v1/companies/${companyId}/connectivity`, {
        kind: def.kind, company_id: clear ? null : (company?.id || null), contact_id: clear ? null : (contactId || null),
      })
      onSaved(r.data)
      setEditing(false)
    } catch (e) { setError(e.response?.data?.detail || 'Erreur') } finally { setSaving(false) }
  }

  const box = { background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 10, padding: 16, flex: '1 1 300px', minWidth: 0 }
  const muted = { color: 'var(--c-muted)', fontSize: 13 }
  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{def.icon} {def.label}</div>
          <div style={{ ...muted, fontSize: 12 }}>{def.hint}</div>
        </div>
        {!editing && <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={start}>{data ? 'Modifier' : 'Assigner'}</button>}
      </div>

      {!editing && !data && <div style={{ ...muted, fontStyle: 'italic' }}>Aucune compagnie assignée.</div>}
      {!editing && data && (
        <div style={{ fontSize: 14, lineHeight: 1.6 }}>
          <div><Link to={`/companies/${data.company.id}`} style={{ fontWeight: 600 }}>{data.company.name}</Link>
            {data.company.office_phone && <span style={muted}> · <a href={`tel:${data.company.office_phone}`}>{data.company.office_phone}</a></span>}
          </div>
          {data.contact ? (
            <div style={{ marginTop: 6 }}>
              <div><span style={muted}>Contact préféré : </span><Link to={`/contacts/${data.contact.id}`}>{data.contact.name}</Link></div>
              {data.contact.phone && <div style={muted}>☎ <a href={`tel:${data.contact.phone}`}>{data.contact.phone}</a>{data.contact.extension ? ` poste ${data.contact.extension}` : ''}</div>}
              {data.contact.mobile && <div style={muted}>📱 <a href={`tel:${data.contact.mobile}`}>{data.contact.mobile}</a></div>}
              {data.contact.email && <div style={muted}>✉ <a href={`mailto:${data.contact.email}`}>{data.contact.email}</a></div>}
            </div>
          ) : <div style={{ ...muted, fontStyle: 'italic', marginTop: 6 }}>Aucun contact préféré.</div>}
        </div>
      )}

      {editing && (
        <div>
          {error && <div className="form-error">{error}</div>}
          <Autocomplete label="Compagnie" items={companies} value={company}
            onSelect={pickCompany} onCreate={name => setNewCompany(name)} placeholder="Rechercher une compagnie…" openOnFocus />
          {company && (
            <div className="form-group">
              <label>Contact préféré</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select value={contactId} onChange={e => setContactId(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
                  <option value="">— Aucun —</option>
                  {contacts.map(c => <option key={c.contact_id} value={c.contact_id}>{c.first_name} {c.last_name}</option>)}
                </select>
                <button type="button" className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setNewContact(true)}>+ Nouveau contact</button>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 4 }}>
            {data ? <button className="btn-secondary" style={{ color: '#DC2626' }} disabled={saving}
              onClick={() => { if (confirm(`Retirer ${def.label.toLowerCase()} de cette fiche ?`)) save(true) }}>Retirer</button> : <span />}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-secondary" onClick={() => setEditing(false)} disabled={saving}>Annuler</button>
              <button className="btn-primary" onClick={() => save()} disabled={saving || !company}>{saving ? '...' : 'Enregistrer'}</button>
            </div>
          </div>
        </div>
      )}

      {newCompany !== null && (
        <QuickNewCompany initialName={newCompany} onClose={() => setNewCompany(null)}
          onCreated={c => { setNewCompany(null); loadCompanies(true); pickCompany({ id: c.id, label: c.name }) }} />
      )}
      {newContact && (
        <QuickNewContact companyId={company.id} onClose={() => setNewContact(false)} onCreated={contactCreated} />
      )}
    </div>
  )
}

export default function ConnectivityPanel({ companyId }) {
  const [data, setData] = useState(null)
  const [companies, setCompanies] = useState([])

  useEffect(() => {
    setData(null)
    api.get(`/v1/companies/${companyId}/connectivity`).then(r => setData(r.data))
  }, [companyId])

  function loadCompanies(force = false) {
    if (companies.length && !force) return
    api.get('/v1/companies').then(r => setCompanies(r.data.filter(c => c.is_active).map(c => ({ id: c.id, label: c.name, sub: c.city || undefined }))))
  }

  if (!data) return null
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="ifield-section-title" style={{ marginBottom: 10 }}>Internet et réseau</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {KINDS.map(def => (
          <Side key={def.kind} companyId={companyId} def={def} data={data[def.kind]}
            companies={companies} loadCompanies={loadCompanies} onSaved={setData} />
        ))}
      </div>
      {data.dependents.length > 0 && (
        <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 10, padding: 16, marginTop: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Clients qui dépendent de nous ({data.dependents.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.dependents.map(d => (
              <div key={d.id} style={{ fontSize: 14 }}>
                <Link to={`/companies/${d.id}`} style={{ color: d.is_active ? undefined : 'var(--c-faint)' }}>{d.name}</Link>
                <span style={{ color: 'var(--c-muted)', fontSize: 12 }}> — {d.roles.map(r => ROLE_LABELS[r]).join(', ')}{d.is_active ? '' : ' (inactive)'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
