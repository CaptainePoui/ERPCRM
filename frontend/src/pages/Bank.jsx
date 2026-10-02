import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import api from '../services/api'
import { IconBank, IconCreditCard, IconCash, IconSearch, IconChevronDown, IconCalendar } from '../components/Icons'

// Onglet Banque (TASK-042) -- interface et options. Aucune source de transactions
// n'est branchee : soldes, non classees et graphique affichent un etat vide.

export const ACCOUNT_TYPES = {
  bank:        { label: 'Compte bancaire', Icon: IconBank },
  credit_card: { label: 'Carte de crédit', Icon: IconCreditCard },
  petty_cash:  { label: 'Petite caisse',   Icon: IconCash },
}

// Regroupement du graphique : chaque choix affiche un nombre fixe de periodes (voir backend core/bank_chart.py)
export const GRANULARITIES = [
  { value: 'day',         label: 'Jour',            range: '30 derniers jours' },
  { value: 'week',        label: 'Semaine',         range: '12 dernières semaines' },
  { value: 'biweek',      label: '2 semaines',      range: '26 dernières semaines' },
  { value: 'month',       label: 'Mois',            range: '12 derniers mois' },
  { value: 'semester',    label: 'Semestre',        range: '3 dernières années' },
  { value: 'year',        label: 'Année',           range: '5 dernières années' },
  { value: 'fiscal_year', label: 'Année imposable', range: '5 derniers exercices' },
]

const LIST_FILTERS = [
  { value: 'active',   label: 'Comptes actifs' },
  { value: 'inactive', label: 'Comptes inactifs' },
  { value: 'all',      label: 'Tous les comptes' },
]

export const C = {
  border: '#E5E7EB',
  muted: '#6B7280',
  faint: '#9CA3AF',
  link: '#1F5AA6',
  green: '#059669',
  red: '#DC2626',
  cash: '#6B7280',
  bank: '#059669',
}

export const EMPTY = '—'

export function fmtMoney(v) {
  return v == null ? EMPTY : new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(v)
}

export function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString('fr-CA') : null
}

export function Dropdown({ label, children, align = 'left', buttonStyle }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', font: 'inherit', ...buttonStyle }}>
        {label} <IconChevronDown width={14} height={14} />
      </button>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'absolute', top: '100%', [align]: 0, marginTop: 6, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,.08)', minWidth: 200, zIndex: 20, padding: 4 }}>
          {children}
        </div>
      )}
    </div>
  )
}

export function MenuItem({ onClick, active, disabled, children }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{ display: 'block', width: '100%', textAlign: 'left', background: active ? '#EFF6FF' : 'none', border: 'none', borderRadius: 6, padding: '8px 10px', fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer', color: disabled ? C.faint : active ? C.link : '#111827' }}>
      {children}
    </button>
  )
}

export function Indicator({ icon, iconBg, title, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
      <div>
        <div style={{ fontSize: 13, color: C.muted }}>{title}</div>
        <div style={{ fontSize: 20, fontWeight: 600 }}>{value}</div>
      </div>
    </div>
  )
}

export default function Bank() {
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState('all')        // 'all' ou id d'un compte
  const [showChart, setShowChart] = useState(true)
  const [listFilter, setListFilter] = useState('active')
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)      // null | { mode: 'new', type } | { mode: 'edit', account }
  const [showStatements, setShowStatements] = useState(false)
  const [showRules, setShowRules] = useState(false)

  async function load() {
    const r = await api.get('/v1/bank/accounts', { params: { include_inactive: true } })
    setAccounts(r.data)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const activeAccounts = accounts.filter(a => a.is_active)
  const scopeAccount = scope === 'all' ? null : accounts.find(a => a.id === scope)
  const inScope = scopeAccount ? [scopeAccount] : activeAccounts
  const unclassifiedTotal = inScope.reduce((n, a) => n + (a.unclassified_count || 0), 0)
  // Solde bancaire : comptes bancaires seulement (une carte de credit est une dette), solde fourni par le dernier releve
  const withBalance = inScope.filter(a => a.account_type === 'bank' && a.bank_balance != null)
  const bankBalance = withBalance.length ? withBalance.reduce((n, a) => n + a.bank_balance, 0) : null
  const classifyTarget = scopeAccount && scopeAccount.account_type !== 'petty_cash'
    ? scopeAccount
    : activeAccounts.find(a => a.account_type !== 'petty_cash')

  const listed = accounts
    .filter(a => listFilter === 'all' || (listFilter === 'active' ? a.is_active : !a.is_active))
    .filter(a => {
      const q = search.trim().toLowerCase()
      if (!q) return true
      return [a.name, a.institution, a.account_last4].some(v => (v || '').toLowerCase().includes(q))
    })

  async function toggleActive(a) {
    if (a.is_active && !confirm(`Désactiver le compte « ${a.name} » ? Il restera consultable dans les comptes inactifs.`)) return
    await api.put(`/v1/bank/accounts/${a.id}`, { is_active: !a.is_active })
    if (a.is_active && scope === a.id) setScope('all')
    await load()
  }

  if (loading) return <div className="page"><div className="loading">Chargement...</div></div>

  return (
    <div className="page">
      {/* En-tete : actions generales de la banque */}
      <div className="page-header" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">Aperçu bancaire</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={() => setShowStatements(true)}>Relevés bancaires</button>
          <button className="btn-primary" onClick={() => setEditing({ mode: 'new', type: 'bank' })}>Ajouter une banque ou une carte de crédit</button>
          <button className="btn-secondary" onClick={() => setShowRules(true)}>Gérer les règles de transaction</button>
          <Dropdown label="Plus" align="right" buttonStyle={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', background: '#fff', fontSize: 13 }}>
            <MenuItem onClick={() => setEditing({ mode: 'new', type: 'petty_cash' })}>Ajouter une petite caisse</MenuItem>
            <MenuItem onClick={() => setListFilter('inactive')}>Afficher les comptes inactifs</MenuItem>
          </Dropdown>
        </div>
      </div>

      {/* Grand panneau : resume, indicateurs, graphique */}
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
          <Dropdown label={scopeAccount ? scopeAccount.name : 'Tous les comptes'} buttonStyle={{ fontSize: 17, fontWeight: 600 }}>
            <MenuItem active={scope === 'all'} onClick={() => setScope('all')}>Tous les comptes</MenuItem>
            {activeAccounts.map(a => (
              <MenuItem key={a.id} active={scope === a.id} onClick={() => setScope(a.id)}>{a.name}</MenuItem>
            ))}
          </Dropdown>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
            <Indicator icon={<IconCash color={C.cash} />} iconBg="#F3F4F6" title="Espèces disponibles" value={EMPTY} />
            <Indicator icon={<IconBank color={C.bank} />} iconBg="#ECFDF5" title="Solde bancaire" value={fmtMoney(bankBalance)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#FEF2F2', color: C.red, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16 }}>{unclassifiedTotal}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Transactions non classées</div>
              {/* Raccourci vers le traitement : le compte choisi, sinon le premier compte synchronisable */}
              {classifyTarget
                ? <button type="button" onClick={() => navigate(`/bank/${classifyTarget.id}?tab=unclassified`)} style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: C.link, cursor: 'pointer' }}>Classer maintenant ›</button>
                : <span title="Aucun compte bancaire ou carte de crédit" style={{ fontSize: 12, color: C.faint, cursor: 'not-allowed' }}>Classer maintenant ›</span>}
            </div>
          </div>
        </div>

        <button type="button" onClick={() => setShowChart(s => !s)} style={{ marginTop: 20, background: 'none', border: 'none', padding: 0, color: C.link, fontSize: 13, cursor: 'pointer' }}>
          {showChart ? 'Masquer le graphique ▲' : 'Afficher le graphique ▼'}
        </button>

        {showChart && <BankChart accountId={scope === 'all' ? undefined : scope} />}
      </div>

      {/* Comptes */}
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px' }}>
        <div style={{ marginBottom: 12 }}>
          <Dropdown label={LIST_FILTERS.find(f => f.value === listFilter)?.label} buttonStyle={{ fontSize: 17, fontWeight: 600 }}>
            {LIST_FILTERS.map(f => <MenuItem key={f.value} active={f.value === listFilter} onClick={() => setListFilter(f.value)}>{f.label}</MenuItem>)}
          </Dropdown>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>
                <th style={{ padding: '10px 8px', fontWeight: 600 }}>
                  {searchOpen
                    ? <input autoFocus className="search-input" placeholder="Rechercher un compte..." value={search} onChange={e => setSearch(e.target.value)} style={{ textTransform: 'none', fontSize: 13 }} />
                    : 'Détails du compte'}
                </th>
                <th style={{ padding: '10px 8px', fontWeight: 600 }}>Non classé</th>
                <th style={{ padding: '10px 8px', fontWeight: 600 }}>Chèques en attente</th>
                <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'right' }}>Montant en banque</th>
                <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'right' }}>Montant dans ERPCRM</th>
                <th style={{ padding: '10px 8px', width: 40, textAlign: 'right' }}>
                  <button type="button" title="Rechercher" onClick={() => { setSearchOpen(o => !o); setSearch('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 0 }}>
                    <IconSearch width={16} height={16} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {listed.map(a => {
                const T = ACCOUNT_TYPES[a.account_type] || ACCOUNT_TYPES.bank
                const internal = a.account_type === 'petty_cash'
                return (
                  <tr key={a.id} style={{ borderBottom: `1px solid ${C.border}`, opacity: a.is_active ? 1 : 0.55 }}>
                    <td style={{ padding: '14px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <T.Icon color={C.muted} style={{ flexShrink: 0 }} />
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button type="button" onClick={() => navigate(`/bank/${a.id}`)} style={{ background: 'none', border: 'none', padding: 0, color: C.link, fontSize: 14, cursor: 'pointer' }}>{a.name}</button>
                            {!internal && a.feed_connected && (
                              <span title="Connexion bancaire active" style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, display: 'inline-block' }} />
                            )}
                            {!a.is_active && <span style={{ fontSize: 11, color: C.muted }}>(inactif)</span>}
                          </div>
                          {!internal && (
                            <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>
                              {a.account_last4 ? `xxxx${a.account_last4}` : T.label}
                              {' | '}
                              {a.feed_connected && a.last_synced_at ? `Mis à jour le : ${fmtDate(a.last_synced_at)}` : 'Aucune connexion bancaire'}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 8px' }}>
                      {internal ? '' : a.unclassified_count > 0
                        ? <button type="button" onClick={() => navigate(`/bank/${a.id}?tab=unclassified`)} style={{ background: 'none', border: 'none', padding: 0, color: C.red, cursor: 'pointer', fontSize: 13 }}>{a.unclassified_count} transaction{a.unclassified_count > 1 ? 's' : ''}</button>
                        : <span style={{ color: C.faint }}>{EMPTY}</span>}
                    </td>
                    <td style={{ padding: '14px 8px', color: C.faint }}>{internal ? '' : EMPTY}</td>
                    <td style={{ padding: '14px 8px', textAlign: 'right', color: a.bank_balance == null ? C.faint : undefined }}>{internal ? '' : fmtMoney(a.bank_balance)}</td>
                    <td style={{ padding: '14px 8px', color: C.faint, textAlign: 'right' }}>{EMPTY}</td>
                    <td style={{ padding: '14px 8px', textAlign: 'right' }}>
                      <Dropdown align="right" label="" buttonStyle={{ width: 26, height: 26, borderRadius: '50%', border: `1px solid ${C.border}`, justifyContent: 'center', color: C.muted, gap: 0 }}>
                        <MenuItem onClick={() => navigate(`/bank/${a.id}`)}>Ouvrir le compte</MenuItem>
                        <MenuItem onClick={() => setEditing({ mode: 'edit', account: a })}>Modifier</MenuItem>
                        <MenuItem onClick={() => toggleActive(a)}>{a.is_active ? 'Désactiver' : 'Réactiver'}</MenuItem>
                      </Dropdown>
                    </td>
                  </tr>
                )
              })}
              {listed.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: C.faint, padding: 24 }}>
                  {accounts.length === 0 ? 'Aucun compte — ajoutez une banque, une carte de crédit ou une petite caisse.' : 'Aucun compte dans cette vue.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <AccountModal
          initial={editing.mode === 'edit' ? editing.account : { account_type: editing.type }}
          isNew={editing.mode === 'new'}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load() }}
        />
      )}
      {showStatements && <StatementsModal accounts={activeAccounts.filter(a => a.account_type !== 'petty_cash')} onClose={() => setShowStatements(false)} onImported={load} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  )
}

const fmtAxis = v => Math.abs(v) >= 1000 ? `${Math.round(v / 1000)} k` : `${Math.round(v)}`

// Entrees (barres vertes), sorties (barres rouges) et solde (courbe) par periode.
// accountId absent : tous les comptes bancaires actifs. onTotals : totaux de la plage affichee.
export function BankChart({ accountId, onTotals }) {
  const [granularity, setGranularity] = useState(() => {
    try { return localStorage.getItem('bank_chart_granularity') || 'month' } catch { return 'month' }
  })
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    setError(null)
    api.get('/v1/bank/chart', { params: { granularity, offset, account_id: accountId || undefined } })
      .then(r => { if (alive) { setData(r.data); onTotals?.(r.data.totals) } })
      .catch(() => { if (alive) setError('Impossible de charger le graphique') })
    return () => { alive = false }
  }, [granularity, offset, accountId])

  function choose(g) {
    setGranularity(g); setOffset(0)
    try { localStorage.setItem('bank_chart_granularity', g) } catch { /* stockage indisponible */ }
  }

  const G = GRANULARITIES.find(x => x.value === granularity)
  const empty = data && data.buckets.every(b => !b.deposits && !b.withdrawals && b.balance == null)
  const arrow = enabled => ({ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 6, width: 28, height: 28, cursor: enabled ? 'pointer' : 'default', color: enabled ? '#111827' : C.faint })

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" title="Période précédente" disabled={!data?.has_older} onClick={() => setOffset(o => o + 1)} style={arrow(data?.has_older)}>‹</button>
          <span style={{ fontSize: 13, color: C.muted, minWidth: 190, textAlign: 'center' }}>
            {data ? `${fmtDate(data.range_start + 'T00:00:00')} au ${fmtDate(data.range_end + 'T00:00:00')}` : ' '}
          </span>
          <button type="button" title="Période suivante" disabled={!data?.has_newer} onClick={() => setOffset(o => Math.max(0, o - 1))} style={arrow(data?.has_newer)}>›</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.muted }}>
          Regrouper par
          <Dropdown label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconCalendar width={14} height={14} /> {G?.label}</span>} align="right" buttonStyle={{ fontSize: 13, color: '#111827', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', background: '#fff' }}>
            {GRANULARITIES.map(x => (
              <MenuItem key={x.value} active={x.value === granularity} onClick={() => choose(x.value)}>
                {x.label} <span style={{ color: C.faint, fontSize: 12 }}>· {x.range}</span>
              </MenuItem>
            ))}
          </Dropdown>
        </div>
      </div>
      <div style={{ position: 'relative', height: 300, marginTop: 12 }}>
        {data && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.buckets} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#F3F4F6" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.faint }} tickLine={false} axisLine={{ stroke: C.border }} interval="preserveStartEnd" minTickGap={16} />
              <YAxis yAxisId="flow" tickFormatter={fmtAxis} tick={{ fontSize: 11, fill: C.faint }} tickLine={false} axisLine={false} width={44} />
              {data.has_balance && <YAxis yAxisId="balance" orientation="right" tickFormatter={fmtAxis} tick={{ fontSize: 11, fill: C.faint }} tickLine={false} axisLine={false} width={44} />}
              <Tooltip formatter={(v, name) => [v == null ? EMPTY : fmtMoney(v), name]} labelStyle={{ fontWeight: 600 }} />
              <Legend iconType="square" wrapperStyle={{ fontSize: 13 }} />
              <Bar yAxisId="flow" dataKey="deposits" name="Entrées" fill="#10B981" radius={[3, 3, 0, 0]} maxBarSize={36} />
              <Bar yAxisId="flow" dataKey="withdrawals" name="Sorties" fill="#F87171" radius={[3, 3, 0, 0]} maxBarSize={36} />
              {data.has_balance && <Line yAxisId="balance" type="monotone" dataKey="balance" name="Solde" stroke={C.link} strokeWidth={2} dot={false} connectNulls={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        )}
        {(error || empty) && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', color: error ? C.red : C.faint, fontSize: 13 }}>
            {error || 'Aucune donnée pour cette période'}
          </div>
        )}
      </div>
    </div>
  )
}

export function AccountModal({ initial, isNew, onClose, onSaved }) {
  const [form, setForm] = useState({
    account_type: initial.account_type || 'bank',
    name: initial.name || '',
    institution: initial.institution || '',
    account_last4: initial.account_last4 || '',
    notes: initial.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const internal = form.account_type === 'petty_cash'

  async function save() {
    setSaving(true); setError(null)
    const payload = {
      account_type: form.account_type,
      name: form.name.trim(),
      institution: internal ? null : (form.institution.trim() || null),
      account_last4: internal ? null : (form.account_last4.trim() || null),
      notes: form.notes.trim() || null,
    }
    try {
      if (isNew) await api.post('/v1/bank/accounts', payload)
      else await api.put(`/v1/bank/accounts/${initial.id}`, payload)
      await onSaved()
    } catch (e) {
      const d = e.response?.data?.detail
      setError(Array.isArray(d) ? d.map(x => x.msg.replace(/^Value error, /, '')).join(' ; ') : (d || 'Erreur'))
    } finally { setSaving(false) }
  }

  const valid = form.name.trim() && (internal || !form.account_last4 || /^\d{4}$/.test(form.account_last4))

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 420 }}>
        <h3 className="modal-title">{isNew ? 'Ajouter un compte' : 'Modifier le compte'}</h3>
        <div className="form-group">
          <label>Type de compte</label>
          <select value={form.account_type} onChange={e => f('account_type', e.target.value)}>
            {Object.entries(ACCOUNT_TYPES).map(([v, t]) => <option key={v} value={v}>{t.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Nom du compte</label>
          <input autoFocus value={form.name} onChange={e => f('name', e.target.value)} placeholder={internal ? 'Petite caisse' : 'Compte d\'opérations'} />
        </div>
        {!internal && (
          <>
            <div className="form-group">
              <label>Institution financière</label>
              <input value={form.institution} onChange={e => f('institution', e.target.value)} placeholder="Ex. Desjardins" />
            </div>
            <div className="form-group">
              <label>4 derniers chiffres du numéro</label>
              <input value={form.account_last4} maxLength={4} inputMode="numeric" onChange={e => f('account_last4', e.target.value.replace(/\D/g, ''))} placeholder="1234" />
            </div>
          </>
        )}
        <div className="form-group">
          <label>Notes (optionnel)</label>
          <input value={form.notes} onChange={e => f('notes', e.target.value)} />
        </div>
        {error && <div style={{ color: C.red, fontSize: 13 }}>{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving || !valid}>{saving ? '...' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}

// Import de releves OFX/QFX/QBO ou CSV : apercu (rien d'enregistre) puis import des nouvelles lignes
export function StatementsModal({ accounts, initialAccountId, onClose, onImported }) {
  const [accountId, setAccountId] = useState(initialAccountId || accounts[0]?.id || '')
  const [file, setFile] = useState(null)
  const [fileKey, setFileKey] = useState(0)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const [history, setHistory] = useState([])

  async function loadHistory(id = accountId) {
    if (!id) { setHistory([]); return }
    const r = await api.get(`/v1/bank/accounts/${id}/statements`)
    setHistory(r.data)
  }
  useEffect(() => { loadHistory() }, [accountId])

  function errText(e) {
    const d = e.response?.data?.detail
    return Array.isArray(d) ? d.map(x => x.msg).join(' ; ') : (d || 'Erreur lors de la lecture du fichier')
  }

  async function send(f, dryRun) {
    const fd = new FormData()
    fd.append('file', f)
    fd.append('dry_run', dryRun ? 'true' : 'false')
    return (await api.post(`/v1/bank/accounts/${accountId}/statements`, fd)).data
  }

  async function analyze(f, id = accountId) {
    setFile(f); setPreview(null); setError(null); setDone(null)
    if (!f || !id) return
    setBusy(true)
    try { setPreview(await send(f, true)) } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  async function doImport() {
    setBusy(true); setError(null)
    try {
      const r = await send(file, false)
      setDone(r); setPreview(null); setFile(null); setFileKey(k => k + 1)
      await loadHistory(); await onImported?.()
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  async function cancelImport(imp) {
    if (!confirm(`Annuler l'import « ${imp.filename} » ? Ses ${imp.rows_new} transaction(s) seront retirées du compte.`)) return
    try {
      await api.delete(`/v1/bank/statements/${imp.id}`)
      await loadHistory(); await onImported?.()
    } catch (e) { setError(errText(e)) }
  }

  const period = (a, b) => a ? `${fmtDate(a + 'T00:00:00')} au ${fmtDate(b + 'T00:00:00')}` : EMPTY

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 620, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 className="modal-title">Relevés bancaires</h3>
        <div className="form-group">
          <label>Compte</label>
          <select value={accountId} onChange={e => { setAccountId(e.target.value); if (file) analyze(file, e.target.value) }} disabled={accounts.length === 0}>
            {accounts.length === 0 && <option value="">Aucun compte bancaire ou carte de crédit</option>}
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}{a.account_last4 ? ` (xxxx${a.account_last4})` : ''}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Fichier de relevé (OFX, QFX, QBO ou CSV)</label>
          <input key={fileKey} type="file" accept=".ofx,.qfx,.qbo,.csv,.txt" disabled={!accountId || busy} onChange={e => analyze(e.target.files[0] || null)} />
        </div>

        {busy && <div style={{ fontSize: 13, color: C.muted }}>Lecture du fichier...</div>}
        {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: C.red, borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>{error}</div>}
        {done && (
          <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
            {done.rows_new} transaction{done.rows_new > 1 ? 's' : ''} importée{done.rows_new > 1 ? 's' : ''}{done.rows_duplicate ? ` (${done.rows_duplicate} déjà présente${done.rows_duplicate > 1 ? 's' : ''}, ignorée${done.rows_duplicate > 1 ? 's' : ''})` : ''}{done.rows_zero_skipped ? `, ${done.rows_zero_skipped} ligne${done.rows_zero_skipped > 1 ? 's' : ''} à 0,00 $ ignorée${done.rows_zero_skipped > 1 ? 's' : ''}` : ''}. Elles sont dans « Transactions non classées ».
          </div>
        )}

        {preview && (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div><strong>Aperçu</strong> — format {preview.file_format.toUpperCase()}, période du {period(preview.period_start, preview.period_end)}</div>
            <div>{preview.rows_total} transaction{preview.rows_total > 1 ? 's' : ''} : <strong style={{ color: C.green }}>{preview.rows_new} nouvelle{preview.rows_new > 1 ? 's' : ''}</strong>{preview.rows_duplicate ? `, ${preview.rows_duplicate} déjà importée${preview.rows_duplicate > 1 ? 's' : ''} (ignorée${preview.rows_duplicate > 1 ? 's' : ''})` : ''}</div>
            {preview.rows_zero_skipped > 0 && <div style={{ color: C.muted }}>{preview.rows_zero_skipped} ligne{preview.rows_zero_skipped > 1 ? 's' : ''} à 0,00 $ ignorée{preview.rows_zero_skipped > 1 ? 's' : ''} (aucun montant à classer)</div>}
            {preview.ledger_balance != null && <div>Solde du relevé : {fmtMoney(preview.ledger_balance)}{preview.ledger_balance_date ? ` au ${fmtDate(preview.ledger_balance_date + 'T00:00:00')}` : ''}</div>}
            {preview.account_mismatch && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', borderRadius: 6, padding: '6px 10px' }}>
                Attention : ce relevé est celui du compte se terminant par {preview.file_account_last4}, pas celui du compte choisi.
              </div>
            )}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
              <tbody>
                {preview.preview.map((l, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${C.border}`, color: l.new ? undefined : C.faint }}>
                    <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>{fmtDate(l.posted_date + 'T00:00:00')}</td>
                    <td style={{ padding: '4px 6px' }}>{l.description}{l.new ? '' : ' (déjà importée)'}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', whiteSpace: 'nowrap', color: l.new ? (l.amount < 0 ? C.red : C.green) : undefined }}>{fmtMoney(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.rows_total > preview.preview.length && <div style={{ color: C.faint }}>… et {preview.rows_total - preview.preview.length} autre{preview.rows_total - preview.preview.length > 1 ? 's' : ''}</div>}
          </div>
        )}

        <div style={{ fontSize: 13, color: C.muted }}>Relevés importés</div>
        {history.length === 0
          ? <div style={{ border: `1px dashed ${C.border}`, borderRadius: 8, padding: 16, textAlign: 'center', color: C.faint, fontSize: 13 }}>Aucun relevé importé pour ce compte.</div>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ padding: 6 }}>Fichier</th><th style={{ padding: 6 }}>Période</th><th style={{ padding: 6 }}>Lignes</th><th style={{ padding: 6 }}>Importé le</th><th></th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: 6, wordBreak: 'break-all' }}>{h.filename}</td>
                    <td style={{ padding: 6, whiteSpace: 'nowrap' }}>{period(h.period_start, h.period_end)}</td>
                    <td style={{ padding: 6 }}>{h.rows_new} nouv.{h.rows_duplicate ? ` / ${h.rows_duplicate} doubl.` : ''}</td>
                    <td style={{ padding: 6, whiteSpace: 'nowrap' }}>{fmtDate(h.created_at)}</td>
                    <td style={{ padding: 6, textAlign: 'right' }}><button type="button" onClick={() => cancelImport(h)} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 12 }}>Annuler</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Fermer</button>
          <button className="btn-primary" disabled={busy || !preview || preview.rows_new === 0} onClick={doImport}>
            {busy ? '...' : preview ? `Importer ${preview.rows_new} transaction${preview.rows_new > 1 ? 's' : ''}` : 'Importer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Structure seulement : les regles seront branchees avec le classement des transactions
export function RulesModal({ onClose }) {
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 640, maxWidth: '95vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="modal-title" style={{ margin: 0 }}>Règles de transaction</h3>
          <button className="btn-primary" disabled title="Disponible à une prochaine étape">+ Nouvelle règle</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: C.muted, fontSize: 11, textTransform: 'uppercase', borderBottom: `1px solid ${C.border}` }}>
              <th style={{ padding: 8 }}>Nom de la règle</th>
              <th style={{ padding: 8 }}>S'applique à</th>
              <th style={{ padding: 8 }}>Conditions</th>
              <th style={{ padding: 8 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan={4} style={{ textAlign: 'center', color: C.faint, padding: 24 }}>Aucune règle. Les règles classeront automatiquement les transactions reçues de la banque.</td></tr>
          </tbody>
        </table>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  )
}
