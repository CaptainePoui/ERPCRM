// Boite de reception (TASK-047.2, 2026-10-09) : toutes les boites au meme endroit -- partagees (service@,
// facturation@, portabilite@) pour toute l'equipe, personnelles (philippe@) pour leur proprietaire et le patron.
// support@ n'y est pas : ses courriels deviennent des tickets. « Envoyes d'ici » : courriels envoyes depuis ERPCRM (TASK-047.3).
// « A jeter » : expediteurs en liste noire (TASK-047.7), effaces apres 1 an.
import { useEffect, useState } from 'react'
import api from '../services/api'
import MailBrowser from '../components/MailBrowser'

export default function Mail() {
  const [data, setData] = useState({ folders: [], unclassified: 0, junk: 0 })
  const [sel, setSel] = useState({ view: 'all', mailbox_id: '' })
  const [syncing, setSyncing] = useState(false)

  const loadFolders = () => api.get('/v1/mail/folders').then(r => setData(r.data))
  useEffect(() => { loadFolders(); const t = setInterval(loadFolders, 60000); return () => clearInterval(t) }, [])

  async function syncNow() {
    setSyncing(true)
    await api.post('/v1/mail/sync')
    setTimeout(() => { loadFolders(); setSel(s => ({ ...s })); setSyncing(false) }, 8000)
  }

  const unread = data.folders.reduce((n, f) => n + f.unread, 0)
  const item = (active, onClick, label, count, sub, warn) => (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none', borderRadius: 6,
      cursor: 'pointer', fontSize: 13, background: active ? 'var(--c-tint-blue)' : 'transparent', color: active ? 'var(--c-on-blue)' : 'var(--c-text)', fontWeight: active ? 600 : 400 }}>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}{sub && <span style={{ color: 'var(--c-muted)', fontWeight: 400 }}> {sub}</span>}</span>
      {warn && <span title={warn} style={{ color: '#DC2626' }}>⚠</span>}
      {count > 0 && <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--brand)', color: '#fff', borderRadius: 10, padding: '1px 7px' }}>{count}</span>}
    </button>
  )

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Courriels</h1>
          <p className="page-sub">{unread} non lu{unread > 1 ? 's' : ''} · copiés de vos boîtes chaque minute, Outlook et cellulaire restent à jour</p>
        </div>
        <button className="btn-secondary" onClick={syncNow} disabled={syncing}>{syncing ? 'Actualisation…' : '↻ Actualiser'}</button>
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {item(sel.view === 'all' && !sel.mailbox_id, () => setSel({ view: 'all', mailbox_id: '' }), 'Tous les courriels', unread)}
          {item(sel.view === 'unclassified', () => setSel({ view: 'unclassified', mailbox_id: '' }), 'À classer', data.unclassified)}
          {item(sel.view === 'sent', () => setSel({ view: 'sent', mailbox_id: '' }), 'Envoyés d’ici', 0)}
          {item(sel.view === 'junk', () => setSel({ view: 'junk', mailbox_id: '' }), '🗑 À jeter', 0, data.junk ? `· ${data.junk}` : '')}
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--c-faint)', margin: '12px 10px 4px' }}>Boîtes</div>
          {data.folders.map(f => item(sel.mailbox_id === f.id, () => setSel({ view: 'all', mailbox_id: f.id }),
            f.email.split('@')[0] + '@', f.unread, f.personal ? (f.mine ? '· à moi' : '· personnelle') : '',
            f.sync_error ? `Copie impossible : ${f.sync_error}` : (!f.has_password ? 'Mot de passe manquant' : '')))}
          {!data.folders.length && <div style={{ fontSize: 12, color: 'var(--c-muted)', padding: '0 10px' }}>Aucune boîte : ajoutez-les dans Administration → Intégrations.</div>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <MailBrowser filter={sel.view === 'sent' ? { direction: 'out' }
            : { view: sel.view, mailbox_id: sel.mailbox_id, ...(sel.view === 'unclassified' || sel.view === 'junk' ? {} : { direction: 'in' }) }} onCounts={loadFolders} />
        </div>
      </div>
    </div>
  )
}
