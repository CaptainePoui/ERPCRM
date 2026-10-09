// Courriels recus (TASK-047.2, 2026-10-09) : liste + lecture. Sert a la boite de reception (/mail) et a l'onglet
// Courriels des fiches compagnie et contact. Classement automatique dans la fiche ; « Changer » seulement si ERPCRM
// s'est trompe. Faire un ticket / une tache a partir du courriel.
import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import Autocomplete from './Autocomplete'
import NewTicketModal from './NewTicketModal'
import NewTaskModal from './NewTaskModal'
import { downloadFile } from '../utils/download'

const PAGE = 50

function when(d) {
  if (!d) return ''
  const t = new Date(d), now = new Date()
  if (t.toDateString() === now.toDateString()) return t.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })
  return t.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', ...(t.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
}

function size(n) {
  return n > 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`
}

// Corps du courriel isole (aucun script ; les liens s'ouvrent dans un nouvel onglet)
function MailBody({ html, text }) {
  const doc = html
    ? `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{font-family:Arial,sans-serif;font-size:14px;color:#111;margin:12px;word-wrap:break-word}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`
    : `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:14px;color:#111;margin:12px;white-space:pre-wrap;word-wrap:break-word}</style></head><body>${(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</body></html>`
  return <iframe title="Courriel" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={doc}
    style={{ width: '100%', flex: 1, minHeight: 420, border: 'none', background: '#fff' }} />
}

function ClassifyModal({ mail, onClose, onSaved }) {
  const [companies, setCompanies] = useState([])
  const [contacts, setContacts] = useState([])
  const [company, setCompany] = useState(mail.company_id ? { id: mail.company_id, label: mail.company_name } : null)
  const [contact, setContact] = useState(mail.contact_id ? { id: mail.contact_id, label: mail.contact_name } : null)
  const [remember, setRemember] = useState(true)
  const [create, setCreate] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    api.get('/v1/companies').then(r => setCompanies(r.data))
    api.get('/v1/contacts').then(r => setContacts(r.data))
  }, [])

  const companyItems = companies.map(c => ({ id: c.id, label: c.name }))
  const contactItems = contacts
    .filter(c => !company || (c.companies || []).some(co => co.company_id === company.id))
    .map(c => ({ id: c.id, label: `${c.first_name} ${c.last_name}`.trim(), sub: c.email || c.companies?.[0]?.company_name || '', companies: c.companies || [] }))

  function pickContact(item) {
    setContact(item)
    if (item && !company && item.companies?.length === 1) setCompany({ id: item.companies[0].company_id, label: item.companies[0].company_name })
  }

  async function save(clear) {
    setSaving(true); setErr('')
    try {
      const r = await api.put(`/v1/mail/${mail.id}/classify`, clear ? { company_id: null, contact_id: null, remember: false }
        : { company_id: company?.id || null, contact_id: contact?.id || null, remember, create_contact: !contact && create })
      onSaved(r.data)
    } catch (e) { setErr(e.response?.data?.detail || 'Erreur') } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 300 }}>
      <div className="modal-box" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Classer le courriel</h3>
        <p style={{ fontSize: 13, color: '#6B7280', marginTop: -6 }}>De : {mail.from_name ? `${mail.from_name} <${mail.from_email}>` : mail.from_email}</p>
        <Autocomplete label="Compagnie" items={companyItems} value={company} onSelect={setCompany} placeholder="Rechercher une compagnie..." autoFocus />
        <Autocomplete label="Contact" items={contactItems} value={contact} onSelect={pickContact} placeholder="Rechercher un contact..." openOnFocus={!!company} />
        {contact && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, margin: '6px 0 4px' }}>
            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} style={{ marginTop: 2 }} />
            <span>Retenir {mail.from_email} pour ce contact : ses prochains courriels iront directement dans sa fiche</span>
          </label>
        )}
        {company && !contact && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, margin: '6px 0 4px' }}>
            <input type="checkbox" checked={create} onChange={e => setCreate(e.target.checked)} style={{ marginTop: 2 }} />
            <span>Créer le contact « {mail.from_name || mail.from_email} » ({mail.from_email}) dans cette compagnie : ses prochains courriels iront directement dans sa fiche (téléphone et titre lus dans sa signature)</span>
          </label>
        )}
        {err && <div style={{ color: '#DC2626', fontSize: 13, marginTop: 8 }}>{err}</div>}
        <div className="modal-actions">
          {(mail.company_id || mail.contact_id) && <button className="btn-secondary" style={{ marginRight: 'auto' }} onClick={() => save(true)} disabled={saving}>Remettre « À classer »</button>}
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={() => save(false)} disabled={saving || (!company && !contact)}>{saving ? '...' : 'Classer'}</button>
        </div>
      </div>
    </div>
  )
}

function Reader({ id, onChanged, onClose }) {
  const navigate = useNavigate()
  const [m, setM] = useState(null)
  const [err, setErr] = useState('')
  const [classify, setClassify] = useState(false)
  const [making, setMaking] = useState(null)       // 'ticket' | 'task'

  useEffect(() => {
    setM(null); setErr('')
    api.get(`/v1/mail/${id}`).then(r => { setM(r.data); onChanged?.({ ...r.data, is_read: true }) })
      .catch(e => setErr(e.response?.data?.detail || 'Courriel introuvable'))
  }, [id])   // eslint-disable-line

  if (err) return <div style={{ padding: 24, color: '#DC2626' }}>{err}</div>
  if (!m) return <div style={{ padding: 24, color: '#6B7280' }}>Chargement…</div>

  const update = patch => { const next = { ...m, ...patch }; setM(next); onChanged?.(next) }
  const company = m.company_id ? { id: m.company_id, label: m.company_name } : null
  const contact = m.contact_id ? { id: m.contact_id, label: m.contact_name } : null
  const from = m.from_name ? `${m.from_name} <${m.from_email}>` : m.from_email
  const quote = `De : ${from}\nReçu le : ${new Date(m.sent_at || Date.now()).toLocaleString('fr-CA')}\n\n${(m.body_text || '').slice(0, 4000)}`

  async function linked(kind, obj) {
    setMaking(null)
    const r = await api.put(`/v1/mail/${m.id}/link`, kind === 'ticket' ? { ticket_id: obj.id } : { task_id: obj.id })
    update({ ...r.data })
    const fresh = await api.get(`/v1/mail/${m.id}`)
    update(fresh.data)
  }

  async function toggleRead() {
    const r = await api.put(`/v1/mail/${m.id}/read`, { is_read: !m.is_read })
    update({ is_read: r.data.is_read })
  }

  async function toggleShare() {
    const r = await api.put(`/v1/mail/${m.id}/share`, { shared: !m.shared })
    update({ shared: r.data.shared })
  }

  const chip = { fontSize: 12, padding: '2px 8px', borderRadius: 10, background: '#F3F4F6', color: '#374151' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #E5E7EB' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <h2 style={{ fontSize: 18, margin: 0, flex: 1, wordBreak: 'break-word' }}>{m.subject || '(sans objet)'}</h2>
          {onClose && <button className="btn-secondary" onClick={onClose} title="Fermer">✕</button>}
        </div>
        <div style={{ fontSize: 13, color: '#374151', marginTop: 8 }}><b>{from}</b></div>
        <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
          À : {m.to_addrs || m.mailbox}{m.cc_addrs ? ` · Cc : ${m.cc_addrs}` : ''} · {m.sent_at ? new Date(m.sent_at).toLocaleString('fr-CA') : ''}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 10, fontSize: 13 }}>
          <span style={chip}>{m.mailbox}{m.personal ? ' · personnelle' : ''}</span>
          {company || contact ? (
            <span>
              Classé dans :{' '}
              {company && <a href={`/companies/${company.id}`} onClick={e => { e.preventDefault(); navigate(`/companies/${company.id}`) }}>{company.label}</a>}
              {company && contact && ' · '}
              {contact && <a href={`/contacts/${contact.id}`} onClick={e => { e.preventDefault(); navigate(`/contacts/${contact.id}`) }}>{contact.label}</a>}
              {m.contact_created && <span style={{ ...chip, marginLeft: 6, background: '#ECFDF5', color: '#047857' }}>contact créé à partir de ce courriel</span>}
            </span>
          ) : <span style={{ ...chip, background: '#FEF3C7', color: '#92400E' }}>À classer</span>}
          <button className="btn-secondary" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => setClassify(true)}>{company || contact ? 'Changer' : 'Classer'}</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {m.ticket_id
            ? <button className="btn-secondary" onClick={() => navigate(`/tickets/${m.ticket_id}`)}>🎫 Voir le ticket</button>
            : <button className="btn-primary" onClick={() => setMaking('ticket')}>🎫 Faire un ticket</button>}
          {m.task_id
            ? <button className="btn-secondary" onClick={() => navigate('/tasks')}>✅ Tâche faite</button>
            : <button className="btn-secondary" onClick={() => setMaking('task')}>✅ Faire une tâche</button>}
          <button className="btn-secondary" onClick={toggleRead}>{m.is_read ? 'Marquer non lu' : 'Marquer lu'}</button>
          {m.can_share && <button className="btn-secondary" onClick={toggleShare}>{m.shared ? '🔒 Ne plus partager' : '👥 Partager avec l\'équipe'}</button>}
        </div>
        {m.attachments?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {m.attachments.map(a => (
              <button key={a.i} className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px' }}
                onClick={() => downloadFile(`/v1/mail/${m.id}/attachments/${a.i}`, a.filename)}>📎 {a.filename} ({size(a.size)})</button>
            ))}
          </div>
        )}
      </div>
      <MailBody html={m.body_html} text={m.body_text} />

      {classify && <ClassifyModal mail={m} onClose={() => setClassify(false)}
        onSaved={d => { setClassify(false); update(d) }} />}
      {making === 'ticket' && <NewTicketModal prefillCompany={company} prefillContact={contact}
        prefillTitle={(m.subject || '').slice(0, 255)} prefillDescription={quote}
        onClose={() => setMaking(null)} onCreated={t => linked('ticket', t)} />}
      {making === 'task' && <NewTaskModal prefillCompany={company} prefillContact={contact}
        prefillTitle={(m.subject || '').slice(0, 255)} prefillDescription={quote}
        onClose={() => setMaking(null)} onCreated={t => linked('task', t)} />}
    </div>
  )
}

// filter : { mailbox_id, view, company_id, contact_id } ; onCounts : appele quand lu/classe change (compteurs a jour)
export default function MailBrowser({ filter = {}, onCounts, height = 'calc(100vh - 170px)' }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(null)
  const key = JSON.stringify(filter)

  const load = useCallback(async (offset = 0) => {
    setLoading(true)
    const params = { limit: PAGE, offset, ...Object.fromEntries(Object.entries(filter).filter(([, v]) => v)), ...(search ? { q: search } : {}) }
    try {
      const r = await api.get('/v1/mail', { params })
      setItems(prev => offset ? [...prev, ...r.data.items] : r.data.items)
      setTotal(r.data.total)
    } finally { setLoading(false) }
  }, [key, search])   // eslint-disable-line

  useEffect(() => { setOpen(null); load(0) }, [load])

  function changed(m) {
    setItems(prev => prev.map(x => x.id === m.id ? { ...x, ...Object.fromEntries(Object.entries(m).filter(([k]) => k in x)) } : x))
    onCounts?.()
  }

  return (
    <div style={{ display: 'flex', border: '1px solid #E5E7EB', borderRadius: 10, background: '#fff', height, minHeight: 480, overflow: 'hidden' }}>
      <div style={{ width: open ? 380 : '100%', minWidth: 300, borderRight: open ? '1px solid #E5E7EB' : 'none', display: 'flex', flexDirection: 'column' }}>
        <form onSubmit={e => { e.preventDefault(); setSearch(q.trim()) }} style={{ padding: 8, borderBottom: '1px solid #E5E7EB', display: 'flex', gap: 6 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher (objet, expéditeur, texte)…" style={{ flex: 1 }} />
          {search && <button type="button" className="btn-secondary" onClick={() => { setQ(''); setSearch('') }}>✕</button>}
        </form>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {!loading && !items.length && <div style={{ padding: 20, color: '#6B7280', fontSize: 14 }}>Aucun courriel.</div>}
          {items.map(m => (
            <div key={m.id} onClick={() => setOpen(m.id)}
              style={{ padding: '9px 12px', borderBottom: '1px solid #F3F4F6', cursor: 'pointer', background: open === m.id ? '#EFF6FF' : '#fff',
                       borderLeft: `3px solid ${m.is_read ? 'transparent' : 'var(--brand)'}` }}>
              <div style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                <span style={{ flex: 1, fontWeight: m.is_read ? 400 : 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.from_name || m.from_email}</span>
                <span style={{ color: '#6B7280', fontSize: 12, whiteSpace: 'nowrap' }}>{m.has_attachments ? '📎 ' : ''}{when(m.sent_at)}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: m.is_read ? 400 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subject || '(sans objet)'}</div>
              <div style={{ fontSize: 12, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.company_name || m.contact_name
                  ? <span style={{ color: '#047857' }}>{[m.company_name, m.contact_name].filter(Boolean).join(' · ')}</span>
                  : <span style={{ color: '#92400E' }}>À classer</span>}
                {!filter.mailbox_id && <span> · {m.mailbox.split('@')[0]}@</span>}
                {m.ticket_id && ' · 🎫'}{m.task_id && ' · ✅'}
              </div>
            </div>
          ))}
          {items.length < total && (
            <div style={{ padding: 10, textAlign: 'center' }}>
              <button className="btn-secondary" onClick={() => load(items.length)} disabled={loading}>{loading ? '…' : `Afficher plus (${total - items.length})`}</button>
            </div>
          )}
        </div>
      </div>
      {open && <div style={{ flex: 1, minWidth: 0 }}><Reader id={open} onChanged={changed} onClose={() => setOpen(null)} /></div>}
    </div>
  )
}
