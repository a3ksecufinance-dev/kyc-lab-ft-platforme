/**
 * Scénarios pré-construits pour la simulation CBS → LabFT
 * Organisés par module métier
 */

// Image 1x1 pixel JPEG minimaliste pour les tests OCR
const TINY_IMG = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AB//Z";

export const SCENARIOS = {

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE KYC — Entrée en relation
  // ═══════════════════════════════════════════════════════════════════════
  kyc: [
    {
      id:           "kyc-clean",
      label:        "Client clean (Happy Path)",
      description:  "Mohammed BENALI, casablancais, profil propre — devrait être APPROVED après OCR + Confirm",
      icon:         "✅",
      expected:     { decision: "APPROVED", reasonCode: "APPROVED_CLEAR" },
      flow:         "ocr_then_confirm",
      ocr_payload: {
        cin_recto:  TINY_IMG,
        cin_verso:  TINY_IMG,
        mimeType:   "image/jpeg",
        channel:    "CBS_API",
        cbs_id:     "BASIKON-CLEAN-001",
        cbs_code:   "entree",
        cbs_fields: {
          nom:            "BENALI",
          prenom:         "Mohammed",
          cin:            "AB123456",
          dateNaissance:  "1985-03-15",
          dateExpiration: "2030-03-15",
          lieuNaissance:  "Casablanca",
        },
      },
      confirm_payload: {
        fields: {
          nom:            "BENALI",
          prenom:         "Mohammed",
          cin:            "AB123456",
          dateNaissance:  "1985-03-15",
          dateExpiration: "2030-03-15",
          lieuNaissance:  "Casablanca",
          adresse:        "12 Rue Hassan II",
          quartier:       "Maarif",
          ville:          "Casablanca",
          sexe:           "M",
        },
        modified: false,
        code:     "entree",
      },
    },
    {
      id:           "kyc-sanctioned",
      label:        "Client sanctionné (OFAC MATCH)",
      description:  "Usama BIN LADEN → screening match OFAC, devrait être REJECTED en confirm",
      icon:         "❌",
      expected:     { decision: "REJECTED", reasonCode: "REJECTED_SANCTIONS_MATCH" },
      flow:         "ocr_then_confirm",
      ocr_payload: {
        cin_recto: TINY_IMG, cin_verso: TINY_IMG, mimeType: "image/jpeg",
        channel: "CBS_API", cbs_id: "BASIKON-SANC-001", cbs_code: "entree",
        cbs_fields: { nom: "BIN LADEN", prenom: "Usama", cin: "ST999001" },
      },
      confirm_payload: {
        fields: {
          nom: "BIN LADEN", prenom: "Usama",
          cin: "ST999001", dateNaissance: "1957-03-10",
          dateExpiration: "2030-01-01",
          lieuNaissance: "Riyadh",
        },
        modified: false,
      },
    },
    {
      id:           "kyc-pep",
      label:        "Client PEP détecté",
      description:  "Pervez MUSHARRAF (ex-président) → PEP détecté, EDD obligatoire",
      icon:         "⚠️",
      expected:     { decision: "IN_REVIEW", note: "kycStatus IN_REVIEW + alerte PEP" },
      flow:         "ocr_then_confirm",
      ocr_payload: {
        cin_recto: TINY_IMG, cin_verso: TINY_IMG, mimeType: "image/jpeg",
        channel: "CBS_API", cbs_id: "BASIKON-PEP-001", cbs_code: "entree",
        cbs_fields: { nom: "MUSHARRAF", prenom: "Pervez", cin: "PK000001" },
      },
      confirm_payload: {
        fields: {
          nom: "MUSHARRAF", prenom: "Pervez", cin: "PK000001",
          dateNaissance: "1943-08-11", dateExpiration: "2030-01-01",
        },
        modified: false,
      },
    },
    {
      id:           "kyc-doc-expired",
      label:        "Document déjà expiré",
      description:  "CIN expirée depuis 2 ans → devrait être marquée IN_REVIEW",
      icon:         "📅",
      expected:     { decision: "IN_REVIEW", reasonCode: "REVIEW_DOCUMENT_EXPIRED" },
      flow:         "ocr_then_confirm",
      ocr_payload: {
        cin_recto: TINY_IMG, cin_verso: TINY_IMG, mimeType: "image/jpeg",
        channel: "CBS_API", cbs_id: "BASIKON-EXP-001", cbs_code: "entree",
        cbs_fields: { nom: "ALAOUI", prenom: "Fatima", cin: "EX-OLD-001" },
      },
      confirm_payload: {
        fields: {
          nom: "ALAOUI", prenom: "Fatima", cin: "EX-OLD-001",
          dateNaissance: "1990-01-15",
          dateExpiration: "2023-06-30",  // Expiré depuis 3 ans
          lieuNaissance: "Rabat", ville: "Rabat", sexe: "F",
        },
        modified: false,
      },
    },
    {
      id:           "kyc-modified",
      label:        "Champs modifiés par l'agent",
      description:  "Agent corrige le nom et l'adresse → modificationReport généré",
      icon:         "✏️",
      expected:     { decision: "APPROVED", note: "modificationReport avec 2 entrées" },
      flow:         "ocr_then_confirm",
      ocr_payload: {
        cin_recto: TINY_IMG, cin_verso: TINY_IMG, mimeType: "image/jpeg",
        channel: "CBS_API", cbs_id: "BASIKON-MOD-001", cbs_code: "entree",
        cbs_fields: { nom: "ELALAMI", prenom: "Karim", cin: "MD-FIX-001" },
      },
      confirm_payload: {
        fields: {
          nom:           "EL ALAMI",        // Corrigé : était "ELALAMI"
          prenom:        "Karim",
          cin:           "MD-FIX-001",
          dateNaissance: "1988-11-22",
          dateExpiration:"2031-11-22",
          adresse:       "45 Boulevard Anfa", // Ajouté manuellement
          ville:         "Casablanca",
          sexe:          "M",
        },
        modified: true,
        modifiedFields: ["nom", "adresse"],
      },
    },
    {
      id:           "kyc-legacy",
      label:        "[LEGACY] Endpoint /onboarding",
      description:  "Test rétrocompatibilité — devrait fonctionner avec header X-Deprecated",
      icon:         "🟡",
      expected:     { decision: "APPROVED", note: "Header X-Deprecated: true présent" },
      flow:         "legacy_onboarding",
      legacy_payload: {
        ID:            "BASIKON-LEG-001",
        code:          "entree",
        nom:           "TAZI",
        prenom:        "Salma",
        date_naissance: "12/05/1995",
        CIN:           "LG-001",
        nationalite:   "MA",
      },
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE TRANSACTIONS
  // ═══════════════════════════════════════════════════════════════════════
  transactions: [
    {
      id:           "tx-normal",
      label:        "Transaction normale",
      description:  "Versement de 5 000 MAD — devrait être COMPLETED sans alerte",
      icon:         "💰",
      expected:     { status: "COMPLETED", alertGenerated: false },
      flow:         "transaction",
      payload: {
        customerId:      1,  // À adapter selon clients en DB
        transactionId:   "BASIKON-TX-NORMAL-001",
        amount:          "5000.00",
        currency:        "MAD",
        transactionType: "DEPOSIT",
        channel:         "AGENCY",
        counterparty:    "Self",
        description:     "Versement espèces guichet",
      },
    },
    {
      id:           "tx-large",
      label:        "Transaction au-dessus du seuil",
      description:  "Versement de 80 000 MAD → seuil dépassé, alerte THRESHOLD attendue",
      icon:         "🚨",
      expected:     { status: "FLAGGED", alertType: "THRESHOLD" },
      flow:         "transaction",
      payload: {
        customerId:      1,
        transactionId:   "BASIKON-TX-LARGE-001",
        amount:          "80000.00",
        currency:        "MAD",
        transactionType: "DEPOSIT",
        channel:         "AGENCY",
        description:     "Versement espèces — montant élevé",
      },
    },
    {
      id:           "tx-structuring",
      label:        "Pattern structuring (10 dépôts)",
      description:  "10 dépôts de 9 500 MAD chacun (juste sous le seuil 10k) — pattern AML",
      icon:         "🎯",
      expected:     { alertType: "PATTERN", scenario: "STRUCTURING" },
      flow:         "transaction_batch",
      payloads: Array.from({ length: 10 }, (_, i) => ({
        customerId:      1,
        transactionId:   `BASIKON-TX-STRUCT-${String(i+1).padStart(3,'0')}`,
        amount:          "9500.00",
        currency:        "MAD",
        transactionType: "DEPOSIT",
        channel:         "AGENCY",
        description:     `Dépôt structuring ${i+1}/10`,
      })),
    },
    {
      id:           "tx-velocity",
      label:        "Velocity (50 tx en 1h)",
      description:  "Burst de 50 micro-transactions — pattern velocity",
      icon:         "⚡",
      expected:     { alertType: "VELOCITY" },
      flow:         "transaction_batch",
      payloads: Array.from({ length: 50 }, (_, i) => ({
        customerId:      1,
        transactionId:   `BASIKON-TX-VEL-${String(i+1).padStart(3,'0')}`,
        amount:          "150.00",
        currency:        "MAD",
        transactionType: "TRANSFER",
        channel:         "MOBILE",
        description:     `Micro-transfer ${i+1}/50`,
      })),
    },
    {
      id:           "tx-risky-country",
      label:        "Pays à risque (Iran)",
      description:  "Virement international vers Iran — pays sur liste FATF",
      icon:         "🌍",
      expected:     { alertType: "PATTERN", scenario: "HIGH_RISK_COUNTRY" },
      flow:         "transaction",
      payload: {
        customerId:           1,
        transactionId:        "BASIKON-TX-IRAN-001",
        amount:               "15000.00",
        currency:             "USD",
        transactionType:      "WIRE_TRANSFER",
        channel:              "AGENCY",
        counterparty:         "Tehran International Bank",
        counterpartyCountry:  "IR",
        description:          "Wire transfer to Iran",
      },
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE WALLET / Comptes
  // ═══════════════════════════════════════════════════════════════════════
  wallets: [
    {
      id:           "wallet-create",
      label:        "Création wallet mobile",
      description:  "Ouverture wallet Orange Money pour client KYC validé",
      icon:         "📱",
      expected:     { status: "ACTIVE" },
      flow:         "wallet_create",
      payload: {
        customerId:   1,
        walletType:   "MOBILE_MONEY",
        provider:     "ORANGE_MONEY",
        phoneNumber:  "+212600000001",
        currency:     "MAD",
        dailyLimit:   "5000.00",
      },
    },
    {
      id:           "wallet-p2p",
      label:        "Transfert P2P wallet",
      description:  "Transfert entre 2 wallets mobiles — monitoring AML",
      icon:         "↔️",
      expected:     { status: "COMPLETED" },
      flow:         "wallet_transfer",
      payload: {
        fromWalletId:  1,
        toWalletId:    2,
        amount:        "500.00",
        currency:      "MAD",
        description:   "P2P transfer",
      },
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // MODULE DOCUMENTS — Cycle de vie
  // ═══════════════════════════════════════════════════════════════════════
  documents: [
    {
      id:           "doc-renewal",
      label:        "Renouvellement CIN",
      description:  "Client existant renouvelle sa CIN avant expiration",
      icon:         "🔄",
      expected:     { kycStatus: "APPROVED" },
      flow:         "cbs_document",
      payload: {
        CIN: "AB123456",
        document: {
          type:        "ID_CARD",
          expiryDate:  "2035-12-31",
          number:      "AB123456",
        },
      },
    },
    {
      id:           "doc-reactivation",
      label:        "Réactivation après blocage",
      description:  "Client bloqué (UC-8) revient avec nouveau document",
      icon:         "🔓",
      expected:     { kycStatus: "APPROVED", sarWarning: false },
      flow:         "cbs_reactivation",
      payload: {
        CIN: "AB123456",
        newDocument: {
          type:       "ID_CARD",
          expiryDate: "2035-12-31",
          number:     "AB123456-NEW",
        },
      },
    },
  ],
};
