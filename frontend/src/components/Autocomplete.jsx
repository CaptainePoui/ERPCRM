import { useState, useEffect, useRef } from 'react'

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

  const filtered = query.trim()
    ? items.filter(i => i.label.toLowerCase().includes(query.toLowerCase()))
    : items

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
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #D1D5DB', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 200, maxHeight: 220, overflowY: 'auto' }}>
          {filtered.map(item => (
            <div key={item.id} onMouseDown={() => pick(item)}
              style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 14, borderBottom: '1px solid #F3F4F6' }}
              onMouseEnter={e => e.currentTarget.style.background = '#F3F4F6'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <div>{item.label}</div>
              {item.sub && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{item.sub}</div>}
            </div>
          ))}
          {showCreate && (
            <div onMouseDown={() => { setOpen(false); onCreate(query.trim()) }}
              style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 14, color: '#184FA0', fontWeight: 600 }}
              onMouseEnter={e => e.currentTarget.style.background = '#EFF6FF'}
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
