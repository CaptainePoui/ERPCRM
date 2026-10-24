import { useState, useEffect } from 'react'
import api from '../services/api'
import { useNavigate } from 'react-router-dom'
import ZekoChat from './ZekoChat'
import { openInMain, openZekoWindow } from '../utils/zekoBridge'

// Panneau Zéko à droite de l'écran (TASK-006.5 étape 2). Sans ticket : mes conversations (liste + nouvelle) ;
// avec ticketId : LA conversation de ce ticket (partagée par les techniciens, jamais montrée au client).
// Ne se ferme que par son bouton (jamais au clic à côté).
// standalone (TASK-006.7, 2026-10-24) : la fenêtre Zéko à part (/zeko), qu'on place sur un autre écran ; les pages que
// Zéko ouvre s'affichent alors dans la fenêtre ERPCRM.
export default function ZekoPanel({ ticketId, ticketLabel, onClose, standalone }) {
  const navigate = useNavigate()
  const openPage = standalone ? openInMain : chemin => navigate(chemin)
  useEffect(() => {
    if (!standalone) return
    document.title = 'Zéko'
    let t = 'jour'
    try { t = localStorage.getItem('erpcrm_theme') || 'jour' } catch { /* sans stockage */ }
    if (t === 'nuit') document.documentElement.setAttribute('data-theme', 'dark')
  }, [standalone])
  const [list, setList] = useState([])
  const [current, setCurrent] = useState(null)
  const [status, setStatus] = useState(null)

  async function loadList(selectFirst) {
    const r = await api.get('/v1/zeko/conversations')
    setList(r.data)
    if (selectFirst) setCurrent(r.data[0]?.id || null)
  }
  useEffect(() => {
    api.get('/v1/zeko/status').then(r => setStatus(r.data)).catch(() => setStatus({ enabled: false }))
    if (ticketId) api.post('/v1/zeko/conversations', { ticket_id: ticketId }).then(r => setCurrent(r.data.id))
    else loadList(true)
  }, [ticketId])

  async function newConv() {
    const r = await api.post('/v1/zeko/conversations', {})
    await loadList(false)
    setCurrent(r.data.id)
  }

  return (
    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: standalone ? '100vw' : ticketId ? 520 : 760, maxWidth: '100vw', zIndex: 1200,
                  background: 'var(--c-surface)', borderLeft: '1px solid var(--c-border)', boxShadow: '-8px 0 30px rgba(0,0,0,.25)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--c-border)' }}>
        <span style={{ width: 28, height: 28, borderRadius: 14, background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>Z</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--c-text)' }}>Zéko</div>
          <div style={{ fontSize: 11, color: 'var(--c-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ticketId ? `Ticket ${ticketLabel || ''} — échange interne, jamais montré au client` : 'Lit ERPCRM, ne modifie rien'}
            {status && !status.enabled && ' · non configuré (Administration → Intégrations)'}
          </div>
        </div>
        {!ticketId && <button className="btn-secondary" style={{ fontSize: 12 }} onClick={newConv}>+ Nouvelle</button>}
        {!ticketId && !standalone && <button className="btn-secondary" style={{ fontSize: 12 }} title="Zéko dans sa propre fenêtre, à placer sur un autre écran"
          onClick={() => { openZekoWindow(); onClose() }}>↗ Fenêtre à part</button>}
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onClose}>Fermer</button>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {!ticketId && (
          <div style={{ width: 220, borderRight: '1px solid var(--c-border)', overflowY: 'auto' }}>
            {list.length === 0 && <div style={{ padding: 12, fontSize: 12, color: 'var(--c-faint)' }}>Aucune conversation.</div>}
            {list.map(c => (
              <div key={c.id} onClick={() => setCurrent(c.id)}
                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--c-surface-3)',
                         background: c.id === current ? 'var(--brand-bg)' : 'transparent', color: 'var(--c-text)' }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: c.id === current ? 700 : 400 }}>{c.title || 'Nouvelle conversation'}</div>
                <div style={{ fontSize: 11, color: 'var(--c-faint)' }}>{new Date(c.updated_at).toLocaleDateString('fr-CA')}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {current
            ? <ZekoChat conversationId={current} compact={!!ticketId} onOpenPage={openPage} onChanged={deleted => { if (!ticketId) loadList(!!deleted) }} />
            : !ticketId && <div style={{ padding: 16 }}><button className="btn-primary" onClick={newConv}>Commencer une conversation</button></div>}
        </div>
      </div>
    </div>
  )
}
