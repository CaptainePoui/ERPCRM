import { useState, useEffect } from 'react'
import api from '../services/api'

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

function fmt(n) { return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(n) }

export default function Settings() {
  const [settings, setSettings] = useState(null)
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
  }, [])

  async function saveSettings() {
    setSaving(true); setMsg('')
    try {
      const r = await api.put('/v1/settings', {
        hourly_rate: parseFloat(settings.hourly_rate),
        labour_round_minutes: parseInt(settings.labour_round_minutes),
        commission_rate: parseFloat(settings.commission_rate),
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
