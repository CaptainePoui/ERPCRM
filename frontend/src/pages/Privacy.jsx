import './Privacy.css'

export default function Privacy() {
  return (
    <div className="priv-page">
      <div className="priv-topbar">
        <div className="priv-brand">Simple IP</div>
      </div>
      <div className="priv-body">
        <h1>Politique de confidentialité</h1>
        <p className="priv-updated">Dernière mise à jour : août 2026</p>

        <p>
          Simple IP (« nous », « notre ») respecte la confidentialité des renseignements
          personnels de ses clients et visiteurs. Cette politique décrit les renseignements
          que nous recueillons et la façon dont nous les utilisons, notamment dans le cadre
          de notre outil de prise de rendez-vous en ligne.
        </p>

        <h2>1. Renseignements recueillis</h2>
        <p>
          Lorsque vous utilisez notre formulaire de prise de rendez-vous (appel téléphonique
          ou rendez-vous sur place), nous recueillons : votre nom, le nom de votre compagnie,
          votre courriel, votre numéro de téléphone, votre numéro de cellulaire (optionnel),
          l'adresse de la visite (pour un rendez-vous sur place) et une description de votre
          demande.
        </p>

        <h2>2. Utilisation des renseignements</h2>
        <p>
          Ces renseignements servent uniquement à : créer votre dossier client dans notre
          système de gestion interne, planifier le rendez-vous demandé, vous envoyer un
          courriel de confirmation (incluant une invitation de calendrier standard), et
          assurer le suivi de votre demande par nos techniciens.
        </p>

        <h2>3. Utilisation de Google Calendar</h2>
        <p>
          Notre système utilise l'API Google Calendar, connectée à un compte Google
          appartenant exclusivement à Simple IP, pour deux fins précises et limitées :
        </p>
        <ul>
          <li>
            <strong>Vérifier la disponibilité</strong> (portée <code>calendar.freebusy</code>) :
            consulter les plages libres/occupées de l'agenda interne de Simple IP afin de
            proposer des créneaux réellement disponibles, sans jamais consulter le contenu,
            les détails ou les participants des événements.
          </li>
          <li>
            <strong>Créer les rendez-vous confirmés</strong> (portée <code>calendar.events</code>) :
            ajouter un événement dans l'agenda interne de Simple IP correspondant au
            rendez-vous que vous avez réservé.
          </li>
        </ul>
        <p>
          Notre système n'a accès à aucun agenda Google appartenant à nos clients ou visiteurs.
          Seul l'agenda interne de Simple IP est consulté ou modifié.
        </p>

        <h2>4. Conservation des données</h2>
        <p>
          Les renseignements sont conservés dans notre système de gestion interne aussi
          longtemps que nécessaire pour assurer le suivi de la relation client.
        </p>

        <h2>5. Partage avec des tiers</h2>
        <p>
          Nous ne vendons ni ne partageons vos renseignements personnels avec des tiers,
          à l'exception des fournisseurs de services strictement nécessaires au
          fonctionnement de notre système (hébergement, envoi de courriels, Google
          Calendar tel que décrit ci-dessus).
        </p>

        <h2>6. Vos droits</h2>
        <p>
          Vous pouvez en tout temps demander l'accès, la correction ou la suppression de vos
          renseignements personnels en nous contactant à l'adresse ci-dessous.
        </p>

        <h2>7. Contact</h2>
        <p>
          Pour toute question concernant cette politique de confidentialité :
          <br />Simple IP — <a href="mailto:support@simpleip.tel">support@simpleip.tel</a>
        </p>
      </div>
    </div>
  )
}
