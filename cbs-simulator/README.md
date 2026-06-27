# CBS Simulator — LabFT

Simulateur autonome de l'intégration Basikon ↔ LabFT pour démos et tests.

## Démarrage

```bash
node cbs-simulator/server.js
# puis ouvrir http://localhost:3100
```

Aucune dépendance npm — Node natif uniquement.

## Architecture

```
cbs-simulator/
├── server.js          Mini serveur (statique + webhook receiver)
├── index.html         Interface React (CDN) + Tailwind
├── scenarios.js       Catalogue de scénarios par module
├── webhooks-log/      Archives JSON des webhooks reçus
└── README.md
```

## Modules disponibles

| Module | Scénarios | Cas couvert |
|--------|-----------|-------------|
| **KYC** | 6 | Clean / Sanctionné / PEP / Doc expiré / Modifs agent / Legacy |
| **Transactions** | 5 | Normale / Seuil / Structuring / Velocity / Pays risque |
| **Wallets** | 2 | Création / Transfert P2P |
| **Documents** | 2 | Renouvellement / Réactivation |
| **Webhooks** | live | Reçus depuis LabFT (KYC_APPROVED, KYC_REJECTED…) |
| **Historique** | — | Tous les tests exécutés avec stats de succès |

## Configuration LabFT (pour webhook bidirectionnel)

Ajouter dans `.env` de LabFT :

```env
CBS_WEBHOOK_URL=http://localhost:3100/webhook/cbs
CBS_NOTIFY_ENABLED=true
```

Redémarrer LabFT. Chaque changement de statut KYC enverra une notification
en temps réel au simulateur, visible dans l'onglet "Webhooks reçus".

## Utilisation pour démo client

1. Lancer LabFT : `npm run dev`
2. Lancer le simulateur : `node cbs-simulator/server.js`
3. Ouvrir 2 onglets :
   - LabFT : http://localhost:3000 (interface compliance)
   - Simulateur : http://localhost:3100 (interface CBS)
4. Pour chaque scénario, cliquer "▶ Exécuter" et voir :
   - L'appel partir vers LabFT (volet droit simulateur)
   - L'effet dans LabFT (alertes, clients créés)
   - Le webhook retour (onglet Webhooks)

## Évaluation automatique

Chaque scénario définit un `expected` :

```js
expected: { decision: "REJECTED", reasonCode: "REJECTED_SANCTIONS_MATCH" }
```

Le runner compare la réponse réelle au résultat attendu :
- ✓ **Conforme attendu** (vert) — comportement correct
- ✗ **Écart vs attendu** (rouge) — régression détectée

## Endpoints API testés

| Endpoint LabFT | Scénarios utilisateurs |
|----------------|------------------------|
| POST /api/cbs/ocr | KYC étape 1 |
| POST /api/cbs/confirm | KYC étape 2 |
| POST /api/cbs/document | Renouvellement doc |
| POST /api/cbs/reactivation | Réactivation client bloqué |
| POST /api/cbs/onboarding | KYC legacy (rétrocompat) |
| POST /trpc/transactions.create | Module transactions |
| POST /trpc/wallets.create | Module wallets |
| POST /trpc/wallets.transfer | Transfert P2P |

## Endpoints du simulateur

| Endpoint | Usage |
|----------|-------|
| GET / | Interface UI |
| POST /webhook/cbs | Reçoit les notifications LabFT |
| GET /api/webhooks/recent | Buffer des 50 derniers webhooks |
| POST /api/webhooks/clear | Vide le buffer |

## Personnalisation des scénarios

Éditer `scenarios.js` :

```js
export const SCENARIOS = {
  kyc: [
    {
      id: "mon-scenario",
      label: "Mon test custom",
      icon: "🎯",
      expected: { decision: "APPROVED" },
      flow: "ocr_then_confirm",
      ocr_payload: { ... },
      confirm_payload: { ... },
    },
    // ...
  ],
};
```

Aucune recompilation nécessaire — un rechargement du navigateur suffit.
