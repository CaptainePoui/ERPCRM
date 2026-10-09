// Repondre / ecrire depuis ERPCRM (TASK-047.3, 2026-10-09) : le courriel part de la boite choisie (celle ou le
// courriel est arrive, par defaut), avec la signature de l'employe et le courriel d'origine cite dessous ; une copie
// va dans Envoyes de la boite (Outlook et cellulaire la voient) et dans la fiche du client.
import { useEffect, useRef, useState } from 'react'
import api from '../services/api'
import SignatureEditor from './SignatureEditor'

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

  function cancel() {
    if (dirty && !window.confirm('Abandonner ce courriel ? Ce que vous avez écrit sera perdu.')) return
    onClose()
  }

  async function send() {
    setErr('')
    if (!from) return setErr('Choisissez la boîte d’envoi')
    if (!to.trim()) return setErr('Indiquez au moins un destinataire')
    if (total > MAX_TOTAL) return setErr('Pièces jointes trop lourdes (20 Mo au total)')
    if (!subject.trim() && !window.confirm('Envoyer sans objet ?')) return
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
  const lab = { width: 46, fontSize: 13, color: '#6B7280', flexShrink: 0 }
  const inp = { flex: 1, minWidth: 0, fontSize: 14, padding: '7px 10px', border: '1.5px solid #D1D5DB', borderRadius: 6 }
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
        {originBox && <div style={{ fontSize: 12, color: '#92400E', margin: '-4px 0 8px 54px' }}>Ce courriel est arrivé dans {originBox}, d’où vous ne pouvez pas envoyer : choisissez une autre boîte.</div>}
        <div style={row}>
          <span style={lab}>À</span>
          <input value={to} onChange={e => setTo(e.target.value)} placeholder="adresse@exemple.com, Nom <autre@exemple.com>" style={inp} autoFocus={mode === 'new' || mode === 'forward'} />
          {!showCc && <button type="button" className="btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setShowCc(true)}>Cc</button>}
        </div>
        {showCc && (
          <div style={row}>
            <span style={lab}>Cc</span>
            <input value={cc} onChange={e => setCc(e.target.value)} style={inp} />
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
            <span key={i} style={{ fontSize: 12, padding: '3px 8px', background: '#F3F4F6', borderRadius: 6 }}>
              📎 {f.name} ({size(f.size)}) <a href="#" onClick={e => { e.preventDefault(); setFiles(prev => prev.filter((_, j) => j !== i)) }} title="Retirer">✕</a>
            </span>
          ))}
          {fwdList.map(a => (
            <label key={a.i} style={{ fontSize: 12, padding: '3px 8px', background: '#F3F4F6', borderRadius: 6, display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <input type="checkbox" checked={fwd.includes(a.i)} onChange={e => setFwd(prev => e.target.checked ? [...prev, a.i] : prev.filter(x => x !== a.i))} />
              {a.filename} ({size(a.size)})
            </label>
          ))}
          {total > MAX_TOTAL && <span style={{ fontSize: 12, color: '#DC2626' }}>Plus de 20 Mo : retirez une pièce jointe.</span>}
        </div>
        <div style={{ fontSize: 12, color: '#6B7280', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
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
