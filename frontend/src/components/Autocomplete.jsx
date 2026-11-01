import { useState, useEffect, useRef } from 'react'

// TASK-047.10 : même tolérance que la recherche du haut (TASK-052) -- sans accents, espaces, tirets, apostrophes ni
// ponctuation (« dastou » trouve « D'Astous Auto ») ; ceux qui COMMENCENT par les lettres tapées d'abord, puis ceux
// dont un mot commence par elles, puis ceux qui les contiennent. item.search = autres textes cherchés (ex. raison sociale).
const squash = t => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const words = t => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
function rank(items, query) {
  const q = squash(query)
  if (!q) return items
  const score = i => {
    const texts = [i.label, ...(Array.isArray(i.search) ? i.search : [i.search])].filter(Boolean)
    let best = 0
    for (const t of texts) {
      const sq = squash(t)
      if (sq.startsWith(q)) return 3
      if (words(t).some(w => w.startsWith(q)) || words(t).some((_, k, a) => a.slice(k).join('').startsWith(q))) best = Math.max(best, 2)
      else if (sq.includes(q)) best = Math.max(best, 1)
    }
    return best
  }
  return items.map((i, n) => [score(i), n, i]).filter(([s]) => s > 0)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, , i]) => i)
}

export default function Autocomplete({ label, items, value, onSelect, onCreate, placeholder, required, autoFocus, openOnFocus }) {
  const [query, setQuery] = useState(value?.label || '')
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => { setQuery(value?.label || '') }, [value])

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Champ vide : rien de proposé (Philippe : « si aucune lettre n'est inscrite, pas de proposition… à partir de la première
  // seulement »), sauf openOnFocus, voulu là où la liste est courte (ex. les contacts de la compagnie choisie)
  const filtered = query.trim() ? rank(items, query) : (openOnFocus ? items : [])

  const showCreate = onCreate && query.trim() && filtered.length === 0

  function pick(item) {
    setQuery(item.label)
    setOpen(false)
    onSelect(item)
  }

  return (
    <div className="form-group" ref={ref} style={{ position: 'relative' }}>
      {label && <label>{label}{required && ' *'}</label>}
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onSelect(null) }}
        onFocus={() => { if (query.trim() || openOnFocus) setOpen(true) }}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        style={{ width: '100%' }}
      />
      {open && (filtered.length > 0 || showCreate) && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--c-surface)', border: '1px solid var(--c-border-strong)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 200, maxHeight: 220, overflowY: 'auto' }}>
          {filtered.map(item => (
            <div key={item.id} onMouseDown={() => pick(item)}
              style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 14, borderBottom: '1px solid var(--c-surface-3)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--c-surface-3)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <div>{item.label}</div>
              {item.sub && <div style={{ fontSize: 11, color: 'var(--c-faint)' }}>{item.sub}</div>}
            </div>
          ))}
          {showCreate && (
            <div onMouseDown={() => { setOpen(false); onCreate(query.trim()) }}
              style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 14, color: 'var(--brand)', fontWeight: 600 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--brand-bg)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              + Créer « {query.trim()} »
            </div>
          )}
        </div>
      )}
    </div>
  )
}
