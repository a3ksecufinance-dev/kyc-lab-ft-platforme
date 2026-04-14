/**
 * IVMS 101 Message Builder — FATF Travel Rule (Rec. 16)
 *
 * Norme : IVMS 101 v1.0 (Inter-VASP Messaging Standard)
 *         https://intervasp.org/ivms-101/
 *
 * Seuil d'application :
 *   - Transferts >= 1 000 USD (ou équivalent MAD ≈ 10 000)
 *   - Entre PSP / VASP (Paiement Service Provider / Virtual Asset SP)
 *   - Les informations suivantes sont obligatoires :
 *       Donneur  : nom légal, numéro de compte, adresse géographique
 *       Bénéficiaire : nom légal, numéro de compte
 *
 * Format de sortie : JSON conforme IVMS 101 v1.0
 * Transport        : API REST propriétaire du PSP bénéficiaire
 *                    (OpenVASP, TRP Protocol, Notabene, ou endpoint direct)
 */

// ─── Types IVMS 101 ───────────────────────────────────────────────────────────

export interface Ivms101NaturalPerson {
  name: {
    nameIdentifier: Array<{
      primaryIdentifier:   string;    // Nom de famille
      secondaryIdentifier: string;    // Prénom(s)
      nameIdentifierType:  "LEGL" | "MAID" | "NICK" | "TRAD" | "MISC";
    }>;
  };
  geographicAddress?: Array<{
    addressType:     "HOME" | "BIZZ" | "GEOG";
    streetName?:     string;
    buildingNumber?: string;
    townName:        string;
    postCode?:       string;
    country:         string;          // ISO 3166-1 alpha-2
  }>;
  nationalIdentification?: {
    nationalIdentifier:     string;
    nationalIdentifierType: "ARNU" | "CCPT" | "RAID" | "DRLC" | "FIIN" | "TXID" | "SOCS" | "IDCD" | "LEIX" | "MISC";
    countryOfIssue?:        string;
    registrationAuthority?: string;
  };
  dateAndPlaceOfBirth?: {
    dateOfBirth:  string;    // ISO 8601
    placeOfBirth: string;
  };
}

export interface Ivms101LegalPerson {
  name: {
    legalPersonNameIdentifier: Array<{
      legalPersonName:     string;
      legalPersonNameIdentifierType: "LEGL" | "SHRT" | "TRAD";
    }>;
  };
  geographicAddress?: Array<{
    addressType: "HOME" | "BIZZ" | "GEOG";
    streetName?: string;
    townName:    string;
    country:     string;
  }>;
  nationalIdentification?: {
    nationalIdentifier:     string;
    nationalIdentifierType: "RAID" | "LEIX" | "TXID" | "MISC";
    countryOfIssue?:        string;
    registrationAuthority?: string;
  };
  leiCode?: string;      // Legal Entity Identifier (20 chars)
}

export interface Ivms101Vasp {
  originatingVASP?: { originatingVASP: { legalPerson: Ivms101LegalPerson } };
  beneficiaryVASP?: { beneficiaryVASP: { legalPerson: Ivms101LegalPerson } };
}

export interface Ivms101Originator {
  originatorPersons: Array<{ naturalPerson?: Ivms101NaturalPerson; legalPerson?: Ivms101LegalPerson }>;
  accountNumber:     string[];     // IBAN / numéro de wallet
}

export interface Ivms101Beneficiary {
  beneficiaryPersons: Array<{ naturalPerson?: Ivms101NaturalPerson; legalPerson?: Ivms101LegalPerson }>;
  accountNumber:      string[];
}

export interface Ivms101Message {
  ivms101Version: "1.0";
  messageId:      string;
  createdAt:      string;           // ISO 8601
  originator:         Ivms101Originator;
  beneficiary:        Ivms101Beneficiary;
  originatingVasp:    Ivms101LegalPerson;
  beneficiaryVasp:    Ivms101LegalPerson;
  transferAmount:     number;
  transferCurrency:   string;       // ISO 4217
  transactionRef:     string;       // ID transaction source
}

// ─── Seuils Travel Rule ───────────────────────────────────────────────────────

const TRAVEL_RULE_THRESHOLD_USD = 1_000;
const MAD_TO_USD_RATE           = 0.1;   // 1 MAD ≈ 0.10 USD (approximation)

export function isTravelRuleRequired(amountMad: number, currency = "MAD"): boolean {
  const usdEquivalent = currency === "MAD"
    ? amountMad * MAD_TO_USD_RATE
    : amountMad;   // supposé USD si pas MAD
  return usdEquivalent >= TRAVEL_RULE_THRESHOLD_USD;
}

// ─── Builders IVMS 101 ────────────────────────────────────────────────────────

export function buildNaturalPerson(params: {
  firstName:       string;
  lastName:        string;
  nationality?:    string;
  dateOfBirth?:    string;
  placeOfBirth?:   string;
  address?:        string;
  city?:           string;
  country?:        string;
  nationalId?:     string;
  nationalIdType?: "CCPT" | "IDCD" | "DRLC" | "MISC";
}): Ivms101NaturalPerson {
  const person: Ivms101NaturalPerson = {
    name: {
      nameIdentifier: [{
        primaryIdentifier:   params.lastName.toUpperCase(),
        secondaryIdentifier: params.firstName,
        nameIdentifierType:  "LEGL",
      }],
    },
  };

  if (params.city || params.country) {
    person.geographicAddress = [{
      addressType:  "HOME",
      ...(params.address ? { streetName: params.address } : {}),
      townName:     params.city ?? "N/A",
      country:      params.country ?? "MA",
    }];
  }

  if (params.nationalId) {
    person.nationalIdentification = {
      nationalIdentifier:     params.nationalId,
      nationalIdentifierType: params.nationalIdType ?? "IDCD",
      ...(params.nationality ? { countryOfIssue: params.nationality } : {}),
    };
  }

  if (params.dateOfBirth) {
    person.dateAndPlaceOfBirth = {
      dateOfBirth:  params.dateOfBirth.slice(0, 10),
      placeOfBirth: params.placeOfBirth ?? params.city ?? "N/A",
    };
  }

  return person;
}

export function buildLegalPerson(params: {
  name:        string;
  country?:    string;
  city?:       string;
  leiCode?:    string;
  identifier?: string;
}): Ivms101LegalPerson {
  return {
    name: {
      legalPersonNameIdentifier: [{
        legalPersonName:               params.name,
        legalPersonNameIdentifierType: "LEGL",
      }],
    },
    ...(params.city || params.country ? {
      geographicAddress: [{
        addressType: "BIZZ" as const,
        townName:    params.city ?? "N/A",
        country:     params.country ?? "MA",
      }],
    } : {}),
    ...(params.leiCode   ? { leiCode: params.leiCode } : {}),
    ...(params.identifier ? {
      nationalIdentification: {
        nationalIdentifier:     params.identifier,
        nationalIdentifierType: "RAID" as const,
        ...(params.country ? { countryOfIssue: params.country } : {}),
      },
    } : {}),
  };
}

// ─── Constructeur principal du message IVMS 101 ───────────────────────────────

let messageSeq = 0;

function nextMessageId(entityCode = "EST"): string {
  const ts = Date.now().toString(36).toUpperCase();
  return `IVMS-${entityCode}-${ts}-${String(++messageSeq).padStart(4, "0")}`;
}

export function buildIvms101Message(params: {
  originator:      { person: Ivms101NaturalPerson | Ivms101LegalPerson; accountNumber: string; isNatural: boolean };
  beneficiary:     { person: Ivms101NaturalPerson | Ivms101LegalPerson; accountNumber: string; isNatural: boolean };
  originatingVasp: Ivms101LegalPerson;
  beneficiaryVasp: Ivms101LegalPerson;
  amount:          number;
  currency:        string;
  transactionRef:  string;
}): Ivms101Message {
  const origPerson = params.originator.isNatural
    ? { naturalPerson: params.originator.person as Ivms101NaturalPerson }
    : { legalPerson:   params.originator.person as Ivms101LegalPerson };

  const beneePerson = params.beneficiary.isNatural
    ? { naturalPerson: params.beneficiary.person as Ivms101NaturalPerson }
    : { legalPerson:   params.beneficiary.person as Ivms101LegalPerson };

  return {
    ivms101Version:   "1.0",
    messageId:        nextMessageId(),
    createdAt:        new Date().toISOString(),
    originator: {
      originatorPersons: [origPerson],
      accountNumber:     [params.originator.accountNumber],
    },
    beneficiary: {
      beneficiaryPersons: [beneePerson],
      accountNumber:      [params.beneficiary.accountNumber],
    },
    originatingVasp: params.originatingVasp,
    beneficiaryVasp: params.beneficiaryVasp,
    transferAmount:   params.amount,
    transferCurrency: params.currency,
    transactionRef:   params.transactionRef,
  };
}

// ─── Validation basique du message IVMS 101 ───────────────────────────────────

export interface Ivms101ValidationResult {
  valid:    boolean;
  errors:   string[];
  warnings: string[];
}

export function validateIvms101(msg: Ivms101Message): Ivms101ValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  // Originator obligatoire
  if (!msg.originator.originatorPersons.length) {
    errors.push("originator.originatorPersons : au moins 1 personne requise");
  }
  const origPerson = msg.originator.originatorPersons[0];
  const origNatural = origPerson?.naturalPerson;
  if (origNatural) {
    if (!origNatural.name.nameIdentifier[0]?.primaryIdentifier) {
      errors.push("originator: nom de famille (primaryIdentifier) manquant");
    }
    if (!origNatural.geographicAddress?.length) {
      warnings.push("originator: adresse géographique recommandée (obligatoire si institution financière)");
    }
    if (!origNatural.nationalIdentification) {
      warnings.push("originator: nationalIdentification recommandé");
    }
  }

  // Bénéficiaire obligatoire (nom minimum)
  if (!msg.beneficiary.beneficiaryPersons.length) {
    errors.push("beneficiary.beneficiaryPersons : au moins 1 personne requise");
  }
  const beneePerson = msg.beneficiary.beneficiaryPersons[0];
  const beneeNatural = beneePerson?.naturalPerson;
  if (beneeNatural && !beneeNatural.name.nameIdentifier[0]?.primaryIdentifier) {
    errors.push("beneficiary: nom de famille manquant");
  }

  // Numéros de compte
  if (!msg.originator.accountNumber.length)  errors.push("originator.accountNumber requis");
  if (!msg.beneficiary.accountNumber.length) errors.push("beneficiary.accountNumber requis");

  // VASPs
  if (!msg.originatingVasp.name?.legalPersonNameIdentifier[0]?.legalPersonName) {
    errors.push("originatingVasp: nom légal manquant");
  }
  if (!msg.beneficiaryVasp.name?.legalPersonNameIdentifier[0]?.legalPersonName) {
    errors.push("beneficiaryVasp: nom légal manquant");
  }

  // Montant
  if (msg.transferAmount <= 0) errors.push("transferAmount doit être > 0");

  return { valid: errors.length === 0, errors, warnings };
}
