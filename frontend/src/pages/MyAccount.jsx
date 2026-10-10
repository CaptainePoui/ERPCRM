// ⚙ Mon compte (TASK-014.3, 2026-10-09) : seulement ce qui appartient a la personne connectee -- son mot de passe et
// sa signature de courriel (la meme que dans Employés → ✉ Courriels et signature, lue sur sa fiche employe).
// Les reglages de l'entreprise sont dans Administration → Entreprise.
import { useEffect, useState } from 'react'
import api from '../services/api'
import SignatureEditor from '../components/SignatureEditor'
import ChangePasswordModal from '../components/ChangePasswordModal'

const ROLE_LABELS = { admin: 'Administrateur', manager: 'Gérant', tech: 'Technicien', billing: 'Facturation', readonly: 'Lecture seule' }
const card = { background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, padding: 24, marginBottom: 20 }
const h3 = { fontSize: 15, fontWeight: 700, marginBottom: 8, color: 'var(--c-text)' }

export default function MyAccount() {
  const [user, setUser] = useState(null)       // lu sur le compte (jamais la copie gardee a la connexion)
  const [pwd, setPwd] = useState(false)
  const [html, setHtml] = useState(null)
  const [noEmployee, setNoEmployee] = useState('')
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    api.get('/v1/auth/me').then(r => setUser(r.data))
    api.get('/v1/employees/me/signature').then(r => setHtml(r.data.html))
      .catch(e => setNoEmployee(e.response?.status === 404 ? e.response.data.detail : 'Signature impossible à charger'))
  }, [])

  async function saveSignature() {
    setSaving(true); setMsg(null)
    try {
      const r = await api.put('/v1/employees/me/signature', { html })
      setHtml(r.data.html); setMsg({ ok: true, text: 'Signature enregistrée' })
    } catch (e) { setMsg({ ok: false, text: e.response?.data?.detail || 'Erreur : non enregistré' }) } finally { setSaving(false) }
  }

  const previewDoc = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:16px;font-family:Arial,sans-serif;font-size:14px;color:#333}p{margin:0}img{max-width:100%}a{color:#1D4ED8}hr{border:none;border-top:1px solid #D1D5DB;margin:8px 0}</style></head><body>${(html || '').replace(/<p([^>]*)><\/p>/g, '<p$1><br></p>')}</body></html>`
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 520px), 1fr))', columnGap: 20, alignItems: 'start', padding: '0 0 40px' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24, gridColumn: '1 / -1' }}>⚙ Mon compte</h2>

      <div style={card}>
        <h3 style={h3}>Connexion</h3>
        <div style={{ fontSize: 14, color: 'var(--c-text-2)', marginBottom: 12 }}>
          <div><strong>{user?.full_name}</strong> — {ROLE_LABELS[user?.role] || user?.role}</div>
          <div style={{ color: 'var(--c-muted)' }}>Se connecte avec {user?.email}</div>
        </div>
        <button className="btn-primary" onClick={() => setPwd(true)}>Changer mon mot de passe</button>
      </div>

      <div style={card}>
        <h3 style={h3}>Ma signature de courriel</h3>
        <p style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 0 }}>
          Ajoutée au bas des courriels que vous écrivez et des courriels de communication (tickets, tâches). Jamais sur les factures, devis ou avis de retard.
          Vous pouvez coller votre signature actuelle (Outlook, Gmail) : la mise en forme est gardée.
        </p>
        {noEmployee ? <div style={{ fontSize: 13, color: 'var(--c-on-amber)' }}>{noEmployee}</div>
          : html === null ? <div style={{ padding: 20, color: 'var(--c-faint)' }}>Chargement…</div>
          : <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button type="button" className={preview ? 'btn-secondary' : 'btn-primary'} style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => setPreview(false)}>Modifier</button>
              <button type="button" className={preview ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => setPreview(true)}>Aperçu</button>
            </div>
            {preview ? <iframe title="Aperçu de la signature" sandbox="" srcDoc={previewDoc} style={{ width: '100%', height: 300, border: '1px solid var(--c-border-strong)', borderRadius: 8, background: 'var(--c-surface)' }} />
              : <SignatureEditor value={html} onChange={setHtml} />}
            {msg && <div style={{ fontSize: 13, marginTop: 8, color: msg.ok ? '#059669' : '#DC2626' }}>{msg.text}</div>}
            <button className="btn-primary" onClick={saveSignature} disabled={saving} style={{ marginTop: 12 }}>{saving ? '…' : 'Enregistrer ma signature'}</button>
          </>}
      </div>

      {pwd && <ChangePasswordModal onClose={() => setPwd(false)} />}
    </div>
  )
}
