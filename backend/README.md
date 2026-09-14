# 4thestate Dashboard — Backend

API pour la plateforme d'investigation & suivi éditorial (voir le brief dans
le projet Claude "investigative dashboard"). Express 5 + TypeScript + mysql2,
sur la base MySQL déjà créée dans cPanel/phpMyAdmin.

## Installation

```bash
cd backend
npm install
cp ...env.example ...env
```

Remplis `.env` avec les identifiants de ta base cPanel (`DB_HOST`, `DB_USER`,
`DB_PASSWORD`, `DB_NAME`) et une valeur longue/aléatoire pour `JWT_SECRET`.

> Si ta base cPanel n'autorise pas les connexions distantes (MySQL Remote
> Access non activé), il faudra soit l'activer dans cPanel > "Remote MySQL"
> pour ton IP, soit démarrer une base MySQL locale pour le développement et
> pointer `.env` dessus.

> **Migration BDD** : si tu avais déjà importé le `schema.sql` initial, importe aussi `migration_002_native_contacts.sql` dans phpMyAdmin (remplace les tables de contacts prévues pour une "Contact Platform" externe par un répertoire de contacts natif à cette plateforme).

> Importe aussi `migration_003_google_auth.sql` (ajoute les colonnes Google `google_id`/`avatar_url`/`auth_provider` à `users` et rend `password_hash` optionnel).

## Stockage des documents

Les fichiers uploades sur un dossier (`case_documents`) sont ecrits sur le
disque local, dans `backend/uploads/` par defaut (cree automatiquement,
exclu de git). Pour pointer ailleurs (utile en prod cPanel, par exemple hors
du webroot public), ajoute `UPLOADS_DIR=/chemin/absolu` dans `.env`.

Chiffres au repos et rendus recherchables par leur contenu (OCR/texte) —
voir "Chiffrement des documents + OCR" plus bas pour le detail.

⚠️ **Nouvelle dependance ajoutee : `multer`.** Comme pour toute nouvelle
dependance, il faut relancer `npm install` dans `backend/` avant de
redemarrer le serveur (`npm run dev`) — sans ca, le serveur ne demarrera
pas (module introuvable).

⚠️ **Nouvelle dependance ajoutee : `socket.io`** (voir "Presence temps reel"
plus bas). Meme remarque : `npm install` dans `backend/` avant de relancer
le serveur.

⚠️ **Nouvelles dependances ajoutees : `otplib`, `qrcode`, `tesseract.js`,
`tesseract.js-core`, `@tesseract.js-data/eng`, `pdf-parse`.** Meme remarque :
`npm install` dans `backend/` avant de relancer le serveur. Les deux
paquets tesseract.js-* ajoutent environ 58 Mo a `node_modules/` (donnees de
langue + moteur OCR) — a garder en tete si l'espace disque cote hebergement
est limite.

## Notifications

La table `notifications` existait deja en base (probablement une table du
`schema.sql` initial, jamais listee dans le brief §3.1 mais bien presente) —
aucune migration necessaire, le module `notifications` a ete ecrit pour
coller a sa structure (`user_id`, `type` (enum), `payload` (JSON), `is_read`,
`created_at` — pas de colonnes separees pour le dossier/l'acteur/la
ressource concernee : tout ca est stocke directement dans `payload` au
moment de la creation de la notification).

L'enum `type` prevoit 5 valeurs ; seules 3 sont declenchees pour l'instant :

- `new_action` : quelqu'un poste un commentaire **partage** sur un dossier
  auquel tu contribues (les commentaires "private" ne notifient personne
  d'autre que leur auteur)
- `access_granted` : tu es ajoute comme contributeur sur un dossier, ou que
  ton role dessus change (le payload precise `event: "added"` ou
  `"role_changed"`)
- `sensitivity_increased` : la sensibilite d'un dossier auquel tu contribues
  est **augmentee** (jamais sur une diminution)

Pas encore couvert, alors que la table le prevoit :

- `mention` : suppose de mentionner un contributeur (personne) dans un
  commentaire. Aujourd'hui `comments.mentions` ne reference que des
  contacts/evenements (brief §4.5), pas des utilisateurs de la plateforme —
  a etendre si besoin.
- `deadline_approaching` : "cas proche de l'echeance" (brief §2.3) ne peut
  pas se declencher sur une simple ecriture, ca demande une tache planifiee
  qui verifie periodiquement les `due_date` a venir. Pas construit.
- Email et digest quotidien/hebdo (toujours brief §2.3) : in-app seulement
  pour l'instant, version simple d'abord.

Aucune notification ne part vers son propre auteur (l'acteur d'une action
n'est jamais notifie de sa propre action).

## Presence temps reel

"Presence simple" (brief §4.7, scope choisi avec Yv : pas de curseurs live
type Figma, juste "qui consulte ce dossier en ce moment"). Le serveur HTTP
existant sert aussi une connexion Socket.io (`src/realtime/presence.ts`,
branche dans `server.ts`) :

- authentification par le meme JWT que l'API REST, passe dans
  `socket.handshake.auth.token` a la connexion ;
- le client emet `case:join` / `case:leave` avec `{ caseId }` — le serveur
  verifie que l'utilisateur est bien contributeur du dossier
  (`case_contributors`) avant de le laisser rejoindre la room
  `case:<id>` ;
- le serveur diffuse la liste des contributeurs presents (`case:presence`,
  `{ userId, fullName }[]`) a toute la room a chaque arrivee/depart ;
- rien n'est persiste en base : c'est un etat en memoire (une `Map` cote
  serveur), qui se vide tout seul au redemarrage ou quand tout le monde se
  deconnecte — deliberement, une presence n'a pas vocation a survivre.

`FRONTEND_URL` (deja dans `.env` pour les redirections OAuth) sert aussi de
whitelist CORS pour Socket.io.

## Recherche cross-case

Recherche texte simple (`LIKE`, pas de `FULLTEXT` ni de moteur externe type
Elasticsearch/MeiliSearch — brief §6 les mentionnait en option, ecarte pour
l'instant) sur quatre types de ressources : dossiers (titre/description/
contexte editorial), evenements (motif/lieu/resume des decouvertes),
commentaires (uniquement les partages, ou les prives dont on est l'auteur),
documents (nom de fichier/description de la source — pas le contenu du
fichier lui-meme, aucun texte n'est extrait). Toujours limitee aux dossiers
dont l'appelant est contributeur, meme logique d'acces que partout ailleurs
dans l'API.

Les commentaires n'ont pas de colonne `case_id` propre (ils sont rattaches a
un dossier, un evenement ou un document via `resource_type`/`resource_id`) :
la requete de recherche resout leur dossier au vol selon ce a quoi ils sont
rattaches, avant d'appliquer les memes filtres que les autres types.

Si les resultats deviennent peu pertinents a mesure que le volume de donnees
grandit, un index `FULLTEXT` MySQL (ou un moteur dedie) donnerait un
classement par pertinence — pas fait pour cette premiere version, "simple
d'abord" comme le reste.

## Graphe de relations

Comme la recherche cross-case, entierement auto-derive des donnees deja en
base — pas de table `graph_edges` separee, pas de saisie manuelle de
relations (decision prise avec Yv, meme logique "simple d'abord"). Chaque
arete vient d'un lien qui existe deja pour une autre raison :

- contact <-> dossier (`case_contacts`)
- contact <-> evenement (`event_contacts`), etiquetee `interviewed_at` si
  l'evenement est de type "interview", `discovered_at` s'il est de type
  "key_discovery", `involved_in_event` sinon
- evenement <-> dossier (chaque evenement appartient a un dossier)
- dossier <-> tag/theme (`case_tags`)
- evenement <-> lieu (`investigation_events.location`, quand renseigne)
- contact <-> contact, inferee : deux contacts presents sur le meme
  evenement sont marques `met`
- contact <-> dossier, inferee depuis les mentions de commentaire
  (`comments.mentions.contactIds`), etiquetee `mentioned_in`

Le seul verbe du brief (§1.5) qui n'a pas d'equivalent est "a collabore
sur" : rien dans le modele de donnees actuel ne distingue de facon fiable
une collaboration entre contacts (`case_contacts` enregistre des sujets/
sources d'enquete, pas des relations de travail) — laisse de cote plutot
que devine, voir claude/etat-avancement.md.

Cross-case par defaut (memes regles d'acces que la recherche : uniquement
les dossiers dont l'appelant est contributeur), ou limite a un seul dossier
via `?caseId=` — un dossier auquel l'appelant n'a pas acces renvoie
simplement un graphe vide plutot qu'une 403, meme comportement que le reste
de l'API sur les requetes transverses.

## Rapport d'enquête

Rapport Markdown auto-genere par dossier (Phase 3, brief §4.2) : `GET
/api/cases/:caseId/report`, meme acces minimum que le reste du dossier
(`read_only`+). Genere entierement a partir des donnees deja suivies —
metadonnees du dossier, resume (description), decouvertes cles (evenements
de type "key_discovery"), timeline complete, contacts cles, tags/themes —
rien de nouveau a maintenir. Les commentaires ne sont pas inclus.

Markdown seul pour cette premiere version (decision prise avec Yv, meme
logique "simple d'abord" que pour l'export de la recherche) ; un export PDF
resterait a ajouter plus tard si le besoin se confirme (nouvelle dependance).

Parametre `?redacted=true` (ou `=1`) pour la version anonymisee destinee a
la relecture editoriale / fact-check : les contacts marques
`protected_witness` ou `at_risk_source` sont remplaces par un libelle
generique ("Protected source #N") et prives de leurs details identifiants,
et tout evenement dont la sensibilite effective (celle de l'evenement, sinon
celle du dossier) est "tres sensible" voit son contenu remplace par un
placeholder. Le rapport complet (non redige) d'un dossier "tres sensible"
est reserve au lead — meme regle que le journal d'activite, voir
caseAuditLog.service.ts.

## Géolocalisation

`GET /api/geo` (Phase 4 du roadmap) — liste les evenements qui ont des
coordonnees (`investigation_events.location_lat`/`location_lng`), pour
alimenter la carte du frontend. Rien de nouveau en base : ces deux colonnes
existaient deja sur le formulaire d'evenement depuis la Phase 1, simplement
non exploitees jusqu'ici. Meme modele d'acces cross-case que `/api/graph`
et `/api/search` (uniquement les dossiers dont l'appelant est contributeur),
cross-case par defaut ou limite a un seul dossier via `?caseId=`.

## Calendrier

`GET /api/calendar` (Phase 4 du roadmap) — vue calendrier des dates deja
suivies : les evenements d'enquete (`investigation_events.event_date`) et
les echeances de dossier (`cases.due_date`). Aucune nouvelle colonne :
reutilise les memes donnees que la timeline et la carte. Meme modele
d'acces cross-case que `/api/geo`, `/api/graph` et `/api/search`
(uniquement les dossiers dont l'appelant est contributeur), cross-case par
defaut ou limite a un seul dossier via `?caseId=`.

Portee volontairement limitee a la vue calendrier (decision prise avec Yv) :
pas d'export iCal ni de rappels dans cette premiere version — les
"jalons editoriaux" du brief (§4.3) restent hors-scope tant que les projets
editoriaux (§2.1) n'existent pas encore ; `cases.due_date` sert de proxy en
attendant.

## Projets editoriaux + portfolio

`GET/POST /api/editorial-projects`, `GET/PUT/DELETE /api/editorial-projects/:id`,
et les sous-ressources `/api/editorial-projects/:id/contributors`,
`/api/editorial-projects/:id/cases` (liaison avec un ou plusieurs dossiers)
et `/api/editorial-projects/:id/milestones` (brief §2.1/§2.2). Aucune
nouvelle migration : les quatre tables (`editorial_projects`,
`editorial_project_contributors`, `project_cases`, `project_milestones`)
existaient deja dans `schema.sql` depuis le debut, simplement non exploitees
jusqu'ici (meme situation que la geolocalisation et le calendrier).

Un projet editorial est distinct d'un dossier (`cases`) : plusieurs dossiers
peuvent alimenter un seul projet editorial via `project_cases`. Acces
controle par `editorial_project_contributors`, separe de l'acces aux
dossiers eux-memes : voir un projet editorial ne donne pas acces aux
dossiers qui y sont lies, et inversement. Quand on liste les dossiers lies a
un projet, seuls ceux ou l'appelant est aussi `case_contributor` sont
renvoyes (jamais un 403 sur les autres, comme pour le reste de l'app) ;
lier un dossier a un projet est aussi limite aux dossiers auxquels
l'appelant a lui-meme acces (sinon n'importe qui sur le projet pourrait
attacher un dossier par simple devinette d'id).

Roles de contributeur (`lead_journalist`/`editor`/`researcher`/
`photographer`, brief §2.1) : contrairement aux roles de dossier
(lead/collaborator/observer/read_only), ce ne sont pas des niveaux
hierarchiques mais des roles fonctionnels — decision prise en construisant
cette fonctionnalite (pas de rang explicite dans le brief) : n'importe quel
contributeur peut lire et modifier les champs du projet, lier/delier des
dossiers et gerer les jalons ; seul le `lead_journalist` gere l'appartenance
(ajout/role/retrait) et peut supprimer le projet — meme logique que "seul le
lead d'un dossier gere son acces", mais sans hierarchie de lecture/ecriture
entre les quatre roles.

KPI du portfolio (`active`, `toLaunch`, `publishedThisMonth`) calcules sur
*tous* les projets visibles par l'appelant, independamment des filtres
appliques a la liste — comme un bandeau de tableau de bord classique.
`publishedThisMonth` est une approximation : `editorial_projects` n'a pas de
colonne `published_at` dediee (contrairement a `cases`), donc c'est
`updated_at` qui sert de proxy pour "date a laquelle le statut est passe a
publie" — une modification ulterieure d'un projet deja publie le compterait
a tort comme publie "ce mois-ci". Tri du portfolio (`?sort=date|urgency|
progress`) : `date` trie par date cible ; `urgency` pareil mais relegue les
projets deja publies en fin de liste (plus urgents du tout) ; `progress`
trie par position dans le pipeline de statuts (pitch → ... → published),
plutot que par ratio de jalons completes (toujours disponible, meme sans
aucun jalon cree).

## Authentification Google

L'interface se connecte via "Se connecter avec Google" (OAuth 2.0, flux
authorization code). Configuration côté [Google Cloud Console](https://console.cloud.google.com/apis/credentials) :

1. Créer (ou réutiliser) un OAuth client ID de type **Application Web**.
2. Dans **URI de redirection autorisés**, ajouter exactement l'URL de
   `GOOGLE_CALLBACK_URL` de ton `.env` (ex. `http://localhost:4000/api/auth/google/callback`
   en dev). Cette valeur doit correspondre au caractère près.
3. Renseigner dans `backend/.env` : `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `GOOGLE_CALLBACK_URL`, et `GOOGLE_ALLOWED_DOMAIN` (laisser `mfwa.org` pour
   n'autoriser que les comptes Google Workspace de l'organisation, ou vider
   la valeur pour accepter n'importe quel compte Google).

Le premier compte Google `@mfwa.org` qui se connecte est créé
automatiquement (voir `handleGoogleCallback` dans `auth.service.ts`). Il n'y
a donc plus besoin de `create-user` pour l'usage normal — ce script reste
disponible pour créer un compte local de secours si besoin (l'endpoint
`POST /api/auth/login` existe toujours côté API, simplement plus affiché
dans l'UI).

⚠️ N'ajoute jamais le `GOOGLE_CLIENT_SECRET` ni aucune valeur de `.env` dans un
message ou un fichier suivi par Git — `.env` est dans `.gitignore`, modifie-le
directement en local.

## Authentification à deux facteurs (2FA)

Brief §5.2 : "2FA obligatoire pour sensibilité >= très sensible". Avec les 4
niveaux existants (`public`/`internal`/`confidential`/`highly_sensitive`),
">= très sensible" a été interprété comme "exactement `highly_sensitive`".

⚠️ Nécessite une nouvelle migration : `Claude outputs/migration_005_totp_2fa.sql`
ajoute trois colonnes à `users` (`totp_secret`, `totp_enabled`,
`totp_recovery_codes`). À importer via phpMyAdmin avant que la fonctionnalité
ne soit utilisable — sans elle, tout appel à `/api/auth/2fa/*` échouera. Rien
n'est activé par défaut : `totp_enabled` démarre à `0`, aucun compte existant
n'est affecté tant qu'il n'active pas lui-même le 2FA (page Sécurité de
l'appli).

Endpoints (`/api/auth/2fa`, tous authentifiés) :
- `GET /` — statut (`{ enabled }`)
- `POST /setup` — génère un secret TOTP + QR code (`otplib` v13, API
  fonctionnelle et asynchrone, pas le singleton `authenticator` des versions
  10-12) ; pas encore actif
- `POST /enable` — confirme avec un code à 6 chiffres, active le compte et
  renvoie 8 codes de récupération à usage unique (format `XXXX-XXXX`,
  affichés une seule fois, seuls leurs hash bcrypt sont stockés) — ajout
  volontaire au-delà du strict minimum du brief : sans ça, perdre son
  téléphone bloquerait définitivement l'accès aux dossiers très sensibles
  dont on est responsable
- `POST /disable` — désactive (nécessite un code valide ou un code de
  récupération)
- `POST /step-up` — reçoit un code fraîchement saisi et renvoie un nouveau
  JWT portant un claim `totpVerifiedAt` ; c'est ce claim que `requireCaseRole`
  vérifie pour les dossiers `highly_sensitive` (fenêtre de validité :
  `TOTP_STEPUP_TTL_MINUTES`, 12h par défaut, volontairement découplée de
  `JWT_EXPIRES_IN`) — un 403 avec `code: TOTP_SETUP_REQUIRED` ou
  `TOTP_STEP_UP_REQUIRED` indique au frontend lequel des deux cas afficher.

Portée de la vérification : le gate est posé uniquement dans
`requireCaseRole`, donc toutes les routes d'un dossier (événements,
contributeurs, journal d'audit, tags, documents, commentaires, rapport)
l'héritent automatiquement. En revanche les vues transversales (recherche,
graphe, carte, calendrier) ne sont **pas** filtrées par ce gate : un dossier
très sensible peut encore y apparaître (titre/extrait) sans re-vérification
2FA. C'est une limite connue, pas un oubli — à durcir si besoin dans une
itération suivante.

## Chiffrement des documents + OCR (brief §5)

**Chiffrement au repos** : quand `DOCUMENT_ENCRYPTION_KEY` est renseigné dans
`.env` (64 caractères hex = 32 octets, ex. `openssl rand -hex 32`), chaque
document uploadé est chiffré (AES-256-GCM) avant d'être écrit sur disque —
le déchiffrement se fait à la volée au moment du téléchargement
(`GET /:documentId/download`). Format auto-descriptif plutôt qu'une colonne
en base : chaque fichier chiffré commence par un marqueur, ce qui permet de
distinguer un fichier chiffré d'un fichier légataire uploadé avant la mise
en place de cette variable — **aucune migration nécessaire** pour cette
partie. Tant que `DOCUMENT_ENCRYPTION_KEY` n'est pas définie, les uploads
continuent de fonctionner sans chiffrement, exactement comme avant cette
fonctionnalité (affiché au démarrage du serveur : "Document encryption at
rest: ON/OFF"). ⚠️ Ne jamais perdre cette clé une fois des documents
chiffrés avec : sans elle, ces fichiers sont définitivement illisibles (pas
de porte dérobée, volontairement).

**OCR / extraction de texte** ("OCR pour rendre les documents
recherchables") : à l'upload, une extraction de texte est lancée en
arrière-plan (ne bloque pas la réponse) — OCR (`tesseract.js`, anglais
uniquement pour l'instant) pour les images, extraction de la couche texte
(`pdf-parse`) pour les PDF ; les autres types (audio/vidéo/autre) ne sont
pas traités. Le résultat est stocké dans `case_documents.extracted_text`
(nécessite `migration_006_document_text_extraction.sql`, voir plus bas) et
rend le document trouvable par son contenu dans la recherche cross-case
(`search.service.ts`), pas seulement par son nom de fichier ou sa
description. Le statut (`ocr_status` : `pending`/`done`/`failed`/
`not_applicable`) est affiché sur la fiche dossier ("Indexing text…" /
"🔍 Searchable by content" / "Text extraction failed").

⚠️ Piège rencontré et corrigé pendant le développement : `tesseract.js`
télécharge par défaut son modèle de langue (`eng.traineddata`) depuis le CDN
jsdelivr au premier usage — ça échoue silencieusement sur un hébergement
sans accès sortant vers ce CDN précis (jsdelivr n'est pas accessible depuis
l'environnement de développement, alors que le registre npm l'est). Corrigé
en installant le paquet npm `@tesseract.js-data/eng` (les données de langue,
~14 Mo) et `tesseract.js-core` (~44 Mo) comme dépendances normales, et en
pointant `langPath` vers leur emplacement local plutôt que le CDN — testé de
bout en bout (le pipeline OCR tourne sans accès réseau externe). Si l'OCR
semble ne rien faire une fois en production chez toi, la première chose à
vérifier est que `npm install` a bien récupéré ces deux paquets.

## Journal d'audit — export + rétention (brief §5)

**Export** : `GET /api/cases/:caseId/audit-log/export` (bouton "Export CSV"
sur l'écran "Activity log" de la fiche dossier) télécharge l'historique
complet du journal d'audit d'un dossier en CSV — mêmes règles de visibilité
que l'écran (lead voit tout y compris les consultations, collaborator voit
tout sauf les consultations, observer/read_only ne voient que leurs propres
actions, un dossier très sensible reste réservé au lead), mais sans la
limite de 200 lignes de l'écran : un export doit couvrir tout l'historique
accessible, pas seulement les entrées les plus récentes.

**Rétention** : `backend/src/scripts/purgeAuditLog.ts` (lancé via
`npm run purge-audit-log`) supprime les entrées du journal d'audit plus
vieilles que `AUDIT_LOG_RETENTION_DAYS` jours. Volontairement **hors** du
serveur API : ce projet n'a pas d'infrastructure de tâches planifiées
(pas de file d'attente, pas de scheduler en mémoire), et une tâche cron
cPanel (que tu utilises déjà pour d'autres tâches récurrentes probablement)
est le moyen le plus simple de la programmer périodiquement, ex. :

```
0 3 * * 0  cd /chemin/vers/backend && npm run purge-audit-log >> /chemin/vers/logs/purge.log 2>&1
```

(tous les dimanches à 3h — ajuste le chemin et la fréquence selon ton
hébergement, dans cPanel > Cron Jobs).

⚠️ Rien n'est supprimé tant que `AUDIT_LOG_RETENTION_DAYS` n'est pas défini
dans `.env` — aucune fenêtre de rétention implicite par défaut. Avant de
supprimer quoi que ce soit, le script archive automatiquement les lignes
concernées dans un fichier JSON local (`backend/audit-log-backups/`,
exclu de git) — un filet de sécurité au cas où personne n'aurait pensé à
faire l'export CSV avant. Le déclenchement réel de la suppression n'a pas
été testé contre la vraie base de données pendant le développement (pour ne
pas risquer de supprimer de vraies entrées d'audit sans ton accord) — le
chemin "rien à faire" (variable non définie) l'a été. Teste d'abord sur un
dossier de test, ou avec une valeur de rétention volontairement longue,
avant de programmer la tâche cron en production.

## Mode panique + liste blanche d'IP (brief §5)

**Mode panique** : bouton "Panic — sign out everywhere" sur la page
"Security" — invalide immédiatement toutes les sessions du compte, partout
(y compris l'appareil sur lequel on clique). Techniquement : `POST
/api/auth/panic` pose `users.sessions_invalidated_at = NOW()` ; `requireAuth`
compare ensuite le `iat` (date d'émission) de chaque JWT présenté à cette
valeur — tout jeton émis avant est rejeté (401, `code: SESSION_INVALIDATED`),
même s'il n'a pas encore expiré normalement (`JWT_EXPIRES_IN`, 7 jours
actuellement). ⚠️ Nécessite `migration_007_panic_mode.sql` (une colonne sur
`users`, sans impact sur les comptes existants). Portée volontairement
individuelle (pas de bouton "panique globale, tout le monde") : il n'existe
nulle part ailleurs dans cette appli de notion de super-admin, et un
appareil compromis n'appartient jamais qu'à un seul compte. Limite connue :
si le mode panique est déclenché depuis un autre appareil, un onglet resté
ouvert ne s'en rend compte qu'au prochain appel API (pas de redirection
automatique vers l'écran de connexion — même comportement qu'une expiration
de JWT normale aujourd'hui, ce n'est pas une régression propre à cette
fonctionnalité).

**Liste blanche d'IP** : `IP_ALLOWLIST` dans `.env` — liste d'adresses IP
exactes et/ou de plages IPv4 en notation CIDR séparées par des virgules
(ex. `41.66.12.4,102.176.0.0/16`). **Vide/absente par défaut = aucune
restriction** ; dès qu'elle contient au moins une entrée, toute requête dont
l'adresse IP ne correspond à aucune entrée reçoit un 403 — sauf
`/api/health`, volontairement exemptée pour que les sondes de disponibilité
de l'hébergeur continuent de fonctionner. Si le serveur est derrière un
reverse proxy (cas typique d'une appli Node sur cPanel, proxée par
Apache/LiteSpeed), mets aussi `TRUST_PROXY=true` — sinon l'adresse vue par
l'appli est celle du proxy, pas celle du vrai visiteur, et la liste blanche
ne fonctionnera pas comme prévu.

⚠️ **Risque réel à connaître avant d'activer cette variable** : si ta propre
adresse IP n'est pas dans la liste (ou change ensuite — souvenez-vous du bug
"Remote MySQL" plus haut, dû à une IP publique qui avait changé), tu peux te
retrouver toi-même bloqué hors de l'application. Il n'y a aucun mécanisme de
récupération dans l'app elle-même : la seule façon de s'en sortir est de
modifier ou vider `IP_ALLOWLIST` directement dans `.env` sur le serveur (par
exemple via le gestionnaire de fichiers cPanel), sans redéploiement de code.
Recommandation : teste avec une valeur temporaire d'abord, et garde toujours
un accès au fichier `.env` du serveur qui ne dépend pas de cette liste (accès
SSH/FTP/cPanel direct, pas seulement l'appli elle-même).

## Créer le premier utilisateur

Il n'y a pas d'inscription publique — le premier compte se crée en CLI :

```bash
npm run create-user -- "Ton Nom" ton.email@mfwa.org "un-mot-de-passe-solide"
```

## Lancer en développement

```bash
npm run dev
```

Le serveur écoute sur `http://localhost:4000` (configurable via `PORT`).

## Tester l'API

```bash
# 1. Login -> récupère un token
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ton.email@mfwa.org","password":"un-mot-de-passe-solide"}'

# 2. Créer un dossier (case)
curl -X POST http://localhost:4000/api/cases \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"title":"Ma premiere enquete","sensitivity":"internal"}'

# 3. Lister mes dossiers
curl http://localhost:4000/api/cases -H "Authorization: Bearer <TOKEN>"
```

```bash
# 4. Ajouter un evenement au dossier (remplace <CASE_ID>)
curl -X POST http://localhost:4000/api/cases/<CASE_ID>/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"type":"interview","eventDate":"2026-09-15T14:30:00Z","reason":"Premier contact avec la source"}'

# 5. Lister la timeline du dossier
curl http://localhost:4000/api/cases/<CASE_ID>/events -H "Authorization: Bearer <TOKEN>"
```

```bash
# 6. Creer un contact
curl -X POST http://localhost:4000/api/contacts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"fullName":"Jane Doe","organization":"Ministere de la Sante"}'

# 7. Rattacher un contact au dossier (remplace <CASE_ID> et <CONTACT_ID>)
curl -X POST http://localhost:4000/api/cases/<CASE_ID>/contacts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"contactId":<CONTACT_ID>}'
```

```bash
# 8. Ajouter un contributeur a un dossier (reserve au role "lead" ;
#    l'email doit correspondre a un compte qui s'est deja connecte au moins
#    une fois via Google)
curl -X POST http://localhost:4000/api/cases/<CASE_ID>/contributors \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"email":"collegue@mfwa.org","role":"collaborator"}'

# 9. Lister les contributeurs d'un dossier
curl http://localhost:4000/api/cases/<CASE_ID>/contributors -H "Authorization: Bearer <TOKEN>"

# 10. Changer le role d'un contributeur (remplace <USER_ID>)
curl -X PUT http://localhost:4000/api/cases/<CASE_ID>/contributors/<USER_ID> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"role":"observer"}'

# 11. Retirer un contributeur (refuse si c'est le dernier "lead" du dossier)
curl -X DELETE http://localhost:4000/api/cases/<CASE_ID>/contributors/<USER_ID> \
  -H "Authorization: Bearer <TOKEN>"
```

```bash
# 12. Consulter le journal d'activite d'un dossier (visibilite variable
#     selon le role de l'appelant, voir caseAuditLog.service.ts)
curl http://localhost:4000/api/cases/<CASE_ID>/audit-log -H "Authorization: Bearer <TOKEN>"

# 13. Lister/creer des tags ou themes (vocabulaire partage sur toute la plateforme)
curl http://localhost:4000/api/tags -H "Authorization: Bearer <TOKEN>"
curl -X POST http://localhost:4000/api/tags \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"name":"Sante publique","type":"theme"}'

# 14. Rattacher un tag/theme a un dossier (remplace <TAG_ID>)
curl -X POST http://localhost:4000/api/cases/<CASE_ID>/tags \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"tagId":<TAG_ID>}'
```

```bash
# 15. Uploader un document sur un dossier (multipart/form-data)
curl -X POST http://localhost:4000/api/cases/<CASE_ID>/documents \
  -H "Authorization: Bearer <TOKEN>" \
  -F "file=@/chemin/vers/mon-fichier.pdf" \
  -F "fileType=report"

# 16. Lister les documents d'un dossier
curl http://localhost:4000/api/cases/<CASE_ID>/documents -H "Authorization: Bearer <TOKEN>"

# 17. Telecharger un document (remplace <DOCUMENT_ID>)
curl -OJ http://localhost:4000/api/cases/<CASE_ID>/documents/<DOCUMENT_ID>/download \
  -H "Authorization: Bearer <TOKEN>"
```

```bash
# 18. Poster un commentaire sur un dossier (partage par defaut)
curl -X POST http://localhost:4000/api/cases/<CASE_ID>/comments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"body":"A verifier avec la source avant publication","visibility":"shared"}'

# 19. Repondre a un commentaire (remplace <COMMENT_ID>)
curl -X POST http://localhost:4000/api/cases/<CASE_ID>/comments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"body":"Fait, source confirmee","parentCommentId":<COMMENT_ID>}'

# 20. Lister les commentaires d'un dossier (les commentaires "private" des
#     autres utilisateurs sont automatiquement exclus de la reponse)
curl http://localhost:4000/api/cases/<CASE_ID>/comments -H "Authorization: Bearer <TOKEN>"

# 21. Lister mes notifications (les plus recentes d'abord ; ?unreadOnly=true
#     pour ne recuperer que les non-lues)
curl http://localhost:4000/api/notifications -H "Authorization: Bearer <TOKEN>"

# 22. Compter mes notifications non lues (pour la pastille de la cloche)
curl http://localhost:4000/api/notifications/unread-count -H "Authorization: Bearer <TOKEN>"

# 23. Marquer une notification comme lue (remplace <NOTIFICATION_ID>)
curl -X PUT http://localhost:4000/api/notifications/<NOTIFICATION_ID>/read \
  -H "Authorization: Bearer <TOKEN>"

# 24. Marquer toutes mes notifications comme lues
curl -X PUT http://localhost:4000/api/notifications/read-all -H "Authorization: Bearer <TOKEN>"
```

```bash
# 25. Recherche cross-case (uniquement dans les dossiers ou je contribue).
#     Filtres optionnels : sensitivity, eventType, contributor, dateFrom,
#     dateTo (YYYY-MM-DD), types (liste separee par des virgules parmi
#     case,event,comment,document)
curl -G http://localhost:4000/api/search \
  -H "Authorization: Bearer <TOKEN>" \
  --data-urlencode "q=corruption" \
  --data-urlencode "sensitivity=confidential"

# 26. Exporter les memes resultats en CSV
curl -G http://localhost:4000/api/search/export \
  -H "Authorization: Bearer <TOKEN>" \
  --data-urlencode "q=corruption" \
  -o search-results.csv
```

```bash
# 27. Graphe de relations, toutes les cases ou je contribue (nœuds et
#     aretes auto-derivees, voir "Graphe de relations" plus bas)
curl http://localhost:4000/api/graph -H "Authorization: Bearer <TOKEN>"

# 28. Meme graphe, limite a une seule case (remplace <CASE_ID>)
curl "http://localhost:4000/api/graph?caseId=<CASE_ID>" \
  -H "Authorization: Bearer <TOKEN>"

# 29. Rapport d'enquete Markdown pour un dossier (remplace <CASE_ID>) ;
#     ajouter ?redacted=true pour la version anonymisee (fact-check editeur)
curl "http://localhost:4000/api/cases/<CASE_ID>/report" \
  -H "Authorization: Bearer <TOKEN>" -o case-report.md
curl "http://localhost:4000/api/cases/<CASE_ID>/report?redacted=true" \
  -H "Authorization: Bearer <TOKEN>" -o case-report-redacted.md

# 30. Evenements geolocalises, toutes les cases ou je contribue
curl http://localhost:4000/api/geo -H "Authorization: Bearer <TOKEN>"

# 31. Meme liste, limitee a une seule case (remplace <CASE_ID>)
curl "http://localhost:4000/api/geo?caseId=<CASE_ID>" \
  -H "Authorization: Bearer <TOKEN>"
```

## Structure

```
src/
  config/      env + pool de connexion MySQL
  middleware/  auth (JWT + rôles par case), audit log, gestion d'erreurs
  modules/
    auth/      login
    cases/     CRUD des dossiers d'enquête (cases)
    events/    CRUD des événements d'enquête (investigation_events)
    contacts/      CRUD du répertoire de contacts
    notifications/ notifications in-app (fanout depuis les autres modules, lecture/marquage lu)
    search/         recherche cross-case (LIKE sur cases/events/comments/documents, export CSV)
    graph/          graphe de relations (nœuds/aretes auto-derives, cross-case ou limite a un dossier)
    report/         rapport d'enquete Markdown auto-genere par dossier (version complete ou redigee/anonymisee)
    geo/            evenements geolocalises (cross-case ou limite a un dossier), pour la carte du frontend
  realtime/    Socket.io — presence temps reel par dossier (pas de route HTTP)
  scripts/     utilitaires CLI (création du premier utilisateur)
  app.ts       config Express (middlewares, montage des routes)
  server.ts    point d'entrée (connexion DB + http.Server + Socket.io + listen)
```

## Statut (roadmap Phase 1)

- [x] CRUD `cases` (create/list/get/update/delete-soft) avec rôles par dossier
- [x] Audit log de base (create/read/update/delete sur les cases)
- [x] Auth Google OAuth (JWT emis apres connexion Google, restreint au domaine mfwa.org)
- [x] CRUD `investigation_events` (timeline par dossier, liens vers des contacts)
- [x] Repertoire de contacts natif (CRUD + rattachement a des dossiers)
- [x] Gestion des contributeurs par dossier (ajout/role/retrait, module `caseContributors`) — permet enfin de tester l'application des roles (lead/collaborator/observer/read_only)
- [x] Journal d'activite consultable par dossier (`caseAuditLog`), avec visibilite differenciee par role (lead voit tout, collaborator voit tout sauf les simples consultations, observer/read_only ne voient que leurs propres actions, et un dossier "tres sensible" reste reserve au lead)
- [x] Tags / themes (`tags` + `caseTags`) — vocabulaire partage, rattachable a un dossier
- [x] Documents / pieces jointes (`caseDocuments`) — upload/liste/telechargement/suppression (soft-delete), stockage sur disque local (voir "Stockage des documents" ci-dessous). Chiffrement au repos et OCR volontairement laisses de cote pour cette premiere version (a traiter avec le reste de la securite, brief §5)
- [x] Commentaires (`caseComments`, Phase 2 du roadmap, brief §4.5) — fils de discussion sur un dossier avec reponses (un seul niveau de profondeur), visibilite privee (auteur seul) ou partagee, mentions de contacts/evenements. Reutilise la table `comments` deja presente dans le schema initial. Poster est reserve a `observer`+ (read_only ne peut que lire les commentaires partages) ; supprimer est reserve a l'auteur ou au lead
- [x] Notifications in-app (`notifications`, Phase 2 du roadmap, brief §2.3) — declenchees sur commentaire partage, ajout/changement de role contributeur, sensibilite de dossier augmentee. Pas d'email/digest, pas d'echeances (a faire plus tard, necessite une tache planifiee)
- [x] Presence temps reel (`realtime/presence`, Phase 2 du roadmap, brief §4.7) — Socket.io, qui consulte un dossier en ce moment. Scope reduit par rapport au brief : pas de curseurs live, pas d'historique de modifications avec diff visible (decision prise avec Yv)
- [x] Recherche cross-case (`search`, Phase 3 du roadmap, brief §4.1) — recherche texte (LIKE) sur cases/investigation_events/comments/case_documents, limitee aux dossiers ou l'appelant est contributeur ; filtres sensibilite/type d'evenement/contributeur/plage de dates ; export CSV des resultats
- [x] Graphe de relations (`graph`, Phase 3 du roadmap, brief §1.5) — nœuds (dossiers/evenements/contacts/tags-themes/lieux) et aretes entierement auto-derives des donnees existantes, cross-case (ou limite a un dossier via `?caseId=`) ; detection de clusters et filtre par type d'arete geres cote frontend
- [x] Rapport d'enquete auto-genere (`report`, Phase 3 du roadmap, brief §4.2) — Markdown par dossier (resume, decouvertes cles, timeline, contacts cles, tags), Markdown seul pour cette version (pas de PDF, decision prise avec Yv), version `?redacted=true` anonymisant les sources protegees et masquant le contenu "tres sensible" pour la relecture editoriale, rapport complet reserve au lead sur un dossier "tres sensible"
- [x] Geolocalisation (`geo`, Phase 4 du roadmap) — evenements avec coordonnees (colonnes deja presentes depuis la Phase 1), cross-case ou limite a un dossier via `?caseId=`, meme modele d'acces que le graphe/la recherche ; carte cote frontend (Leaflet)
- [x] Dashboard front minimal (Vite + React) — voir ../frontend/README.md
- [x] UI : contacts (liste/creation/edition), liaison contacts<->case et contacts<->evenement, edition/suppression de cases et d'evenements, gestion des contributeurs, journal d'activite, tags/themes (badges aussi sur la liste des dossiers), documents (upload/telechargement/suppression), commentaires (fils, prive/partage, mentions), cloche de notifications, bandeau de presence sur la fiche dossier, page de recherche cross-case, page de graphe de relations (D3, pan/zoom, filtre par type d'arete), telechargement du rapport d'enquete (complet/redige) depuis la fiche dossier, page de carte (Leaflet, filtre par type d'evenement)

## Notes de sécurité

L'authentification se fait via Google OAuth (brief §5.2), restreinte au
domaine `GOOGLE_ALLOWED_DOMAIN`. La protection CSRF du flux OAuth repose sur
un paramètre `state` auto-vérifiable (signé avec `JWT_SECRET`, valide 10
minutes) plutôt que sur une session serveur — suffisant pour l'usage actuel,
à revisiter si l'app devient multi-instance derrière un load balancer sans
secret partagé. Le 2FA pour les dossiers "très sensible" (toujours §5.2)
reste à faire avant toute mise en production avec des données réellement
sensibles.

L'endpoint `POST /api/auth/login` (email + mot de passe) reste disponible côté
API pour des comptes locaux de secours, mais n'est plus exposé dans
l'interface.
