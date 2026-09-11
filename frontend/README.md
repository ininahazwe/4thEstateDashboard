# 4thestate Dashboard — Frontend

Vite + React 19 + TypeScript. Consomme l'API du dossier `../backend`.

## Installation

```bash
cd frontend
npm install
cp .env.example .env
```

`VITE_API_URL` doit pointer vers l'API backend (par défaut `http://localhost:4000/api`).

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
  événements (investigation_events), avec ajout rapide

## Prochaines étapes (pas encore fait)

- Gestion des contacts (répertoire + rattachement à un dossier) côté UI —
  l'API existe déjà (`/api/contacts`, `/api/cases/:id/contacts`)
- Gestion des contributeurs / rôles par dossier depuis l'UI
- Graphe de relations (D3.js, brief §1.5 — Phase 3 du roadmap)
- Recherche cross-case, rapports auto-générés (Phase 3)
