import { useState, useEffect } from 'react'
import api from '../services/api'
import EntityLink from './EntityLink'
import { askConfirm, showAlert } from './Dialog'

// Propositions de Zéko (TASK-042.13, 2026-10-21) : avis de paiement trouvés dans les courriels → « ce dépôt paie ces
// factures », preuve à l'appui. Rien n'est associé sans « Accepter » ; tout est revérifié au moment d'accepter.
const money = v => v == null ? '—' : `${Number(v).toFixed(2)} $`
const day = d => d ? String(d).slice(0, 10) : '—'
const STATE = {
  proposee: { label: 'Prête', color: '#059669' },
  a_corriger: { label: 'À corriger d’abord', color: '#D97706' },
  sans_depot: { label: 'Dépôt pas encore trouvé', color: 'var(--c-muted)' },
}

export default function ZekoProposals({ onChanged }) {
  const [d, setD] = useState(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(null)
  const load = () => api.get('/v1/zeko/proposals').then(r => setD(r.data)).catch(() => setD({ items: [], scanned: 0, total: 0 }))
  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv) }, [])
  async function act(fn) {
    setBusy(true)
    try { await fn(); await load(); onChanged && await onChanged() }
    catch (e) { showAlert(e.response?.data?.detail || 'Erreur') }
    finally { setBusy(false) }
  }
  if (!d) return <div style={{ padding: 16, color: 'var(--c-faint)' }}>Chargement…</div>
  const ready = d.items.filter(p => p.status === 'proposee')
  const groups = ['proposee', 'a_corriger', 'sans_depot'].map(k => [k, d.items.filter(p => p.status === k)]).filter(([, l]) => l.length)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12, fontSize: 13, color: 'var(--c-muted)' }}>
        <span>Zéko a examiné <strong style={{ color: 'var(--c-text)' }}>{d.scanned}</strong> courriel{d.scanned > 1 ? 's' : ''} sur {d.total} ({(d.boxes || []).join(', ')}) · {d.notices} avis de paiement trouvé{d.notices > 1 ? 's' : ''}</span>
        <button className="btn-secondary" style={{ fontSize: 12 }} disabled={busy} onClick={() => act(() => api.post('/v1/zeko/proposals/recheck'))}>Revérifier</button>
        {ready.length > 0 && <button className="btn-primary" style={{ marginLeft: 'auto' }} disabled={busy}
          onClick={async () => { if (await askConfirm(`Accepter les ${ready.length} propositions prêtes ? Chaque dépôt sera associé à ses factures (annulable ensuite comme une association normale).`)) act(async () => { const r = await api.post('/v1/zeko/proposals/accept-all'); if (r.data.errors?.length) showAlert(`${r.data.accepted} acceptée(s). Refusées à la revérification :\n${r.data.errors.join('\n')}`) }) }}>
          Tout accepter ({ready.length})</button>}
      </div>
      {d.items.length === 0 && <div style={{ border: '1px dashed var(--c-border)', borderRadius: 8, padding: 16, textAlign: 'center', color: 'var(--c-faint)', fontSize: 13 }}>
        Aucune proposition pour l'instant. Zéko lit les courriels un par un (environ 1 à 3 minutes chacun sur ce serveur).</div>}
      {groups.map(([k, list]) => (
        <div key={k} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: STATE[k].color, margin: '6px 0' }}>{STATE[k].label} ({list.length})</div>
          {list.map(p => (
            <div key={p.id} style={{ border: '1px solid var(--c-border)', borderRadius: 8, padding: '10px 12px', marginBottom: 8, background: 'var(--c-surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 14 }}>
                <strong>{money(p.amount)}</strong>
                {p.company_name && <EntityLink kind="company" id={p.company_id}>{p.company_name}</EntityLink>}
                <span style={{ color: 'var(--c-muted)', fontSize: 13 }}>
                  {p.deposit ? `dépôt du ${day(p.deposit.date)}` : 'aucun dépôt associé'} · avis du {day(p.mail?.date)} ({p.mail?.name || p.mail?.from})
                </span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? 'Cacher la preuve' : 'Voir la preuve'}</button>
                  {k === 'proposee' && <button className="btn-primary" style={{ fontSize: 12 }} disabled={busy} onClick={() => act(() => api.post(`/v1/zeko/proposals/${p.id}/accept`))}>Accepter</button>}
                  <button className="btn-secondary" style={{ fontSize: 12 }} disabled={busy} onClick={async () => { if (await askConfirm('Écarter cette proposition ?')) act(() => api.post(`/v1/zeko/proposals/${p.id}/refuse`)) }}>Refuser</button>
                </span>
              </div>
              {p.allocations.length > 0 && (
                <div style={{ fontSize: 13, marginTop: 4 }}>Paie : {p.allocations.map((a, i) => <span key={a.invoice_id}>{i ? ', ' : ''}<EntityLink kind="invoice" id={a.invoice_id}>{a.number}</EntityLink> {money(a.amount)}</span>)}</div>
              )}
              {p.explanation && <div style={{ fontSize: 13, marginTop: 4, color: STATE[k].color }}>{p.explanation}</div>}
              {open === p.id && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: 'var(--c-surface-2)', borderRadius: 6, padding: 10, marginTop: 8, maxHeight: 300, overflow: 'auto' }}>{p.mail?.subject ? `Sujet : ${p.mail.subject}\n` : ''}{p.evidence}</pre>}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
