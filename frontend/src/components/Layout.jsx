import { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import api from '../services/api'
import {
  IconBuilding, IconUser, IconPackage, IconReceipt, IconTicket, IconFileText,
  IconClipboard, IconUsers, IconCheck, IconCalendar, IconServer, IconSettings, IconRefresh, IconBank, IconFlag, IconCart, IconMail, IconSearch,
} from './Icons'
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
  { to: '/taxes',            label: 'Fiscalité',  Icon: IconFlag },
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
    // factures et paiements : ouverts dans la fiche du client (TASK-002.9 / TASK-052)
    navigate(result.type === 'company' ? `/companies/${result.id}`
      : result.type === 'invoice' ? `/companies/${result.company_id}?tab=transactions&facture=${result.id}`
      : result.type === 'payment' ? `/companies/${result.company_id}?tab=transactions&paiement=${result.id}`
      : `/contacts/${result.id}`)
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
      <IconSearch className="search-icon" width={18} height={18} aria-hidden="true" />
      <input
        className="global-search"
        aria-label="Rechercher"
        placeholder="Rechercher : compagnie, contact, facture, montant…"
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
              <span className="search-item-type">{r.type === 'company' ? <IconBuilding width={14} height={14} /> : r.type === 'invoice' ? '🧾' : r.type === 'payment' ? '$' : <IconUser width={14} height={14} />}</span>
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

// Apparence Jour / Nuit (TASK-050) : réglage d'entreprise (Administration -> Entreprise), appliqué sur <html> le temps
// que l'écran interne est ouvert (la connexion et le portail client restent en mode jour). Gardé dans le navigateur
// pour éviter un éclair blanc au chargement ; l'événement « erpcrm-theme » l'applique tout de suite après un changement.
const THEME_KEY = 'erpcrm_theme'
function applyTheme(t) {
  try { localStorage.setItem(THEME_KEY, t) } catch { /* navigateur sans stockage */ }
  if (t === 'nuit') document.documentElement.setAttribute('data-theme', 'dark')
  else document.documentElement.removeAttribute('data-theme')
}

function initials(name) {
  return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

const ROLE_LABELS = { admin: 'Administrateur', manager: 'Gestionnaire', tech: 'Technicien', billing: 'Facturation', readonly: 'Lecture seule' }

export default function Layout({ user, onLogout, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const group = activeGroup(location.pathname)

  useEffect(() => {
    let saved = 'jour'
    try { saved = localStorage.getItem(THEME_KEY) || 'jour' } catch { /* navigateur sans stockage */ }
    applyTheme(saved)
    api.get('/v1/settings').then(r => applyTheme(r.data.ui_theme || 'jour')).catch(() => {})
    const onChange = e => applyTheme(e.detail)
    window.addEventListener('erpcrm-theme', onChange)
    return () => { window.removeEventListener('erpcrm-theme', onChange); document.documentElement.removeAttribute('data-theme') }
  }, [])

  return (
    <div className="layout">
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <nav className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`} aria-label="Menu principal">
        <div className="layout-brand">
          <div className="brand-icon">SI</div>
          <div className="brand-text"><div className="brand-name">Simple IP</div><div className="brand-sub">ERP·CRM</div></div>
        </div>
        {NAV.map(item => {
          if (item.group) {
            const g = GROUPS[item.group]
            return (
              <NavLink key={item.group} to={g.home} className={() => `sidebar-link${group === item.group ? ' active' : ''}`} onClick={() => setSidebarOpen(false)} title={g.label}>
                <span className="sidebar-icon"><g.Icon /></span>
                <span className="sidebar-label">{g.label}</span>
              </NavLink>
            )
          }
          const { to, label, Icon } = item
          return (
            <NavLink key={to} to={to} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} onClick={() => setSidebarOpen(false)} title={label}>
              <span className="sidebar-icon"><Icon /></span>
              <span className="sidebar-label">{label}</span>
            </NavLink>
          )
        })}
      </nav>

      <div className="layout-col">
        <header className="layout-header">
          <button className="hamburger-btn" onClick={() => setSidebarOpen(o => !o)} aria-label="Menu">☰</button>
          <GlobalSearch />
          <div className="layout-user">
            <div className="user-text">
              <div className="user-name">{user.full_name}</div>
              <div className="user-role">{ROLE_LABELS[user.role] || user.role}</div>
            </div>
            <NavLink to="/settings" className={({ isActive }) => `user-avatar${isActive ? ' active' : ''}`} title="Mon compte" aria-label="Mon compte">{initials(user.full_name)}</NavLink>
            <button onClick={onLogout} className="logout-btn">Déconnexion</button>
          </div>
        </header>

        <main className="layout-main">
          {group && <GroupTabs groupKey={group} path={location.pathname} />}
          {children}
        </main>
      </div>
    </div>
  )
}
