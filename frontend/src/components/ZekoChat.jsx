import { useState, useEffect, useRef } from 'react'
import api, { getToken } from '../services/api'
import { askConfirm } from './Dialog'

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

export function ZekoText({ text }) {
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

function fmtWhen(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-CA') + ' ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })
}

const TOOL_LABELS = { chercher: 'a cherché dans ERPCRM', fiche_client: 'a lu la fiche du client', tickets_client: 'a lu les tickets du client',
                      lire_ticket: 'a lu un ticket', equipements: 'a lu les équipements', telephonie: 'a lu la téléphonie' }

export default function ZekoChat({ conversationId, onChanged, compact }) {
  const [conv, setConv] = useState(null)
  const [draft, setDraft] = useState('')
  const [live, setLive] = useState(null)        // { text, steps: [], thinking } pendant une réponse
  const [error, setError] = useState(null)
  const abortRef = useRef(null)
  const endRef = useRef(null)

  async function load() {
    if (!conversationId) return
    setConv((await api.get(`/v1/zeko/conversations/${conversationId}`)).data)
  }
  useEffect(() => { setConv(null); setLive(null); setError(null); load() }, [conversationId])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [conv?.messages?.length, live?.text, live?.steps?.length])
  useEffect(() => () => abortRef.current?.abort(), [])

  async function send() {
    const text = draft.trim()
    if (!text || live) return
    setDraft(''); setError(null)
    setConv(c => ({ ...c, messages: [...c.messages, { id: `tmp-${Date.now()}`, role: 'user', content: text, created_at: new Date().toISOString(), author_name: 'Moi' }] }))
    setLive({ text: '', steps: [], thinking: true })
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const r = await fetch(`/api/v1/zeko/conversations/${conversationId}/messages`, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ content: text }),
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
          if (!line.startsWith('data: ')) continue
          const ev = JSON.parse(line.slice(6))
          if (ev.type === 'texte') setLive(l => ({ ...l, thinking: false, text: l.text + ev.texte }))
          else if (ev.type === 'pense') setLive(l => ({ ...l, thinking: true }))
          else if (ev.type === 'outil') setLive(l => ({ ...l, thinking: true, text: '', steps: [...l.steps, ev.libelle] }))
          else if (ev.type === 'erreur') setError(ev.texte)
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message || 'Zéko n’a pas pu répondre')
    } finally {
      abortRef.current = null
      setLive(null)
      await load()
      onChanged && onChanged()
    }
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
        {live && (
          <>
            {live.steps.map((s, i) => <div key={i} style={{ fontSize: 11, color: 'var(--c-faint)', paddingLeft: 4 }}>Zéko {s}…</div>)}
            <div style={bubble(false)}>
              <div style={{ fontSize: 11, color: 'var(--c-muted)', marginBottom: 2 }}>Zéko</div>
              {live.text ? <ZekoText text={live.text} /> : <span style={{ color: 'var(--c-faint)' }}>{live.thinking ? 'Zéko réfléchit…' : '…'}</span>}
            </div>
          </>
        )}
        {error && <div style={{ color: '#DC2626', fontSize: 13 }}>{error}</div>}
        <div ref={endRef} />
      </div>
      <div style={{ borderTop: '1px solid var(--c-border)', padding: 8, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea rows={compact ? 2 : 3} value={draft} onChange={e => setDraft(e.target.value)} disabled={!!live}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Écrire à Zéko… (Entrée pour envoyer, Maj+Entrée pour une ligne)"
          style={{ flex: 1, resize: 'none', fontSize: 14, padding: 8, borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', color: 'var(--c-text)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {live
            ? <button className="btn-secondary" onClick={() => abortRef.current?.abort()}>Arrêter</button>
            : <button className="btn-primary" onClick={send} disabled={!draft.trim()}>Envoyer</button>}
          {!live && conv.messages.length > 0 && !conv.ticket_id && <button className="btn-secondary" style={{ fontSize: 11, padding: '2px 6px' }} onClick={remove}>Supprimer</button>}
        </div>
      </div>
    </div>
  )
}
