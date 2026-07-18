import { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import api from '../services/api'
import './Layout.css'

const NAV = [
  { to: '/companies', label: 'Compagnies', icon: '🏢' },
  { to: '/contacts',  label: 'Contacts',   icon: '👤' },
  { to: '/catalogue', label: 'Catalogue',  icon: '📦' },
  { to: '/invoices',  label: 'Factures',   icon: '🧾' },
  { to: '/tickets',          label: 'Tickets',    icon: '🎫' },
  { to: '/purchase-orders',  label: 'Commandes',  icon: '📋' },
  { to: '/ecom-orders',      label: 'Web orders', icon: '🛒' },
  { to: '/employees',        label: 'Employés',   icon: '👷' },
  { to: '/tasks',            label: 'Tâches',     icon: '✓' },
  { to: '/agenda',           label: 'Agenda',     icon: '📅' },
  { to: '/admin',            label: 'Admin',      icon: '⚙️' },
]

function GlobalSearch() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const timer = useRef(null)
  const wrapRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const handler = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function onChange(e) {
    const val = e.target.value
    setQ(val)
    setActive(-1)
    clearTimeout(timer.current)
    if (val.trim().length < 1) { setResults([]); setOpen(false); return }
    timer.current = setTimeout(async () => {
      const r = await api.get(`/v1/search?q=${encodeURIComponent(val.trim())}`)
      setResults(r.data)
      setOpen(true)
    }, 250)
  }

  function go(result) {
    setQ('')
    setResults([])
    setOpen(false)
    navigate(result.type === 'company' ? `/companies/${result.id}` : `/contacts/${result.id}`)
  }

  function onKeyDown(e) {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && active >= 0) go(results[active])
    if (e.key === 'Escape') { setOpen(false); setQ('') }
  }

  return (
    <div className="search-wrap" ref={wrapRef}>
      <input
        className="global-search"
        placeholder="Rechercher compagnie ou contact..."
        value={q}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onFocus={() => results.length && setOpen(true)}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <div className="search-dropdown">
          {results.map((r, i) => (
            <div key={r.id} className={`search-item${i === active ? ' search-item-active' : ''}`} onMouseDown={() => go(r)}>
              <span className="search-item-type">{r.type === 'company' ? '🏢' : '👤'}</span>
              <span className="search-item-label">{r.label}</span>
              {r.sub && <span className="search-item-sub">{r.sub}</span>}
            </div>
          ))}
        </div>
      )}
      {open && results.length === 0 && q.length > 0 && (
        <div className="search-dropdown">
          <div className="search-empty">Aucun résultat</div>
        </div>
      )}
    </div>
  )
}

export default function Layout({ user, onLogout, children }) {
  return (
    <div className="layout">
      <header className="layout-header">
        <div className="layout-brand">
          <div className="brand-icon">SI</div>
          <span className="brand-name">Simple IP ERP·CRM</span>
        </div>
        <GlobalSearch />
        <div className="layout-user">
          <NavLink to="/settings" className={({ isActive }) => `settings-btn${isActive ? ' active' : ''}`} title="Paramètres">⚙</NavLink>
          <span className="user-name">{user.full_name}</span>
          <span className="user-role">{user.role}</span>
          <button onClick={onLogout} className="logout-btn">Déconnexion</button>
        </div>
      </header>

      <div className="layout-body">
        <nav className="sidebar">
          {NAV.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
              <span className="sidebar-icon">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <main className="layout-main">
          {children}
        </main>
      </div>
    </div>
  )
}
