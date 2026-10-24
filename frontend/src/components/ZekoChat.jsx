import { useState, useEffect, useRef } from 'react'
import api, { getToken } from '../services/api'
import { askConfirm } from './Dialog'
import MicButton from './MicButton'

// Conversation avec Zéko (TASK-006.5 étape 2, 2026-10-18). La réponse arrive mot par mot (flux du serveur) ;
// « Zéko lit la fiche du client… » montre ce qu'il consulte. Arrêter coupe la génération (le texte déjà écrit reste).

// Mise en forme minimale des réponses : **gras**, `code`, listes « - » / « 1. », paragraphes (jamais de HTML brut)
function inline(text, keyBase) {
  const parts = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0, m, i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const t = m[0]
    parts.push(t.startsWith('**') ? <strong key={`${keyBase}-${i++}`}>{t.slice(2, -2)}</strong>
      : <code key={`${keyBase}-${i++}`} style={{ background: 'var(--c-surface-3)', padding: '0 4px', borderRadius: 4, fontSize: '0.92em' }}>{t.slice(1, -1)}</code>)
    last = m.index + t.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

// Espaces typographiques du modèle (fine insécable…) invisibles dans la police de l'écran : espaces normales
const ODD_SPACES = /[\u00a0\u2002\u2003\u2007-\u200a\u202f\u205f]/g

export function ZekoText({ text }) {
  text = (text || '').replace(ODD_SPACES, ' ').replace(/[\u2010\u2011]/g, '-').replace(/\u200b/g, '')
  const blocks = []
  let list = null
  ;(text || '').split('\n').forEach((line, n) => {
    const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/)
    if (li) {
      if (!list) { list = []; blocks.push({ list }) }
      list.push(li[1])
    } else {
      list = null
      if (line.trim()) blocks.push({ p: line.replace(/^#+\s*/, '') })
    }
  })
  return blocks.map((b, i) => b.list
    ? <ul key={i} style={{ margin: '4px 0', paddingLeft: 20 }}>{b.list.map((x, j) => <li key={j}>{inline(x, `${i}-${j}`)}</li>)}</ul>
    : <div key={i} style={{ margin: '3px 0' }}>{inline(b.p, i)}</div>)
}

// Lit une réponse de Zéko en flux (SSE) : onEvent reçoit {type: pense|texte|outil|erreur|fin, ...}
export async function streamZeko(url, body, onEvent, signal) {
  const r = await fetch(url, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) {
    const d = await r.json().catch(() => ({}))
    throw new Error(d.detail || `Erreur ${r.status}`)
  }
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 2)
      if (line.startsWith('data: ')) onEvent(JSON.parse(line.slice(6)))
    }
  }
}

// Réflexion de Zéko montrée en direct (« éphémère ») : effacée dès qu'il consulte un outil ou commence sa réponse
export function zekoReducer(l, ev) {
  if (ev.type === 'texte') return { ...l, thinking: false, reasoning: '', text: l.text + ev.texte }
  if (ev.type === 'pense') return { ...l, thinking: true, reasoning: ((l.reasoning || '') + (ev.texte || '')).slice(-400) }
  if (ev.type === 'outil') return { ...l, thinking: true, reasoning: '', text: '', steps: [...l.steps, ev.libelle] }
  return l
}

export function ZekoThinking({ live }) {
  if (live.text) return null
  return (
    <div style={{ color: 'var(--c-faint)', fontSize: 12, fontStyle: 'italic', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
      {live.reasoning ? `Zéko réfléchit : …${live.reasoning.replace(/\s+/g, ' ').slice(-260)}` : 'Zéko réfléchit…'}
    </div>
  )
}

// Touche Entrée : envoie (Maj+Entrée = nouvelle ligne) par défaut, ou nouvelle ligne (Ctrl+Entrée = envoyer) ; choix retenu
const ENTER_KEY = 'erpcrm-entree-envoie'
export function useEnterSends() {
  const [v, setV] = useState(() => { try { return localStorage.getItem(ENTER_KEY) !== 'non' } catch { return true } })
  const set = x => { setV(x); try { localStorage.setItem(ENTER_KEY, x ? 'oui' : 'non') } catch { /* sans stockage */ } }
  return [v, set]
}
export function isSendKey(e, enterSends) {
  if (e.key !== 'Enter') return false
  return enterSends ? !e.shiftKey && !e.ctrlKey && !e.metaKey : (e.ctrlKey || e.metaKey)
}
export function EnterToggle({ value, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--c-muted)', cursor: 'pointer', userSelect: 'none' }}
      title={value ? 'Entrée envoie ; Maj+Entrée passe une ligne' : 'Entrée passe une ligne ; Ctrl+Entrée envoie'}>
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />
      Entrée envoie {value ? '(Maj+Entrée : ligne)' : '(Ctrl+Entrée envoie)'}
    </label>
  )
}

export const BUSY_RING = { boxShadow: '0 0 0 2px #DC2626', borderColor: '#DC2626' }

function fmtWhen(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-CA') + ' ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })
}

const TOOL_LABELS = { chercher_courriels: 'a cherché dans les courriels', lire_courriel: 'a lu un courriel et ses pièces jointes', transactions_banque: 'a lu le relevé bancaire', regles_apprises: 'a relu ce qu’il a appris', retenir: 'a retenu pour la suite', paiements_carte: 'a lu les reçus de carte', demander_ia_externe: 'a demandé à l’IA externe', chercher: 'a cherché dans ERPCRM', fiche_client: 'a lu la fiche du client', fiche_contact: 'a lu la fiche de la personne', tickets_client: 'a lu les tickets du client',
                      lire_ticket: 'a lu un ticket', ouvrir_page: 'a ouvert la page', equipements: 'a lu les équipements', telephonie: 'a lu la téléphonie' }

// TASK-006.7 (2026-10-24) : la réponse se fait sur le serveur même si la fenêtre se ferme ; en revenant, « Zéko
// travaille… » s'affiche jusqu'à sa réponse. La dictée part seule à Zéko après 5 s sans parler. onOpenPage(chemin) :
// Zéko ouvre une page (dans la fenêtre ERPCRM quand il est dans sa fenêtre à part).
export default function ZekoChat({ conversationId, onChanged, compact, onOpenPage }) {
  const [conv, setConv] = useState(null)
  const [draft, setDraft] = useState('')
  const [live, setLive] = useState(null)        // { text, steps: [], thinking } pendant une réponse
  const [error, setError] = useState(null)
  const abortRef = useRef(null)
  const endRef = useRef(null)
  const inputRef = useRef(null)
  const [enterSends, setEnterSends] = useEnterSends()

  async function load() {
    if (!conversationId) return null
    const c = (await api.get(`/v1/zeko/conversations/${conversationId}`)).data
    setConv(c)
    return c
  }
  // Réponse en cours sans flux (fenêtre rouverte, connexion coupée) : on regarde toutes les 5 s
  const [waiting, setWaiting] = useState(false)
  useEffect(() => { if (conv?.busy && !live) setWaiting(true) }, [conv?.busy, live])
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(async () => {
      const c = await load().catch(() => null)
      if (c && !c.busy) { setWaiting(false); onChanged && onChanged() }
    }, 5000)
    return () => clearInterval(t)
  }, [waiting, conversationId])
  useEffect(() => { setConv(null); setLive(null); setError(null); setWaiting(false); load() }, [conversationId])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [conv?.messages?.length, live?.text, live?.steps?.length])
  useEffect(() => () => abortRef.current?.abort(), [])
  // Le curseur reste dans la boîte d'écriture : à l'ouverture, après l'envoi et après la réponse (Philippe, 2026-10-18)
  useEffect(() => { if (conv && !live) inputRef.current?.focus() }, [conv?.id, live])

  async function send(extra) {
    const text = (extra ? `${draft.trim()} ${extra}` : draft).trim()
    if (extra && (live || waiting)) { setDraft(text); return }     // dictée pendant que Zéko travaille : gardée à envoyer
    if (!text || live || waiting) return
    setDraft(''); setError(null)
    setConv(c => ({ ...c, messages: [...c.messages, { id: `tmp-${Date.now()}`, role: 'user', content: text, created_at: new Date().toISOString(), author_name: 'Moi' }] }))
    setLive({ text: '', steps: [], thinking: true })
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      await streamZeko(`/api/v1/zeko/conversations/${conversationId}/messages`, { content: text }, ev => {
        if (ev.type === 'erreur') setError(ev.texte)
        else if (ev.type === 'ouvrir') onOpenPage && onOpenPage(ev.chemin)
        else setLive(l => zekoReducer(l, ev))
      }, ctrl.signal)
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message || 'Zéko n’a pas pu répondre')
    } finally {
      abortRef.current = null
      setLive(null)
      await load().catch(() => null)
      onChanged && onChanged()
    }
  }

  async function stop() {
    await api.post(`/v1/zeko/conversations/${conversationId}/stop`).catch(() => {})
    abortRef.current?.abort()
  }

  async function remove() {
    if (!await askConfirm('Supprimer cette conversation avec Zéko ?')) return
    await api.delete(`/v1/zeko/conversations/${conversationId}`)
    onChanged && onChanged(true)
  }

  if (!conv) return <div style={{ padding: 16, color: 'var(--c-faint)', fontSize: 13 }}>Chargement…</div>
  const bubble = mine => ({
    alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%', padding: '8px 12px', borderRadius: 10, fontSize: 14, lineHeight: 1.5,
    background: mine ? 'var(--brand-bg)' : 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', wordBreak: 'break-word',
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: compact ? 8 : 12 }}>
        {conv.messages.length === 0 && !live && (
          <div style={{ color: 'var(--c-faint)', fontSize: 13, padding: 8 }}>
            Demandez à Zéko : un contact, un équipement, l'historique d'un client, une piste de dépannage… Il lit ERPCRM, il ne modifie rien.
          </div>
        )}
        {conv.messages.map(m => m.role === 'tool'
          ? <div key={m.id} style={{ fontSize: 11, color: 'var(--c-faint)', paddingLeft: 4 }}>Zéko {TOOL_LABELS[m.tool_name] || m.tool_name}</div>
          : (
            <div key={m.id} style={bubble(m.role === 'user')}>
              <div style={{ fontSize: 11, color: 'var(--c-muted)', marginBottom: 2 }}>
                {m.role === 'user' ? (m.author_name || 'Moi') : 'Zéko'} · {fmtWhen(m.created_at)}
              </div>
              {m.role === 'user' ? <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div> : <ZekoText text={m.content} />}
            </div>
          ))}
        {waiting && !live && (
          <div style={bubble(false)}>
            <div style={{ fontSize: 11, color: 'var(--c-muted)', marginBottom: 2 }}>Zéko</div>
            <div style={{ color: 'var(--c-faint)', fontSize: 12, fontStyle: 'italic' }}>Zéko travaille sur ta demande…</div>
          </div>
        )}
        {live && (
          <>
            {live.steps.map((s, i) => <div key={i} style={{ fontSize: 11, color: 'var(--c-faint)', paddingLeft: 4 }}>Zéko {s}…</div>)}
            <div style={bubble(false)}>
              <div style={{ fontSize: 11, color: 'var(--c-muted)', marginBottom: 2 }}>Zéko</div>
              {live.text ? <ZekoText text={live.text} /> : <ZekoThinking live={live} />}
            </div>
          </>
        )}
        {error && <div style={{ color: '#DC2626', fontSize: 13 }}>{error}</div>}
        <div ref={endRef} />
      </div>
      <div style={{ borderTop: '1px solid var(--c-border)', padding: '8px 8px 2px' }}>
        <EnterToggle value={enterSends} onChange={setEnterSends} />
      </div>
      <div style={{ padding: '4px 8px 8px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea ref={inputRef} rows={compact ? 2 : 3} value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (isSendKey(e, enterSends)) { e.preventDefault(); if (!live && !waiting) send() } }}
          placeholder="Écrire à Zéko…"
          style={{ flex: 1, resize: 'none', fontSize: 14, padding: 8, borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', color: 'var(--c-text)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button className="btn-primary" onClick={() => send()} disabled={!!live || waiting || !draft.trim()} style={live || waiting ? BUSY_RING : undefined}
            title={live ? 'Zéko réfléchit — vous pourrez envoyer quand il aura fini' : undefined}>Envoyer</button>
          <MicButton silenceStop={5} onText={t => send(t)} />
          {(live || waiting) && <button className="btn-secondary" style={{ fontSize: 11, padding: '2px 6px' }} onClick={stop}>Arrêter</button>}
          {!live && !waiting && conv.messages.length > 0 && !conv.ticket_id && <button className="btn-secondary" style={{ fontSize: 11, padding: '2px 6px' }} onClick={remove}>Supprimer</button>}
        </div>
      </div>
    </div>
  )
}
