import { useState, useEffect } from 'react'
import api from '../services/api'
import useFeatures from '../hooks/useFeatures'

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

function fmt(n) { return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(n) }

export default function Settings() {
  const [settings, setSettings] = useState(null)
  const [users, setUsers] = useState([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [inflationPct, setInflationPct] = useState('')
  const [inflationPreview, setInflationPreview] = useState(null)
  const [applyingInflation, setApplyingInflation] = useState(false)
  const [commYear, setCommYear] = useState(new Date().getFullYear())
  const [commMonth, setCommMonth] = useState(new Date().getMonth() + 1)
  const [commissions, setCommissions] = useState(null)

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
        commission_rate: parseFloat(settings.commission_rate),
        fiscal_year_start_month: parseInt(settings.fiscal_year_start_month),
        tax_lock_date: settings.tax_lock_date || '',
        tax_filing_frequency: settings.tax_filing_frequency || '',
        tax_reminder_user_id: settings.tax_reminder_user_id || '',
      })
      setSettings(r.data)
      setMsg('Paramètres sauvegardés')
    } finally { setSaving(false) }
  }

  async function previewInflation() {
    if (!inflationPct) return
    setApplyingInflation(true)
    try {
      const r = await api.post('/v1/settings/apply-inflation', { percent: parseFloat(inflationPct) })
      setInflationPreview(r.data)
      setMsg(`Inflation appliquée : ${r.data.updated} articles mis à jour`)
    } finally { setApplyingInflation(false) }
  }

  async function loadCommissions() {
    const r = await api.get(`/v1/employees/commissions?year=${commYear}&month=${commMonth}`)
    setCommissions(r.data)
  }

  if (!settings) return <div style={{ padding: 40, color: '#6B7280' }}>Chargement...</div>

  return (
    <div style={{ maxWidth: 700, padding: '0 0 40px' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>⚙ Paramètres</h2>

      {msg && <div style={{ background: '#ECFDF5', color: '#065F46', padding: '10px 16px', borderRadius: 8, marginBottom: 20, fontSize: 14 }}>{msg}</div>}

      <BusinessSection />
      <TimezoneSection />
      <LateFeesSection />

      {/* ── Taux de service ── */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: '#111827' }}>Taux de service Simple IP</h3>
        <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
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
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Commission vendeur (%)</label>
            <input type="number" step="0.1" value={settings.commission_rate}
              onChange={e => setSettings(p => ({ ...p, commission_rate: e.target.value }))}
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
        </div>
        <button className="btn-primary" onClick={saveSettings} disabled={saving} style={{ marginTop: 16 }}>
          {saving ? 'Sauvegarde...' : 'Sauvegarder'}
        </button>
      </div>

      {/* ── Inflation matériel & services serveur ── */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#111827' }}>Inflation — matériel & services serveur</h3>
        <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
          Applique un % d'augmentation sur tous les articles <strong>non liés</strong> au taux horaire.
          Les prix sont arrondis au X4.95$ ou X9.95$ supérieur.
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Augmentation (%)</label>
            <input type="number" step="0.1" value={inflationPct} onChange={e => setInflationPct(e.target.value)} style={{ width: 100 }} placeholder="ex: 3.5" />
          </div>
          <button className="btn-primary" onClick={previewInflation} disabled={applyingInflation || !inflationPct}>
            {applyingInflation ? 'Application...' : 'Appliquer'}
          </button>
        </div>
        {inflationPreview && (
          <div style={{ marginTop: 16, maxHeight: 240, overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Article</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#374151' }}>Ancien</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#059669' }}>Nouveau</th>
                </tr>
              </thead>
              <tbody>
                {inflationPreview.preview.map(item => (
                  <tr key={item.id} style={{ borderTop: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '7px 12px' }}>{item.name}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', color: '#9CA3AF' }}>{fmt(item.old_price)}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: '#059669' }}>{fmt(item.new_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NumberingSection />

      {/* ── Commissions ── */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: '#111827' }}>Rapport de commissions vendeurs</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Année</label>
            <input type="number" value={commYear} onChange={e => setCommYear(+e.target.value)} style={{ width: 90 }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Mois</label>
            <select value={commMonth} onChange={e => setCommMonth(+e.target.value)}>
              {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
            </select>
          </div>
          <button className="btn-secondary" onClick={loadCommissions}>Générer</button>
        </div>
        {commissions !== null && (
          commissions.length === 0
            ? <div style={{ marginTop: 16, color: '#9CA3AF', fontSize: 14 }}>Aucune commission pour cette période.</div>
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 16 }}>
                <thead>
                  <tr style={{ background: '#F9FAFB' }}>
                    {['Vendeur', 'Facturation clients', `Commission (${settings.commission_rate}%)`, ''].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Vendeur' ? 'left' : 'right', fontWeight: 600, color: '#374151' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {commissions.map((c, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 500 }}>{c.first_name} {c.last_name}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#6B7280' }}>{fmt(c.invoiced_total)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>{fmt(c.commission_amount)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <button className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => alert(`Commission à payer: ${fmt(c.commission_amount)} à ${c.first_name} ${c.last_name}`)}>
                          Payer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
        )}
      </div>
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
    if (extra.late_fees_enabled && !confirm(`Allumer les frais de retard ? ERPCRM créera et enverra par courriel ${preview?.notices.length || 0} avis de retard, puis les suivants au fil des jours. Assure-toi que l'ancien logiciel n'en fait plus.`)) return
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
    <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>Frais de retard</h3>
        <span style={{ fontSize: 13, fontWeight: 600, color: cfg.late_fees_enabled ? '#059669' : '#B45309' }}>
          {cfg.late_fees_enabled ? 'Allumé' : 'Éteint — rien n\'est facturé'}
        </span>
      </div>
      <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
        Un avis de retard par client : {cfg.late_fee_monthly_rate} % de tout son solde en retard (avis précédents compris) + frais de gestion,
        {' '}{cfg.late_fee_grace_days} jours après l'échéance, puis chaque {cfg.late_fee_interval_days} jours tant que c'est impayé. Sans taxes.
        {features.barter && 'Jamais sur une facture marquée « À régler en troc ». '}Les avis sont émis et envoyés par courriel au contact comptes payables / facturation (sinon le contact principal) ; sans courriel, l'avis reste non transmis.
      </p>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {field('late_fee_monthly_rate', '% par mois')}
        {field('late_fee_admin', 'Frais de gestion ($)', 100)}
        {field('late_fee_grace_days', 'Jours après l\'échéance')}
        {field('late_fee_interval_days', 'Jours entre 2 avis')}
        <button className="btn-secondary" onClick={() => save()}>Enregistrer</button>
        {cfg.late_fees_enabled
          ? <button className="btn-secondary" style={{ color: '#B45309' }} onClick={() => save({ late_fees_enabled: false })}>Éteindre</button>
          : <button className="btn-primary" onClick={() => save({ late_fees_enabled: true })}>Allumer</button>}
        {msg && <span style={{ fontSize: 13, color: msg === 'Enregistré' ? '#059669' : '#DC2626' }}>{msg}</span>}
      </div>
      {preview && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            Aperçu : avis qui {cfg.late_fees_enabled ? 'seront créés' : 'seraient créés'} aujourd'hui ({preview.notices.length})
          </div>
          {preview.notices.length === 0 && <div style={{ fontSize: 13, color: '#9CA3AF' }}>Aucun.</div>}
          {preview.notices.map(n => (
            <div key={n.company_id} style={{ fontSize: 13, borderTop: '1px solid #F3F4F6', padding: '6px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <b>{n.company_name}</b>
                <span>{money(n.interest)} + {money(n.admin)} = <b>{money(n.total)}</b></span>
              </div>
              <div style={{ fontSize: 12, color: '#6B7280' }}>
                {cfg.late_fee_monthly_rate} % de {money(n.base)} en retard — {n.invoices.map(i => `${i.number} (${money(i.balance)})`).join(', ')}
                {n.last_notice ? ` — dernier avis le ${n.last_notice}` : ''}
              </div>
              <div style={{ fontSize: 12, color: n.email ? '#6B7280' : '#B45309' }}>{n.email ? `Envoyé à ${n.email}` : 'Aucun courriel de facturation : restera non transmis'}</div>
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
    <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 24, marginBottom: 20 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#111827' }}>Coordonnées de l'entreprise</h3>
      <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
        Imprimées en haut de tous les PDF : factures, avoirs, devis et ententes d'échange. Vos numéros de TPS et de TVQ permettent à vos clients de réclamer les taxes qu'ils vous paient.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
        <div style={{ gridColumn: '1 / -1' }}>{field('name', "Nom de l'entreprise")}</div>
        <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
          <label>Adresse</label>
          <textarea rows={3} value={f.address} onChange={e => set('address', e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} placeholder={'123, rue Principale\nVille (Québec)  H0H 0H0'} />
        </div>
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
    <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 24, marginBottom: 20 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#111827' }}>Fuseau horaire de l'entreprise</h3>
      <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
        Sert à savoir quel jour on est : date des factures et des paiements, factures périodiques, échanges… Il est <b>{data.now}</b> selon ce fuseau.
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
  const preview = e => `${e.prefix.replace('{year}', new Date().getFullYear())}${String(e.next_value).padStart(Number(e.padding) || 0, '0')}`
  async function save(key) {
    setMsg({ ...msg, [key]: '' })
    const e = edit[key]
    if (!confirm(`Le prochain numéro sera ${preview(e)}. Le compteur ne pourra plus jamais revenir en arrière. Continuer ?`)) return
    try {
      await api.put(`/v1/settings/numbering/${key}`, { prefix: e.prefix, next_value: Number(e.next_value), padding: Number(e.padding) })
      setMsg({ ...msg, [key]: 'Enregistré' }); load()
    } catch (err) { setMsg({ ...msg, [key]: err.response?.data?.detail || 'Refusé' }) }
  }
  if (!rows) return null
  return (
    <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 24, marginBottom: 24 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: '#111827' }}>Numérotation des documents</h3>
      <p style={{ fontSize: 13, color: '#6B7280', marginTop: 0, marginBottom: 16 }}>
        Chaque numéro n'est donné qu'une fois : supprimer ou annuler un document ne fait jamais reculer le compteur.
        « {'{year}'} » dans le préfixe est remplacé par l'année en cours.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#F9FAFB' }}>
            {['Document', 'Préfixe', 'Chiffres', 'Prochain numéro', 'Aperçu', ''].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(x => {
              const e = edit[x.key]
              const changed = e.prefix !== x.prefix || Number(e.next_value) !== x.next_value || Number(e.padding) !== x.padding
              return (
                <tr key={x.key} style={{ borderTop: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 500 }}>{x.label}</td>
                  <td style={{ padding: '8px 10px' }}><input value={e.prefix} style={{ width: 120 }} onChange={ev => setEdit({ ...edit, [x.key]: { ...e, prefix: ev.target.value } })} /></td>
                  <td style={{ padding: '8px 10px' }}><input type="number" min="0" max="10" value={e.padding} style={{ width: 60 }} title="Nombre minimum de chiffres (0 = sans zéros devant)" onChange={ev => setEdit({ ...edit, [x.key]: { ...e, padding: ev.target.value } })} /></td>
                  <td style={{ padding: '8px 10px' }}><input type="number" min={1} value={e.next_value} style={{ width: 110 }} onChange={ev => setEdit({ ...edit, [x.key]: { ...e, next_value: ev.target.value } })} /></td>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 600 }}>{preview(e)}</td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                    {changed && <button className="btn-primary" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => save(x.key)}>Enregistrer</button>}
                    {msg[x.key] && <span style={{ marginLeft: 8, fontSize: 12, color: msg[x.key] === 'Enregistré' ? '#059669' : '#DC2626' }}>{msg[x.key]}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Avis de virement Interac par courriel (TASK-042.5) : donnent le nom de l'expediteur des depots
// « VIREMENT INTERAC ». Mot de passe chiffre dans la base, jamais reaffiche.
