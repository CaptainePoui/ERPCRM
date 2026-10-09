// Lignes du journal des actions (TASK-049, 2026-10-09) : Administration -> Journal et Historique d'une fiche.
// Quand / Qui / Action / Quoi / Detail (champ : ancien -> nouveau).
import { Link } from 'react-router-dom'

const ACTION_COLORS = { created: '#059669', deleted: '#DC2626', field_change: '#1D4ED8', request: '#7C3AED', viewed: '#6B7280' }

function when(iso) {
  const d = new Date(iso)
  return d.toLocaleString('fr-CA', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function val(v) {
  if (v === null || v === undefined || v === '') return <span style={{ color: '#9CA3AF' }}>(vide)</span>
  if (v === 'True') return 'Oui'
  if (v === 'False') return 'Non'
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return when(v)
  return v.length > 160 ? <span title={v}>{v.slice(0, 160)}…</span> : v
}

function Detail({ r }) {
  if (r.action === 'field_change') {
    return (
      <span>
        <strong>{r.field_label}</strong> : {r.description && !r.old && !r.new ? r.description : <>{val(r.old)} → {val(r.new)}</>}
      </span>
    )
  }
  if (r.action === 'request') {
    return <span>{r.description}{r.new && <div style={{ color: '#6B7280', fontSize: 12, wordBreak: 'break-all' }}>{r.new.length > 200 ? r.new.slice(0, 200) + '…' : r.new}</div>}</span>
  }
  return <span>{r.description || ''}</span>
}

export default function JournalRows({ rows, showObject = true }) {
  if (!rows.length) return <div style={{ padding: 24, color: '#9CA3AF', fontSize: 14 }}>Rien dans le journal.</div>
  const th = { padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12, whiteSpace: 'nowrap' }
  const td = { padding: '7px 10px', fontSize: 13, verticalAlign: 'top', borderTop: '1px solid #F3F4F6' }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#F9FAFB' }}>
            <th style={th}>Quand</th><th style={th}>Qui</th><th style={th}>Action</th>{showObject && <th style={th}>Quoi</th>}<th style={th}>Détail</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td style={{ ...td, whiteSpace: 'nowrap', color: '#6B7280' }}>{when(r.at)}</td>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>{r.who}</td>
              <td style={{ ...td, whiteSpace: 'nowrap', color: ACTION_COLORS[r.action] || '#374151', fontWeight: 600 }}>{r.action_label}</td>
              {showObject && (
                <td style={td}>
                  <span style={{ color: '#6B7280' }}>{r.object_label}</span>
                  {r.object_name && <> : {r.link ? <Link to={r.link}>{r.object_name}</Link> : r.object_name}</>}
                  {r.parent_label && (
                    <div style={{ fontSize: 12, color: '#6B7280' }}>
                      dans {r.parent_label} {r.parent_link ? <Link to={r.parent_link}>{r.parent_name || ''}</Link> : (r.parent_name || '')}
                    </div>
                  )}
                </td>
              )}
              <td style={td}>
                {!showObject && r.parent_label && r.object_label && <span style={{ color: '#6B7280' }}>{r.object_label}{r.object_name ? ` « ${r.object_name} »` : ''} — </span>}
                <Detail r={r} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
