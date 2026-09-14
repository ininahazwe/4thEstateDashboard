# 4thestate Dashboard — Frontend

Vite + React 19 + TypeScript. Consomme l'API du dossier `../backend`.

## Installation

```bash
cd frontend
npm install
cp ...env.example ...env
```

`VITE_API_URL` doit pointer vers l'API backend (par défaut `http://localhost:4000/api`).

⚠️ **Nouvelle dépendance ajoutée : `leaflet`** (pour la carte, voir plus
bas). Déjà installée (`npm install` lancé directement sur ta machine) —
mentionné ici pour mémoire si tu retires `node_modules` ou clones le dépôt
ailleurs.

## Lancer en développement

```bash
npm run dev
```

Ouvre `http://localhost:5173`. Le backend (`cd ../backend && npm run dev`) doit
tourner en parallèle, avec les identifiants Google OAuth configurés côté
backend (voir `../backend/README.md` > Authentification Google) — c'est le
seul moyen de se connecter, il n'y a plus de formulaire mot de passe dans
l'UI.

## Ce qui est fait

- Connexion via Google (redirige vers le backend -> Google -> callback -> JWT stocké en localStorage)
- Liste des dossiers (cases) avec création rapide
- Vue détail d'un dossier : badges statut/sensibilité + chronologie des
  événements (investigation_events), avec ajout/édition/suppression
- Édition et suppression (soft-delete) d'un dossier depuis sa page de détail
- Page "Contacts" : répertoire natif — création, édition, suppression, recherche
- Rattachement de contacts à un dossier (section "Contacts liés" sur la page
  du dossier) et sélection des contacts impliqués dans un événement donné
- Gestion des contributeurs d'un dossier (section "Contributeurs", réservée
  aux "lead") : ajout par email, changement de rôle, retrait — c'est ce qui
  permet de tester l'accès par rôle (lead/collaborator/observer/read_only)
  en ajoutant un deuxième compte sur un même dossier
- Tags / thèmes sur un dossier : lier un tag existant ou en créer un nouveau
  à la volée (vocabulaire partagé sur toute la plateforme) ; affichés aussi
  en badges sur la liste des dossiers, pas seulement sur la fiche détail
- Journal d'activité par dossier ("Activity log") avec le détail avant/après
  au clic — la visibilité varie selon le rôle du lecteur (voir
  `../backend/README.md`)
- Documents : upload (avec type, sensibilité, source, date) et téléchargement
  depuis la fiche du dossier ; suppression réservée au lead
- Commentaires sur un dossier, un événement ou un document : fil de
  discussion avec réponses (un niveau de profondeur), visibilité privée
  (auteur seul) ou partagée avec les autres contributeurs, mentions de
  contacts/événements. Poster est réservé aux rôles `observer` et plus
  (`read_only` ne peut lire que les commentaires partagés) ; modifier/
  supprimer un commentaire est réservé à son auteur (ou au `lead` pour la
  suppression)
- Notifications in-app : cloche dans l'en-tête (présente sur toutes les
  pages) avec pastille de non-lues, liste déroulante, marquage lu au clic
  (ou "tout marquer comme lu"), rafraîchie toutes les 30s. Déclenchée par un
  commentaire partagé, un ajout/changement de rôle en tant que contributeur,
  ou une sensibilité de dossier augmentée
- Présence temps réel sur la fiche dossier : bandeau "Currently viewing: ..."
  qui liste les contributeurs qui ont la page ouverte en ce moment (via
  Socket.io), mis à jour instantanément à l'arrivée/au départ de chacun. Pas
  de curseurs live — juste qui est présent
- Recherche cross-case (page "Search", accessible depuis les dossiers, les
  contacts et la liste des dossiers) : recherche unique sur les dossiers,
  événements, commentaires et documents à la fois (LIKE sur titre/
  description/corps selon le type), avec filtres sensibilité, type
  d'événement, contributeur, plage de dates et sélection des types de
  ressource à inclure. Résultats triés par date décroissante, chacun avec un
  lien vers le dossier concerné. Export CSV des résultats affichés
- Graphe de relations (page "Graph", accessible depuis les dossiers, les
  contacts, la liste des dossiers, et depuis une fiche dossier pour une vue
  limitée à ce seul dossier) : graphe interactif (D3, force-directed) des
  dossiers, événements, contacts, tags/thèmes et lieux, avec pan/zoom,
  glisser un nœud pour le repositionner, filtre par type de relation, survol
  pour le détail, clic sur un dossier/événement pour l'ouvrir, clic sur un
  contact/tag/lieu pour surligner ses connexions directes. Les clusters
  (groupes de contacts liés) sont coloriés automatiquement (composantes
  connexes calculées côté client). Rien n'est saisi manuellement — tout est
  déduit des données existantes (voir ../backend/README.md > Graphe de
  relations pour le détail)
- Rapport d'enquête : boutons "Report (redacted)" / "Report (full)" sur la
  fiche dossier, qui téléchargent un fichier Markdown (résumé, découvertes
  clés, chronologie, contacts clés, tags) — voir ../backend/README.md >
  Rapport d'enquête pour le détail. Le bouton "Report (full)" est masqué
  pour un rôle autre que `lead` sur un dossier "très sensible" (le backend
  le refuserait de toute façon)
- Carte (page "Map", accessible depuis les dossiers, les contacts et la
  liste des dossiers, et depuis une fiche dossier pour une vue limitée à ce
  seul dossier) : carte interactive (Leaflet + fonds OpenStreetMap, pas de
  clé API) des événements géolocalisés, marqueurs colorés par type
  d'événement, filtre par type, clic sur un marqueur pour le détail et un
  lien vers le dossier concerné. Vue par défaut centrée sur le Ghana à
  l'ouverture (ajustée automatiquement dès qu'il y a des événements à
  afficher). Seuls les événements avec des coordonnées (pas juste un texte
  de lieu) apparaissent — voir ../backend/README.md > Géolocalisation pour
  le détail
- Calendrier (page "Calendar", accessible depuis les mêmes endroits que la
  carte) : vue mensuelle ou hebdomadaire des événements d'enquête et des
  échéances de dossier, filtre par type d'événement, clic sur un jour pour
  le détail dans un panneau "agenda", clic sur un élément pour aller au
  dossier concerné. Pas d'export iCal ni de rappels dans cette version —
  voir ../backend/README.md > Calendrier pour le détail et les raisons
- Portfolio éditorial (page "Portfolio", accessible depuis les mêmes
  endroits que la carte/le calendrier) : grille des projets éditoriaux
  (brief §2.1/§2.2) avec bandeau de KPI (actifs, à lancer, publiés ce
  mois-ci), filtres (statut, thème, tri par date/urgence/progrès), création
  d'un projet. Fiche détail d'un projet (page "Editorial project") :
  édition des champs et du statut, dossiers liés (lier/délier, limité aux
  dossiers auxquels on a soi-même accès), jalons (créer, changer de statut,
  supprimer), contributeurs (ajout par email/rôle/retrait, réservé au
  `lead_journalist`) — voir ../backend/README.md > Projets éditoriaux +
  portfolio pour le détail, notamment les décisions de rôle/tri/KPI
- Authentification à deux facteurs (page "Security", accessible depuis les
  mêmes endroits que le portfolio) : activation (QR code à scanner + clé
  manuelle, confirmation par code, affichage unique des 8 codes de
  récupération), désactivation. Sur la fiche d'un dossier `highly_sensitive`
  sans 2FA vérifié récemment, un écran dédié remplace le contenu du dossier
  et propose soit d'aller l'activer (page Security), soit de saisir un code
  frais (retente automatiquement le chargement du dossier une fois validé)
  — voir ../backend/README.md > Authentification à deux facteurs (2FA) pour
  le détail, notamment la portée volontairement limitée aux routes d'un
  dossier (pas de re-vérification sur la recherche/le graphe/la carte/le
  calendrier)
- Documents chiffrés au repos + recherchables par leur contenu : rien de
  visible ne change à l'upload (le chiffrement est transparent), sauf un
  petit indicateur sur chaque document de la fiche dossier ("Indexing
  text…" / "🔍 Searchable by content" / "Text extraction failed") selon
  l'avancement de l'extraction de texte (OCR pour les photos, extraction du
  texte pour les PDF) lancée automatiquement à l'upload — voir
  ../backend/README.md > "Chiffrement des documents + OCR" pour le détail
- Export CSV du journal d'activité : bouton "Export CSV" sur l'écran
  "Activity log" de la fiche dossier (masqué si le dossier est très
  sensible et qu'on n'est pas lead, comme le reste de cet écran) —
  télécharge l'historique complet accessible, pas seulement les entrées
  affichées à l'écran — voir ../backend/README.md > "Journal d'audit —
  export + rétention" pour le détail, notamment la politique de rétention
  (côté serveur, pas d'UI dédiée pour l'instant)
- Mode panique (page "Security") : bouton "Panic — sign out everywhere"
  (avec confirmation) qui invalide immédiatement toutes les sessions du
  compte, y compris celle en cours — voir ../backend/README.md > "Mode
  panique + liste blanche d'IP" pour le détail. La liste blanche d'IP,
  elle, est une variable d'environnement côté serveur : aucune UI, rien à
  configurer depuis le frontend.

Les boutons de création/édition d'événement et de rattachement de contact ne
s'affichent que pour les rôles `lead`/`collaborator` (le backend les
refuserait de toute façon) ; les boutons de suppression et la gestion des
contributeurs ne s'affichent que pour le `lead`.

## Prochaines étapes (pas encore fait)

- Phase 3 terminée (recherche cross-case, graphe de relations, rapport
  auto-généré) et Phase 2 terminée (commentaires, notifications, présence
  temps réel)
- Phase 4 (Éditorial + Polish, brief) est maintenant **entièrement
  fonctionnellement complète**, volet sécurité/conformité (brief §5)
  compris : projets éditoriaux, vue portfolio, calendrier, 2FA, chiffrement
  des documents, OCR, export/rétention du journal d'audit, mode panique et
  liste blanche d'IP sont tous faits (voir ci-dessus)
