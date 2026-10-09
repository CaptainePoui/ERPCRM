import { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import api from '../services/api'
import {
  IconBuilding, IconUser, IconPackage, IconReceipt, IconTicket, IconFileText,
  IconClipboard, IconUsers, IconCheck, IconCalendar, IconServer, IconSettings, IconRefresh, IconBank, IconPercent, IconCart, IconMail,
} from './Icons'
import ChangePasswordModal from './ChangePasswordModal'
import './Layout.css'

// Groupes Ventes / Achats : une entree dans le menu de gauche, sous-menus en onglets
// horizontaux en haut de la page (demande de Philippe, 2026-10-02). `match` = autres
// prefixes d'adresse qui appartiennent a l'onglet (fiches de detail).
const GROUPS = {
  ventes: {
    label: 'Ventes', Icon: IconReceipt, home: '/invoices',
    items: [
      { to: '/devis', label: 'Devis' },
      { to: '/sales/deposits', label: "Factures d'acompte" },
      { to: '/invoices', label: 'Factures' },
      { to: '/recurrence', label: 'Factures périodiques' },
      { to: '/sales/payments', label: 'Paiements reçus' },
      { to: '/sales/credits', label: "Factures d'avoir" },
    ],
  },
  achats: {
    label: 'Achats', Icon: IconCart, home: '/purchases/bills',
    items: [
      { to: '/purchases/vendors', label: 'Fournisseurs' },
      { to: '/purchases/expenses', label: 'Dépenses' },
      { to: '/purchases/recurring-expenses', label: 'Dépenses périodiques' },
      { to: '/purchases/bills', label: 'Factures fournisseurs' },
      { to: '/purchases/recurring-bills', label: 'Factures fournisseurs périodiques' },
      { to: '/purchases/payments', label: 'Paiements effectués' },
      { to: '/purchases/credits', label: 'Avoirs fournisseur' },
      { to: '/purchases/orders', label: 'Bons de commande', match: ['/purchase-orders'] },
    ],
  },
}

const NAV = [
  { to: '/companies', label: 'Compagnies', Icon: IconBuilding },
  { to: '/contacts',  label: 'Contacts',   Icon: IconUser },
  { to: '/catalogue', label: 'Catalogue',  Icon: IconPackage },
  { to: '/mail',             label: 'Courriels',  Icon: IconMail },
  { to: '/tickets',          label: 'Tickets',    Icon: IconTicket },
  { group: 'ventes' },
  { group: 'achats' },
  { to: '/bank',             label: 'Banque',     Icon: IconBank },
  { to: '/taxes',            label: 'Impôts et formulaires', Icon: IconPercent },
  { to: '/commandes',        label: 'Commandes',  Icon: IconClipboard },
  { to: '/employees',        label: 'Employés',   Icon: IconUsers },
  { to: '/tasks',            label: 'Tâches',     Icon: IconCheck },
  { to: '/agenda',           label: 'Agenda',     Icon: IconCalendar },
  { to: '/server',           label: 'Serveur',    Icon: IconServer },
  { to: '/admin',            label: 'Admin',      Icon: IconSettings },
]

function itemMatches(item, path) {
  return [item.to, ...(item.match || [])].some(p => path === p || path.startsWith(p + '/'))
}

function activeGroup(path) {
  return Object.entries(GROUPS).find(([, g]) => g.items.some(i => itemMatches(i, path)))?.[0]
}

function GroupTabs({ groupKey, path }) {
  const g = GROUPS[groupKey]
  return (
    <div className="group-tabs">
      {g.items.map(i => (
        <NavLink key={i.to} to={i.to} className={() => `group-tab${itemMatches(i, path) ? ' active' : ''}`}>{i.label}</NavLink>
      ))}
    </div>
  )
}

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
  const [pwd, setPwd] = useState(false)
  const location = useLocation()
  const group = activeGroup(location.pathname)

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
          <span className="user-name" onClick={() => setPwd(true)} style={{ cursor: 'pointer' }} title="Changer mon mot de passe">{user.full_name}</span>
          <span className="user-role">{user.role}</span>
          <button onClick={onLogout} className="logout-btn">Déconnexion</button>
        </div>
      </header>
      {pwd && <ChangePasswordModal onClose={() => setPwd(false)} />}

      <div className="layout-body">
        {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
        <nav className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>
          {NAV.map(item => {
            if (item.group) {
              const g = GROUPS[item.group]
              return (
                <NavLink key={item.group} to={g.home} className={() => `sidebar-link${group === item.group ? ' active' : ''}`} onClick={() => setSidebarOpen(false)}>
                  <span className="sidebar-icon"><g.Icon /></span>
                  <span className="sidebar-label">{g.label}</span>
                </NavLink>
              )
            }
            const { to, label, Icon } = item
            return (
              <NavLink key={to} to={to} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} onClick={() => setSidebarOpen(false)}>
                <span className="sidebar-icon"><Icon /></span>
                <span className="sidebar-label">{label}</span>
              </NavLink>
            )
          })}
        </nav>

        <main className="layout-main">
          {group && <GroupTabs groupKey={group} path={location.pathname} />}
          {children}
        </main>
      </div>
    </div>
  )
}
