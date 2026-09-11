# 4thestate Dashboard — Backend

API pour la plateforme d'investigation & suivi éditorial (voir le brief dans
le projet Claude "investigative dashboard"). Express 5 + TypeScript + mysql2,
sur la base MySQL déjà créée dans cPanel/phpMyAdmin.

## Installation

```bash
cd backend
npm install
cp .env.example .env
```

Remplis `.env` avec les identifiants de ta base cPanel (`DB_HOST`, `DB_USER`,
`DB_PASSWORD`, `DB_NAME`) et une valeur longue/aléatoire pour `JWT_SECRET`.

> Si ta base cPanel n'autorise pas les connexions distantes (MySQL Remote
> Access non activé), il faudra soit l'activer dans cPanel > "Remote MySQL"
> pour ton IP, soit démarrer une base MySQL locale pour le développement et
> pointer `.env` dessus.

> **Migration BDD** : si tu avais déjà importé le `schema.sql` initial, importe aussi `migration_002_native_contacts.sql` dans phpMyAdmin (remplace les tables de contacts prévues pour une "Contact Platform" externe par un répertoire de contacts natif à cette plateforme).

> Importe aussi `migration_003_google_auth.sql` (ajoute les colonnes Google `google_id`/`avatar_url`/`auth_provider` à `users` et rend `password_hash` optionnel).

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

## Structure

```
src/
  config/      env + pool de connexion MySQL
  middleware/  auth (JWT + rôles par case), audit log, gestion d'erreurs
  modules/
    auth/      login
    cases/     CRUD des dossiers d'enquête (cases)
    events/    CRUD des événements d'enquête (investigation_events)
    contacts/  CRUD du répertoire de contacts
  scripts/     utilitaires CLI (création du premier utilisateur)
  app.ts       config Express (middlewares, montage des routes)
  server.ts    point d'entrée (connexion DB + app.listen)
```

## Statut (roadmap Phase 1)

- [x] CRUD `cases` (create/list/get/update/delete-soft) avec rôles par dossier
- [x] Audit log de base (create/read/update/delete sur les cases)
- [x] Auth Google OAuth (JWT emis apres connexion Google, restreint au domaine mfwa.org)
- [x] CRUD `investigation_events` (timeline par dossier, liens vers des contacts)
- [x] Repertoire de contacts natif (CRUD + rattachement a des dossiers)
- [x] Dashboard front minimal (Vite + React) — voir ../frontend/README.md

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
