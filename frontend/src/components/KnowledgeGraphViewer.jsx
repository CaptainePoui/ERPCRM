import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import ForceGraph3D from 'react-force-graph-3d'
import api from '../services/api'
import Autocomplete from './Autocomplete'

const TYPE_COLORS = { Entity: '#38BDF8', Episodic: '#F472B6', Community: '#FBBF24' }
const colorForType = t => TYPE_COLORS[t] || '#A78BFA'

export default function KnowledgeGraphViewer() {
  const [limit, setLimit] = useState(3000)
  const [data, setData] = useState({ nodes: [], links: [] })
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [live, setLive] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [dims, setDims] = useState({ width: 0, height: 620 })
  const [searchValue, setSearchValue] = useState(null)
  const containerRef = useRef(null)
  const fgRef = useRef(null)

  // Deplace la camera jusqu'au noeud choisi (ex: "Philippe", le point central du
  // graphe) au lieu de le laisser chercher a l'oeil dans des milliers de noeuds.
  function focusNode(item) {
    setSearchValue(item)
    if (!item) return
    const node = data.nodes.find(n => n.id === item.id)
    if (!node || !fgRef.current) return
    const dist = Math.hypot(node.x || 0, node.y || 0, node.z || 0)
    const distRatio = dist > 0 ? 1 + 120 / dist : 1
    fgRef.current.cameraPosition(
      { x: (node.x || 0) * distRatio, y: (node.y || 0) * distRatio, z: (node.z || 1) * distRatio },
      node,
      1500
    )
    setSelected(node)
  }

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const r = await api.get('/v1/knowledge-graph/graph', { params: { limit } })
      setData(prev => {
        const sameCount = prev.nodes.length === r.data.nodes.length && prev.links.length === r.data.links.length
        if (sameCount) {
          const prevIds = new Set(prev.nodes.map(n => n.id))
          const unchanged = r.data.nodes.every(n => prevIds.has(n.id))
          if (unchanged) return prev // rien de nouveau -- ne pas re-render/relancer la simulation 3D pour rien
        }
        return r.data
      })
      setLastUpdate(new Date())
    } catch (e) {
      if (!silent) setError(e.response?.data?.detail || 'Connexion au graphe impossible')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [limit])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!live) return
    const id = setInterval(() => load(true), 4000)
    return () => clearInterval(id)
  }, [live, load])

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  useEffect(() => {
    function updateDims() {
      if (isFullscreen) {
        setDims({ width: window.innerWidth, height: window.innerHeight })
      } else if (containerRef.current) {
        setDims({ width: containerRef.current.clientWidth, height: 620 })
      }
    }
    updateDims()
    window.addEventListener('resize', updateDims)
    return () => window.removeEventListener('resize', updateDims)
  }, [isFullscreen])

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      containerRef.current?.requestFullscreen()
    }
  }

  // Une Entite nommee "Philippe" et un Episode titre "Philippe -- centre du..."
  // matchent tous les deux une recherche "Philippe" -- sans tri, ils se
  // melangent dans un ordre Neo4j arbitraire. Priorite aux Entity (le concept
  // qu'on cherche typiquement) puis aux libelles les plus courts (une entite
  // nommee exactement "Philippe" passe avant un long titre qui la mentionne).
  const searchItems = useMemo(() => {
    return [...data.nodes]
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'Entity' ? -1 : b.type === 'Entity' ? 1 : 0
        return a.label.length - b.label.length
      })
      .map(n => ({ id: n.id, label: n.label }))
  }, [data.nodes])

  return (
    <div>
      <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>
        Mémoire relationnelle de la plateforme (Graphiti / Neo4j) — faits, décisions et entités liés entre eux. Clic-glisser pour tourner, molette pour zoomer, clic sur un nœud pour voir son détail.
      </p>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ width: 240 }}>
          <Autocomplete
            label="Trouver un nœud"
            items={searchItems}
            value={searchValue}
            onSelect={focusNode}
            placeholder="ex: Philippe..."
          />
        </div>
        <div className="form-group" style={{ margin: 0, width: 140 }}>
          <label>Limite de nœuds</label>
          <input type="number" min="10" max="5000" step="50" value={limit} onChange={e => setLimit(parseInt(e.target.value) || 3000)} />
        </div>
        <button className="btn-secondary" onClick={() => load()} style={{ marginTop: 20 }}>Rafraîchir</button>
        <button
          className={live ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setLive(v => !v)}
          style={{ marginTop: 20 }}
        >
          {live ? '● Live (toutes les 4s)' : 'Activer le live'}
        </button>
        <button className="btn-secondary" onClick={toggleFullscreen} style={{ marginTop: 20 }}>
          {isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
        </button>
        {!loading && !error && (
          <span style={{ fontSize: 13, color: '#9CA3AF', marginTop: 20 }}>
            {data.nodes.length} nœud{data.nodes.length !== 1 ? 's' : ''} · {data.links.length} lien{data.links.length !== 1 ? 's' : ''}
            {data.total_relations > data.links.length && ` sur ${data.total_relations} au total`}
            {live && lastUpdate && ` · maj ${lastUpdate.toLocaleTimeString('fr-CA')}`}
          </span>
        )}
      </div>

      {error && <div className="adm-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div ref={containerRef} style={{ height: isFullscreen ? '100vh' : 620, border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', position: 'relative', background: '#0B1120' }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 13, zIndex: 1 }}>
            Chargement du graphe...
          </div>
        )}
        {!loading && !error && data.nodes.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 13, zIndex: 1 }}>
            Aucune donnée.
          </div>
        )}
        {!loading && data.nodes.length > 0 && (
          <ForceGraph3D
            ref={fgRef}
            graphData={data}
            width={dims.width}
            height={dims.height}
            backgroundColor="#0B1120"
            nodeId="id"
            nodeLabel={n => n.label}
            nodeColor={n => colorForType(n.type)}
            nodeVal={n => n.type === 'Episodic' ? 1 : 2}
            linkLabel={l => l.fact || l.label}
            linkColor={() => 'rgba(148,163,184,0.35)'}
            linkDirectionalParticles={1}
            linkDirectionalParticleWidth={1.2}
            onNodeClick={setSelected}
          />
        )}

        {isFullscreen && (
          <button className="btn-secondary" onClick={toggleFullscreen} style={{ position: 'absolute', top: 12, right: 12, zIndex: 2 }}>
            ✕ Quitter le plein écran
          </button>
        )}

        {selected && (
          <div className="modal-overlay">
            <div className="modal-box" style={{ width: 480, maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: 12, fontWeight: 700, color: colorForType(selected.type), marginBottom: 6, textTransform: 'uppercase' }}>{selected.type}</div>
              <h3 className="modal-title">{selected.label}</h3>
              {Object.entries(selected.properties || {})
                .filter(([k]) => !['name', 'group_id'].includes(k))
                .map(([k, v]) => (
                  <div key={k} style={{ marginBottom: 8 }}>
                    <div style={{ color: '#9CA3AF', fontSize: 11, textTransform: 'uppercase' }}>{k}</div>
                    <div style={{ color: '#374151', wordBreak: 'break-word', fontSize: 13 }}>{String(v)}</div>
                  </div>
                ))}
              {(() => {
                // react-force-graph remplace source/target (des ids au chargement)
                // par les objets noeuds complets une fois la simulation demarree --
                // gerer les deux formes pour retrouver les liens du noeud selectionne.
                const idOf = ref => (ref && typeof ref === 'object' ? ref.id : ref)
                const related = data.links
                  .filter(l => idOf(l.source) === selected.id || idOf(l.target) === selected.id)
                  .map(l => {
                    const otherId = idOf(l.source) === selected.id ? idOf(l.target) : idOf(l.source)
                    const otherNode = data.nodes.find(n => n.id === otherId)
                    return { ...l, otherLabel: otherNode?.label || otherId }
                  })
                if (related.length === 0) return null
                return (
                  <div style={{ marginTop: 12, borderTop: '1px solid #E5E7EB', paddingTop: 12 }}>
                    <div style={{ color: '#9CA3AF', fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>
                      Relations ({related.length})
                    </div>
                    {related.map((l, i) => (
                      <div key={i} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>→ {l.otherLabel}</div>
                        {l.fact && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{l.fact}</div>}
                      </div>
                    ))}
                  </div>
                )
              })()}
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setSelected(null)}>Fermer</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
