// Bouton « Historique » d'une fiche (TASK-049, 2026-10-09) : tout ce qui a ete fait sur elle et ses morceaux
// (lignes, notes, paiements appliques...), qui et quand, meme ce qui a ete supprime depuis.
import { useState } from 'react'
import api from '../services/api'
import JournalRows from './JournalRows'

// compact : seulement l'icone (en-tetes deja pleins de boutons, pour ne pas changer leur mise en page)
export default function HistoryButton({ objectType, objectId, title, compact = false }) {
  const [rows, setRows] = useState(null)
  const [more, setMore] = useState(false)
  const [open, setOpen] = useState(false)

  async function load(offset = 0) {
    const r = await api.get('/v1/journal', { params: { object_type: objectType, object_id: objectId, limit: 100, offset } })
    setRows(prev => offset ? [...prev, ...r.data.rows] : r.data.rows)
    setMore(r.data.has_more)
  }

  return (
    <>
      <button className="btn-secondary" style={{ fontSize: 12, ...(compact ? { padding: '6px 9px' } : {}) }} title="Historique : qui a fait quoi sur cette fiche"
        onClick={() => { setOpen(true); setRows(null); load() }}>{compact ? '🕘' : '🕘 Historique'}</button>
      {open && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 980, width: '96vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 className="modal-title">Historique{title ? ` — ${title}` : ''}</h3>
            {rows === null ? <div style={{ padding: 20, color: '#9CA3AF' }}>Chargement…</div> : <JournalRows rows={rows} showObject={false} />}
            {more && <button className="btn-secondary" style={{ marginTop: 10 }} onClick={() => load(rows.length)}>Voir plus</button>}
            <div className="modal-actions"><button className="btn-secondary" onClick={() => setOpen(false)}>Fermer</button></div>
          </div>
        </div>
      )}
    </>
  )
}
