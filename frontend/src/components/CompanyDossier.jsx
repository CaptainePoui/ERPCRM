// Dossier de la compagnie (TASK-002.7, 2026-10-14). Philippe : « tout ce qui a rapport avec la compagnie, rassemblé…
// des liens : si le CDR est dans SIPV, le lien va les chercher instantanément ». Rien n'est copié : chaque carte lit sa
// source à l'ouverture (ERPCRM ou SIPV) et mène à l'onglet complet ; les fichiers s'ouvrent depuis leur place.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'

const fmtD = d => d ? new Date(d).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
const fmtDT = d => d ? new Date(d).toLocaleString('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
const fmtSec = s => s == null ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const muted = { fontSize: 12, color: 'var(--c-muted)' }

async function openBlob(url, filename) {
  const r = await api.get(url, { responseType: 'blob' })
  const u = URL.createObjectURL(r.data)
  if (filename) { const a = document.createElement('a'); a.href = u; a.download = filename; a.click() } else window.open(u, '_blank')
}

function Card({ title, count, source, onOpen, children, unavailable }) {
  return (
    <div style={{ border: '1px solid var(--c-border)', borderRadius: 12, padding: 14, background: 'var(--c-surface)', display: 'flex', flexDirection: 'column', minHeight: 120 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
        {count != null && !unavailable && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)' }}>{count}</span>}
        <span style={{ ...muted, fontSize: 11 }}>· {source}</span>
        {onOpen && <button type="button" className="btn-secondary" style={{ marginLeft: 'auto', fontSize: 12, padding: '3px 10px' }} onClick={onOpen}>Ouvrir →</button>}
      </div>
      {unavailable ? <div style={{ ...muted, color: '#D97706' }}>SIPV injoignable pour l'instant.</div> : children}
    </div>
  )
}

const Row = ({ left, right, onClick, to }) => {
  const style = { display: 'flex', gap: 10, fontSize: 13, padding: '4px 0', borderTop: '1px solid var(--c-surface-3)', cursor: onClick || to ? 'pointer' : 'default', color: 'inherit', textDecoration: 'none' }
  const inner = <><span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{left}</span><span style={muted}>{right}</span></>
  return to ? <Link to={to} style={style}>{inner}</Link> : <div style={style} onClick={onClick}>{inner}</div>
}

export default function CompanyDossier({ companyId, onOpenTab, barter }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api.get(`/v1/companies/${companyId}/dossier`).then(r => setD(r.data)).catch(e => setError(e.response?.data?.detail || 'Erreur')) }, [companyId])
  if (error) return <div style={{ color: '#DC2626' }}>{error}</div>
  if (!d) return <div className="loading">Chargement...</div>
  const none = txt => <div style={muted}>{txt}</div>
  const prov = d.provisioning || {}
  return (
    <div>
      <div style={{ ...muted, marginBottom: 14 }}>Tout ce qui concerne {d.company.name}{d.company.account_number ? ` (${d.company.account_number})` : ''}, lu en direct là où c'est rangé (ERPCRM ou SIPV) — rien n'est copié.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 14 }}>
        <Card title="Tickets" count={d.tickets.count} source="ERPCRM" onOpen={() => onOpenTab('tickets')}>
          {d.tickets.items.length ? d.tickets.items.map(t => <Row key={t.id} to={`/tickets/${t.id}`} left={t.title} right={`${t.status} · ${fmtD(t.date)}`} />) : none('Aucun ticket.')}
        </Card>
        <Card title="Factures" count={d.invoices.count} source="ERPCRM" onOpen={() => onOpenTab('transactions')}>
          {d.invoices.items.length ? d.invoices.items.map(i => (
            <div key={i.id} style={{ display: 'flex', gap: 10, fontSize: 13, padding: '4px 0', borderTop: '1px solid var(--c-surface-3)', alignItems: 'center' }}>
              <Link to={`/invoices/${i.id}`} style={{ flex: 1 }}>{i.number}</Link>
              <span style={muted}>{Number(i.total).toFixed(2)} $ · {i.status} · {fmtD(i.date)}</span>
              <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => openBlob(`/v1/invoices/${i.id}/pdf`)}>PDF</button>
            </div>
          )) : none('Aucune facture.')}
        </Card>
        <Card title="Courriels" count={d.mails.count} source="ERPCRM" onOpen={() => onOpenTab('courriels')}>
          {d.mails.items.length ? d.mails.items.map(m => <Row key={m.id} left={m.subject} right={fmtD(m.date)} onClick={() => onOpenTab('courriels')} />) : none('Aucun courriel lié.')}
        </Card>
        <Card title="Ententes" count={d.agreements.count} source="ERPCRM" onOpen={barter ? () => onOpenTab('echanges') : null}>
          {d.agreements.items.length ? d.agreements.items.map(f => <Row key={f.id} left={f.filename} right={fmtD(f.date)} onClick={() => openBlob(`/v1/barter/files/${f.id}`, f.filename)} />)
            : none('Aucune entente.')}
        </Card>
        <Card title="Provisionnement" count={null} source="SIPV" unavailable={prov.unavailable} onOpen={() => onOpenTab('telephonie', 'appareils')}>
          {(prov.templates || []).length ? prov.templates.map(t => <Row key={t.id} left={`${t.name}${t.is_default ? ' (par défaut)' : ''}`} right={`${t.phone_model || ''} · ${t.phones} poste(s)`} onClick={() => onOpenTab('telephonie', 'appareils')} />)
            : none('Aucun modèle de provisionnement.')}
          <div style={{ ...muted, marginTop: 8 }}>Fonds d'écran : {(prov.wallpapers || []).length ? prov.wallpapers.map(w => w.name + (w.is_default ? ' (par défaut)' : '')).join(', ') : 'aucun (fond Simple IP)'}</div>
        </Card>
        <Card title="Appels" count={d.calls.count} source="SIPV" unavailable={d.calls.unavailable} onOpen={() => onOpenTab('telephonie', 'cdr')}>
          {(d.calls.items || []).length ? d.calls.items.map((c, k) => <Row key={k} left={`${c.src || ''} → ${c.dst || ''}`} right={`${c.direction === 'inbound' ? 'Entrant' : c.direction === 'outbound' ? 'Sortant' : c.direction || ''} · ${fmtSec(c.duration)} · ${fmtDT(c.date)}`} onClick={() => onOpenTab('telephonie', 'cdr')} />)
            : none('Aucun appel.')}
        </Card>
        <Card title="Appels enregistrés" count={d.recordings.count} source="SIPV" unavailable={d.recordings.unavailable}>
          {(d.recordings.items || []).length ? d.recordings.items.map(r => <Row key={r.id} left={`${r.caller || ''} → ${r.callee || ''}`} right={`${fmtSec(r.duration)} · ${fmtDT(r.date)}`} />)
            : none('Aucun appel enregistré.')}
        </Card>
        <Card title="Photos d'installation" count={d.photos.count} source="ERPCRM" onOpen={() => onOpenTab('photos')}>
          {none(d.photos.count ? `${d.photos.count} photo(s).` : 'Aucune photo.')}
        </Card>
      </div>
    </div>
  )
}
