import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../services/api'
import { IconBank, IconCalendar, IconSearch, IconSettings } from '../components/Icons'
import {
  ACCOUNT_TYPES, C, EMPTY, fmtDate, fmtMoney,
  Dropdown, MenuItem, Indicator, BankChart, AccountModal, StatementsModal,
} from './Bank'

// Fiche d'un compte de l'onglet Banque (TASK-042) -- interface et options.
// Aucune source de transactions n'est branchee : tableaux et montants vides.

const TABS = ['dashboard', 'unclassified', 'all']

const ALL_FILTERS = [
  { value: 'all',         label: 'Toutes les transactions' },
  { value: 'deposits',    label: 'Dépôts' },
  { value: 'withdrawals', label: 'Retraits' },
  { value: 'matched',     label: 'Mises en correspondance' },
  { value: 'classified',  label: 'Classées' },
  { value: 'manual',      label: 'Ajoutées manuellement' },
]

const PER_PAGE = [50, 100, 200]

const th = { padding: '10px 8px', fontWeight: 600, whiteSpace: 'nowrap' }

function InfoBox({ icon, title, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted }}>{icon}</div>
      <div>
        <div style={{ fontSize: 12, color: C.muted }}>{title}</div>
        <div style={{ fontSize: 17, fontWeight: 600 }}>{value}</div>
      </div>
    </div>
  )
}

function Tab({ active, title, sub, onClick, children }) {
  return (
    <div onClick={onClick} style={{ cursor: 'pointer', padding: '10px 16px 12px', borderBottom: `2px solid ${active ? C.link : 'transparent'}`, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flexShrink: 0 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: active ? 600 : 500, color: active ? '#111827' : C.muted }}>{title}</div>
        <div style={{ fontSize: 12, color: C.faint }}>{sub}</div>
      </div>
      {children}
    </div>
  )
}

function Pagination({ perPage, setPerPage, page = 0, setPage, total = 0 }) {
  const first = total ? page * perPage + 1 : 0
  const last = Math.min(total, (page + 1) * perPage)
  const navBtn = enabled => ({ background: 'none', border: 'none', color: enabled ? C.link : C.faint, cursor: enabled ? 'pointer' : 'default', fontSize: 16 })
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 12, fontSize: 13, color: C.muted }}>
      <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage?.(0) }} style={{ fontSize: 13, padding: '4px 6px', border: `1px solid ${C.border}`, borderRadius: 6 }}>
        {PER_PAGE.map(n => <option key={n} value={n}>{n} par page</option>)}
      </select>
      <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} style={navBtn(page > 0)}>‹</button>
      <span>{first} - {last}</span>
      <button type="button" disabled={last >= total} onClick={() => setPage(page + 1)} style={navBtn(last < total)}>›</button>
    </div>
  )
}

function SearchHeader({ open, setOpen, value, setValue }) {
  return (
    <th style={{ ...th, width: 40, textAlign: 'right' }}>
      {open && <input autoFocus className="search-input" placeholder="Rechercher..." value={value} onChange={e => setValue(e.target.value)} style={{ textTransform: 'none', fontSize: 13, width: 180, marginRight: 6 }} />}
      <button type="button" title="Rechercher" onClick={() => { setOpen(o => !o); setValue('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 0, verticalAlign: 'middle' }}>
        <IconSearch width={16} height={16} />
      </button>
    </th>
  )
}

function EmptyRow({ colSpan, children }) {
  return <tr><td colSpan={colSpan} style={{ textAlign: 'center', color: C.faint, padding: 32 }}>{children}</td></tr>
}

function Switch({ checked, onChange, label }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.muted, cursor: 'pointer', fontStyle: 'italic' }}>
      {label}
      <span onClick={() => onChange(!checked)} style={{ width: 32, height: 18, borderRadius: 9, background: checked ? C.link : '#D1D5DB', position: 'relative', transition: 'background .15s' }}>
        <span style={{ position: 'absolute', top: 2, left: checked ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
      </span>
    </label>
  )
}

function UnclassifiedTab({ transactions }) {
  const [sub, setSub] = useState('all')            // all | recognized
  const [excluded, setExcluded] = useState(false)
  const [multi, setMulti] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [perPage, setPerPage] = useState(200)
  const [page, setPage] = useState(0)
  const [desc, setDesc] = useState(true)
  const [selected, setSelected] = useState(new Set())

  const unclassified = transactions.filter(t => t.status === 'unclassified')
  // « Reconnu » = lignes que le rapprochement automatique propose d'associer -- aucune tant qu'il n'existe pas
  const base = excluded ? transactions.filter(t => t.status === 'excluded') : sub === 'recognized' ? [] : unclassified
  const q = search.trim().toLowerCase()
  const rows = base
    .filter(t => !q || [t.description, t.payee, t.reference, String(Math.abs(t.amount))].some(v => (v || '').toLowerCase().includes(q)))
    .sort((a, b) => (desc ? -1 : 1) * a.posted_date.localeCompare(b.posted_date))
  const pageRows = rows.slice(page * perPage, (page + 1) * perPage)
  const allChecked = pageRows.length > 0 && pageRows.every(t => selected.has(t.id))
  function toggle(id) { setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function toggleAll() { setSelected(s => { const n = new Set(s); pageRows.forEach(t => allChecked ? n.delete(t.id) : n.add(t.id)); return n }) }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="filter-tabs">
          <button className={`filter-tab${sub === 'all' && !excluded ? ' active' : ''}`} onClick={() => { setSub('all'); setExcluded(false); setPage(0) }}>Tout ({unclassified.length})</button>
          <button className={`filter-tab${sub === 'recognized' && !excluded ? ' active' : ''}`} onClick={() => { setSub('recognized'); setExcluded(false); setPage(0) }}>Reconnu (0)</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Switch checked={multi} onChange={setMulti} label="Correspondance & sélection multiple" />
          <button type="button" onClick={() => { setExcluded(e => !e); setPage(0) }} style={{ background: 'none', border: 'none', padding: 0, fontSize: 13, color: excluded ? C.link : C.muted, cursor: 'pointer', fontWeight: excluded ? 600 : 400 }}>Exclu</button>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${C.border}` }}>
              <th style={{ ...th, width: 32 }}><input type="checkbox" checked={allChecked} disabled={!pageRows.length} onChange={toggleAll} /></th>
              <th style={{ ...th, cursor: 'pointer' }} onClick={() => setDesc(d => !d)}>Date {desc ? '↓' : '↑'}</th>
              <th style={th}>Détails du relevé</th>
              <th style={{ ...th, textAlign: 'right' }}>Dépôts</th>
              <th style={{ ...th, textAlign: 'right' }}>Retraits</th>
              <SearchHeader open={searchOpen} setOpen={setSearchOpen} value={search} setValue={v => { setSearch(v); setPage(0) }} />
            </tr>
          </thead>
          <tbody>
            {pageRows.map(t => (
              <tr key={t.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '10px 8px' }}><input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} /></td>
                <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{fmtDate(t.posted_date + 'T00:00:00')}</td>
                <td style={{ padding: '10px 8px' }}>
                  <div>Description : {t.description || EMPTY}</div>
                  {(t.payee || t.reference) && <div style={{ fontSize: 12, color: C.muted }}>{t.payee ? `Bénéficiaire : ${t.payee}` : ''}{t.payee && t.reference ? ' · ' : ''}{t.reference ? `Réf. : ${t.reference}` : ''}</div>}
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>{t.amount > 0 ? fmtMoney(t.amount) : ''}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>{t.amount < 0 ? fmtMoney(-t.amount) : ''}</td>
                <td />
              </tr>
            ))}
            {pageRows.length === 0 && (
              <EmptyRow colSpan={6}>
                {excluded ? 'Aucune transaction exclue.'
                  : q ? 'Aucune transaction ne correspond à la recherche.'
                  : sub === 'recognized' ? 'Aucune transaction reconnue : le rapprochement automatique n\'existe pas encore.'
                  : 'Aucune transaction non classée. Importez un relevé (bouton Relevés bancaires) : ses lignes apparaîtront ici.'}
              </EmptyRow>
            )}
          </tbody>
        </table>
      </div>
      <Pagination perPage={perPage} setPerPage={setPerPage} page={page} setPage={setPage} total={rows.length} />
    </div>
  )
}

function AllTransactionsTab() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [perPage, setPerPage] = useState(200)
  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${C.border}` }}>
              <th style={th}>Date ↕</th>
              <th style={th}>N° de référence</th>
              <th style={th}>Type</th>
              <th style={th}>Statut</th>
              <th style={{ ...th, textAlign: 'right' }}>Dépôts</th>
              <th style={{ ...th, textAlign: 'right' }}>Retraits</th>
              <th style={{ ...th, textAlign: 'right' }}>Solde actuel</th>
              <SearchHeader open={searchOpen} setOpen={setSearchOpen} value={search} setValue={setSearch} />
            </tr>
          </thead>
          <tbody>
            <EmptyRow colSpan={8}>Aucune transaction dans ERPCRM pour ce compte.</EmptyRow>
          </tbody>
        </table>
      </div>
      <Pagination perPage={perPage} setPerPage={setPerPage} />
    </div>
  )
}

function DashboardTab({ account, internal }) {
  // Depots / retraits de la plage affichee par le graphique
  const [totals, setTotals] = useState(null)
  return (
    <div>
      <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
        <Indicator icon={<IconBank color={C.bank} />} iconBg="#ECFDF5" title={internal ? 'Solde du compte' : 'Solde bancaire'} value={fmtMoney(account.bank_balance)} />
        <Indicator icon={<span style={{ color: C.green, fontWeight: 700 }}>+</span>} iconBg="#ECFDF5" title="Entrées de la période" value={totals ? fmtMoney(totals.deposits) : EMPTY} />
        <Indicator icon={<span style={{ color: C.red, fontWeight: 700 }}>−</span>} iconBg="#FEF2F2" title="Sorties de la période" value={totals ? fmtMoney(totals.withdrawals) : EMPTY} />
      </div>
      <BankChart accountId={account.id} onTotals={setTotals} />
    </div>
  )
}

export default function BankAccountDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [showStatements, setShowStatements] = useState(false)
  const [allFilter, setAllFilter] = useState('all')
  const [transactions, setTransactions] = useState([])

  async function load() {
    const [r, t] = await Promise.all([
      api.get('/v1/bank/accounts', { params: { include_inactive: true } }),
      api.get(`/v1/bank/accounts/${id}/transactions`, { params: { status_filter: 'all' } }).catch(() => ({ data: [] })),
    ])
    setAccounts(r.data)
    setTransactions(t.data)
    setLoading(false)
  }
  useEffect(() => { load() }, [id])

  if (loading) return <div className="page"><div className="loading">Chargement...</div></div>
  const account = accounts.find(a => a.id === id)
  if (!account) return <div className="page"><div className="loading">Compte introuvable.</div></div>

  const internal = account.account_type === 'petty_cash'
  const T = ACCOUNT_TYPES[account.account_type] || ACCOUNT_TYPES.bank
  // La petite caisse n'a pas de releves bancaires : pas d'onglet Non classees
  const tabs = internal ? TABS.filter(t => t !== 'unclassified') : TABS
  const requested = params.get('tab')
  const tab = tabs.includes(requested) ? requested : (internal ? 'all' : 'unclassified')
  const setTab = t => setParams({ tab: t }, { replace: true })
  const switchable = accounts.filter(a => a.is_active || a.id === id)

  return (
    <div className="page">
      {/* En-tete du compte */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Dropdown label={account.name} buttonStyle={{ fontSize: 22, fontWeight: 700 }}>
              {switchable.map(a => (
                <MenuItem key={a.id} active={a.id === id} onClick={() => navigate(`/bank/${a.id}`)}>{a.name}{a.is_active ? '' : ' (inactif)'}</MenuItem>
              ))}
            </Dropdown>
            {!internal && account.feed_connected && <span title="Connexion bancaire active" style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, display: 'inline-block' }} />}
            {!account.is_active && <span style={{ fontSize: 12, color: C.muted }}>(inactif)</span>}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
            {internal ? T.label : `Numéro de compte : ${account.account_last4 ? `xxxx${account.account_last4}` : EMPTY}${account.institution ? ` · ${account.institution}` : ''}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {!internal && <button className="btn-secondary" onClick={() => setShowStatements(true)}>Relevés bancaires</button>}
          {!internal && <button className="btn-primary" disabled title="Disponible quand des transactions seront reçues de la banque">Catégorisation rapide</button>}
          <Dropdown label="Ajouter une transaction" align="right" buttonStyle={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', background: '#fff', fontSize: 13 }}>
            <div style={{ padding: '6px 10px 2px', fontSize: 11, color: C.faint, textTransform: 'uppercase' }}>Dépôts</div>
            <MenuItem disabled>Paiement de client</MenuItem>
            <MenuItem disabled>Dépôt</MenuItem>
            <MenuItem disabled>Virement depuis un autre compte</MenuItem>
            <div style={{ padding: '6px 10px 2px', fontSize: 11, color: C.faint, textTransform: 'uppercase' }}>Retraits</div>
            <MenuItem disabled>Dépense</MenuItem>
            <MenuItem disabled>Paiement de fournisseur</MenuItem>
            <MenuItem disabled>Virement vers un autre compte</MenuItem>
          </Dropdown>
          <button className="btn-secondary" disabled title="Disponible à une prochaine étape">Enregistrer un dépôt</button>
          <button type="button" title="Réglages du compte" onClick={() => setEditing(true)} style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 9px', cursor: 'pointer', color: C.muted, display: 'flex' }}>
            <IconSettings width={16} height={16} />
          </button>
          <button type="button" title="Retour à l'aperçu bancaire" onClick={() => navigate('/bank')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, fontSize: 20, lineHeight: 1, padding: '4px 6px' }}>✕</button>
        </div>
      </div>

      {/* Montants + actualisation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <InfoBox icon={<T.Icon />} title="Montant dans ERPCRM" value={EMPTY} />
          {!internal && <InfoBox icon={<IconBank />} title="Montant en banque" value={fmtMoney(account.bank_balance)} />}
          {!internal && <InfoBox icon={<IconCalendar />} title="Dernière date de flux" value={account.last_feed_date ? fmtDate(account.last_feed_date + 'T00:00:00') : EMPTY} />}
        </div>
        {!internal && (
          <div style={{ textAlign: 'right', fontSize: 13, color: C.muted }}>
            <div>{account.last_synced_at ? `Dernière actualisation le ${fmtDate(account.last_synced_at)}` : 'Jamais actualisé'}</div>
            <span title="Aucune connexion bancaire" style={{ fontSize: 12, color: C.faint, cursor: 'not-allowed' }}>↻ Actualiser les flux</span>
          </div>
        )}
      </div>

      {/* Onglets */}
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '0 24px 20px' }}>
        <div style={{ display: 'flex', gap: 8, borderBottom: `1px solid ${C.border}`, marginBottom: 16, overflowX: 'auto' }}>
          <Tab active={tab === 'dashboard'} title="Tableau de bord" sub="Résumé du compte" onClick={() => setTab('dashboard')} />
          {!internal && (
            <Tab active={tab === 'unclassified'} title={<span><span style={{ color: C.red }}>{account.unclassified_count}</span> Transactions non classées</span>} sub="À partir des relevés bancaires" onClick={() => setTab('unclassified')} />
          )}
          <Tab active={tab === 'all'} title={ALL_FILTERS.find(f => f.value === allFilter)?.label} sub="Dans ERPCRM" onClick={() => setTab('all')}>
            <span onClick={e => e.stopPropagation()}>
              <Dropdown label="" buttonStyle={{ color: C.muted }}>
                {ALL_FILTERS.map(f => <MenuItem key={f.value} active={f.value === allFilter} onClick={() => { setAllFilter(f.value); setTab('all') }}>{f.label}</MenuItem>)}
              </Dropdown>
            </span>
          </Tab>
        </div>
        {tab === 'dashboard' && <DashboardTab key={id} account={account} internal={internal} />}
        {tab === 'unclassified' && <UnclassifiedTab key={id} transactions={transactions} />}
        {tab === 'all' && <AllTransactionsTab />}
      </div>

      {editing && (
        <AccountModal initial={account} isNew={false} onClose={() => setEditing(false)} onSaved={async () => { setEditing(false); await load() }} />
      )}
      {showStatements && (
        <StatementsModal accounts={accounts.filter(a => a.is_active && a.account_type !== 'petty_cash')} initialAccountId={id} onClose={() => setShowStatements(false)} onImported={load} />
      )}
    </div>
  )
}
