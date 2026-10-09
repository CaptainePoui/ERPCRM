// Boites de courriel de l'entreprise -- Administration -> Integrations (TASK-047.1, 2026-10-08). Chaque boite recoit
// ses fonctions (tickets, factures, devis : une fonction = une seule boite) ; les avis Interac sont reconnus dans
// toutes les boites actives. Mot de passe chiffre, jamais reaffiche. Backend : api/v1/endpoints/mailboxes.py.
import { useState, useEffect } from 'react'
import api from '../services/api'

const errText = e => e.response?.data?.detail || 'Erreur'
const short = label => label.split(' — ')[0]
const KINDS = {
  shared: 'Partagée — toute l\'équipe la voit dans Courriels',
  send_only: 'Envoi seulement — jamais lue (ex. nepasrepondre@)',
}

export default function MailboxesPanel() {
  const [data, setData] = useState(null)
  const [edit, setEdit] = useState(null)        // {} = nouvelle boite
  const [tests, setTests] = useState({})
  const [interacMsg, setInteracMsg] = useState('')
  const load = () => api.get('/v1/mailboxes').then(r => setData(r.data))
  useEffect(() => { load() }, [])
  if (!data) return null

  async function test(m) {
    setTests(t => ({ ...t, [m.id]: { busy: true } }))
    try {
      const r = await api.post(`/v1/mailboxes/${m.id}/test`)
      setTests(t => ({ ...t, [m.id]: { ok: true, text: `Connexion réussie : réception (${r.data.inbox_count} courriel(s) dans la boîte, ${r.data.unseen_count} non lu(s)) et envoi` } }))
    } catch (e) { setTests(t => ({ ...t, [m.id]: { ok: false, text: errText(e) } })) }
    load()
  }

  async function saveInterac(patch) {
    setInteracMsg('')
    try {
      const r = await api.put('/v1/mailboxes/interac/settings', { enabled: data.interac.enabled, since: data.interac.since || null, ...patch })
      setData({ ...data, interac: r.data }); setInteracMsg('Enregistré')
    } catch (e) { setInteracMsg(errText(e)) }
  }
  async function runInterac() {
    await api.post('/v1/mailboxes/interac/run')
    setInteracMsg("Lecture lancée en arrière-plan — l'IA lit environ un avis par 30 secondes.")
    setTimeout(load, 5000)
  }

  const st = data.interac.stats || {}
  return (
    <div style={{ marginBottom: 28 }}>
      <div className="adm-panel-header">
        <span className="adm-count">Boîtes de courriel</span>
        <button className="btn-primary" onClick={() => setEdit({})}>+ Ajouter une boîte</button>
      </div>
      <p style={{ fontSize: 13, color: '#6B7280', marginTop: 0 }}>
        Donnez à chaque boîte sa fonction : les factures partent de la boîte « Factures », les tickets de la boîte « Tickets »…
        Les boîtes partagées sont copiées dans <b>Courriels</b> et classées dans la fiche de chaque client ; la boîte « Tickets » n'y est pas
        (ses courriels deviennent des tickets). Une boîte personnelle (philippe@) se règle dans la fiche de l'employé. Les paiements Interac
        sont reconnus dans <b>toutes</b> les boîtes.
      </p>
      <table className="adm-table">
        <thead><tr><th>Boîte</th><th>Fonctions</th><th>État</th><th></th></tr></thead>
        <tbody>
          {data.mailboxes.length === 0 && <tr><td colSpan={4} style={{ color: '#9CA3AF', textAlign: 'center' }}>Aucune boîte</td></tr>}
          {data.mailboxes.map(m => (
            <tr key={m.id} style={{ opacity: m.is_active ? 1 : 0.55 }}>
              <td>
                <div style={{ fontWeight: 600 }}>{m.email}</div>
                {m.display_name && <div style={{ fontSize: 12, color: '#6B7280' }}>Nom affiché : {m.display_name}</div>}
                <div style={{ fontSize: 12, color: '#6B7280' }}>
                  {m.kind === 'personal' ? `Personnelle — ${m.owner_name || 'employé'} (réglée dans Employés)`
                    : m.kind === 'send_only' ? 'Envoi seulement — jamais lue'
                    : m.functions.includes('tickets') ? 'Chaque courriel devient un ticket'
                    : 'Partagée'}
                  {(m.kind === 'personal' || (m.kind === 'shared' && !m.functions.includes('tickets'))) &&
                    ` · ${m.message_count} courriel(s) copié(s)${m.sync_error ? '' : m.last_sync_at ? ` · copiée ${new Date(m.last_sync_at).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}` : ''}`}
                </div>
                {m.sync_error && <div style={{ fontSize: 12, color: '#DC2626' }}>Copie impossible : {m.sync_error}</div>}
                {tests[m.id]?.text && <div style={{ fontSize: 12, marginTop: 4, color: tests[m.id].ok ? '#059669' : '#DC2626' }}>{tests[m.id].text}</div>}
              </td>
              <td>
                {m.functions.length ? m.functions.map(f => (
                  <span key={f} style={{ display: 'inline-block', fontSize: 12, padding: '2px 8px', borderRadius: 10, background: '#DBEAFE', color: '#1D4ED8', marginRight: 4 }}>{short(data.functions[f] || f)}</span>
                )) : <span style={{ fontSize: 12, color: '#9CA3AF' }}>—</span>}
              </td>
              <td style={{ fontSize: 12 }}>
                {!m.is_active ? <span style={{ color: '#6B7280' }}>Désactivée</span>
                  : !m.has_password ? <span style={{ color: '#D97706' }}>Mot de passe à entrer</span>
                  : m.last_error ? <span style={{ color: '#DC2626' }} title={m.last_error}>Erreur de connexion</span>
                  : m.last_check_at ? <span style={{ color: '#059669' }}>✓ Connectée</span>
                  : <span style={{ color: '#6B7280' }}>Pas encore testée</span>}
              </td>
              <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                <button className="btn-secondary" style={{ fontSize: 12, marginRight: 6 }} disabled={tests[m.id]?.busy || !m.has_password} onClick={() => test(m)}>{tests[m.id]?.busy ? '…' : 'Tester'}</button>
                {m.kind !== 'personal' && <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setEdit(m)}>Modifier</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 16, padding: 14, border: '1px solid #E5E7EB', borderRadius: 10, background: '#fff' }}>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={data.interac.enabled} onChange={e => saveInterac({ enabled: e.target.checked })} style={{ marginTop: 3 }} />
          <span>
            <strong>Reconnaître les paiements Interac</strong>
            <span style={{ display: 'block', color: '#6B7280', fontSize: 13, marginTop: 2 }}>
              Le relevé de la banque n'indique que « VIREMENT INTERAC ». ERPCRM lit les avis d'Interac dans toutes les boîtes, toutes les 15 minutes
              (lecture seule : aucun courriel marqué lu ni déplacé), pour savoir qui a payé chaque dépôt.
            </span>
          </span>
        </label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10, fontSize: 13 }}>
          <span>Lire depuis le</span>
          <input type="date" value={data.interac.since || ''} onChange={e => saveInterac({ since: e.target.value || null })} />
          <span style={{ color: '#9CA3AF' }}>(vide = tout)</span>
          <button className="btn-secondary" style={{ fontSize: 12 }} disabled={!data.interac.enabled} onClick={runInterac}>Lire maintenant</button>
          {interacMsg && <span style={{ color: interacMsg === 'Enregistré' || interacMsg.startsWith('Lecture') ? '#059669' : '#DC2626' }}>{interacMsg}</span>}
        </div>
        {Object.keys(st).length > 0 && (
          <div style={{ marginTop: 8, fontSize: 13, color: '#6B7280' }}>
            Avis : {st.matched || 0} reliés à un dépôt · {st.parsed || 0} lus en attente du relevé · {st.pending || 0} à lire · {st.ignored || 0} ignorés (pas un virement reçu) · {st.failed || 0} illisibles
          </div>
        )}
      </div>

      {edit && <MailboxModal box={edit} functions={data.functions} defaultHost={data.default_host}
        onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </div>
  )
}

function MailboxModal({ box, functions, defaultHost, onClose, onSaved }) {
  const isNew = !box.id
  const [f, setF] = useState({
    email: box.email || '', display_name: box.display_name || '', username: box.username || '', password: '',
    host: box.host || defaultHost || '', imap_port: box.imap_port || 993, smtp_port: box.smtp_port || 465,
    functions: box.functions || [], is_active: box.is_active ?? true,
    kind: box.kind || 'shared', sync_since: box.sync_since || '',
  })
  const [advanced, setAdvanced] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setF({ ...f, [k]: v })
  const toggleFn = k => set('functions', f.functions.includes(k) ? f.functions.filter(x => x !== k) : [...f.functions, k])

  async function save() {
    setSaving(true); setError('')
    const body = { ...f, sync_since: f.sync_since || null, password: f.password || null, username: f.username || null, display_name: f.display_name || null,
      imap_port: Number(f.imap_port) || 993, smtp_port: Number(f.smtp_port) || 465 }
    try {
      if (isNew) await api.post('/v1/mailboxes', body); else await api.put(`/v1/mailboxes/${box.id}`, body)
      onSaved()
    } catch (e) { setError(errText(e)); setSaving(false) }
  }
  async function remove() {
    if (!confirm(`Retirer ${box.email} d'ERPCRM ? Rien n'est effacé dans la boîte de courriel elle-même.`)) return
    await api.delete(`/v1/mailboxes/${box.id}`); onSaved()
  }

  const input = { width: '100%', boxSizing: 'border-box' }
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 560, width: '100%' }}>
        <h3 className="modal-title">{isNew ? 'Ajouter une boîte de courriel' : box.email}</h3>
        <div className="form-group"><label>Adresse</label><input style={input} value={f.email} placeholder="service@votredomaine.com" onChange={e => set('email', e.target.value)} /></div>
        <div className="form-group"><label>Mot de passe</label>
          <input style={input} type="password" autoComplete="new-password" value={f.password} onChange={e => set('password', e.target.value)}
            placeholder={box.has_password ? '•••••••• (enregistré, chiffré — vide = le garder)' : 'Mot de passe de la boîte'} />
        </div>
        <div className="form-group"><label>Nom affiché aux clients (expéditeur)</label><input style={input} value={f.display_name} placeholder="ex. Simple IP Facturation" onChange={e => set('display_name', e.target.value)} /></div>
        <div className="form-group">
          <label>Type</label>
          <select style={input} value={f.kind} onChange={e => set('kind', e.target.value)}>
            {Object.entries(KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        {f.kind === 'shared' && !f.functions.includes('tickets') && (
          <div className="form-group">
            <label>Copier dans Courriels les courriels reçus depuis le</label>
            <input type="date" value={f.sync_since} onChange={e => set('sync_since', e.target.value)} />
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>Vide = les 90 derniers jours. Reculer la date ajoute les courriels plus anciens au prochain passage (rien n'est copié deux fois).</div>
          </div>
        )}
        <div className="form-group">
          <label>Fonctions</label>
          {Object.entries(functions).map(([k, label]) => (
            <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, margin: '6px 0', cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>
              <input type="checkbox" checked={f.functions.includes(k)} onChange={() => toggleFn(k)} style={{ marginTop: 2 }} />
              <span><b>{short(label)}</b> — {label.split(' — ')[1]}</span>
            </label>
          ))}
          <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>Les paiements Interac sont reconnus dans toutes les boîtes, peu importe la fonction.</div>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 10 }}>
          <input type="checkbox" checked={f.is_active} onChange={e => set('is_active', e.target.checked)} /> Boîte active
        </label>
        <button type="button" onClick={() => setAdvanced(!advanced)} style={{ background: 'none', border: 'none', color: '#1D4ED8', cursor: 'pointer', fontSize: 13, padding: 0, marginBottom: 8 }}>
          {advanced ? '▾' : '▸'} Serveur (avancé)
        </button>
        {advanced && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Identifiant (vide = l'adresse)</label><input style={input} value={f.username} onChange={e => set('username', e.target.value)} /></div>
            <div className="form-group"><label>Serveur</label><input style={input} value={f.host} onChange={e => set('host', e.target.value)} /></div>
            <div className="form-group"><label>Port réception</label><input style={input} type="number" value={f.imap_port} onChange={e => set('imap_port', e.target.value)} /></div>
            <div className="form-group"><label>Port envoi</label><input style={input} type="number" value={f.smtp_port} onChange={e => set('smtp_port', e.target.value)} /></div>
          </div>
        )}
        {error && <div style={{ color: '#DC2626', fontSize: 13, marginTop: 8 }}>{error}</div>}
        <div className="modal-actions">
          {!isNew && <button className="btn-secondary" style={{ marginRight: 'auto', color: '#DC2626' }} onClick={remove} disabled={saving}>Retirer</button>}
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving || !f.email.trim() || (isNew && !f.password)}>{saving ? '…' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}
