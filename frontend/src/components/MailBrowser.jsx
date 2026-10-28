// Courriels recus (TASK-047.2, 2026-10-09) et envoyes d'ici (TASK-047.3 : Repondre, Repondre a tous, Transferer,
// Ecrire -- components/MailCompose.jsx) : liste + lecture. Sert a la boite de reception (/mail) et a l'onglet
// Courriels des fiches compagnie et contact. Classement automatique dans la fiche ; « Changer » seulement si ERPCRM
// s'est trompe. Faire un ticket / une tache a partir du courriel.
import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import Autocomplete from './Autocomplete'
import NewTicketModal from './NewTicketModal'
import NewTaskModal from './NewTaskModal'
import MailCompose from './MailCompose'
import { downloadFile } from '../utils/download'
import { GoogleEventModal } from '../pages/Tasks'
import { todayIso } from '../utils/date'

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
    style={{ width: '100%', flex: 1, minHeight: 420, border: 'none', background: 'var(--c-surface)' }} />
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
        : { company_id: company?.id || null, contact_id: contact?.id || null, remember: remember && mail.direction !== 'out', create_contact: !contact && create && mail.direction !== 'out' })
      onSaved(r.data)
    } catch (e) { setErr(e.response?.data?.detail || 'Erreur') } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 300 }}>
      <div className="modal-box" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Classer le courriel</h3>
        <p style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: -6 }}>{mail.direction === 'out' ? `Envoyé à : ${mail.to_addrs}` : `De : ${mail.from_name ? `${mail.from_name} <${mail.from_email}>` : mail.from_email}`}</p>
        <Autocomplete label="Compagnie" items={companyItems} value={company} onSelect={setCompany} placeholder="Rechercher une compagnie..." autoFocus />
        <Autocomplete label="Contact" items={contactItems} value={contact} onSelect={pickContact} placeholder="Rechercher un contact..." openOnFocus={!!company} />
        {contact && mail.direction !== 'out' && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, margin: '6px 0 4px' }}>
            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} style={{ marginTop: 2 }} />
            <span>Retenir {mail.from_email} pour ce contact : ses prochains courriels iront directement dans sa fiche</span>
          </label>
        )}
        {company && !contact && mail.direction !== 'out' && (
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

// TASK-047.4 : contact lie a plusieurs compagnies, ERPCRM n'a pas trouve laquelle -> on demande a la lecture.
// « Me le rappeler plus tard » : redemande seulement au prochain courriel de ce fil (recu ou envoye).
function CompanyAskModal({ mail, onDone }) {
  const [pick, setPick] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save(later) {
    setSaving(true); setErr('')
    try {
      const r = await api.put(`/v1/mail/${mail.id}/company`, later ? { later: true } : { company_id: pick })
      onDone(later ? null : r.data)
    } catch (e) { setErr(e.response?.data?.detail || 'Erreur') } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 300 }}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">À quelle compagnie associer ce courriel ?</h3>
        <p style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: -6 }}>
          {mail.contact_name || mail.from_email} fait partie de plusieurs compagnies et ERPCRM n'a pas trouvé laquelle dans le courriel.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {mail.company_choices.map(c => (
            <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, cursor: 'pointer' }}>
              <input type="radio" name="ask-company" checked={pick === c.id} onChange={() => setPick(c.id)} />
              {c.name}
            </label>
          ))}
        </div>
        {err && <div style={{ color: '#DC2626', fontSize: 13 }}>{err}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => save(true)} disabled={saving}>Me le rappeler plus tard</button>
          <button className="btn-primary" onClick={() => save(false)} disabled={saving || !pick}>{saving ? '...' : 'Associer'}</button>
        </div>
      </div>
    </div>
  )
}

// TASK-026.6 : ce que Zeko a prepare a partir du courriel du client (rien n'est fait sans ce clic)
function ZekoRdvBox({ mail, onDone }) {
  const p = mail.zeko_rdv_proposal
  const [text, setText] = useState(p.text || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const fmt = iso => iso ? new Date(iso).toLocaleString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : ''
  const hm = iso => new Date(iso).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })

  async function act(action) {
    setBusy(true); setErr('')
    try {
      const r = await api.put(`/v1/mail/${mail.id}/zeko-rdv`, { action, text })
      onDone(r.data)
    } catch (e) { setErr(e.response?.data?.detail || 'Erreur') } finally { setBusy(false) }
  }

  const box = { margin: '10px 0 0', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface-2)', fontSize: 13 }
  if (p.status !== 'pending') return (
    <div style={{ ...box, color: 'var(--c-muted)' }}>🤖 Zéko : {p.status === 'applied' ? (p.result || 'fait') : 'proposition ignorée'}</div>
  )
  return (
    <div style={box}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>🤖 Zéko a lu ce courriel</div>
      {p.summary && <div style={{ marginBottom: 6 }}>{p.summary}</div>}
      <div style={{ color: 'var(--c-text-2)', marginBottom: 6 }}>RDV « {p.rdv.title} » : {fmt(p.rdv.start)} – {hm(p.rdv.end)}</div>
      {p.kind === 'move' && <div style={{ marginBottom: 8 }}>Proposition : déplacer au <b>{fmt(p.new_start)} – {hm(p.new_end)}</b> (la plage est libre, 30 min avant et après).</div>}
      {p.kind === 'email' && (
        <>
          <div style={{ marginBottom: 6 }}>
            {p.requested ? <>Le {fmt(p.requested)} n'est pas libre. </> : <>Pas de nouvelle heure précise. </>}
            {p.offer_start ? <>Prochaine plage libre : <b>{fmt(p.offer_start)} – {hm(p.offer_end)}</b>.</> : <>Aucune plage libre trouvée.</>}
            {' '}Courriel préparé pour {p.to} (modifiable) :
          </div>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={9} style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13, padding: 8, borderRadius: 6, border: '1px solid var(--c-border-strong)' }} />
        </>
      )}
      {p.kind === 'email' && <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 4 }}>Le lien « Vous ne voulez plus que Zéko vous réponde ? » est ajouté au bas du courriel.</div>}
      {p.kind === 'suggest' && (
        <div style={{ marginBottom: 8 }}>
          {p.requested ? <>Le {fmt(p.requested)} n'est pas libre. </> : <>Pas de nouvelle heure précise. </>}
          {p.offer_start ? <>Prochaine plage libre : <b>{fmt(p.offer_start)} – {hm(p.offer_end)}</b>.</> : <>Aucune plage libre trouvée.</>}
          <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 4 }}>Zéko n'écrit pas au client : {p.blocked}</div>
        </div>
      )}
      {p.kind === 'info' && <div style={{ marginBottom: 8 }}>Le client annule ce RDV : rien n'est changé dans l'agenda, à toi de décider.</div>}
      {err && <div style={{ color: '#DC2626', marginBottom: 6 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        {p.kind === 'move' && <button className="btn-primary" disabled={busy} onClick={() => act('apply')}>{busy ? '...' : 'Déplacer le RDV'}</button>}
        {p.kind === 'email' && <button className="btn-primary" disabled={busy || !text.trim()} onClick={() => act('apply')}>{busy ? '...' : 'Envoyer au client'}</button>}
        {(p.kind === 'info' || p.kind === 'suggest') && <button className="btn-primary" disabled={busy} onClick={() => act('apply')}>OK</button>}
        <button className="btn-secondary" disabled={busy} onClick={() => act('dismiss')}>Ignorer</button>
      </div>
    </div>
  )
}

function Reader({ id, onChanged, onClose, onOpen, onSent }) {
  const navigate = useNavigate()
  const [m, setM] = useState(null)
  const [err, setErr] = useState('')
  const [classify, setClassify] = useState(false)
  const [making, setMaking] = useState(null)       // 'ticket' | 'task' | 'rdv'
  const [compose, setCompose] = useState(null)     // 'reply' | 'reply_all' | 'forward'
  const [sentMsg, setSentMsg] = useState('')
  const [askCompany, setAskCompany] = useState(false)   // TASK-047.4 : seulement a l'ouverture du courriel

  useEffect(() => {
    setM(null); setErr(''); setAskCompany(false)
    api.get(`/v1/mail/${id}`).then(r => { setM(r.data); onChanged?.({ ...r.data, is_read: true }); setAskCompany(r.data.company_choices?.length > 1) })
      .catch(e => setErr(e.response?.data?.detail || 'Courriel introuvable'))
  }, [id])   // eslint-disable-line

  if (err) return <div style={{ padding: 24, color: '#DC2626' }}>{err}</div>
  if (!m) return <div style={{ padding: 24, color: 'var(--c-muted)' }}>Chargement…</div>

  const update = patch => { const next = { ...m, ...patch }; setM(next); onChanged?.(next) }
  const company = m.company_id ? { id: m.company_id, label: m.company_name } : null
  const contact = m.contact_id ? { id: m.contact_id, label: m.contact_name } : null
  const out = m.direction === 'out'
  const from = (m.from_name && m.from_name !== m.from_email ? `${m.from_name} <${m.from_email}>` : m.from_email) + (out && m.sent_by ? ` — envoyé par ${m.sent_by}` : '')
  const quote = `De : ${from}\nReçu le : ${new Date(m.sent_at || Date.now()).toLocaleString('fr-CA')}\n\n${(m.body_text || '').slice(0, 4000)}`

  // TASK-026.7 : « Creer un RDV » depuis le courriel -- contact, compagnie, sujet et texte du courriel deja places
  function rdvData() {
    const now = new Date()
    const h = Math.min(now.getHours() + 1, 23)
    const hh = String(h).padStart(2, '0')
    return {
      mode: 'create', date: todayIso(), endDate: todayIso(), startTime: `${hh}:00`, endTime: `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${h + 1 > 23 ? '59' : '00'}`,
      title: `RDV - ${(m.subject || '').replace(/^\s*((re|tr|fw|fwd)\s*:\s*)+/i, '').slice(0, 200)}`,
      description: (m.body_text || '').trim().slice(0, 8000), location: '',
      company, contact,
      onTicket: async ticketId => {
        if (m.ticket_id) return
        const r = await api.put(`/v1/mail/${m.id}/link`, { ticket_id: ticketId })
        update({ ...r.data })
      },
    }
  }

  async function linked(kind, obj) {
    setMaking(null)
    const r = await api.put(`/v1/mail/${m.id}/link`, kind === 'ticket' ? { ticket_id: obj.id } : { task_id: obj.id })
    update({ ...r.data })
    const fresh = await api.get(`/v1/mail/${m.id}`)
    update(fresh.data)
  }

  async function sent(r) {
    setCompose(null)
    setSentMsg(r.copy_error ? `Envoyé, mais la copie dans Envoyés de ${r.mailbox} n'a pas pu être faite : ${r.copy_error}` : `Envoyé de ${r.mailbox}.`)
    const fresh = await api.get(`/v1/mail/${m.id}`)
    update(fresh.data)
    onSent?.(r)
  }

  async function toggleRead() {
    const r = await api.put(`/v1/mail/${m.id}/read`, { is_read: !m.is_read })
    update({ is_read: r.data.is_read })
  }

  async function toggleShare() {
    const r = await api.put(`/v1/mail/${m.id}/share`, { shared: !m.shared })
    update({ shared: r.data.shared })
  }

  const chip = { fontSize: 12, padding: '2px 8px', borderRadius: 10, background: 'var(--c-surface-3)', color: 'var(--c-text-2)' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--c-border)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <h2 style={{ fontSize: 18, margin: 0, flex: 1, wordBreak: 'break-word' }}>{m.subject || '(sans objet)'}</h2>
          {onClose && <button className="btn-secondary" onClick={onClose} title="Fermer">✕</button>}
        </div>
        <div style={{ fontSize: 13, color: 'var(--c-text-2)', marginTop: 8 }}><b>{from}</b></div>
        <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 2 }}>
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
              {m.classified_by === 'zeko' && <span style={{ ...chip, marginLeft: 6 }} title="Classé par Zéko : « Changer » si c'est faux">par Zéko</span>}
              {m.contact_created && <span style={{ ...chip, marginLeft: 6, background: 'var(--c-tint-green)', color: 'var(--c-on-green)' }}>contact créé à partir de ce courriel</span>}
            </span>
          ) : <span style={{ ...chip, background: 'var(--c-tint-amber)', color: 'var(--c-on-amber)' }}>À classer</span>}
          <button className="btn-secondary" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => setClassify(true)}>{company || contact ? 'Changer' : 'Classer'}</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <button className="btn-primary" onClick={() => setCompose('reply')}>↩ Répondre</button>
          {m.all_to && (m.all_to !== m.reply_to || m.all_cc) && <button className="btn-secondary" onClick={() => setCompose('reply_all')}>↩ Répondre à tous</button>}
          <button className="btn-secondary" onClick={() => setCompose('forward')}>➜ Transférer</button>
          <button className="btn-secondary" onClick={() => setMaking('rdv')}>📅 Créer un RDV</button>
        </div>
        {m.zeko_rdv_proposal && <ZekoRdvBox key={m.id} mail={m} onDone={pr => update({ zeko_rdv_proposal: pr, zeko_rdv_pending: false })} />}
        {sentMsg && <div style={{ fontSize: 13, marginTop: 8, color: sentMsg.startsWith('Envoyé de') ? 'var(--c-on-green)' : 'var(--c-on-amber)' }}>✓ {sentMsg}</div>}
        {m.copy_error && !sentMsg && <div style={{ fontSize: 12, marginTop: 8, color: 'var(--c-on-amber)' }}>Envoyé, mais pas copié dans Envoyés de {m.mailbox} : {m.copy_error}</div>}
        {m.replies?.length > 0 && (
          <div style={{ fontSize: 12, marginTop: 8, color: 'var(--c-on-green)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {m.replies.map(r => (
              <a key={r.id} href="#" onClick={e => { e.preventDefault(); onOpen?.(r.id) }} style={{ color: 'var(--c-on-green)' }}>
                ↩ Répondu le {new Date(r.sent_at).toLocaleString('fr-CA')}{r.sent_by ? ` par ${r.sent_by}` : ''} à {r.to_addrs}
              </a>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {m.ticket_id
            ? <button className="btn-secondary" onClick={() => navigate(`/tickets/${m.ticket_id}`)}>🎫 Voir le ticket</button>
            : <button className="btn-secondary" onClick={() => setMaking('ticket')}>🎫 Faire un ticket</button>}
          {m.task_id
            ? <button className="btn-secondary" onClick={() => navigate('/tasks')}>✅ Tâche faite</button>
            : <button className="btn-secondary" onClick={() => setMaking('task')}>✅ Faire une tâche</button>}
          {!out && <button className="btn-secondary" onClick={toggleRead}>{m.is_read ? 'Marquer non lu' : 'Marquer lu'}</button>}
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

      {compose && <MailCompose mode={compose} source={m} onClose={() => setCompose(null)} onSent={sent} />}
      {askCompany && <CompanyAskModal mail={m} onDone={d => { setAskCompany(false); if (d) update({ ...d, company_choices: [] }) }} />}
      {classify && <ClassifyModal mail={m} onClose={() => setClassify(false)}
        onSaved={d => { setClassify(false); update(d) }} />}
      {making === 'ticket' && <NewTicketModal prefillCompany={company} prefillContact={contact}
        prefillTitle={(m.subject || '').slice(0, 255)} prefillDescription={quote}
        onClose={() => setMaking(null)} onCreated={t => linked('ticket', t)} />}
      {making === 'rdv' && <GoogleEventModal data={rdvData()} onClose={() => setMaking(null)} onSaved={() => setMaking(null)} />}
      {making === 'task' && <NewTaskModal prefillCompany={company} prefillContact={contact}
        prefillTitle={(m.subject || '').slice(0, 255)} prefillDescription={quote}
        onClose={() => setMaking(null)} onCreated={t => linked('task', t)} />}
    </div>
  )
}

// filter : { mailbox_id, view, company_id, contact_id, direction } ; onCounts : appele quand lu/classe change (compteurs a jour)
// composeDefaults : « Ecrire » depuis une fiche -> { to, company_id, contact_id, mailbox_id } (le courriel envoye y est classe)
export default function MailBrowser({ filter = {}, onCounts, height = 'calc(100vh - 170px)', composeDefaults = {} }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(null)
  const [writing, setWriting] = useState(false)
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
    <div style={{ display: 'flex', border: '1px solid var(--c-border)', borderRadius: 10, background: 'var(--c-surface)', height, minHeight: 480, overflow: 'hidden' }}>
      <div style={{ width: open ? 380 : '100%', minWidth: 300, borderRight: open ? '1px solid var(--c-border)' : 'none', display: 'flex', flexDirection: 'column' }}>
        <form onSubmit={e => { e.preventDefault(); setSearch(q.trim()) }} style={{ padding: 8, borderBottom: '1px solid var(--c-border)', display: 'flex', gap: 6 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher (objet, expéditeur, texte)…" style={{ flex: 1 }} />
          {search && <button type="button" className="btn-secondary" onClick={() => { setQ(''); setSearch('') }}>✕</button>}
          <button type="button" className="btn-primary" style={{ whiteSpace: 'nowrap' }} onClick={() => setWriting(true)}>✉ Écrire</button>
        </form>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {!loading && !items.length && <div style={{ padding: 20, color: 'var(--c-muted)', fontSize: 14 }}>Aucun courriel.</div>}
          {items.map(m => (
            <div key={m.id} onClick={() => setOpen(m.id)}
              style={{ padding: '9px 12px', borderBottom: '1px solid var(--c-surface-3)', cursor: 'pointer', background: open === m.id ? 'var(--c-tint-blue)' : 'var(--c-surface)',
                       borderLeft: `3px solid ${m.is_read ? 'transparent' : 'var(--brand)'}` }}>
              <div style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                <span style={{ flex: 1, fontWeight: m.is_read ? 400 : 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.direction === 'out' ? <span style={{ color: 'var(--c-muted)' }}>↗ À : {(m.to_addrs || '').replace(/\s*<[^>]+>/g, '')}</span> : (m.from_name || m.from_email)}
                </span>
                <span style={{ color: 'var(--c-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{m.zeko_rdv_pending ? <span title="Zéko a préparé un changement de RDV">🤖 </span> : ''}{m.answered_at ? <span title="Répondu">↩ </span> : ''}{m.has_attachments ? '📎 ' : ''}{when(m.sent_at)}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: m.is_read ? 400 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subject || '(sans objet)'}</div>
              <div style={{ fontSize: 12, color: 'var(--c-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.company_name || m.contact_name
                  ? <span style={{ color: 'var(--c-on-green)' }}>{[m.company_name, m.contact_name].filter(Boolean).join(' · ')}</span>
                  : <span style={{ color: 'var(--c-on-amber)' }}>À classer</span>}
                {!filter.mailbox_id && <span> · {m.mailbox.split('@')[0]}@</span>}
                {m.direction === 'out' && m.sent_by && <span> · par {m.sent_by}</span>}
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
      {open && <div style={{ flex: 1, minWidth: 0 }}><Reader id={open} onChanged={changed} onClose={() => setOpen(null)} onOpen={setOpen} onSent={() => load(0)} /></div>}
      {writing && <MailCompose mode="new" defaults={{ mailbox_id: filter.mailbox_id, company_id: filter.company_id, contact_id: filter.contact_id, ...composeDefaults }}
        onClose={() => setWriting(false)} onSent={r => { setWriting(false); load(0); setOpen(r.id) }} />}
    </div>
  )
}
