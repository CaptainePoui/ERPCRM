import { useState, useEffect } from 'react'
import api from '../services/api'

// ── Journal (compagnie ou contact — entite_id determine cote backend ce qui est inclus) ──
export default function JournalFeed({ entityId }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, search])

  async function load() {
    setLoading(true)
    try {
      const r = await api.get(`/v1/entities/${entityId}/logs`, { params: search ? { search } : {} })
      setLogs(r.data)
    } finally { setLoading(false) }
  }

  async function revert(log) {
    if (!confirm(`Remettre « ${log.field_label || log.field_name} » à « ${log.old_value || '—'} » ?`)) return
    await api.post(`/v1/entities/logs/${log.id}/revert`)
    await load()
  }

  return (
    <div>
      <input
        placeholder="Rechercher dans le journal..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: 12, padding: '6px 10px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13, width: 280 }}
      />
      {loading && <div className="empty-tab">Chargement...</div>}
      {!loading && !logs.length && <div className="empty-tab">Aucune entrée dans le journal.</div>}
      {!loading && !!logs.length && (
        <div className="journal-feed">
          {logs.map(l => (
            <div key={l.id} className="journal-entry">
              <div className="journal-dot" />
              <div className="journal-body">
                <div className="journal-meta">
                  <span className="journal-user">{l.user_name}</span>
                  <span className="journal-time">{new Date(l.created_at).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  {l.can_revert && (
                    <button
                      onClick={() => revert(l)}
                      style={{ fontSize: 11, color: '#184FA0', background: 'none', border: '1px solid #CBD5E1', borderRadius: 5, padding: '2px 8px', cursor: 'pointer', marginLeft: 8 }}
                    >
                      Revert
                    </button>
                  )}
                </div>
                <div className="journal-action">
                  <span className="journal-action-label">{l.action_label}</span>
                  {l.field_label && <span className="journal-field"> — {l.field_label}</span>}
                </div>
                {l.old_value !== null && l.new_value !== null && (
                  <div className="journal-change">
                    <span className="journal-old">{l.old_value || '—'}</span>
                    <span className="journal-arrow">→</span>
                    <span className="journal-new">{l.new_value || '—'}</span>
                  </div>
                )}
                {l.description && !l.field_label && (
                  <div className="journal-desc">{l.description}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
