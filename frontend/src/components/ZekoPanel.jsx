import { useState, useEffect, useRef } from 'react'
import api from '../services/api'
import { useNavigate } from 'react-router-dom'
import ZekoChat from './ZekoChat'
import { askConfirm } from './Dialog'
import ZekoDropPopup, { useZekoDropTarget } from './ZekoDrops'
import { openInMain, openZekoWindow } from '../utils/zekoBridge'

// Panneau Zéko à droite de l'écran (TASK-006.5 étape 2). Sans ticket : mes conversations (liste + nouvelle) ;
// avec ticketId : LA conversation de ce ticket (partagée par les techniciens, jamais montrée au client).
// Ne se ferme que par son bouton (jamais au clic à côté).
// standalone (TASK-006.7, 2026-10-24) : la fenêtre Zéko à part (/zeko), qu'on place sur un autre écran ; les pages que
// Zéko ouvre s'affichent alors dans la fenêtre ERPCRM.
// Classement (TASK-006.8, 2026-10-26) : ☰ sous le Z montre/cache la liste ; « Chercher un client » donne les
// conversations d'une compagnie ou d'un contact (et en commence une sur lui : Zéko sait de qui on parle) ; projets
// comme dans ChatGPT (glisser une conversation sur un projet, ou ⋯ › Déplacer).

function load(key, dflt) {
  try { const v = localStorage.getItem(key); return v === null ? dflt : JSON.parse(v) } catch { return dflt }
}
function keep(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* sans stockage */ }
}

const small = { border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--c-muted)', fontFamily: 'inherit', padding: '0 4px', fontSize: 14, lineHeight: 1 }
const section = { padding: '10px 12px 4px', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--c-faint)', display: 'flex', alignItems: 'center', gap: 6 }

function ClientSearch({ onPick }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState([])
  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) { setRes([]); return }
    const h = setTimeout(() => api.get('/v1/search', { params: { q: t } })
      .then(r => setRes(r.data.filter(x => x.type === 'company' || x.type === 'contact').slice(0, 10))).catch(() => setRes([])), 250)
    return () => clearTimeout(h)
  }, [q])
  return (
    <div style={{ position: 'relative', padding: '10px 10px 4px' }}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher un client ou un contact…"
        onKeyDown={e => { if (e.key === 'Escape') setQ('') }}
        style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '6px 8px' }} />
      {res.length > 0 && (
        <div style={{ position: 'absolute', left: 10, right: 10, top: '100%', zIndex: 20, background: 'var(--c-surface)', border: '1px solid var(--c-border-strong)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,.15)', maxHeight: 300, overflowY: 'auto' }}>
          {res.map(r => (
            <div key={r.type + r.id} onClick={() => { onPick({ type: r.type, id: r.id, label: r.label }); setQ(''); setRes([]) }}
              style={{ padding: '7px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--c-surface-3)', color: 'var(--c-text)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--c-surface-3)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
              <div>{r.type === 'company' ? '🏢 ' : '👤 '}{r.label}</div>
              {r.sub && <div style={{ fontSize: 11, color: 'var(--c-faint)' }}>{r.sub}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ConvRow({ c, current, projects, showClient, onOpen, onMove, onRename, setDrag }) {
  const [menu, setMenu] = useState(false)
  const [edit, setEdit] = useState(null)
  const ref = useRef(null)
  useEffect(() => {
    if (!menu) return
    const off = e => { if (ref.current && !ref.current.contains(e.target)) setMenu(false) }
    document.addEventListener('mousedown', off, true)       // capture : avant qu'un parent arrête l'événement
    return () => document.removeEventListener('mousedown', off, true)
  }, [menu])
  const on = c.id === current
  return (
    <div ref={ref} draggable={edit === null} onDragStart={e => { setDrag(c.id); e.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => setDrag(null)}
      onClick={() => edit === null && onOpen(c.id)}
      style={{ position: 'relative', padding: '7px 8px 7px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--c-surface-3)',
               background: on ? 'var(--brand-bg)' : 'transparent', color: 'var(--c-text)', display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {edit !== null
          ? <input autoFocus value={edit} onChange={e => setEdit(e.target.value)} onClick={e => e.stopPropagation()}
              onKeyDown={e => { if (e.key === 'Enter') { onRename(c.id, edit); setEdit(null) } if (e.key === 'Escape') setEdit(null) }}
              onBlur={() => setEdit(null)} style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '2px 4px' }} />
          : <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: on ? 700 : 400 }}>{c.title || 'Nouvelle conversation'}</div>}
        <div style={{ fontSize: 11, color: 'var(--c-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {new Date(c.updated_at).toLocaleDateString('fr-CA')}{showClient && c.client ? ` · ${c.client}` : ''}
        </div>
      </div>
      <button type="button" title="Déplacer, renommer" style={small} onClick={e => { e.stopPropagation(); setMenu(m => !m) }}>⋯</button>
      {menu && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', right: 6, top: '100%', zIndex: 30, minWidth: 190, background: 'var(--c-surface)', border: '1px solid var(--c-border-strong)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,.18)', padding: 4 }}>
          <MenuItem onClick={() => { setMenu(false); setEdit(c.title || '') }}>Renommer</MenuItem>
          {projects.length > 0 && <div style={{ padding: '6px 8px 2px', fontSize: 11, color: 'var(--c-faint)' }}>Déplacer vers</div>}
          {projects.filter(p => p.id !== c.project_id).map(p => <MenuItem key={p.id} onClick={() => { setMenu(false); onMove(c.id, p.id) }}>📁 {p.name}</MenuItem>)}
          {c.project_id && <MenuItem onClick={() => { setMenu(false); onMove(c.id, null) }}>Retirer du projet</MenuItem>}
        </div>
      )}
    </div>
  )
}

function MenuItem({ onClick, children }) {
  return <div onClick={onClick} style={{ padding: '6px 8px', fontSize: 13, cursor: 'pointer', borderRadius: 6, color: 'var(--c-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
    onMouseEnter={e => e.currentTarget.style.background = 'var(--c-surface-3)'} onMouseLeave={e => e.currentTarget.style.background = ''}>{children}</div>
}

function Group({ label, icon, count, open, onToggle, onDrop, drag, actions, children }) {
  const [over, setOver] = useState(false)
  return (
    <div>
      <div onClick={onToggle}
        onDragOver={onDrop ? e => { if (drag) { e.preventDefault(); setOver(true) } } : undefined} onDragLeave={() => setOver(false)}
        onDrop={onDrop ? e => { e.preventDefault(); setOver(false); onDrop() } : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px 6px 10px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--c-text)',
                 background: over ? 'var(--brand-bg)' : 'transparent', outline: over ? '2px dashed var(--brand)' : 'none', outlineOffset: -2 }}>
        <span style={{ width: 10, color: 'var(--c-muted)', fontSize: 10 }}>{open ? '▾' : '▸'}</span>
        <span>{icon}</span>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ fontSize: 11, color: 'var(--c-faint)', fontWeight: 400 }}>{count}</span>
        {actions}
      </div>
      {open && <div style={{ paddingLeft: 12 }}>{children}</div>}
    </div>
  )
}

export default function ZekoPanel({ ticketId, ticketLabel, onClose, standalone }) {
  const navigate = useNavigate()
  const openPage = standalone ? openInMain : chemin => navigate(chemin)
  useEffect(() => {
    if (!standalone) return
    document.title = 'Zéko'
    let t = 'jour'
    try { t = localStorage.getItem('erpcrm_theme') || 'jour' } catch { /* sans stockage */ }
    if (t === 'nuit') document.documentElement.setAttribute('data-theme', 'dark')
  }, [standalone])
  const [list, setList] = useState([])
  const [projects, setProjects] = useState([])
  const [current, setCurrent] = useState(null)
  const [status, setStatus] = useState(null)
  const [showList, setShowList] = useState(() => load('zeko_list_open', true))
  const [opened, setOpened] = useState(() => load('zeko_groups_open', {}))       // projets et clients dépliés
  const [client, setClient] = useState(null)        // { type, id, label } : conversations de ce client seulement
  const [newProject, setNewProject] = useState(null)
  const [editProject, setEditProject] = useState(null)
  const [drag, setDrag] = useState(null)
  const fileDrop = useZekoDropTarget()       // fenêtre à part : on y glisse aussi des documents (TASK-006.9)

  async function loadList(selectFirst) {
    const params = client ? { [client.type === 'company' ? 'company_id' : 'contact_id']: client.id } : {}
    const [r, p] = await Promise.all([api.get('/v1/zeko/conversations', { params }), api.get('/v1/zeko/projects')])
    setList(r.data)
    setProjects(p.data)
    if (selectFirst) setCurrent(r.data[0]?.id || null)
  }
  useEffect(() => {
    api.get('/v1/zeko/status').then(r => setStatus(r.data)).catch(() => setStatus({ enabled: false }))
    if (ticketId) api.post('/v1/zeko/conversations', { ticket_id: ticketId }).then(r => setCurrent(r.data.id))
    else loadList(true)
  }, [ticketId])
  useEffect(() => { if (!ticketId) loadList(!!client) }, [client])

  function toggleList() { setShowList(v => { keep('zeko_list_open', !v); return !v }) }
  function toggle(key) { setOpened(o => { const n = { ...o, [key]: !o[key] }; keep('zeko_groups_open', n); return n }) }

  async function newConv() {
    const body = client ? { [client.type === 'company' ? 'company_id' : 'contact_id']: client.id } : {}
    const r = await api.post('/v1/zeko/conversations', body)
    await loadList(false)
    setCurrent(r.data.id)
  }
  async function move(cid, pid) {
    await api.patch(`/v1/zeko/conversations/${cid}`, { project_id: pid })
    if (pid && !opened['p' + pid]) toggle('p' + pid)
    loadList(false)
  }
  async function rename(cid, title) {
    if (!title.trim()) return
    await api.patch(`/v1/zeko/conversations/${cid}`, { title })
    loadList(false)
  }
  async function saveProject() {
    const name = (newProject || '').trim()
    setNewProject(null)
    if (name) { await api.post('/v1/zeko/projects', { name }); loadList(false) }
  }
  async function renameProject() {
    const { id, name } = editProject
    setEditProject(null)
    if (name.trim()) { await api.put(`/v1/zeko/projects/${id}`, { name }); loadList(false) }
  }
  async function removeProject(p) {
    if (!(await askConfirm(`Supprimer le projet « ${p.name} » ?\nSes conversations retournent dans la liste, rien n'est effacé.`))) return
    await api.delete(`/v1/zeko/projects/${p.id}`)
    loadList(false)
  }

  const row = (c, showClient) => <ConvRow key={c.id} c={c} current={current} projects={projects} showClient={showClient}
    onOpen={setCurrent} onMove={move} onRename={rename} setDrag={setDrag} />
  const free = list.filter(c => !c.project_id)
  const byClient = {}
  free.filter(c => c.client).forEach(c => { (byClient[c.client] = byClient[c.client] || []).push(c) })
  const loose = free.filter(c => !c.client)
  const curConv = list.find(c => c.id === current)

  return (
    <div {...(standalone ? fileDrop.props : {})}
      style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: standalone ? '100vw' : ticketId ? 520 : 760, maxWidth: '100vw', zIndex: 1200,
                  background: 'var(--c-surface)', borderLeft: '1px solid var(--c-border)', boxShadow: '-8px 0 30px rgba(0,0,0,.25)', display: 'flex', flexDirection: 'column',
                  outline: fileDrop.over ? '3px dashed var(--brand)' : 'none', outlineOffset: -3 }}>
      {standalone && <ZekoDropPopup />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--c-border)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 28, height: 28, borderRadius: 14, background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>Z</span>
          {!ticketId && <button type="button" title={showList ? 'Cacher les conversations' : 'Montrer les conversations'} onClick={toggleList}
            style={{ ...small, fontSize: 16, padding: '0 2px', color: showList ? 'var(--brand)' : 'var(--c-muted)' }}>☰</button>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--c-text)' }}>Zéko</div>
          <div style={{ fontSize: 11, color: 'var(--c-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ticketId ? `Ticket ${ticketLabel || ''} — échange interne, jamais montré au client`
              : curConv?.client ? `À propos de : ${curConv.client}` : 'Ton assistant dans ERPCRM'}
            {status && !status.enabled && ' · non configuré (Administration → Intégrations)'}
          </div>
        </div>
        {!ticketId && <button className="btn-secondary" style={{ fontSize: 12 }} onClick={newConv}>+ Nouvelle</button>}
        {!ticketId && !standalone && <button className="btn-secondary" style={{ fontSize: 12 }} title="Zéko dans sa propre fenêtre, à placer sur un autre écran"
          onClick={() => { openZekoWindow(); onClose() }}>↗ Fenêtre à part</button>}
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onClose}>Fermer</button>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {!ticketId && showList && (
          <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--c-border)', overflowY: 'auto', overflowX: 'hidden' }}>
            <ClientSearch onPick={setClient} />
            {client ? <>
              <div style={{ margin: '6px 10px', padding: '6px 8px', borderRadius: 8, background: 'var(--brand-bg)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--c-text)' }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{client.type === 'company' ? '🏢 ' : '👤 '}{client.label}</span>
                <button type="button" title="Toutes mes conversations" style={small} onClick={() => setClient(null)}>✕</button>
              </div>
              <div style={{ padding: '0 10px 6px' }}>
                <button className="btn-primary" style={{ fontSize: 12, width: '100%' }} onClick={newConv}>+ Nouvelle sur ce {client.type === 'company' ? 'client' : 'contact'}</button>
              </div>
              {list.length === 0 && <div style={{ padding: 12, fontSize: 12, color: 'var(--c-faint)' }}>Aucune conversation sur {client.label}.</div>}
              {list.map(c => row(c, client.type === 'company'))}
            </> : <>
              <div style={section}>
                <span style={{ flex: 1 }}>Projets</span>
                <button type="button" title="Nouveau projet" style={{ ...small, fontSize: 16 }} onClick={() => setNewProject('')}>+</button>
              </div>
              {newProject !== null && (
                <div style={{ padding: '2px 10px 6px' }}>
                  <input autoFocus value={newProject} placeholder="Nom du projet" onChange={e => setNewProject(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveProject(); if (e.key === 'Escape') setNewProject(null) }} onBlur={saveProject}
                    style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '4px 6px' }} />
                </div>
              )}
              {projects.length === 0 && newProject === null && <div style={{ padding: '0 12px 6px', fontSize: 12, color: 'var(--c-faint)' }}>Aucun projet : + pour en créer un.</div>}
              {projects.map(p => {
                const convs = list.filter(c => c.project_id === p.id)
                return editProject?.id === p.id
                  ? <div key={p.id} style={{ padding: '2px 10px 6px' }}>
                      <input autoFocus value={editProject.name} onChange={e => setEditProject({ id: p.id, name: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') renameProject(); if (e.key === 'Escape') setEditProject(null) }} onBlur={renameProject}
                        style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '4px 6px' }} />
                    </div>
                  : <Group key={p.id} label={p.name} icon="📁" count={convs.length} open={!!opened['p' + p.id]} onToggle={() => toggle('p' + p.id)}
                      drag={drag} onDrop={() => drag && move(drag, p.id)}
                      actions={<>
                        <button type="button" title="Renommer le projet" style={small} onClick={e => { e.stopPropagation(); setEditProject({ id: p.id, name: p.name }) }}>✎</button>
                        <button type="button" title="Supprimer le projet" style={small} onClick={e => { e.stopPropagation(); removeProject(p) }}>✕</button>
                      </>}>
                      {convs.length === 0 && <div style={{ padding: '4px 12px 8px', fontSize: 12, color: 'var(--c-faint)' }}>Glisse une conversation ici.</div>}
                      {convs.map(c => row(c, true))}
                    </Group>
              })}
              {Object.keys(byClient).length > 0 && <div style={section}>Clients</div>}
              {Object.entries(byClient).map(([name, convs]) => (
                <Group key={name} label={name} icon={convs[0].contact_id ? '👤' : '🏢'} count={convs.length} open={!!opened['c' + name]} onToggle={() => toggle('c' + name)}>
                  {convs.map(c => row(c, false))}
                </Group>
              ))}
              <div
                onDragOver={e => { if (drag && list.find(c => c.id === drag)?.project_id) e.preventDefault() }}
                onDrop={e => { e.preventDefault(); if (drag) move(drag, null) }}>
                <div style={section}>Conversations</div>
                {list.length === 0 && <div style={{ padding: 12, fontSize: 12, color: 'var(--c-faint)' }}>Aucune conversation.</div>}
                {loose.map(c => row(c, false))}
              </div>
            </>}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {current
            ? <ZekoChat conversationId={current} compact={!!ticketId} onOpenPage={openPage} onChanged={deleted => { if (!ticketId) loadList(!!deleted) }} />
            : !ticketId && <div style={{ padding: 16 }}><button className="btn-primary" onClick={newConv}>Commencer une conversation</button></div>}
        </div>
      </div>
    </div>
  )
}
