// Reglages de l'entreprise (Administration → Entreprise, TASK-014.3, 2026-10-09) : deplaces de l'engrenage, qui ne montre
// plus que le compte de la personne connectee (pages/MyAccount.jsx).
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import useFeatures from '../hooks/useFeatures'
import { askConfirm } from './Dialog'

export default function CompanySettingsPanel({ only = null }) {
  // only : 'entreprise' (coordonnees) | 'general' (apparence, fuseau, taux, numerotation) | 'factures' (frais de retard)
  const show = k => !only || only === k
  const [settings, setSettings] = useState(null)
  const [users, setUsers] = useState([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api.get('/v1/settings').then(r => setSettings(r.data))
    api.get('/v1/admin/users').then(r => setUsers(r.data.filter(u => u.is_active !== false))).catch(() => setUsers([]))
  }, [])

  async function saveSettings() {
    setSaving(true); setMsg('')
    try {
      const r = await api.put('/v1/settings', {
        hourly_rate: parseFloat(settings.hourly_rate),
        labour_round_minutes: parseInt(settings.labour_round_minutes),
        fiscal_year_start_month: parseInt(settings.fiscal_year_start_month),
        tax_lock_date: settings.tax_lock_date || '',
        tax_filing_frequency: settings.tax_filing_frequency || '',
        tax_reminder_user_id: settings.tax_reminder_user_id || '',
        tax_portal_url: (settings.tax_portal_url || '').trim(),
      })
      setSettings(r.data)
      setMsg('Paramètres sauvegardés')
    } finally { setSaving(false) }
  }

  if (!settings) return <div style={{ padding: 40, color: 'var(--c-muted)' }}>Chargement...</div>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 520px), 1fr))', columnGap: 20, alignItems: 'stretch', padding: '0 0 40px' }}>
      {msg && <div style={{ gridColumn: '1 / -1', background: 'var(--c-tint-green)', color: 'var(--c-on-green)', padding: '10px 16px', borderRadius: 8, marginBottom: 20, fontSize: 14 }}>{msg}</div>}

      {show('general') && <AppearanceSection />}
      {show('entreprise') && <BusinessSection />}
      {show('general') && <TimezoneSection />}
      {show('factures') && <LateFeesSection />}

      {/* ── Taux de service ── */}
      {show('general') && <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: 'var(--c-text)' }}>Taux de service Simple IP</h3>
        <p style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 16 }}>
          Ce taux s'applique aux tickets, factures et tous les articles catalogue liés au taux horaire.
        </p>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Taux horaire ($/h)</label>
            <input type="number" step="0.01" value={settings.hourly_rate}
              onChange={e => setSettings(p => ({ ...p, hourly_rate: e.target.value }))}
              style={{ width: 120 }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Arrondi temps (min)</label>
            <input type="number" value={settings.labour_round_minutes}
              onChange={e => setSettings(p => ({ ...p, labour_round_minutes: e.target.value }))}
              style={{ width: 80 }} />
          </div>
          {/* TASK-042 : annee imposable du graphique Banque */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Début de l'exercice financier</label>
            <select value={settings.fiscal_year_start_month}
              onChange={e => setSettings(p => ({ ...p, fiscal_year_start_month: e.target.value }))}>
              {['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
                .map((m, i) => <option key={i + 1} value={i + 1}>1er {m}</option>)}
            </select>
          </div>
          {/* TASK-005.8 : factures de la periode declaree verrouillees (ni brouillon ni suppression) */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label title="Une facture datée de cette date ou avant ne peut plus être supprimée ni remise en brouillon — seulement créditée">Taxes déclarées jusqu'au</label>
            <input type="date" value={settings.tax_lock_date || ''} onChange={e => setSettings(p => ({ ...p, tax_lock_date: e.target.value }))} />
          </div>
          {/* Rappels de declaration TPS/TVQ : tache + courriels a la fin de chaque periode */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label title="À la fin de chaque période, une tâche « Déclaration TPS/TVQ » est créée avec des rappels par courriel">Déclarations TPS/TVQ</label>
            <select value={settings.tax_filing_frequency || ''} onChange={e => setSettings(p => ({ ...p, tax_filing_frequency: e.target.value }))}>
              <option value="">Pas de rappel</option>
              <option value="mensuelle">Mensuelles</option>
              <option value="trimestrielle">Trimestrielles</option>
              <option value="annuelle">Annuelles</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Rappels envoyés à</label>
            <select value={settings.tax_reminder_user_id || ''} onChange={e => setSettings(p => ({ ...p, tax_reminder_user_id: e.target.value }))}>
              <option value="">— Choisir —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
          {/* TASK-043.3 : ouvert en cliquant une declaration a produire (Impots et formulaires) */}
          <div className="form-group" style={{ marginBottom: 0, flex: '1 1 320px' }}>
            <label>Portail pour produire la déclaration</label>
            <input value={settings.tax_portal_url || ''} placeholder="https://…" onChange={e => setSettings(p => ({ ...p, tax_portal_url: e.target.value }))} />
          </div>
        </div>
        <button className="btn-primary" onClick={saveSettings} disabled={saving} style={{ marginTop: 16 }}>
          {saving ? 'Sauvegarde...' : 'Sauvegarder'}
        </button>
      </div>}

      {show('general') && <NumberingSection />}

    </div>
  )
}

// Numerotation des documents (2026-10-04) : le compteur ne peut jamais reculer -- le serveur refuse
// tout prochain numero plus petit que le compteur actuel ou deja utilise avec ce prefixe.
// Factures de frais de retard (TASK-005.14) : 2 % par mois du solde en retard du client + frais de gestion, a
// l'echeance + 15 jours puis chaque 30 jours. Eteint au depart ; l'apercu montre ce qui serait facture aujourd'hui.
function LateFeesSection() {
  const [cfg, setCfg] = useState(null)
  const features = useFeatures()
  const [preview, setPreview] = useState(null)
  const [msg, setMsg] = useState('')
  const money = v => new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(v)
  const load = () => {
    api.get('/v1/settings').then(r => setCfg({ late_fees_enabled: r.data.late_fees_enabled, late_fee_monthly_rate: r.data.late_fee_monthly_rate,
      late_fee_admin: r.data.late_fee_admin, late_fee_grace_days: r.data.late_fee_grace_days, late_fee_interval_days: r.data.late_fee_interval_days }))
    api.get('/v1/invoices/late-fees/preview').then(r => setPreview(r.data))
  }
  useEffect(() => { load() }, [])
  async function save(extra = {}) {
    setMsg('')
    const body = { ...cfg, ...extra }
    if (extra.late_fees_enabled && !await askConfirm(`Allumer les frais de retard ? ERPCRM créera et enverra par courriel ${preview?.notices.length || 0} avis de retard, puis les suivants au fil des jours. Assure-toi que l'ancien logiciel n'en fait plus.`)) return
    try {
      await api.put('/v1/settings', { ...body, late_fee_monthly_rate: Number(body.late_fee_monthly_rate), late_fee_admin: Number(body.late_fee_admin),
        late_fee_grace_days: Number(body.late_fee_grace_days), late_fee_interval_days: Number(body.late_fee_interval_days) })
      setMsg('Enregistré'); load()
    } catch (e) { setMsg(e.response?.data?.detail?.[0]?.msg || e.response?.data?.detail || 'Refusé') }
  }
  if (!cfg) return null
  const set = (k, v) => setCfg(p => ({ ...p, [k]: v }))
  const field = (k, label, w = 80) => (
    <div className="form-group" style={{ marginBottom: 0 }}><label>{label}</label>
      <input type="number" step="0.01" value={cfg[k]} onChange={e => set(k, e.target.value)} style={{ width: w }} /></div>
  )
  return (
    <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)', margin: 0 }}>Frais de retard</h3>
        <span style={{ fontSize: 13, fontWeight: 600, color: cfg.late_fees_enabled ? '#059669' : 'var(--c-on-amber)' }}>
          {cfg.late_fees_enabled ? 'Allumé' : 'Éteint — rien n\'est facturé'}
        </span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 16 }}>
        Un avis de retard par client : {cfg.late_fee_monthly_rate} % de tout son solde en retard (avis précédents compris) + frais de gestion,
        {' '}{cfg.late_fee_grace_days} jours après l'échéance, puis chaque {cfg.late_fee_interval_days} jours tant que c'est impayé. Sans taxes.
        {'Jamais pour un client « pas de frais de retard » (onglet Entente). '}Les avis sont émis et envoyés par courriel au contact comptes payables / facturation (sinon le contact principal) ; sans courriel, l'avis reste non transmis.
      </p>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {field('late_fee_monthly_rate', '% par mois')}
        {field('late_fee_admin', 'Frais de gestion ($)', 100)}
        {field('late_fee_grace_days', 'Jours après l\'échéance')}
        {field('late_fee_interval_days', 'Jours entre 2 avis')}
        <button className="btn-secondary" onClick={() => save()}>Enregistrer</button>
        {cfg.late_fees_enabled
          ? <button className="btn-secondary" style={{ color: 'var(--c-on-amber)' }} onClick={() => save({ late_fees_enabled: false })}>Éteindre</button>
          : <button className="btn-primary" onClick={() => save({ late_fees_enabled: true })}>Allumer</button>}
        {msg && <span style={{ fontSize: 13, color: msg === 'Enregistré' ? '#059669' : '#DC2626' }}>{msg}</span>}
      </div>
      {preview && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            Aperçu : avis qui {cfg.late_fees_enabled ? 'seront créés' : 'seraient créés'} aujourd'hui ({preview.notices.length})
          </div>
          {preview.notices.length === 0 && <div style={{ fontSize: 13, color: 'var(--c-faint)' }}>Aucun.</div>}
          {preview.notices.map(n => (
            <div key={n.company_id} style={{ fontSize: 13, borderTop: '1px solid var(--c-surface-3)', padding: '6px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <b>{n.company_name}</b>
                <span>{money(n.interest)} + {money(n.admin)} = <b>{money(n.total)}</b></span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--c-muted)' }}>
                {cfg.late_fee_monthly_rate} % de {money(n.base)} en retard — {n.invoices.map(i => `${i.number} (${money(i.balance)})`).join(', ')}
                {n.last_notice ? ` — dernier avis le ${n.last_notice}` : ''}
              </div>
              <div style={{ fontSize: 12, color: n.email ? 'var(--c-muted)' : 'var(--c-on-amber)' }}>{n.email ? `Envoyé à ${n.email}` : 'Aucun courriel de facturation : restera non transmis'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Coordonnees de l'entreprise (TASK-005.18, 2026-10-08) : imprimees en haut de tous les PDF (facture, avoir, devis,
// entente d'echange). Les n° de TPS/TVQ permettent aux clients de reclamer les taxes payees.
function BusinessSection() {
  const [f, setF] = useState(null)
  const [saved, setSaved] = useState(null)
  const [msg, setMsg] = useState('')
  useEffect(() => { api.get('/v1/settings/business').then(r => { setF(r.data); setSaved(r.data) }) }, [])
  async function save() {
    setMsg('')
    try { const r = await api.put('/v1/settings/business', f); setF(r.data); setSaved(r.data); setMsg('Enregistré') }
    catch (e) { setMsg(e.response?.data?.detail || 'Refusé') }
  }
  if (!f) return null
  const set = (k, v) => { setF({ ...f, [k]: v }); setMsg('') }
  const field = (k, label, extra = {}) => (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label>{label}</label>
      <input value={f[k]} onChange={e => set(k, e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} {...extra} />
    </div>
  )
  const changed = JSON.stringify(f) !== JSON.stringify(saved)
  return (
    <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, padding: 24, marginBottom: 20 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: 'var(--c-text)' }}>Coordonnées de l'entreprise</h3>
      <p style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 16 }}>
        Imprimées en haut de tous les PDF : factures, avoirs et devis. Vos numéros de TPS et de TVQ permettent à vos clients de réclamer les taxes qu'ils vous paient.
        {f.company_id && <> Ce sont les informations de la fiche <Link to={`/companies/${f.company_id}`}>{saved?.name}</Link> (compagnie du propriétaire, jamais facturée) : une seule copie.</>}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
        <div style={{ gridColumn: '1 / -1' }}>{field('name', "Nom de l'entreprise")}</div>
        <div style={{ gridColumn: '1 / -1' }}>{field('street', 'Adresse (numéro et rue)', { placeholder: '123 rue Principale' })}</div>
        {field('unit', 'Local / bureau')}
        {field('city', 'Ville')}
        {field('province', 'Province', { placeholder: 'QC' })}
        {field('postal_code', 'Code postal', { placeholder: 'H0H 0H0' })}
        {field('tps', 'N° de TPS', { placeholder: '123456789 RT0001' })}
        {field('tvq', 'N° de TVQ', { placeholder: '1234567890 TQ0001' })}
        {field('phone', 'Téléphone')}
        {field('email', 'Courriel', { type: 'email' })}
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
        <button className="btn-primary" onClick={save} disabled={!changed}>Enregistrer</button>
        {msg && <span style={{ fontSize: 13, color: msg === 'Enregistré' ? '#059669' : '#DC2626' }}>{msg}</span>}
      </div>
    </div>
  )
}

// Fuseau horaire de l'entreprise (2026-10-08) : le serveur tourne en UTC ; tout ERPCRM decide « quel jour on est »
// avec ce fuseau (factures, paiements, periodiques, echanges...). Voir backend/app/core/clock.py.
function TimezoneSection() {
  const [data, setData] = useState(null)
  const [value, setValue] = useState('')
  const [msg, setMsg] = useState('')
  const load = () => api.get('/v1/settings/timezones').then(r => { setData(r.data); setValue(r.data.current) })
  useEffect(() => { load() }, [])
  async function save() {
    setMsg('')
    try { await api.put('/v1/settings', { business_timezone: value }); setMsg('Enregistré'); load() }
    catch (e) { setMsg(e.response?.data?.detail || 'Refusé') }
  }
  if (!data) return null
  return (
    <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, padding: 24, marginBottom: 20 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: 'var(--c-text)' }}>Fuseau horaire de l'entreprise</h3>
      <p style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 16 }}>
        Sert à savoir quel jour on est : date des factures et des paiements, factures périodiques… Il est <b>{data.now}</b> selon ce fuseau.
      </p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={value} onChange={e => setValue(e.target.value)} style={{ minWidth: 260 }}>
          {data.zones.map(z => <option key={z} value={z}>{z === 'America/Toronto' ? 'America/Toronto (Montréal, Québec, Ontario)' : z}</option>)}
        </select>
        <button className="btn-primary" onClick={save} disabled={value === data.current}>Enregistrer</button>
        {msg && <span style={{ fontSize: 13, color: msg === 'Enregistré' ? '#059669' : '#DC2626' }}>{msg}</span>}
      </div>
    </div>
  )
}

function NumberingSection() {
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState({})
  const [msg, setMsg] = useState({})
  const load = () => api.get('/v1/settings/numbering').then(r => { setRows(r.data); setEdit(Object.fromEntries(r.data.map(x => [x.key, { prefix: x.prefix, next_value: x.next_value, padding: x.padding }]))) })
  useEffect(() => { load() }, [])
  const pad2 = n => String(n).padStart(2, '0')
  const today = new Date()
  const preview = e => `${e.prefix.replace('{year}', today.getFullYear()).replace('{month}', pad2(today.getMonth() + 1)).replace('{day}', pad2(today.getDate()))}${String(e.next_value).padStart(Number(e.padding) || 0, '0')}`
  async function save(key) {
    setMsg({ ...msg, [key]: '' })
    const e = edit[key]
    if (!await askConfirm(`Le prochain numéro sera ${preview(e)}. Le compteur ne pourra plus jamais revenir en arrière. Continuer ?`)) return
    try {
      await api.put(`/v1/settings/numbering/${key}`, { prefix: e.prefix, next_value: Number(e.next_value), padding: Number(e.padding) })
      setMsg({ ...msg, [key]: 'Enregistré' }); load()
    } catch (err) { setMsg({ ...msg, [key]: err.response?.data?.detail || 'Refusé' }) }
  }
  if (!rows) return null
  return (
    <div style={{ gridColumn: '1 / -1', background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: 'var(--c-text)' }}>Numérotation des documents</h3>
      <p style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 0, marginBottom: 16 }}>
        Chaque numéro n'est donné qu'une fois : supprimer ou annuler un document ne fait jamais reculer le compteur.
        Dans le préfixe, « {'{year}'} », « {'{month}'} » et « {'{day}'} » sont remplacés par la date du jour (le numéro qui suit continue d'un jour à l'autre).
      </p>
      {/* Rangées en grille : colonnes sur grand écran, repliées sur cellulaire (Admin.css .num-*), jamais de défilement horizontal */}
      <div className="form-group" style={{ marginBottom: 0, fontSize: 13 }}>
        <div className="num-row num-head">
          {['Document', 'Préfixe', 'Chiffres', 'Prochain numéro', 'Aperçu', ''].map(h => <div key={h}>{h}</div>)}
        </div>
        {rows.map(x => {
          const e = edit[x.key]
          const changed = e.prefix !== x.prefix || Number(e.next_value) !== x.next_value || Number(e.padding) !== x.padding
          return (
            <div key={x.key} className="num-row">
              <div className="num-label">{x.label}</div>
              <label><span className="num-mini">Préfixe</span>
                <input value={e.prefix} style={{ width: '100%' }} onChange={ev => setEdit({ ...edit, [x.key]: { ...e, prefix: ev.target.value } })} /></label>
              <label><span className="num-mini">Chiffres</span>
                <input type="number" min="0" max="10" value={e.padding} style={{ width: '100%' }} title="Nombre minimum de chiffres (0 = sans zéros devant)" onChange={ev => setEdit({ ...edit, [x.key]: { ...e, padding: ev.target.value } })} /></label>
              <label><span className="num-mini">Prochain numéro</span>
                <input type="number" min={1} value={e.next_value} style={{ width: '100%' }} onChange={ev => setEdit({ ...edit, [x.key]: { ...e, next_value: ev.target.value } })} /></label>
              <div className="num-preview"><span className="num-mini">Aperçu</span>{preview(e)}</div>
              <div style={{ whiteSpace: 'nowrap' }}>
                {changed && <button className="btn-primary" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => save(x.key)}>Enregistrer</button>}
                {msg[x.key] && <span style={{ marginLeft: 8, fontSize: 12, color: msg[x.key] === 'Enregistré' ? '#059669' : '#DC2626' }}>{msg[x.key]}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Avis de virement Interac par courriel (TASK-042.5) : donnent le nom de l'expediteur des depots
// « VIREMENT INTERAC ». Mot de passe chiffre dans la base, jamais reaffiche.

// Apparence de l'écran pour tout le monde (TASK-050) : Jour (par défaut) ou Nuit, appliqué tout de suite.
function AppearanceSection() {
  const [theme, setTheme] = useState(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { api.get('/v1/settings').then(r => setTheme(r.data.ui_theme || 'jour')) }, [])
  async function pick(t) {
    if (t === theme || saving) return
    setSaving(true)
    try {
      const r = await api.put('/v1/settings', { ui_theme: t })
      setTheme(r.data.ui_theme)
      window.dispatchEvent(new CustomEvent('erpcrm-theme', { detail: r.data.ui_theme }))
    } finally { setSaving(false) }
  }
  if (!theme) return null
  const opt = (t, label, sub, bg, fg, box) => (
    <button type="button" onClick={() => pick(t)} disabled={saving} aria-pressed={theme === t}
      style={{ flex: '1 1 160px', textAlign: 'left', padding: 12, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
        border: theme === t ? '2px solid var(--brand)' : '1px solid var(--c-border-strong)', background: 'var(--c-surface)', color: 'var(--c-text)' }}>
      <div style={{ height: 54, borderRadius: 8, background: bg, padding: 8, display: 'flex', gap: 6, marginBottom: 10 }}>
        <div style={{ width: 18, borderRadius: 4, background: box }} />
        <div style={{ flex: 1, borderRadius: 4, background: box, display: 'flex', alignItems: 'center', paddingLeft: 8 }}><div style={{ width: '50%', height: 6, borderRadius: 3, background: fg }} /></div>
      </div>
      <div style={{ fontWeight: 700, fontSize: 14 }}>{theme === t ? '● ' : ''}{label}</div>
      <div style={{ fontSize: 12, color: 'var(--c-muted)' }}>{sub}</div>
    </button>
  )
  return (
    <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, padding: 24, marginBottom: 20 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: 'var(--c-text)' }}>Apparence</h3>
      <p style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 16 }}>Pour tout le monde, dans tout ERPCRM. Le portail client reste en mode jour.</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {opt('jour', 'Jour', 'Fond clair (par défaut)', '#F5F9FF', '#0A1929', '#FFFFFF')}
        {opt('nuit', 'Nuit', 'Fond marine foncé', '#0B1E33', '#E6EEF7', '#102A45')}
      </div>
    </div>
  )
}
