// Courriels recus (TASK-047.2, 2026-10-09) et envoyes d'ici (TASK-047.3 : Repondre, Repondre a tous, Transferer,
// Ecrire -- components/MailCompose.jsx) : liste + lecture. Sert a la boite de reception (/mail) et a l'onglet
// Courriels des fiches compagnie et contact. Classement automatique dans la fiche ; « Changer » seulement si ERPCRM
// s'est trompe. Faire un ticket / une tache a partir du courriel.
import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import Autocomplete from './Autocomplete'
import { MailRuleEditor } from './MailRules'
import { openInMain } from '../utils/zekoBridge'
import NewTicketModal from './NewTicketModal'
import NewTaskModal from './NewTaskModal'
import MailCompose from './MailCompose'
import { downloadFile } from '../utils/download'
import { showAlert } from './Dialog'
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

// Corps du courriel isole (aucun script ; les liens s'ouvrent dans un nouvel onglet). Courriel dangereux (TASK-047.9) :
// sandbox complet, aucun lien ne s'ouvre.
function MailBody({ html, text, danger }) {
  const doc = html
    ? `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{font-family:Arial,sans-serif;font-size:14px;color:#111;margin:12px;word-wrap:break-word}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`
    : `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:14px;color:#111;margin:12px;white-space:pre-wrap;word-wrap:break-word}</style></head><body>${(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</body></html>`
  return <iframe title="Courriel" sandbox={danger ? '' : 'allow-popups allow-popups-to-escape-sandbox'} srcDoc={doc}
    style={{ width: '100%', flex: 1, minHeight: 420, border: 'none', background: '#fff' }} />   /* courriel fait pour du blanc : lisible en mode nuit */
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

  const companyItems = companies.map(c => ({ id: c.id, label: c.name, sub: c.account_number, search: [c.legal_name, c.account_number] }))
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

// TASK-047.7 : « Mettre en liste noire » -- l'expediteur et tous ses courriels vont dans « A jeter », ici et dans la
// vraie boite ; efface apres 1 an. Ferme seulement par Annuler / Mettre en liste noire.
function BlockModal({ mail, onClose, onDone }) {
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    setSaving(true); setErr('')
    try {
      const r = await api.put(`/v1/mail/${mail.id}/block`)
      onDone(r.data)
    } catch (e) { setErr(e.response?.data?.detail || 'Erreur') } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 300 }}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Mettre {mail.from_email} en liste noire ?</h3>
        <p style={{ fontSize: 13, color: 'var(--c-text-2)', marginTop: -6 }}>
          Ce courriel, ses autres courriels et les prochains iront directement dans « À jeter », ici et dans la vraie boîte.
          Ils sont effacés après 1 an. Vous pouvez le retirer de la liste en tout temps : ses courriels reviennent.
        </p>
        {err && <div style={{ color: '#DC2626', fontSize: 13 }}>{err}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '...' : 'Mettre en liste noire'}</button>
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

// Expéditeur déjà contact ? (2026-11-02, Philippe : « un check sur les signatures, à savoir s'il est déjà un contact, et
// sinon un bouton pour l'ajouter quand je lis un courriel ») : ✓ et lien vers sa fiche, sinon « + Ajouter ce contact »
// pré-rempli (nom de l'expéditeur, téléphones lus dans sa signature, compagnie du courriel ou de son domaine).
function SenderCheck({ mail, onAdded, navigate }) {
  const [info, setInfo] = useState(null)
  const [open, setOpen] = useState(false)
  useEffect(() => { setInfo(null); api.get(`/v1/mail/${mail.id}/sender`).then(r => setInfo(r.data)).catch(() => setInfo(null)) }, [mail.id, mail.contact_id])
  if (!info || info.own) return null
  if (info.contact) return (
    <span style={{ fontSize: 12, color: 'var(--c-on-green)' }} title="L'expéditeur est déjà un contact">
      ✓ contact : <a href={`/contacts/${info.contact.id}`} onClick={e => { e.preventDefault(); navigate(`/contacts/${info.contact.id}`) }}>{info.contact.name}</a>{info.contact.company ? ` (${info.contact.company})` : ''}
    </span>
  )
  return <>
    <button className="btn-secondary" style={{ padding: '2px 10px', fontSize: 12 }} title="L'expéditeur n'est pas encore un contact" onClick={() => setOpen(true)}>+ Ajouter ce contact</button>
    {open && <AddSenderModal mail={mail} s={info.suggestion} onClose={() => setOpen(false)} onDone={d => { setOpen(false); onAdded(d) }} />}
  </>
}

function AddSenderModal({ mail, s, onClose, onDone }) {
  const [f, setF] = useState({ first_name: s.first_name || '', last_name: s.last_name || '', email: s.email || '', phone: s.phone || '', extension: s.extension || '', mobile: s.mobile || '' })
  const [companies, setCompanies] = useState([])
  const [company, setCompany] = useState(s.company_id ? { id: s.company_id, label: s.company } : null)
  const [dup, setDup] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { api.get('/v1/companies').then(r => setCompanies(r.data)) }, [])
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  async function save(allow) {
    setBusy(true); setErr('')
    try {
      const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, (v || '').trim() || null]))
      const c = (await api.post('/v1/contacts', { ...body, first_name: body.first_name || '', last_name: body.last_name || '', allow_duplicate: !!allow,
        notes_internal: `Ajouté à partir d'un courriel reçu le ${(mail.sent_at || '').slice(0, 10)} (« ${(mail.subject || '').slice(0, 80)} »).` })).data
      if (company) await api.post(`/v1/companies/${company.id}/contacts`, { contact_id: c.id }).catch(() => {})
      const r = await api.put(`/v1/mail/${mail.id}/classify`, { company_id: company?.id || null, contact_id: c.id, remember: true })
      onDone(r.data)
    } catch (e) {
      const d = e.response?.data?.detail
      if (e.response?.status === 409 && d?.matches) setDup(d.matches)
      else setErr(typeof d === 'string' ? d : 'Création impossible')
    } finally { setBusy(false) }
  }
  const row = (label, k, ph) => (
    <div className="form-group" style={{ marginBottom: 8 }}>
      <label className="ifield-label">{label}</label>
      <input value={f[k]} onChange={e => set(k, e.target.value)} placeholder={ph} style={{ width: '100%' }} />
    </div>
  )
  return (
    <div className="modal-overlay" style={{ zIndex: 300 }}>
      <div className="modal-box" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Ajouter l'expéditeur aux contacts</h3>
        <p style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: -6 }}>Pré-rempli avec son nom et les numéros lus dans sa signature : vérifie avant d'enregistrer.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
          {row('Prénom', 'first_name')}{row('Nom', 'last_name')}
          {row('Courriel', 'email')}{row('Cellulaire', 'mobile')}
          {row('Téléphone', 'phone')}{row('Poste', 'extension')}
        </div>
        <Autocomplete label="Compagnie" items={companies.map(c => ({ id: c.id, label: c.name, sub: c.account_number }))} value={company} onSelect={setCompany} placeholder="(aucune)" />
        {dup && (
          <div style={{ fontSize: 13, background: 'var(--c-tint-amber)', color: 'var(--c-on-amber)', borderRadius: 6, padding: 8, marginTop: 8 }}>
            Existe peut-être déjà : {dup.map(m => `${m.nom}${m.courriel ? ' <' + m.courriel + '>' : ''}`).join(' ; ')}.
            <button className="btn-secondary" style={{ fontSize: 12, marginLeft: 8 }} disabled={busy} onClick={() => save(true)}>Créer quand même</button>
          </div>
        )}
        {err && <div style={{ color: '#DC2626', fontSize: 13, marginTop: 8 }}>{err}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" disabled={busy || !(f.first_name.trim() || f.last_name.trim())} onClick={() => save(false)}>{busy ? '…' : 'Ajouter'}</button>
        </div>
      </div>
    </div>
  )
}

// Réponse automatique d'une règle (TASK-006.24) : envoyée, préparée (Envoyer / Ne pas envoyer, adresses modifiables) ou
// pas envoyée (raison ; « Envoyer » la refait, ex. après avoir classé le courriel dans la fiche du client)
function AutoReplyBox({ mail, onDone }) {
  const ar = mail.auto_reply || {}
  const d = ar.brouillon || {}
  const [to, setTo] = useState(d.a || '')
  const [cc, setCc] = useState(d.cc || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function act(action) {
    setBusy(true); setErr('')
    try {
      const body = action === 'envoyer' && d.a ? { action, a: to, cc } : { action }
      const r = await api.post(`/v1/mail/${mail.id}/auto-reply`, body)
      onDone(r.data.auto_reply)
    } catch (e) { setErr(e.response?.data?.detail || 'Erreur') } finally { setBusy(false) }
  }
  const when = ar.le ? new Date(ar.le).toLocaleString('fr-CA') : ''
  const box = { marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 13 }
  if (ar.etat === 'envoyee') return <div style={{ ...box, background: 'var(--c-tint-green)', color: 'var(--c-on-green)' }}>✓ Réponse automatique envoyée le {when} à {d.a}{d.cc ? ` (Cc : ${d.cc})` : ''} — « {d.objet} »</div>
  if (ar.etat === 'annulee') return <div style={{ ...box, background: 'var(--c-surface-3)', color: 'var(--c-muted)' }}>Réponse automatique : {ar.raison || 'pas envoyée'}</div>
  if (ar.etat === 'attente') return <div style={{ ...box, background: 'var(--c-surface-3)', color: 'var(--c-muted)' }}>Réponse automatique en attente (le client du courriel n'est pas encore connu).</div>
  return (
    <div style={{ ...box, background: 'var(--c-tint-amber)', color: 'var(--c-on-amber)' }}>
      <div style={{ fontWeight: 600 }}>{ar.etat === 'preparee' ? 'Réponse automatique prête à envoyer' : `Réponse automatique pas envoyée : ${ar.raison || ''}`}</div>
      {d.a && <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: 4, alignItems: 'center', margin: '6px 0' }}>
        <span>À</span><input value={to} onChange={e => setTo(e.target.value)} style={{ fontSize: 13, padding: '3px 6px' }} />
        <span>Cc</span><input value={cc} onChange={e => setCc(e.target.value)} style={{ fontSize: 13, padding: '3px 6px' }} />
        <span>Objet</span><span>{d.objet}</span>
      </div>}
      {d.html && <div style={{ background: '#fff', color: '#111', borderRadius: 6, padding: 8, margin: '4px 0' }} dangerouslySetInnerHTML={{ __html: d.html }} />}
      {err && <div style={{ color: '#DC2626', marginTop: 4 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button className="btn-primary" style={{ fontSize: 12, padding: '3px 12px' }} disabled={busy} onClick={() => act('envoyer')}>{busy ? '…' : 'Envoyer'}</button>
        <button className="btn-secondary" style={{ fontSize: 12, padding: '3px 12px' }} disabled={busy} onClick={() => act('annuler')}>Ne pas envoyer</button>
      </div>
    </div>
  )
}

function Reader({ id, onChanged, onClose, onOpen, onSent, onMoved, go }) {
  const routerNavigate = useNavigate()
  const navigate = go || routerNavigate     // TASK-047.11 : dans la fenêtre à part, les pages s'ouvrent dans la fenêtre ERPCRM
  const [m, setM] = useState(null)
  const [err, setErr] = useState('')
  const [classify, setClassify] = useState(false)
  const [rule, setRule] = useState(null)            // TASK-006.22 : règle proposée depuis ce courriel
  const [offerRule, setOfferRule] = useState(false) // « Toujours faire ça ? » après un classement à la main
  const [ruleMsg, setRuleMsg] = useState('')
  async function makeRule() { setRuleMsg(''); setOfferRule(false); const x = await api.get(`/v1/mail/rules/suggest/${m.id}`); setRule(x.data) }
  useEffect(() => { setOfferRule(false); setRuleMsg(''); setRule(null) }, [id])
  const [making, setMaking] = useState(null)       // 'ticket' | 'task' | 'rdv'
  const [compose, setCompose] = useState(null)     // 'reply' | 'reply_all' | 'forward'
  const [sentMsg, setSentMsg] = useState('')
  const [askCompany, setAskCompany] = useState(false)   // TASK-047.4 : seulement a l'ouverture du courriel
  const [blocking, setBlocking] = useState(false)       // TASK-047.7
  const [junkMsg, setJunkMsg] = useState('')

  useEffect(() => {
    setM(null); setErr(''); setAskCompany(false); setJunkMsg('')
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

  async function blocked(d) {
    setBlocking(false)
    const fresh = await api.get(`/v1/mail/${m.id}`)
    update(fresh.data)
    setJunkMsg(`${m.from_email} est en liste noire : ${d.moved} courriel${d.moved > 1 ? 's' : ''} dans « À jeter ».`)
    onMoved?.()
  }

  async function unblock() {
    try {
      const r = await api.delete(`/v1/mail/blocklist/${m.junk_block.id}`)
      const fresh = await api.get(`/v1/mail/${m.id}`)
      update(fresh.data)
      setJunkMsg(`« ${m.junk_block.pattern} » retiré de la liste noire : ${r.data.restored} courriel${r.data.restored > 1 ? 's' : ''} remis dans la boîte de réception.`)
      onMoved?.()
    } catch (e) { setJunkMsg(e.response?.data?.detail || 'Erreur') }
  }

  async function setJunk(junk) {            // « Jeter » ce courriel seulement (sans liste noire), ou le remettre
    try {
      await api.put(`/v1/mail/${m.id}/junk`, { junk })
      const fresh = await api.get(`/v1/mail/${m.id}`)
      update(fresh.data)
      setJunkMsg(junk ? 'Courriel mis dans « À jeter » (l\'expéditeur n\'est pas en liste noire).' : 'Courriel remis dans la boîte de réception.')
      onMoved?.()
    } catch (e) { setJunkMsg(e.response?.data?.detail || 'Erreur') }
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
              {m.classified_by === 'regle' && <span style={{ ...chip, marginLeft: 6 }} title="Classé par une règle des courriels (Administration → Zéko → Règles des courriels)">par une règle</span>}
              {m.contact_created && <span style={{ ...chip, marginLeft: 6, background: 'var(--c-tint-green)', color: 'var(--c-on-green)' }}>contact créé à partir de ce courriel</span>}
            </span>
          ) : !m.junk_at && <span style={{ ...chip, background: 'var(--c-tint-amber)', color: 'var(--c-on-amber)' }}>À classer</span>}
          {!m.junk_at && <button className="btn-secondary" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => setClassify(true)}>{company || contact ? 'Changer' : 'Classer'}</button>}
          {!m.junk_at && m.direction !== 'out' && <SenderCheck mail={m} navigate={navigate} onAdded={d => update(d)} />}
          {!m.junk_at && <button className="btn-secondary" style={{ padding: '2px 10px', fontSize: 12 }} title="Règle comme dans Outlook : classer, marquer lu, déplacer les prochains courriels pareils" onClick={makeRule}>⚙ Créer une règle</button>}
          {!m.junk_at && !m.reviewed_at && (m.classified_by === 'zeko' || m.contact_created) && (
            <span style={{ fontSize: 13, background: 'var(--c-tint-amber)', color: 'var(--c-on-amber)', borderRadius: 6, padding: '3px 8px', display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              À vérifier : {m.classified_by === 'zeko' ? 'Zéko l\'a classé ici' : 'contact créé à partir de ce courriel'}
              <a href="#" onClick={async e => { e.preventDefault(); const x = await api.put(`/v1/mail/${m.id}/reviewed`); update(x.data) }}>C'est bon</a>
              <a href="#" onClick={e => { e.preventDefault(); setClassify(true) }}>Changer</a>
              <a href="#" onClick={e => { e.preventDefault(); makeRule() }}>Toujours faire ça ?</a>
            </span>
          )}
          {offerRule && <span style={{ fontSize: 13, background: 'var(--c-tint-blue)', borderRadius: 6, padding: '3px 8px' }}>Toujours faire ça pour les courriels pareils ? <a href="#" onClick={e => { e.preventDefault(); makeRule() }}>Créer une règle</a> · <a href="#" onClick={e => { e.preventDefault(); setOfferRule(false) }}>Non merci</a></span>}
          {ruleMsg && <span style={{ fontSize: 13, color: 'var(--c-on-green)' }}>✓ {ruleMsg}</span>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <button className="btn-primary" onClick={() => setCompose('reply')}>↩ Répondre</button>
          {m.all_to && (m.all_to !== m.reply_to || m.all_cc) && <button className="btn-secondary" onClick={() => setCompose('reply_all')}>↩ Répondre à tous</button>}
          <button className="btn-secondary" onClick={() => setCompose('forward')}>➜ Transférer</button>
          <button className="btn-secondary" onClick={() => setMaking('rdv')}>📅 Créer un RDV</button>
        </div>
        {m.auto_reply && <AutoReplyBox key={m.id} mail={m} onDone={ar => update({ auto_reply: ar, reviewed_at: new Date().toISOString() })} />}
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
          {!m.junk_at && <button className="btn-secondary" title="Ce courriel seulement, dans « À jeter » (effacé après 1 an)" onClick={() => setJunk(true)}>🗑 Jeter</button>}
          {!out && !m.junk_at && <button className="btn-secondary" onClick={() => setBlocking(true)}>🚫 Mettre en liste noire</button>}
        </div>
        {m.junk_at && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 13 }}>
            <span style={{ ...chip, background: 'var(--c-tint-red)', color: 'var(--c-on-red)' }}>
              🗑 À jeter{m.junk_block ? ` — liste noire : ${m.junk_block.pattern}` : ''} · effacé le {new Date(new Date(m.junk_at).getTime() + 365 * 86400000).toLocaleDateString('fr-CA')}
            </span>
            {m.junk_block && <button className="btn-secondary" style={{ padding: '2px 10px', fontSize: 12 }} onClick={unblock}>Retirer de la liste noire</button>}
            {!m.junk_block && <button className="btn-secondary" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => setJunk(false)}>Remettre dans la boîte de réception</button>}
            {m.junk_error && <span style={{ fontSize: 12, color: 'var(--c-on-amber)' }}>Pas encore déplacé dans la vraie boîte : {m.junk_error}</span>}
          </div>
        )}
        {junkMsg && <div style={{ fontSize: 13, marginTop: 8, color: 'var(--c-on-green)' }}>✓ {junkMsg}</div>}
        {m.scan_status === 'danger' && (
          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: '#FEE2E2', color: '#991B1B', fontSize: 13, border: '1px solid #FCA5A5' }}>
            <b>⚠ Courriel dangereux</b> : {m.scan_detail}. Les pièces jointes sont bloquées et les liens ne s'ouvrent pas. Ne répondez pas aux demandes qu'il contient.
          </div>
        )}
        {m.attachments?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {m.attachments.map(a => (
              <button key={a.i} className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px' }} disabled={m.scan_status === 'danger'}
                title={m.scan_status === 'danger' ? 'Bloquée : courriel dangereux' : undefined}
                onClick={() => downloadFile(`/v1/mail/${m.id}/attachments/${a.i}`, a.filename).catch(async e => { let d; try { d = JSON.parse(await e.response.data.text()).detail } catch { d = null } showAlert(d || 'Pièce jointe impossible à ouvrir') })}>{m.scan_status === 'danger' ? '⛔' : '📎'} {a.filename} ({size(a.size)})</button>
            ))}
          </div>
        )}
      </div>
      <MailBody html={m.body_html} text={m.body_text} danger={m.scan_status === 'danger'} />

      {compose && <MailCompose mode={compose} source={m} onClose={() => setCompose(null)} onSent={sent} />}
      {blocking && <BlockModal mail={m} onClose={() => setBlocking(false)} onDone={blocked} />}
      {askCompany && <CompanyAskModal mail={m} onDone={d => { setAskCompany(false); if (d) update({ ...d, company_choices: [] }) }} />}
      {classify && <ClassifyModal mail={m} onClose={() => setClassify(false)}
        onSaved={d => { setClassify(false); update(d); if (d.company_id || d.contact_id) setOfferRule(true) }} />}
      {rule && <MailRuleEditor initial={rule} onClose={() => setRule(null)}
        onSaved={x => { setRule(null); setRuleMsg(`Règle « ${x.name} » créée${x.applied ? ` : ${x.applied.classes} ancien(s) classé(s)` : ''}`) }} />}
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
// TASK-047.11 (Philippe : « un clic = la visualisation rapide ; deux clics, il l'ouvre dans sa propre page avec les mêmes
// options, en grand ; le X de la page l'enlève, ou le X de la fenêtre aussi ») : une seule fenêtre « erpcrm-courriel »,
// un 2e double-clic y remplace le courriel. Même volet de lecture (Reader) : mêmes options, mêmes corrections.
const MAIL_CHANNEL = 'erpcrm-courriels'
export function openMailWindow(id) {
  const w = Math.min(1200, Math.round(window.screen.availWidth * 0.7)), h = Math.round(window.screen.availHeight * 0.9)
  const win = window.open(`/mail/view/${id}`, 'erpcrm-courriel', `popup,width=${w},height=${h}`)
  win?.focus()
}

function post(msg) {
  try { const ch = new BroadcastChannel(MAIL_CHANNEL); ch.postMessage(msg); ch.close() } catch { /* sans BroadcastChannel */ }
}

export function MailWindow({ id }) {
  useEffect(() => {
    document.title = 'Courriel — ERPCRM'
    let t = 'jour'       // même apparence que la fenêtre ERPCRM (TASK-050), comme la fenêtre de Zéko
    try { t = localStorage.getItem('erpcrm_theme') || 'jour' } catch { /* sans stockage */ }
    if (t === 'nuit') document.documentElement.setAttribute('data-theme', 'dark')
  }, [])
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--c-surface)' }}>
      <Reader id={id} go={openInMain} onClose={() => window.close()}
        onChanged={m => post({ type: 'changed', mail: m })} onSent={() => post({ type: 'reload' })} onMoved={() => post({ type: 'reload' })}
        onOpen={other => window.location.replace(`/mail/view/${other}`)} />
    </div>
  )
}

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

  // TASK-047.11 : ce qui est fait dans la fenêtre à part (lu, classé, à jeter, réponse) se voit ici aussi
  useEffect(() => {
    let ch
    try { ch = new BroadcastChannel(MAIL_CHANNEL) } catch { return }
    ch.onmessage = e => { if (e.data?.type === 'changed') changed(e.data.mail); else if (e.data?.type === 'reload') { load(0); onCounts?.() } }
    return () => ch.close()
  }, [load])   // eslint-disable-line

  // Sans aperçu ouvert, l'ouvrir rétrécit la liste : le 2e clic d'un double-clic tomberait à côté de la ligne. On attend
  // donc un instant avant d'ouvrir l'aperçu, le temps de voir si c'est un double-clic (TASK-047.11).
  const clickTimer = useRef()
  function pick(id) {
    clearTimeout(clickTimer.current)
    if (open) setOpen(id)
    else clickTimer.current = setTimeout(() => setOpen(id), 250)
  }

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
            <div key={m.id} onClick={() => pick(m.id)} onDoubleClick={() => { clearTimeout(clickTimer.current); openMailWindow(m.id) }}
              title="Double-clic : ouvrir en grand dans sa propre fenêtre"
              style={{ padding: '9px 12px', borderBottom: '1px solid var(--c-surface-3)', cursor: 'pointer', background: open === m.id ? 'var(--c-tint-blue)' : 'var(--c-surface)',
                       borderLeft: `3px solid ${m.is_read ? 'transparent' : 'var(--brand)'}` }}>
              <div style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                <span style={{ flex: 1, fontWeight: m.is_read ? 400 : 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.direction === 'out' ? <span style={{ color: 'var(--c-muted)' }}>↗ À : {(m.to_addrs || '').replace(/\s*<[^>]+>/g, '')}</span> : (m.from_name || m.from_email)}
                </span>
                <span style={{ color: 'var(--c-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{m.zeko_rdv_pending ? <span title="Zéko a préparé un changement de RDV">🤖 </span> : ''}{m.answered_at ? <span title="Répondu">↩ </span> : ''}{m.scan_status === 'danger' ? <span title={`Courriel dangereux : ${m.scan_detail}`}>⚠ </span> : ''}{m.has_attachments ? '📎 ' : ''}{when(m.sent_at)}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: m.is_read ? 400 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subject || '(sans objet)'}</div>
              <div style={{ fontSize: 12, color: 'var(--c-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.junk_at ? <span style={{ color: 'var(--c-on-red)' }}>À jeter</span> : m.company_name || m.contact_name
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
      {open && <div style={{ flex: 1, minWidth: 0 }}><Reader id={open} onChanged={changed} onClose={() => setOpen(null)} onOpen={setOpen} onSent={() => load(0)}
        onMoved={() => { load(0); onCounts?.() }} /></div>}
      {writing && <MailCompose mode="new" defaults={{ mailbox_id: filter.mailbox_id, company_id: filter.company_id, contact_id: filter.contact_id, ...composeDefaults }}
        onClose={() => setWriting(false)} onSent={r => { setWriting(false); load(0); setOpen(r.id) }} />}
    </div>
  )
}
