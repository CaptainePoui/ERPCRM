import { useEffect } from 'react'

export default function TimerNavigationPrompt({ blocker, onPause, onResume }) {
  const blocked = !!blocker && blocker.state === 'blocked'

  // Le temps de reflexion devant ce popup ne doit jamais etre facture au
  // client -- pause des l'apparition, une vraie reprise n'a lieu que si
  // l'utilisateur choisit explicitement de continuer.
  useEffect(() => { if (blocked) onPause() }, [blocked])

  if (!blocked) return null

  async function keepRunning() {
    await onResume()
    // Le chrono ne roule que tant que la page du ticket reste ouverte quelque
    // part -- on l'ouvre dans un nouvel onglet pour qu'elle continue a exister,
    // pendant que cet onglet-ci poursuit la navigation demandee.
    window.open(window.location.href, '_blank')
    blocker.proceed()
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 400 }}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 440 }}>
        <h3 className="modal-title">Chrono en cours</h3>
        <p style={{ fontSize: 14, color: '#374151', margin: 0 }}>
          Le chrono de ce ticket est actif. Doit-il continuer pendant que vous naviguez ailleurs ?
        </p>
        <div className="modal-actions" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          {/* data-timer-btn : exclu du listener global "un clic n'importe où relance le
              chrono" -- sinon cliquer ces boutons le relancerait tout seul apres la pause
              ci-dessus, avant meme le choix de l'utilisateur. */}
          <button data-timer-btn className="btn-primary" onClick={keepRunning}>Oui — garder ouvert dans un nouvel onglet</button>
          <button data-timer-btn className="btn-secondary" onClick={() => blocker.proceed()}>Non — mettre en pause</button>
        </div>
      </div>
    </div>
  )
}
