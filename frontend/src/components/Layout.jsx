import { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import api from '../services/api'
import {
  IconBuilding, IconUser, IconPackage, IconReceipt, IconTicket, IconFileText,
  IconClipboard, IconCart, IconUsers, IconCheck, IconCalendar, IconServer, IconSettings, IconRefresh,
} from './Icons'
import './Layout.css'

const NAV = [
  { to: '/companies', label: 'Compagnies', Icon: IconBuilding },
  { to: '/contacts',  label: 'Contacts',   Icon: IconUser },
  { to: '/catalogue', label: 'Catalogue',  Icon: IconPackage },
  { to: '/tickets',          label: 'Tickets',    Icon: IconTicket },
  { to: '/devis',            label: 'Devis',      Icon: IconFileText },
  { to: '/invoices',  label: 'Factures',   Icon: IconReceipt },
  { to: '/recurrence',       label: 'Récurrence', Icon: IconRefresh },
  { to: '/purchase-orders',  label: 'Commandes',  Icon: IconClipboard },
  { to: '/ecom-orders',      label: 'Web orders', Icon: IconCart },
  { to: '/employees',        label: 'Employés',   Icon: IconUsers },
  { to: '/tasks',            label: 'Tâches',     Icon: IconCheck },
  { to: '/agenda',           label: 'Agenda',     Icon: IconCalendar },
  { to: '/server',           label: 'Serveur',    Icon: IconServer },
  { to: '/admin',            label: 'Admin',      Icon: IconSettings },
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
              <span className="search-item-type">{r.type === 'company' ? <IconBuilding width={14} height={14} /> : <IconUser width={14} height={14} />}</span>
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
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="layout">
      <header className="layout-header">
        <button className="hamburger-btn" onClick={() => setSidebarOpen(o => !o)} aria-label="Menu">☰</button>
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
        {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
        <nav className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>
          {NAV.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} onClick={() => setSidebarOpen(false)}>
              <span className="sidebar-icon"><Icon /></span>
              <span className="sidebar-label">{label}</span>
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
