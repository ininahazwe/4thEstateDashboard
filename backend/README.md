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

## Structure

```
src/
  config/      env + pool de connexion MySQL
  middleware/  auth (JWT + rôles par case), audit log, gestion d'erreurs
  modules/
    auth/      login
    cases/     CRUD des dossiers d'enquête (cases)
    events/    CRUD des événements d'enquête (investigation_events)
  scripts/     utilitaires CLI (création du premier utilisateur)
  app.ts       config Express (middlewares, montage des routes)
  server.ts    point d'entrée (connexion DB + app.listen)
```

## Statut (roadmap Phase 1)

- [x] CRUD `cases` (create/list/get/update/delete-soft) avec rôles par dossier
- [x] Audit log de base (create/read/update/delete sur les cases)
- [x] Auth minimale (email + mot de passe -> JWT)
- [x] CRUD `investigation_events` (timeline par dossier, liens vers des contacts)
- [ ] Import/synchro des contacts depuis Contact Platform
- [ ] Dashboard front (Vite + React)

## Notes de sécurité

L'auth email/mot de passe + JWT est volontairement minimale pour débloquer le
développement local. Le brief (§5.2) prévoit à terme OAuth via Google
Workspace MFWA et le 2FA pour les dossiers "très sensible" — ce sera à
brancher avant toute mise en production réelle avec des données sensibles.
