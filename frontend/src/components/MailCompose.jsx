// Repondre / ecrire depuis ERPCRM (TASK-047.3, 2026-10-09) : le courriel part de la boite choisie (celle ou le
// courriel est arrive, par defaut), avec la signature de l'employe et le courriel d'origine cite dessous ; une copie
// va dans Envoyes de la boite (Outlook et cellulaire la voient) et dans la fiche du client.
import { useEffect, useRef, useState } from 'react'
import api from '../services/api'
import SignatureEditor from './SignatureEditor'
import { askConfirm } from './Dialog'

const TITLES = { new: 'Nouveau courriel', reply: 'Répondre', reply_all: 'Répondre à tous', forward: 'Transférer' }
const MAX_TOTAL = 20 * 1024 * 1024

function size(n) {
  return n > 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`
}

function subjectFor(mode, subject) {
  const base = (subject || '').replace(/^\s*((re|tr|fwd?|réf)\s*:\s*)+/i, '').trim()
  return mode === 'forward' ? `TR: ${base}` : (mode === 'reply' || mode === 'reply_all') ? `RE: ${base}` : (subject || '')
}

// mode : new | reply | reply_all | forward ; source : courriel ouvert (lecture) ; defaults : { to, mailbox_id, company_id, contact_id }
// Champ À / Cc avec les contacts de la compagnie (2026-11-01, Philippe : « je veux que les noms des contacts
// apparaissent quand je clique sur le courriel à envoyer ») : la liste s'ouvre au clic, se filtre sur ce qu'on tape
// après la dernière virgule ; un choix ajoute « Nom <adresse> ». Échap ou clic ailleurs : la liste se ferme.
export function RecipientInput({ value, onChange, options, style, autoFocus, placeholder }) {
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const boxRef = useRef()
  useEffect(() => {
    if (!open) return
    const close = e => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const parts = value.split(',')
  const typed = parts[parts.length - 1].trim().toLowerCase()
  const already = value.toLowerCase()
  // Dès la première lettre : tous les contacts d'ERPCRM aussi (2026-11-02, Philippe : « je veux mettre un Cc mais je n'ai
  // pas d'aide de recherche... dès les premières lettres du nom de contact ou du courriel ») ; la compagnie d'abord
  const [found, setFound] = useState([])
  useEffect(() => {
    if (!typed) { setFound([]); return }
    const t = setTimeout(() => api.get('/v1/mail/address-book', { params: { q: typed } }).then(r => setFound(r.data)).catch(() => setFound([])), 200)
    return () => clearTimeout(t)
  }, [typed])
  const mine = (options || []).filter(o => !already.includes(o.email.toLowerCase())
    && (!typed || o.name.toLowerCase().includes(typed) || o.email.toLowerCase().includes(typed)))
  const list = [...mine, ...found.filter(o => !already.includes(o.email.toLowerCase()) && !mine.some(m => m.email.toLowerCase() === o.email.toLowerCase()))]
  function pick(o) {
    const keep = parts.slice(0, -1).map(x => x.trim()).filter(Boolean)
    onChange([...keep, o.name && o.name !== o.email ? `${o.name} <${o.email}>` : o.email].join(', ') + ', ')
    setHi(0)
  }
  return (
    <div ref={boxRef} style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex' }}>
      <input value={value} onChange={e => { onChange(e.target.value); setOpen(true); setHi(0) }} onClick={() => setOpen(true)} onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (!open || !list.length) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, list.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); pick(list[hi]) }
          else if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) }
        }}
        placeholder={placeholder} style={style} autoFocus={autoFocus} />
      {open && list.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 2, maxHeight: 260, overflowY: 'auto',
                      background: 'var(--c-surface)', border: '1px solid var(--c-border-strong)', borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,.25)' }}>
          {list.map((o, i) => (
            <div key={o.email} onMouseDown={e => { e.preventDefault(); pick(o) }} onMouseEnter={() => setHi(i)}
              style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 13, background: i === hi ? 'var(--c-tint-blue)' : undefined }}>
              <span style={{ fontWeight: 600 }}>{o.name}</span> <span style={{ color: 'var(--c-muted)' }}>&lt;{o.email}&gt;</span>
              {o.note && <span style={{ color: 'var(--c-faint)', fontSize: 12 }}> · {o.note}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MailCompose({ mode = 'new', source, defaults = {}, onClose, onSent }) {
  const fileRef = useRef()
  const [boxes, setBoxes] = useState(null)
  const [hasSig, setHasSig] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState(mode === 'reply' ? source?.reply_to || '' : mode === 'reply_all' ? source?.all_to || '' : defaults.to || '')
  const [cc, setCc] = useState(mode === 'reply_all' ? source?.all_cc || '' : '')
  const [showCc, setShowCc] = useState(mode === 'reply_all' && !!source?.all_cc)
  const [subject, setSubject] = useState(source ? subjectFor(mode, source.subject) : '')
  const [html, setHtml] = useState('')
  const [withSig, setWithSig] = useState(true)
  const [files, setFiles] = useState([])
  const [fwd, setFwd] = useState(mode === 'forward' ? (source?.attachments || []).map(a => a.i) : [])
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')

  const [recipients, setRecipients] = useState([])
  useEffect(() => {
    const cid = defaults.company_id || source?.company_id      // écrire depuis la fiche, ou répondre à un courriel classé
    if (cid) api.get(`/v1/companies/${cid}/email-recipients`).then(r => setRecipients(r.data)).catch(() => setRecipients([]))
  }, [defaults.company_id, source?.company_id])
  useEffect(() => {
    api.get('/v1/mail/senders').then(r => {
      const list = r.data.boxes
      setBoxes(list); setHasSig(r.data.has_signature)
      const pick = list.find(b => b.id === source?.mailbox_id) || list.find(b => b.id === defaults.mailbox_id)
        || list.find(b => b.personal) || list[0]
      setFrom(pick?.id || '')
    })
  }, [])   // eslint-disable-line

  const fwdList = mode === 'forward' ? (source?.attachments || []) : []
  const total = files.reduce((n, f) => n + f.size, 0) + fwdList.filter(a => fwd.includes(a.i)).reduce((n, a) => n + a.size, 0)
  const dirty = !!(html.replace(/<[^>]+>/g, '').trim() || files.length || (mode === 'new' && (to.trim() || subject.trim())))
  const originBox = source && boxes && !boxes.some(b => b.id === source.mailbox_id) ? source.mailbox : null

  async function cancel() {
    if (dirty && !await askConfirm('Abandonner ce courriel ? Ce que vous avez écrit sera perdu.')) return
    onClose()
  }

  async function send() {
    setErr('')
    if (!from) return setErr('Choisissez la boîte d’envoi')
    if (!to.trim()) return setErr('Indiquez au moins un destinataire')
    if (total > MAX_TOTAL) return setErr('Pièces jointes trop lourdes (20 Mo au total)')
    if (!subject.trim() && !await askConfirm('Envoyer sans objet ?')) return
    setSending(true)
    const fd = new FormData()
    fd.append('data', JSON.stringify({
      mailbox_id: from, to, cc: showCc ? cc : '', subject, html, mode, source_id: source?.id || null,
      forward_attachments: fwd, with_signature: hasSig && withSig,
      company_id: defaults.company_id || null, contact_id: defaults.contact_id || null,
    }))
    files.forEach(f => fd.append('files', f))
    try {
      const r = await api.post('/v1/mail/send', fd)
      onSent?.(r.data)
    } catch (e) {
      setErr(e.response?.data?.detail || 'Envoi impossible')
      setSending(false)
    }
  }

  const row = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }
  const lab = { width: 46, fontSize: 13, color: 'var(--c-muted)', flexShrink: 0 }
  const inp = { flex: 1, minWidth: 0, fontSize: 14, padding: '7px 10px', border: '1.5px solid var(--c-border-strong)', borderRadius: 6 }
  return (
    <div className="modal-overlay" style={{ zIndex: 300 }}>
      <div className="modal-box" style={{ maxWidth: 820, width: '96vw', maxHeight: '94vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">{TITLES[mode]}</h3>
        {boxes && !boxes.length && <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 8 }}>Aucune boîte d’où vous pouvez envoyer.</div>}
        <div style={row}>
          <span style={lab}>De</span>
          <select value={from} onChange={e => setFrom(e.target.value)} style={{ flex: 1 }}>
            {(boxes || []).map(b => <option key={b.id} value={b.id}>{b.name && b.name !== b.email ? `${b.name} <${b.email}>` : b.email}{b.personal ? ' (personnelle)' : ''}</option>)}
          </select>
        </div>
        {originBox && <div style={{ fontSize: 12, color: 'var(--c-on-amber)', margin: '-4px 0 8px 54px' }}>Ce courriel est arrivé dans {originBox}, d’où vous ne pouvez pas envoyer : choisissez une autre boîte.</div>}
        <div style={row}>
          <span style={lab}>À</span>
          <RecipientInput value={to} onChange={setTo} options={recipients} placeholder="adresse@exemple.com, Nom <autre@exemple.com>" style={inp} autoFocus={mode === 'new' || mode === 'forward'} />
          {!showCc && <button type="button" className="btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setShowCc(true)}>Cc</button>}
        </div>
        {showCc && (
          <div style={row}>
            <span style={lab}>Cc</span>
            <RecipientInput value={cc} onChange={setCc} options={recipients} style={inp} />
          </div>
        )}
        <div style={row}>
          <span style={lab}>Objet</span>
          <input value={subject} onChange={e => setSubject(e.target.value)} style={inp} />
        </div>
        <SignatureEditor value={html} onChange={setHtml} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 8 }}>
          <button type="button" className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => fileRef.current.click()}>📎 Joindre un fichier</button>
          <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
            onChange={e => { setFiles(prev => [...prev, ...e.target.files]); fileRef.current.value = '' }} />
          {files.map((f, i) => (
            <span key={i} style={{ fontSize: 12, padding: '3px 8px', background: 'var(--c-surface-3)', borderRadius: 6 }}>
              📎 {f.name} ({size(f.size)}) <a href="#" onClick={e => { e.preventDefault(); setFiles(prev => prev.filter((_, j) => j !== i)) }} title="Retirer">✕</a>
            </span>
          ))}
          {fwdList.map(a => (
            <label key={a.i} style={{ fontSize: 12, padding: '3px 8px', background: 'var(--c-surface-3)', borderRadius: 6, display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <input type="checkbox" checked={fwd.includes(a.i)} onChange={e => setFwd(prev => e.target.checked ? [...prev, a.i] : prev.filter(x => x !== a.i))} />
              {a.filename} ({size(a.size)})
            </label>
          ))}
          {total > MAX_TOTAL && <span style={{ fontSize: 12, color: '#DC2626' }}>Plus de 20 Mo : retirez une pièce jointe.</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {hasSig
            ? <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={withSig} onChange={e => setWithSig(e.target.checked)} /> Ajouter ma signature</label>
            : <span>Vous n’avez pas encore de signature (Employés → ✉ Courriels et signature).</span>}
          {source && mode !== 'new' && <span>Le courriel d’origine de {source.from_name || source.from_email} sera ajouté sous votre message, comme dans Outlook.</span>}
        </div>
        {err && <div style={{ color: '#DC2626', fontSize: 13, marginTop: 8 }}>{err}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={cancel} disabled={sending}>Annuler</button>
          <button className="btn-primary" onClick={send} disabled={sending || !boxes?.length}>{sending ? 'Envoi…' : '➤ Envoyer'}</button>
        </div>
      </div>
    </div>
  )
}
