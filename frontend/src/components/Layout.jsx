import { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import api from '../services/api'
import {
  IconBuilding, IconUser, IconPackage, IconReceipt, IconTicket, IconFileText,
  IconClipboard, IconUsers, IconCheck, IconCalendar, IconServer, IconSettings, IconRefresh, IconBank, IconFlag, IconCart, IconMail, IconSearch,
} from './Icons'
import './Layout.css'
import { playReminder, showNotification, fmtSince } from './ticketReminder'
import ZekoPanel from './ZekoPanel'
import { listenForZeko } from '../utils/zekoBridge'
import ZekoDropPopup, { useZekoDropTarget } from './ZekoDrops'
import { useNavTrail } from './navTrail'
import { can } from '../utils/privileges'

// Groupes Ventes / Achats : une entree dans le menu de gauche, sous-menus en onglets
// horizontaux en haut de la page (demande de Philippe, 2026-10-02). `match` = autres
// prefixes d'adresse qui appartiennent a l'onglet (fiches de detail).
const GROUPS = {
  ventes: {
    label: 'Ventes', Icon: IconReceipt, home: '/invoices', sec: 'ventes',
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
    label: 'Achats', Icon: IconCart, home: '/purchases/bills', sec: 'achats',
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
  { to: '/companies', label: 'Compagnies', Icon: IconBuilding, sec: 'clients' },
  { to: '/contacts',  label: 'Contacts',   Icon: IconUser, sec: 'clients' },
  { to: '/catalogue', label: 'Catalogue',  Icon: IconPackage, sec: 'catalogue' },
  { to: '/mail',             label: 'Courriels',  Icon: IconMail, sec: 'courriels' },
  { to: '/tickets',          label: 'Tickets',    Icon: IconTicket, sec: 'tickets' },
  { group: 'ventes' },
  { group: 'achats' },
  { to: '/bank',             label: 'Banque',     Icon: IconBank, sec: 'banque' },
  { to: '/taxes',            label: 'Fiscalité',  Icon: IconFlag, sec: 'fiscalite' },
  { to: '/commandes',        label: 'Commandes',  Icon: IconClipboard, sec: 'commandes' },
  { to: '/employees',        label: 'Employés',   Icon: IconUsers, sec: ['employes', 'salaires', 'commissions', 'administration'] },
  { to: '/tasks',            label: 'Tâches',     Icon: IconCheck, sec: 'agenda' },
  { to: '/agenda',           label: 'Agenda',     Icon: IconCalendar, sec: 'agenda' },
  { to: '/server',           label: 'Serveur',    Icon: IconServer, sec: 'serveur' },
  { to: '/admin',            label: 'Admin',      Icon: IconSettings, sec: 'administration' },
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
      : result.type === 'conversation' ? `/tickets/${result.id}`
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
              <span className="search-item-type">{r.type === 'company' ? <IconBuilding width={14} height={14} /> : r.type === 'invoice' ? '🧾' : r.type === 'payment' ? '$' : r.type === 'conversation' ? '🎙️' : <IconUser width={14} height={14} />}</span>
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

// Chronos de ticket qui tournent pour moi (TASK-006.5) : quitter un ticket ne l'arrête pas, on les voit donc ici.
// Le battement (toutes les 30 s, sur toutes les pages) dit au serveur qu'un écran est ouvert : sans battement depuis
// 5 min, le serveur met mes chronos en pause. Rappel toutes les N minutes (Admin › Configuration › Tickets).
const REMINDED_KEY = 'erpcrm-ticket-reminded'
function readReminded() { try { return JSON.parse(localStorage.getItem(REMINDED_KEY) || '{}') } catch { return {} } }
function writeReminded(v) { try { localStorage.setItem(REMINDED_KEY, JSON.stringify(v)) } catch { /* sans stockage */ } }

function ActiveTimers() {
  const [timers, setTimers] = useState([])
  const [fetchedAt, setFetchedAt] = useState(Date.now())
  const [, setTick] = useState(0)
  const [cfg, setCfg] = useState(null)
  const [toasts, setToasts] = useState([])
  const remindedRef = useRef(null)
  const navigate = useNavigate()
  useEffect(() => {
    const beat = () => api.post('/v1/tickets/timers/heartbeat').then(r => { setTimers(r.data); setFetchedAt(Date.now()) }).catch(() => {})
    beat()
    const iv = setInterval(beat, 30000)
    window.addEventListener('erpcrm-timers', beat)
    return () => { clearInterval(iv); window.removeEventListener('erpcrm-timers', beat) }
  }, [])
  useEffect(() => {
    const load = () => api.get('/v1/settings').then(r => setCfg({
      minutes: r.data.ticket_reminder_minutes, sound: r.data.ticket_reminder_sound,
      volume: r.data.ticket_reminder_volume, visual: r.data.ticket_reminder_visual,
    })).catch(() => {})
    load()
    window.addEventListener('erpcrm-settings', load)
    return () => window.removeEventListener('erpcrm-settings', load)
  }, [])
  useEffect(() => {
    if (!timers.length) return
    const iv = setInterval(() => setTick(x => x + 1), 1000)
    return () => clearInterval(iv)
  }, [timers.length])

  const extra = Math.floor((Date.now() - fetchedAt) / 1000)

  // Rappel : une fois par tranche de N minutes depuis le démarrage du chrono (retenu par chrono, survit au rechargement)
  useEffect(() => {
    if (!cfg || !cfg.minutes || !timers.length) return
    const step = cfg.minutes * 60
    const seen = remindedRef.current || (remindedRef.current = readReminded())
    const keys = new Set()
    let changed = false
    for (const t of timers) {
      const key = `${t.ticket_id}|${t.started_at}`
      keys.add(key)
      const k = Math.floor((t.running_seconds + extra) / step)
      if (seen[key] === undefined) { seen[key] = k; changed = true; continue }   // ouverture de page : pas de rafale
      if (k > seen[key]) {
        seen[key] = k; changed = true
        const since = fmtSince(t.running_seconds + extra)
        setToasts(x => [...x.filter(y => y.ticket_id !== t.ticket_id), { ticket_id: t.ticket_id, number: t.number, company_name: t.company_name, since }])
        if (cfg.sound) playReminder(cfg.volume)
        if (cfg.visual) showNotification(`Ticket ${t.number} — ${t.company_name}`, `Chrono actif depuis ${since}`, () => navigate(`/tickets/${t.ticket_id}`))
      }
    }
    for (const key of Object.keys(seen)) if (!keys.has(key)) { delete seen[key]; changed = true }
    if (changed) writeReminded(seen)
  })

  const fmt = s => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }
  return (
    <>
      {timers.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 12, minWidth: 0 }}>
          {timers.map(t => (
            <button key={t.ticket_id} onClick={() => navigate(`/tickets/${t.ticket_id}`)} title={`${t.number} — ${t.title}`}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 10px', borderRadius: 14, border: '1px solid #059669',
                       background: 'var(--c-tint-green)', color: 'var(--c-on-green)', cursor: 'pointer', maxWidth: 260 }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{fmt(t.worked_seconds + extra)}</span>
              <span className="hide-phone" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.company_name}</span>
            </button>
          ))}
        </div>
      )}
      {toasts.length > 0 && (
        <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 1500, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {toasts.map(t => (
            <div key={t.ticket_id} style={{ background: 'var(--c-surface)', border: '2px solid #059669', borderRadius: 10, padding: '12px 16px', width: 320, boxShadow: '0 6px 24px rgba(0,0,0,.25)' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--c-text)' }}>Ticket {t.number} — {t.company_name}</div>
              <div style={{ fontSize: 13, color: 'var(--c-text-2)', margin: '4px 0 10px' }}>Chrono actif depuis {t.since}</div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setToasts(x => x.filter(y => y.ticket_id !== t.ticket_id))}>OK</button>
                <button className="btn-primary" style={{ fontSize: 12 }} onClick={() => { setToasts(x => x.filter(y => y.ticket_id !== t.ticket_id)); navigate(`/tickets/${t.ticket_id}`) }}>Ouvrir le ticket</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

export default function Layout({ user, onLogout, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [zekoOpen, setZekoOpen] = useState(false)
  const zekoDrop = useZekoDropTarget()       // fichiers glissés sur le bouton Zéko (TASK-006.9)
  const location = useLocation()
  useNavTrail()
  const group = activeGroup(location.pathname)
  const navigateTo = useNavigate()
  // Les pages que Zéko ouvre depuis sa fenêtre à part s'affichent ici (TASK-006.7)
  useEffect(() => listenForZeko(navigateTo), [])
  // Action refusée par les privilèges (TASK-007.4) : bandeau rouge, quelle que soit la page
  const [refus, setRefus] = useState(null)
  useEffect(() => {
    let t
    const on = e => { setRefus(e.detail); clearTimeout(t); t = setTimeout(() => setRefus(null), 7000) }
    window.addEventListener('erpcrm-refus', on)
    return () => { window.removeEventListener('erpcrm-refus', on); clearTimeout(t) }
  }, [])

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
        {NAV.filter(item => [].concat(item.group ? GROUPS[item.group].sec : item.sec).some(s => !s || can(s))).map(item => {
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
          <ActiveTimers />
          <div className="layout-user">
            {can('zeko', 'modifier') && <button onClick={() => setZekoOpen(true)} {...zekoDrop.props}
              title={zekoDrop.err || "Zéko — l'assistant d'ERPCRM. Glisse un document ici : Zéko le place au bon endroit"}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px 5px 6px', borderRadius: 18, border: `${zekoDrop.over ? 2 : 1}px ${zekoDrop.over ? 'dashed' : 'solid'} var(--brand)`,
                       background: zekoDrop.over ? 'var(--brand)' : 'var(--brand-bg)', color: zekoDrop.over ? '#fff' : 'var(--brand)', cursor: 'pointer', fontWeight: 700, fontSize: 13,
                       transform: zekoDrop.over ? 'scale(1.08)' : 'none', transition: 'transform .1s' }}>
              <span style={{ width: 22, height: 22, borderRadius: 11, background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>Z</span>
              <span className="hide-phone">Zéko</span>
            </button>}
            <div className="user-text">
              <div className="user-name">{user.full_name}</div>
              <div className="user-role">{user.profile || ROLE_LABELS[user.role] || user.role}</div>
            </div>
            <NavLink to="/settings" className={({ isActive }) => `user-avatar${isActive ? ' active' : ''}`} title="Mon compte" aria-label="Mon compte">{initials(user.full_name)}</NavLink>
            <button onClick={onLogout} className="logout-btn">Déconnexion</button>
          </div>
        </header>
        {refus && <div role="alert" style={{ margin: '8px 16px 0', padding: '8px 12px', borderRadius: 6, background: 'var(--c-tint-red)',
          color: 'var(--c-on-red)', fontWeight: 600, fontSize: 13 }}>✗ {refus}</div>}

        {zekoDrop.err && <div role="alert" style={{ margin: '8px 16px 0', padding: '8px 12px', borderRadius: 6, background: 'var(--c-tint-red)',
          color: 'var(--c-on-red)', fontWeight: 600, fontSize: 13 }}>✗ Zéko : {zekoDrop.err}</div>}
        {zekoOpen && <ZekoPanel onClose={() => setZekoOpen(false)} />}
        {can('zeko', 'modifier') && <ZekoDropPopup />}
        <main className="layout-main">
          {group && <GroupTabs groupKey={group} path={location.pathname} />}
          {children}
        </main>
      </div>
    </div>
  )
}
