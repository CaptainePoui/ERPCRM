// Serveur → onglet « Appareils internes » (TASK-027.3, 2026-10-11). Philippe : « on choisit le tenant d'abord, ça nous
// amène à une liste de postes déjà configurés dans le tenant et on a juste à cocher les postes à l'interne ; on peut même
// ajouter plusieurs tenants ». Un poste coché reçoit l'adresse interne de son serveur comme proxy SIP (au bureau, la
// boucle du routeur ne tient pas) ; tous les autres gardent l'adresse publique. Tout vit sur SIPV, par serveur.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import Autocomplete from './Autocomplete'
import RebootButton from './RebootButton'
import { askConfirm } from './Dialog'

function ServerInternalDevices({ server }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)        // id du poste ou du tenant en cours

  function load() {
    return api.get(`/v1/server/servers/${server.id}/internal-devices`).then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.detail || 'SIPV injoignable'))
  }
  useEffect(() => { load() }, [server.id])   // eslint-disable-line

  async function run(id, fn) {
    setBusy(id); setError('')
    try { await fn(); await load() } catch (e) { setError(e.response?.data?.detail || 'Erreur') } finally { setBusy(null) }
  }
  const addTenant = t => t && run(t.id, () => api.post(`/v1/server/servers/${server.id}/internal-devices/tenants/${t.id}`))
  const removeTenant = async t => {
    const n = t.extensions.filter(e => e.internal).length
    if (!await askConfirm(`Retirer ${t.company_name} (${t.account_number}) des appareils internes ?${n ? ` Ses ${n} poste(s) coché(s) repasseront sur l'adresse externe.` : ''}`)) return
    run(t.id, () => api.delete(`/v1/server/servers/${server.id}/internal-devices/tenants/${t.id}`))
  }
  const toggle = (e, internal) => run(e.id, () => api.put(`/v1/server/internal-devices/extensions/${e.id}`, { internal }))

  const muted = { fontSize: 13, color: 'var(--c-muted)' }
  if (!data) return error ? <div style={{ color: '#DC2626', fontSize: 14 }}>{error}</div> : <div className="loading">Chargement...</div>

  return (
    <div style={{ border: '1px solid var(--c-border)', borderRadius: 12, padding: 20, marginBottom: 20, background: 'var(--c-surface)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{data.server.name}</div>
        <div style={muted}>Adresse interne <b>{data.server.internal_address}</b> · adresse externe {data.server.public_address}</div>
      </div>
      <p style={{ ...muted, margin: '0 0 16px' }}>
        Cochez les postes branchés sur le même réseau que ce serveur. Leur téléphone recevra l'adresse interne au prochain
        redémarrage ; tous les autres postes restent sur l'adresse externe.
      </p>

      <div style={{ maxWidth: 420, marginBottom: 18 }}>
        <Autocomplete label="Ajouter un tenant" placeholder="Rechercher un tenant…" openOnFocus value={null}
          items={data.other_tenants.map(t => ({ id: t.id, label: `${t.company_name}`, sub: t.account_number.toUpperCase() }))}
          onSelect={addTenant} />
      </div>
      {error && <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {data.tenants.length === 0 && <div className="empty-tab">Aucun tenant ajouté : tous les postes de ce serveur utilisent l'adresse externe.</div>}

      {data.tenants.map(t => {
        return (
          <div key={t.id} style={{ border: '1px solid var(--c-border)', borderRadius: 10, marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--c-surface-2)', borderBottom: '1px solid var(--c-border)' }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {t.erpcrm_company_id ? <Link to={`/companies/${t.erpcrm_company_id}`}>{t.company_name}</Link> : t.company_name}
              </div>
              <span style={muted}>{t.account_number.toUpperCase()} · {t.extensions.filter(e => e.internal).length} interne(s) sur {t.extensions.length}</span>
              <button className="btn-secondary" style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 10px' }}
                disabled={busy === t.id} onClick={() => removeTenant(t)}>Retirer le tenant</button>
            </div>
            {t.extensions.length === 0 ? <div style={{ padding: 14, ...muted }}>Aucun poste configuré dans ce tenant.</div> : (
              <table className="adm-table" style={{ margin: 0 }}>
                <thead>
                  <tr><th style={{ width: 90 }}>Interne</th><th>Poste</th><th>Nom</th><th>Téléphone</th><th>Adresse reçue</th><th style={{ width: 140 }}>Redémarrer</th></tr>
                </thead>
                <tbody>
                  {t.extensions.map(e => (
                    <tr key={e.id} style={{ opacity: e.is_active ? 1 : 0.55 }}>
                      <td>
                        <input type="checkbox" checked={e.internal} disabled={busy === e.id} onChange={ev => toggle(e, ev.target.checked)}
                          style={{ width: 17, height: 17, cursor: 'pointer' }} aria-label={`Poste ${e.extension} interne`} />
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 8,
                          background: e.registered ? '#059669' : e.registered === false ? '#DC2626' : 'var(--c-faint)' }}
                          title={e.registered ? 'Enregistré' : e.registered === false ? 'Non enregistré' : 'État inconnu'} />
                        {e.extension}
                      </td>
                      <td>{e.name}</td>
                      <td style={muted}>{e.phone ? `${e.phone.model || 'Téléphone'} · ${e.phone.mac}` : 'Configuré à la main (non provisionné)'}</td>
                      <td style={{ fontSize: 13 }}>
                        {e.phone ? (e.internal ? <b>{data.server.internal_address}</b> : data.server.public_address)
                          : <span style={muted}>à régler dans l'appareil</span>}
                      </td>
                      <td><RebootButton sipExtId={e.id} extension={e.extension} registered={e.registered} compact={false} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function InternalDevices({ servers }) {
  if (!servers.length) return <div className="empty-tab">Aucun serveur SIPV enregistré.</div>
  return servers.map(s => <ServerInternalDevices key={s.id} server={s} />)
}
