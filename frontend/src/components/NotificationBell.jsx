import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { showNotification } from './ticketReminder'

// Cloche à côté de Zéko (TASK-047.6) : ce qui reste à régler, lu dans l'état réel par le serveur (une ligne disparaît
// d'elle-même quand c'est réglé). Relue chaque minute et au retour sur l'onglet. Le menu se ferme au clic à côté : ce
// n'est pas une fenêtre de saisie (rien à perdre).
const ICONS = { mail: '✉', invoices: '$', tickets: '#', bank: '⌂', mail_review: '?' }

export default function NotificationBell() {
  const navigate = useNavigate()
  const [data, setData] = useState({ items: [], total: 0 })
  const [open, setOpen] = useState(false)
  const ref = useRef()
  const prevMail = useRef(null)

  async function load() {
    try {
      const r = await api.get('/v1/notifications')
      const mail = r.data.items.find(i => i.kind === 'mail')?.count || 0
      // Notification du navigateur (réglage, désactivé par défaut) : seulement quand des courriels non lus s'ajoutent
      if (r.data.browser && prevMail.current !== null && mail > prevMail.current)
        showNotification('Nouveau courriel', `${mail - prevMail.current} de plus · ${mail} non lu${mail > 1 ? 's' : ''}`, () => navigate('/mail?view=unread'))
      prevMail.current = mail
      setData(r.data)
    } catch { /* hors ligne : on garde le dernier état */ }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [])

  useEffect(() => {
    if (!open) return
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function go(path) {
    setOpen(false)
    navigate(path)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => { setOpen(o => !o); if (!open) load() }} aria-label="Notifications"
        title={data.total ? `${data.total} chose${data.total > 1 ? 's' : ''} à régler` : 'Rien à régler'}
        style={{ position: 'relative', width: 34, height: 34, borderRadius: 17, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)',
                 cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-text)' }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {data.total > 0 && <span style={{ position: 'absolute', top: -5, right: -7, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
          background: '#DC2626', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {data.total > 999 ? '999+' : data.total}</span>}
      </button>
      {open && (
        <div style={{ position: 'fixed', top: 60, right: 12, width: 400, maxWidth: 'calc(100vw - 24px)', maxHeight: '75vh', overflowY: 'auto',
                      background: 'var(--c-surface)', border: '1px solid var(--c-border-strong)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.25)', zIndex: 300 }}>
          <div style={{ padding: '10px 14px', fontWeight: 700, borderBottom: '1px solid var(--c-surface-3)' }}>
            {data.total ? `À régler (${data.total})` : 'Rien à régler 🎉'}
          </div>
          {data.items.map(it => (
            <div key={it.kind} style={{ borderBottom: '1px solid var(--c-surface-3)' }}>
              <div onClick={() => go(it.path)} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '9px 14px', cursor: 'pointer', fontWeight: 600 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--c-surface-3)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                <span style={{ width: 20, textAlign: 'center' }}>{ICONS[it.kind]}</span>
                <span style={{ flex: 1 }}>{it.label}</span>
                <span style={{ background: 'var(--brand-bg)', color: 'var(--brand)', borderRadius: 10, padding: '1px 8px', fontSize: 12 }}>{it.count}</span>
              </div>
              {it.lines.map((l, i) => (
                <div key={i} onClick={() => go(l.path)} title={l.text}
                  style={{ padding: '5px 14px 5px 42px', fontSize: 12, color: 'var(--c-faint)', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--c-surface-3)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                  {l.text}
                </div>
              ))}
              {it.count > it.lines.length && <div onClick={() => go(it.path)} style={{ padding: '4px 14px 8px 42px', fontSize: 12, color: 'var(--brand)', cursor: 'pointer' }}>
                Voir les {it.count}…</div>}
              {it.zeko && <div style={{ padding: '2px 14px 10px 42px' }}>
                <button className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px' }}
                  onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('zeko-ask', { detail: it.zeko })) }}>Z  Revoir avec Zéko</button>
              </div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
