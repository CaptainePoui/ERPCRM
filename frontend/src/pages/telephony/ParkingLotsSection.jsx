import { useState } from 'react'
import api from '../../services/api'

// ── Parcage — TASK-S061. Premier morceau de l'arborescence par domaine
// (frontend/src/pages/telephony/) plutôt qu'empilé dans CompanyDetail.jsx --
// le reste des sections téléphonie (RingGroups, PagingGroups, Trunk...) reste
// dans CompanyDetail.jsx pour l'instant, migré au fil du temps.
//
// Backend SIPV : dialplan/valet_announce_slot/is_active réels. valet_info
// (statut live), BLF, continuité MOH PAS encore construits côté serveur --
// cet écran ne prétend afficher aucun état live (pas de colonne "slot
// occupé" ici, ce serait inventé).
//
// Rappel au timeout (TASK-S061, demande Philippe 2026-08-20) : par défaut,
// SIPV rappelle dynamiquement le poste qui a réellement parqué l'appel
// (détecté via l'en-tête SIP de transfert, construit et vérifié en direct
// côté serveur) -- pas de case à cocher pour ça, c'est le comportement de
// base. Cocher "Poste dédié" bascule vers un poste fixe choisi (ex.
// Réception), qui reçoit TOUJOURS le timeout peu importe qui a parqué.
// Concept demandé explicitement par Philippe : case à cocher + sélecteur de
// poste qui apparaît juste à côté quand coché, dans le style des
// destinations de DID -- pas un menu à deux options nommées.
export default function ParkingLotsSection({ companyId, parkingLots, parkingLotsLoading, sipExts, onRefresh, onGoToAudio }) {
  const [showNew, setShowNew] = useState(false)
  const emptyForm = { name: '', park_extension: '700', parking_slots_start: 701, parking_slots_end: 720, timeout_seconds: 120, return_extension: '', timeout_return_mode: 'parker', announce_slot: false }
  const [form, setForm] = useState(emptyForm)
  // Lots dont la case "poste dédié" vient d'être cochée localement, en attente
  // du choix d'un poste -- évite d'envoyer timeout_return_mode=fixed avant
  // return_extension (SIPV refuse fixed sans poste), les deux partent
  // ensemble en une seule requête des qu'un poste est choisi.
  const [pendingDedicated, setPendingDedicated] = useState(new Set())

  async function createLot() {
    if (!form.name.trim() || !form.park_extension.trim()) return
    if (form.timeout_return_mode === 'fixed' && !form.return_extension) {
      alert('Choisis un poste dédié avant de créer le lot')
      return
    }
    try {
      await api.post(`/v1/companies/${companyId}/parking-lots`, {
        ...form,
        return_extension: form.return_extension || null,
      })
      setForm(emptyForm)
      setShowNew(false)
      onRefresh()
    } catch (e) {
      alert(e.response?.data?.detail || 'Erreur lors de la création')
    }
  }

  async function updateLotFields(lotId, fields) {
    try {
      await api.put(`/v1/companies/${companyId}/parking-lots/${lotId}`, fields)
      onRefresh()
    } catch (e) {
      alert(e.response?.data?.detail || 'Erreur lors de la modification')
    }
  }

  async function updateLot(lotId, field, value) {
    await updateLotFields(lotId, { [field]: value })
  }

  async function removeLot(lotId) {
    if (!confirm('Supprimer ce lot de parcage ?')) return
    await api.delete(`/v1/companies/${companyId}/parking-lots/${lotId}`)
    onRefresh()
  }

  function togglePending(lotId, on) {
    setPendingDedicated(prev => {
      const next = new Set(prev)
      if (on) next.add(lotId); else next.delete(lotId)
      return next
    })
  }

  const extOptions = [...sipExts].sort((a, b) => a.extension.localeCompare(b.extension, undefined, { numeric: true }))

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Parcage ({parkingLots.length})
        </div>
        <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowNew(v => !v)}>+ Ajouter</button>
      </div>
      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
        Composer l'extension pilote place l'appel dans le premier slot libre de la plage ; composer un slot précis le parque directement ou le récupère s'il est occupé. Par défaut, le timeout rappelle le poste qui a parqué -- coche "Poste dédié" pour toujours renvoyer vers un poste précis à la place.
        {onGoToAudio && (
          <>
            {' '}Pour configurer les audios d'annonce du parcage (choix de langue inclus), voir{' '}
            <a href="#" onClick={e => { e.preventDefault(); onGoToAudio() }} style={{ color: 'var(--brand)' }}>Horaires &amp; Audio</a>.
          </>
        )}
      </div>
      {showNew && (
        <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: 12, marginBottom: 10, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group"><label>Nom</label><input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
          <div className="form-group"><label>Pilote</label><input value={form.park_extension} onChange={e => setForm(p => ({ ...p, park_extension: e.target.value }))} style={{ width: 70 }} /></div>
          <div className="form-group"><label>Début plage</label><input type="number" value={form.parking_slots_start} onChange={e => setForm(p => ({ ...p, parking_slots_start: parseInt(e.target.value, 10) }))} style={{ width: 70 }} /></div>
          <div className="form-group"><label>Fin plage</label><input type="number" value={form.parking_slots_end} onChange={e => setForm(p => ({ ...p, parking_slots_end: parseInt(e.target.value, 10) }))} style={{ width: 70 }} /></div>
          <div className="form-group"><label>Timeout avant rappel (s)</label><input type="number" value={form.timeout_seconds} onChange={e => setForm(p => ({ ...p, timeout_seconds: parseInt(e.target.value, 10) }))} style={{ width: 70 }} /></div>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={form.timeout_return_mode === 'fixed'}
              onChange={e => setForm(p => ({ ...p, timeout_return_mode: e.target.checked ? 'fixed' : 'parker' }))}
            />
            Poste dédié
          </label>
          {form.timeout_return_mode === 'fixed' && (
            <select value={form.return_extension} onChange={e => setForm(p => ({ ...p, return_extension: e.target.value }))} style={{ width: 160 }}>
              <option value="">— choisir un poste —</option>
              {extOptions.map(e => <option key={e.extension} value={e.extension}>{e.extension} — {e.name}</option>)}
            </select>
          )}
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
            <input type="checkbox" checked={form.announce_slot} onChange={e => setForm(p => ({ ...p, announce_slot: e.target.checked }))} />
            Annoncer le slot
          </label>
          <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={createLot}>Créer</button>
        </div>
      )}
      {parkingLotsLoading ? <div style={{ fontSize: 13, color: '#6B7280' }}>Chargement...</div> : parkingLots.length === 0 ? (
        <div className="empty-tab">Aucun lot de parcage.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#F9FAFB' }}>
              {['Actif', 'Nom', 'Pilote', 'Plage', 'Timeout avant rappel', 'Poste de rappel', 'Annonce', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #E5E7EB', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parkingLots.map(lot => {
              const isFixed = lot.timeout_return_mode === 'fixed'
              const showPicker = isFixed || pendingDedicated.has(lot.id)
              return (
                <tr key={lot.id} style={{ borderBottom: '1px solid #F3F4F6', opacity: lot.is_active ? 1 : 0.55 }}>
                  <td style={{ padding: '10px 12px' }}>
                    <input type="checkbox" checked={lot.is_active} onChange={e => updateLot(lot.id, 'is_active', e.target.checked)} />
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                    <input defaultValue={lot.name} onBlur={e => { const v = e.target.value.trim(); if (v && v !== lot.name) updateLot(lot.id, 'name', v) }} style={{ border: 'none', background: 'transparent', fontWeight: 600, width: '100%' }} />
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{lot.park_extension}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{lot.parking_slots_start}–{lot.parking_slots_end}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <input type="number" defaultValue={lot.timeout_seconds} onBlur={e => { const v = parseInt(e.target.value, 10); if (v && v !== lot.timeout_seconds) updateLot(lot.id, 'timeout_seconds', v) }} style={{ width: 60, border: '1px solid transparent', background: 'transparent' }} onFocus={e => e.target.style.border = '1px solid #D1D5DB'} />
                    s
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={showPicker}
                        onChange={e => {
                          if (e.target.checked) {
                            togglePending(lot.id, true)
                          } else {
                            togglePending(lot.id, false)
                            if (isFixed) updateLot(lot.id, 'timeout_return_mode', 'parker')
                          }
                        }}
                      />
                      Poste dédié
                    </label>
                    {showPicker && (
                      <select
                        value={lot.return_extension || ''}
                        onChange={e => {
                          const v = e.target.value || null
                          if (!v) return
                          updateLotFields(lot.id, { timeout_return_mode: 'fixed', return_extension: v })
                          togglePending(lot.id, false)
                        }}
                        style={{ fontSize: 13, marginLeft: 8 }}
                      >
                        <option value="">— choisir —</option>
                        {extOptions.map(e => <option key={e.extension} value={e.extension}>{e.extension} — {e.name}</option>)}
                      </select>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <input type="checkbox" checked={lot.announce_slot} onChange={e => updateLot(lot.id, 'announce_slot', e.target.checked)} />
                  </td>
                  <td style={{ padding: '10px 12px' }}><button className="inv-del-btn" onClick={() => removeLot(lot.id)}>✕</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
