/**
 * Simulateur CBS (Core Banking System)
 *
 * Page publique accessible à /cbs — simule un système bancaire "CoreBank Enterprise"
 * envoyant un dossier d'entrée en relation vers la plateforme KYC-AML.
 *
 * Flux :
 *  1. Auto-connexion avec le compte démo (demo@banque.ma)
 *  2. Wizard 4 étapes : Identification → Produit → Compléments → Transmission
 *  3. Création réelle : customer + wallet (si mobile) + transaction initiale
 *  4. Écran de succès avec lien vers la plateforme conformité
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth }    from "../hooks/useAuth";
import { trpc }       from "../lib/trpc";
import { useLocation } from "wouter";

// ─── Palette CBS (complètement différente du KYC-AML) ────────────────────────

const C = {
  navy:    "#0B1F3A",
  navyMid: "#12325F",
  blue:    "#1B4F8A",
  steel:   "#2C6EAB",
  accent:  "#D4860A",      // or bancaire
  accentL: "#F5A623",
  bg:      "#EEF2F8",
  bgCard:  "#FFFFFF",
  text:    "#0D1B2E",
  sub:     "#4A6080",
  muted:   "#8A9AB5",
  border:  "#C8D4E8",
  green:   "#15803D",
  greenBg: "#DCFCE7",
  red:     "#B91C1C",
  redBg:   "#FEE2E2",
  amber:   "#B45309",
  amberBg: "#FEF3C7",
};

// ─── Composants utilitaires ───────────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {label}{required && <span style={{ color: C.red, marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text", readOnly }: { value: string; onChange?: (v: string) => void; placeholder?: string; type?: string; readOnly?: boolean }) {
  return (
    <input
      type={type}
      value={value}
      readOnly={readOnly}
      onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`,
        borderRadius: 5, fontSize: 14, color: C.text, background: readOnly ? "#F5F7FA" : "#fff",
        outline: "none", boxSizing: "border-box",
        fontFamily: "inherit",
      }}
    />
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`,
        borderRadius: 5, fontSize: 14, color: C.text, background: "#fff",
        outline: "none", boxSizing: "border-box", fontFamily: "inherit",
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>{children}</div>;
}

// ─── Types formulaire ─────────────────────────────────────────────────────────

interface FormData {
  // Étape 1 — Identification
  docType:       string;
  docNumber:     string;
  firstName:     string;
  lastName:      string;
  dateOfBirth:   string;
  nationality:   string;
  phone:         string;
  email:         string;

  // Étape 2 — Produit
  productType:   string;   // "COURANT" | "EPARGNE" | "MOBILE_ORANGE" | "MOBILE_WAVE"
  depositAmount: string;
  depositMotif:  string;

  // Étape 3 — Compléments
  address:       string;
  city:          string;
  profession:    string;
  employer:      string;
  sourceOfFunds: string;
  monthlyIncome: string;
}

interface DocEntry {
  id:      string;   // uuid local
  file:    File;
  docType: string;
  preview: string;   // URL.createObjectURL
}

const INIT: FormData = {
  docType: "CIN", docNumber: "", firstName: "", lastName: "",
  dateOfBirth: "", nationality: "MA", phone: "", email: "",
  productType: "COURANT", depositAmount: "10000", depositMotif: "Apport initial",
  address: "", city: "Casablanca", profession: "", employer: "",
  sourceOfFunds: "Salaire", monthlyIncome: "8000",
};

// ─── Indicateur d'étapes ──────────────────────────────────────────────────────

function StepBar({ current }: { current: number }) {
  const steps = [
    { n: 1, label: "Identification" },
    { n: 2, label: "Produit" },
    { n: 3, label: "Compléments" },
    { n: 4, label: "Documents" },
    { n: 5, label: "Transmission" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "20px 32px", background: C.bgCard, borderBottom: `1px solid ${C.border}` }}>
      {steps.map((s, i) => (
        <div key={s.n} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              background: current > s.n ? C.green : current === s.n ? C.blue : C.border,
              color: current >= s.n ? "#fff" : C.muted, fontSize: 13, fontWeight: 700,
              flexShrink: 0,
            }}>
              {current > s.n ? "✓" : s.n}
            </div>
            <span style={{ fontSize: 13, fontWeight: current === s.n ? 700 : 500, color: current === s.n ? C.text : C.sub, whiteSpace: "nowrap" }}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 2, background: current > s.n ? C.green : C.border, margin: "0 12px" }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Header CBS ───────────────────────────────────────────────────────────────

function CbsHeader({ agentName }: { agentName?: string | undefined }) {
  const now = new Date().toLocaleDateString("fr-MA", { day: "2-digit", month: "long", year: "numeric" });
  return (
    <div style={{ background: C.navy, color: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 24px", borderBottom: `1px solid ${C.navyMid}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>🏦</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "0.02em" }}>COREBANK ENTERPRISE</div>
            <div style={{ fontSize: 10, color: "#8AAFD4", letterSpacing: "0.08em" }}>SYSTÈME DE GESTION BANCAIRE — v4.2</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 12, color: "#8AAFD4" }}>
          <span>📅 {now}</span>
          {agentName && <span>👤 {agentName}</span>}
          <span style={{ background: "#1A4A2E", color: "#4ADE80", padding: "2px 10px", borderRadius: 3, fontSize: 11, fontWeight: 700 }}>● EN LIGNE</span>
        </div>
      </div>
      <div style={{ padding: "8px 24px", background: C.navyMid, fontSize: 12, color: "#A8C4E0", display: "flex", alignItems: "center", gap: 12 }}>
        <span>MODULE : ENTRÉE EN RELATION</span>
        <span style={{ color: "#4A6A8A" }}>›</span>
        <span>OUVERTURE DE COMPTE</span>
        <span style={{ color: "#4A6A8A" }}>›</span>
        <span style={{ color: C.accentL, fontWeight: 600 }}>NOUVEAU DOSSIER</span>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function CbsSimulatorPage() {
  const { isAuthenticated, user, login } = useAuth();
  const [, navigate] = useLocation();

  const [authReady, setAuthReady]     = useState(false);
  const [authError, setAuthError]     = useState("");
  const [step, setStep]               = useState(1);
  const [form, setForm]               = useState<FormData>(INIT);
  const [docs, setDocs]               = useState<DocEntry[]>([]);
  const [addingDocType, setAddingDocType] = useState("IDENTITY");
  const [dragOver, setDragOver]       = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult]           = useState<{ customerId: number; customerRef: string; walletId?: number; txRef?: string; isSuspicious?: boolean; uploadedDocs: number } | null>(null);
  const [attestation, setAttestation] = useState(false);

  // ── tRPC mutations ──────────────────────────────────────────────────────────
  const createCustomer = trpc.customers.create.useMutation();
  const createWallet   = trpc.wallets.create.useMutation();
  const createTx       = trpc.transactions.create.useMutation();

  // ── Auto-login avec le compte démo ─────────────────────────────────────────
  useEffect(() => {
    if (isAuthenticated) { setAuthReady(true); return; }
    login("demo@banque.ma", "Demo2026!")
      .then(() => setAuthReady(true))
      .catch(() => {
        // Essai avec les credentials admin si le compte demo n'existe pas encore
        login("admin@labft.ma", "Admin2026!LabFT")
          .then(() => setAuthReady(true))
          .catch(() => setAuthError("Impossible de se connecter au serveur. Vérifiez que l'application est démarrée."));
      });
  }, []);

  const set = useCallback(<K extends keyof FormData>(k: K, v: FormData[K]) => {
    setForm(prev => ({ ...prev, [k]: v }));
  }, []);

  // ── Helpers documents ───────────────────────────────────────────────────────
  function addFiles(files: FileList | null) {
    if (!files) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    Array.from(files).forEach(file => {
      if (!allowed.includes(file.type)) return;
      if (file.size > 10 * 1024 * 1024) return;
      const entry: DocEntry = {
        id:      crypto.randomUUID(),
        file,
        docType: addingDocType,
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
      };
      setDocs(prev => [...prev, entry]);
    });
  }

  function removeDoc(id: string) {
    setDocs(prev => {
      const removed = prev.find(d => d.id === id);
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter(d => d.id !== id);
    });
  }

  // ── Validation par étape ────────────────────────────────────────────────────
  function canProceed(): boolean {
    if (step === 1) return !!(form.docNumber && form.firstName && form.lastName && form.dateOfBirth && form.phone);
    if (step === 2) return !!(form.depositAmount && parseFloat(form.depositAmount) > 0);
    if (step === 3) return !!(form.address && form.city && form.profession && form.sourceOfFunds);
    if (step === 4) return docs.some(d => d.docType === "IDENTITY");
    return true;
  }

  // ── Soumission finale ───────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!attestation) { setSubmitError("Veuillez cocher la case d'attestation."); return; }
    setSubmitting(true);
    setSubmitError("");

    try {
      const isMobile = form.productType.startsWith("MOBILE_");

      // 1. Créer le client
      const customer = await createCustomer.mutateAsync({
        firstName:       form.firstName,
        lastName:        form.lastName,
        email:           form.email || undefined,
        phone:           form.phone,
        dateOfBirth:     form.dateOfBirth || undefined,
        nationality:     form.nationality,
        residenceCountry: "MA",
        address:         form.address,
        city:            form.city,
        profession:      form.profession,
        employer:        form.employer || undefined,
        sourceOfFunds:   form.sourceOfFunds,
        monthlyIncome:   form.monthlyIncome || undefined,
        customerType:    "INDIVIDUAL",
      });

      // 2. Upload des documents KYC
      let uploadedDocs = 0;
      for (const entry of docs) {
        try {
          const fd = new FormData();
          fd.append("file",         entry.file);
          fd.append("customerId",   String(customer.id));
          fd.append("documentType", entry.docType);
          const resp = await fetch("/api/documents/upload", { method: "POST", body: fd });
          if (resp.ok) uploadedDocs++;
        } catch {
          // Ne pas bloquer si un upload échoue — le service conformité peut redemander
        }
      }

      let walletId: number | undefined;

      // 3. Créer le wallet si produit mobile money
      if (isMobile) {
        const provider = form.productType === "MOBILE_ORANGE" ? "Orange Money" : "Wave";
        const wallet = await createWallet.mutateAsync({
          customerId:  customer.id,
          provider,
          phoneNumber: form.phone,
          msisdn:      form.phone,
          currency:    "MAD",
          kycTier:     "ALLEGED",
        });
        walletId = wallet.id;
      }

      // 4. Créer la transaction de dépôt initial
      const txType: "DEPOSIT" | "MOBILE_MONEY_IN" = isMobile ? "MOBILE_MONEY_IN" : "DEPOSIT";
      const channel: "BRANCH" | "MOBILE" = isMobile ? "MOBILE" : "BRANCH";

      const tx = await createTx.mutateAsync({
        customerId:      customer.id,
        amount:          form.depositAmount,
        currency:        "MAD",
        transactionType: txType,
        channel,
        purpose:         form.depositMotif || "Dépôt initial — ouverture de compte",
      });

      setResult({
        customerId:  customer.id,
        customerRef: (customer as { customerId: string }).customerId ?? `CLI-${customer.id}`,
        ...(walletId !== undefined ? { walletId } : {}),
        txRef:        tx.transactionId,
        isSuspicious: tx.isSuspicious,
        uploadedDocs,
      });
      setStep(6);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur lors de la création du dossier";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDU
  // ─────────────────────────────────────────────────────────────────────────────

  // Chargement / erreur auth
  if (!authReady) {
    return (
      <div style={{ minHeight: "100vh", background: C.navy, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#fff" }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>🏦</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>COREBANK ENTERPRISE 4.2</div>
        {authError
          ? <div style={{ color: "#FCA5A5", textAlign: "center", maxWidth: 400, fontSize: 14 }}>{authError}</div>
          : <div style={{ color: "#8AAFD4", fontSize: 14 }}>Connexion sécurisée au serveur bancaire…</div>
        }
        {!authError && (
          <div style={{ marginTop: 24, display: "flex", gap: 6 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#3B82F6", animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Succès
  if (step === 6 && result) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Inter', system-ui, sans-serif" }}>
        <CbsHeader agentName={user?.name ?? undefined} />
        <div style={{ maxWidth: 700, margin: "48px auto", padding: "0 16px" }}>
          <div style={{ background: C.bgCard, borderRadius: 10, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
            {/* Header succès */}
            <div style={{ background: C.green, padding: "28px 32px", textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 4 }}>DOSSIER TRANSMIS</div>
              <div style={{ fontSize: 14, color: "#BBF7D0" }}>Le dossier d'entrée en relation a été envoyé au service Conformité & LCB-FT</div>
            </div>

            {/* Récapitulatif */}
            <div style={{ padding: "28px 32px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                <InfoCard label="Référence client CBS" value={result.customerRef} highlight />
                <InfoCard label="Transaction d'ouverture" value={result.txRef ?? "—"} />
                <InfoCard label="Documents transmis" value={`${result.uploadedDocs} fichier${result.uploadedDocs > 1 ? "s" : ""} reçu${result.uploadedDocs > 1 ? "s" : ""}`} color={result.uploadedDocs > 0 ? C.green : C.amber} />
                {result.walletId && <InfoCard label="Portefeuille mobile créé" value={`Wallet #${result.walletId}`} />}
                <InfoCard
                  label="Analyse AML immédiate"
                  value={result.isSuspicious ? "⚠️ Alerte générée" : "✓ Aucune alerte"}
                  color={result.isSuspicious ? C.red : C.green}
                />
              </div>

              {result.isSuspicious && (
                <div style={{ background: C.amberBg, border: `1px solid #FCD34D`, borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: C.amber }}>
                  <strong>Information :</strong> Une règle AML a été déclenchée sur ce dossier. Le service conformité trouvera une alerte à traiter dans la plateforme.
                </div>
              )}

              <div style={{ background: C.bg, borderRadius: 8, padding: "16px 20px", marginBottom: 24, fontSize: 13, color: C.sub, lineHeight: 1.6 }}>
                <strong style={{ color: C.text }}>Prochaines étapes — Service Conformité :</strong>
                <ol style={{ margin: "8px 0 0 16px", padding: 0 }}>
                  <li>Vérification des documents KYC soumis</li>
                  <li>Screening sanctions & PEP (ANRF / OFAC / UE)</li>
                  <li>Validation du profil de risque client</li>
                  <li>Approbation du statut KYC → compte activé</li>
                </ol>
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <button
                  onClick={() => navigate(`/customers/${result.customerId}`)}
                  style={{
                    flex: 1, padding: "13px 0", background: C.blue, color: "#fff",
                    border: "none", borderRadius: 7, fontSize: 15, fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  🔍 Ouvrir dans la Plateforme Conformité
                </button>
                <button
                  onClick={() => { setStep(1); setForm(INIT); setDocs([]); setResult(null); setAttestation(false); }}
                  style={{
                    padding: "13px 20px", background: "transparent", color: C.sub,
                    border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 14,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Nouveau dossier
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Wizard
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <CbsHeader agentName={user?.name ?? undefined} />
      <StepBar current={step} />

      <div style={{ maxWidth: 900, margin: "24px auto", padding: "0 16px" }}>
        <div style={{ background: C.bgCard, borderRadius: 10, boxShadow: "0 2px 16px rgba(0,0,0,0.06)", overflow: "hidden" }}>

          {/* ── ÉTAPE 1 : IDENTIFICATION ── */}
          {step === 1 && (
            <StepContainer title="Identification du demandeur" subtitle="Renseignez les informations d'identité du client">
              <Row>
                <Field label="Type de document" required>
                  <Select value={form.docType} onChange={v => set("docType", v)} options={[
                    { value: "CIN",      label: "CIN — Carte Nationale d'Identité" },
                    { value: "PASSPORT", label: "Passeport" },
                    { value: "SEJOUR",   label: "Carte de séjour" },
                  ]} />
                </Field>
                <Field label="Numéro du document" required>
                  <Input value={form.docNumber} onChange={v => set("docNumber", v)} placeholder="Ex: BE123456" />
                </Field>
              </Row>
              <Row>
                <Field label="Prénom" required>
                  <Input value={form.firstName} onChange={v => set("firstName", v)} placeholder="Prénom" />
                </Field>
                <Field label="Nom de famille" required>
                  <Input value={form.lastName} onChange={v => set("lastName", v)} placeholder="Nom" />
                </Field>
              </Row>
              <Row>
                <Field label="Date de naissance" required>
                  <Input type="date" value={form.dateOfBirth} onChange={v => set("dateOfBirth", v)} />
                </Field>
                <Field label="Nationalité">
                  <Select value={form.nationality} onChange={v => set("nationality", v)} options={[
                    { value: "MA", label: "🇲🇦 Marocaine" },
                    { value: "FR", label: "🇫🇷 Française" },
                    { value: "ES", label: "🇪🇸 Espagnole" },
                    { value: "DZ", label: "🇩🇿 Algérienne" },
                    { value: "SN", label: "🇸🇳 Sénégalaise" },
                    { value: "TN", label: "🇹🇳 Tunisienne" },
                    { value: "US", label: "🇺🇸 Américaine" },
                    { value: "GB", label: "🇬🇧 Britannique" },
                  ]} />
                </Field>
              </Row>
              <Row>
                <Field label="Numéro de téléphone" required>
                  <Input value={form.phone} onChange={v => set("phone", v)} placeholder="+212 6XX XXX XXX" type="tel" />
                </Field>
                <Field label="Email (optionnel)">
                  <Input type="email" value={form.email} onChange={v => set("email", v)} placeholder="client@email.com" />
                </Field>
              </Row>
            </StepContainer>
          )}

          {/* ── ÉTAPE 2 : PRODUIT ── */}
          {step === 2 && (
            <StepContainer title="Ouverture de produit financier" subtitle="Sélectionnez le type de compte à ouvrir">
              <Field label="Type de produit" required>
                <Select value={form.productType} onChange={v => set("productType", v)} options={[
                  { value: "COURANT",      label: "💳 Compte courant (Chèque)" },
                  { value: "EPARGNE",      label: "🏦 Compte épargne" },
                  { value: "MOBILE_ORANGE", label: "📱 Portefeuille mobile — Orange Money" },
                  { value: "MOBILE_WAVE",   label: "📱 Portefeuille mobile — Wave" },
                ]} />
              </Field>

              {form.productType.startsWith("MOBILE_") && (
                <div style={{ background: C.amberBg, border: `1px solid #FCD34D`, borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: C.amber }}>
                  <strong>KYC Allégé :</strong> Ce portefeuille démarrera avec un tier KYC Allégé (plafond 5 000 MAD / transaction, 20 000 MAD / mois). Une promotion de tier nécessitera des documents complémentaires.
                </div>
              )}

              <Row>
                <Field label="Dépôt initial (MAD)" required>
                  <Input type="number" value={form.depositAmount} onChange={v => set("depositAmount", v)} placeholder="10000" />
                </Field>
                <Field label="Motif d'ouverture">
                  <Select value={form.depositMotif} onChange={v => set("depositMotif", v)} options={[
                    { value: "Apport initial",            label: "Apport initial" },
                    { value: "Virement salaire",          label: "Virement salaire" },
                    { value: "Épargne personnelle",       label: "Épargne personnelle" },
                    { value: "Activité professionnelle",  label: "Activité professionnelle" },
                    { value: "Héritage",                  label: "Héritage / donation" },
                    { value: "Autre",                     label: "Autre" },
                  ]} />
                </Field>
              </Row>

              {parseFloat(form.depositAmount) >= 100000 && (
                <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: C.red }}>
                  ⚠️ <strong>Note :</strong> Un dépôt ≥ 100 000 MAD nécessite une vérification approfondie (EDD). Ce dossier fera l'objet d'une vigilance renforcée par le service conformité.
                </div>
              )}
            </StepContainer>
          )}

          {/* ── ÉTAPE 3 : COMPLÉMENTS ── */}
          {step === 3 && (
            <StepContainer title="Informations complémentaires" subtitle="Adresse, profession et origine des fonds">
              <Row>
                <Field label="Adresse postale" required>
                  <Input value={form.address} onChange={v => set("address", v)} placeholder="N° et rue" />
                </Field>
                <Field label="Ville" required>
                  <Select value={form.city} onChange={v => set("city", v)} options={[
                    { value: "Casablanca",    label: "Casablanca" },
                    { value: "Rabat",         label: "Rabat" },
                    { value: "Marrakech",     label: "Marrakech" },
                    { value: "Fès",           label: "Fès" },
                    { value: "Tanger",        label: "Tanger" },
                    { value: "Agadir",        label: "Agadir" },
                    { value: "Meknès",        label: "Meknès" },
                    { value: "Oujda",         label: "Oujda" },
                    { value: "Tétouan",       label: "Tétouan" },
                    { value: "Settat",        label: "Settat" },
                    { value: "Autre",         label: "Autre" },
                  ]} />
                </Field>
              </Row>
              <Row>
                <Field label="Profession / Activité" required>
                  <Select value={form.profession} onChange={v => set("profession", v)} options={[
                    { value: "Salarié secteur privé",     label: "Salarié secteur privé" },
                    { value: "Fonctionnaire",             label: "Fonctionnaire / Secteur public" },
                    { value: "Entrepreneur / Commerçant", label: "Entrepreneur / Commerçant" },
                    { value: "Profession libérale",       label: "Profession libérale" },
                    { value: "Retraité",                  label: "Retraité" },
                    { value: "Étudiant",                  label: "Étudiant" },
                    { value: "Agriculteur",               label: "Agriculteur" },
                    { value: "Sans emploi",               label: "Sans emploi" },
                    { value: "Autre",                     label: "Autre" },
                  ]} />
                </Field>
                <Field label="Employeur / Entreprise">
                  <Input value={form.employer} onChange={v => set("employer", v)} placeholder="Nom de l'employeur (optionnel)" />
                </Field>
              </Row>
              <Row>
                <Field label="Source principale des revenus" required>
                  <Select value={form.sourceOfFunds} onChange={v => set("sourceOfFunds", v)} options={[
                    { value: "Salaire",             label: "Salaire" },
                    { value: "Revenus locatifs",    label: "Revenus locatifs" },
                    { value: "Activité commerciale", label: "Activité commerciale" },
                    { value: "Investissements",     label: "Investissements" },
                    { value: "Pension retraite",    label: "Pension retraite" },
                    { value: "Transferts familiaux", label: "Transferts familiaux (MRE)" },
                    { value: "Héritage",            label: "Héritage / donation" },
                    { value: "Autre",               label: "Autre" },
                  ]} />
                </Field>
                <Field label="Revenu mensuel estimé (MAD)">
                  <Input type="number" value={form.monthlyIncome} onChange={v => set("monthlyIncome", v)} placeholder="8000" />
                </Field>
              </Row>
            </StepContainer>
          )}

          {/* ── ÉTAPE 4 : DOCUMENTS KYC ── */}
          {step === 4 && (
            <StepContainer title="Collecte des pièces justificatives" subtitle="Joignez au moins une pièce d'identité (obligatoire) + tout justificatif complémentaire">

              {/* Sélecteur type + zone de dépôt */}
              <div style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <Field label="Type de document à ajouter">
                    <Select value={addingDocType} onChange={setAddingDocType} options={[
                      { value: "IDENTITY",         label: "🪪 Pièce d'identité (CIN / Passeport)" },
                      { value: "PROOF_OF_ADDRESS",  label: "🏠 Justificatif de domicile" },
                      { value: "INCOME",            label: "💼 Justificatif de revenus / fiche de paie" },
                      { value: "BUSINESS",          label: "🏢 Document professionnel / RC" },
                      { value: "SELFIE",            label: "🤳 Photo selfie / biométrie" },
                      { value: "OTHER",             label: "📎 Autre document" },
                    ]} />
                  </Field>
                </div>
                <label
                  style={{
                    padding: "9px 18px", background: C.blue, color: "#fff", borderRadius: 6,
                    fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
                    fontFamily: "inherit", marginBottom: 14,
                  }}
                >
                  + Ajouter un fichier
                  <input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf" style={{ display: "none" }}
                    onChange={e => addFiles(e.target.files)} />
                </label>
              </div>

              {/* Zone drag & drop */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
                style={{
                  border: `2px dashed ${dragOver ? C.blue : C.border}`,
                  borderRadius: 8, padding: "24px 20px", textAlign: "center",
                  background: dragOver ? "#EFF6FF" : C.bg, marginBottom: 20,
                  transition: "all 0.15s", cursor: "default",
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
                <div style={{ fontSize: 13, color: C.sub }}>
                  Glissez-déposez vos fichiers ici, ou utilisez le bouton ci-dessus
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                  Formats acceptés : JPG, PNG, WEBP, PDF — max 10 Mo par fichier
                </div>
              </div>

              {/* Exigences obligatoires */}
              {!docs.some(d => d.docType === "IDENTITY") && (
                <div style={{ background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 7, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: C.amber }}>
                  ⚠️ <strong>Obligatoire :</strong> Au moins une pièce d'identité ({form.docType === "CIN" ? "CIN" : form.docType === "PASSPORT" ? "passeport" : "titre de séjour"} n° {form.docNumber || "…"}) est requise pour valider ce dossier.
                </div>
              )}

              {/* Liste des fichiers ajoutés */}
              {docs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px 0", color: C.muted, fontSize: 13 }}>
                  Aucun document ajouté
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {docs.map(entry => (
                    <div key={entry.id} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 7, padding: "10px 14px",
                    }}>
                      {entry.preview
                        ? <img src={entry.preview} alt="" style={{ width: 44, height: 44, borderRadius: 5, objectFit: "cover", border: `1px solid ${C.border}` }} />
                        : <div style={{ width: 44, height: 44, borderRadius: 5, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📄</div>
                      }
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.file.name}</div>
                        <div style={{ fontSize: 11, color: C.muted }}>
                          {entry.docType === "IDENTITY" ? "Pièce d'identité"
                            : entry.docType === "PROOF_OF_ADDRESS" ? "Justificatif domicile"
                            : entry.docType === "INCOME" ? "Justificatif revenus"
                            : entry.docType === "BUSINESS" ? "Document professionnel"
                            : entry.docType === "SELFIE" ? "Photo / biométrie"
                            : "Autre"}
                          {" · "}{(entry.file.size / 1024).toFixed(0)} ko
                        </div>
                      </div>
                      <button onClick={() => removeDoc(entry.id)} style={{
                        border: "none", background: "transparent", cursor: "pointer",
                        color: C.muted, fontSize: 18, padding: "0 4px", lineHeight: 1,
                      }}>×</button>
                    </div>
                  ))}
                </div>
              )}

              {docs.length > 0 && (
                <div style={{ marginTop: 12, fontSize: 12, color: C.sub, textAlign: "right" }}>
                  {docs.length} document{docs.length > 1 ? "s" : ""} · {docs.filter(d => d.docType === "IDENTITY").length} pièce{docs.filter(d => d.docType === "IDENTITY").length > 1 ? "s" : ""} d'identité
                </div>
              )}
            </StepContainer>
          )}

          {/* ── ÉTAPE 5 : REVUE & TRANSMISSION ── */}
          {step === 5 && (
            <StepContainer title="Revue du dossier & Transmission" subtitle="Vérifiez les informations et documents avant envoi au service conformité">
              {/* Récap identité */}
              <RecapSection title="Identité">
                <RecapRow label="Nom complet"     value={`${form.firstName} ${form.lastName}`} />
                <RecapRow label="Document"        value={`${form.docType} — ${form.docNumber}`} />
                <RecapRow label="Date naissance"  value={form.dateOfBirth} />
                <RecapRow label="Nationalité"     value={form.nationality} />
                <RecapRow label="Téléphone"       value={form.phone} />
                {form.email && <RecapRow label="Email" value={form.email} />}
              </RecapSection>

              {/* Récap produit */}
              <RecapSection title="Produit">
                <RecapRow label="Type"           value={
                  form.productType === "COURANT"        ? "Compte courant"
                  : form.productType === "EPARGNE"      ? "Compte épargne"
                  : form.productType === "MOBILE_ORANGE" ? "Portefeuille Orange Money"
                  : "Portefeuille Wave"
                } />
                <RecapRow label="Dépôt initial"  value={`${parseFloat(form.depositAmount).toLocaleString("fr-MA")} MAD`} />
                <RecapRow label="Motif"          value={form.depositMotif} />
              </RecapSection>

              {/* Récap compléments */}
              <RecapSection title="Informations complémentaires">
                <RecapRow label="Adresse"        value={`${form.address}, ${form.city}`} />
                <RecapRow label="Profession"     value={form.profession} />
                <RecapRow label="Source revenus" value={form.sourceOfFunds} />
                <RecapRow label="Revenu mensuel" value={`${parseFloat(form.monthlyIncome || "0").toLocaleString("fr-MA")} MAD`} />
              </RecapSection>

              {/* Documents uploadés */}
              <div style={{ background: "#F0F7FF", border: "1px solid #BFDBFE", borderRadius: 8, padding: "14px 18px", marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: C.blue, marginBottom: 10 }}>
                  📋 Documents collectés ({docs.length} fichier{docs.length > 1 ? "s" : ""})
                </div>
                {docs.length === 0 ? (
                  <div style={{ fontSize: 13, color: C.muted }}>Aucun fichier joint</div>
                ) : (
                  docs.map(entry => (
                    <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text, padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ color: C.green, fontWeight: 700 }}>✓</span>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.file.name}</span>
                      <span style={{ color: C.muted, flexShrink: 0, fontSize: 11 }}>
                        {entry.docType === "IDENTITY" ? "Identité"
                          : entry.docType === "PROOF_OF_ADDRESS" ? "Domicile"
                          : entry.docType === "INCOME" ? "Revenus"
                          : entry.docType === "BUSINESS" ? "Professionnel"
                          : entry.docType === "SELFIE" ? "Selfie"
                          : "Autre"}
                      </span>
                    </div>
                  ))
                )}
                <div style={{ marginTop: 8, fontSize: 12, color: C.sub }}>+ Formulaire KYC · Déclaration origine des fonds (générés automatiquement)</div>
              </div>

              {/* Attestation */}
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", marginBottom: 20 }}>
                <input type="checkbox" checked={attestation} onChange={e => setAttestation(e.target.checked)}
                  style={{ width: 16, height: 16, marginTop: 2, cursor: "pointer", accentColor: C.blue }} />
                <span style={{ fontSize: 13, color: C.sub, lineHeight: 1.5 }}>
                  Je certifie que les informations fournies sont exactes et complètes, que j'ai vérifié l'identité du client conformément aux procédures internes et aux exigences de la <strong>Circulaire BAM 5/W/2017</strong>. Ce dossier est transmis au service Conformité & LCB-FT pour validation.
                </span>
              </label>

              {submitError && (
                <div style={{ background: C.redBg, border: "1px solid #FCA5A5", borderRadius: 7, padding: "12px 16px", fontSize: 13, color: C.red, marginBottom: 16 }}>
                  ❌ {submitError}
                </div>
              )}
            </StepContainer>
          )}

          {/* ── Navigation ── */}
          <div style={{ padding: "16px 32px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${C.border}` }}>
            {step > 1
              ? <button onClick={() => setStep(s => s - 1)} style={{ padding: "10px 22px", background: "transparent", color: C.sub, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>← Précédent</button>
              : <div />
            }

            {step < 5
              ? (
                <button
                  onClick={() => canProceed() && setStep(s => s + 1)}
                  disabled={!canProceed()}
                  style={{
                    padding: "10px 28px", background: canProceed() ? C.blue : C.border, color: "#fff",
                    border: "none", borderRadius: 6, fontSize: 14, fontWeight: 700,
                    cursor: canProceed() ? "pointer" : "default", fontFamily: "inherit",
                  }}
                >
                  Suivant →
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !attestation}
                  style={{
                    padding: "11px 32px",
                    background: submitting || !attestation ? C.border : C.accent,
                    color: "#fff",
                    border: "none", borderRadius: 6, fontSize: 15, fontWeight: 800,
                    cursor: submitting || !attestation ? "default" : "pointer",
                    fontFamily: "inherit",
                    letterSpacing: "0.02em",
                  }}
                >
                  {submitting ? "⏳ Transmission en cours…" : "📤 TRANSMETTRE AU SERVICE CONFORMITÉ"}
                </button>
              )
            }
          </div>
        </div>

        {/* Footer CBS */}
        <div style={{ textAlign: "center", padding: "20px 0 32px", fontSize: 11, color: C.muted }}>
          COREBANK ENTERPRISE 4.2 — Module Entrée en Relation — Conformément aux dispositions de la Circulaire BAM 5/W/2017 et de la Loi 43-05
        </div>
      </div>
    </div>
  );
}

// ─── Composants helper ────────────────────────────────────────────────────────

function StepContainer({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text }}>{title}</h2>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: C.sub }}>{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function RecapSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>{title}</div>
      <div style={{ background: C.bg, borderRadius: 7, padding: "10px 14px" }}>
        {children}
      </div>
    </div>
  );
}

function RecapRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, borderBottom: `1px solid ${C.border}` }}>
      <span style={{ color: C.sub }}>{label}</span>
      <span style={{ fontWeight: 600, color: C.text }}>{value}</span>
    </div>
  );
}

function InfoCard({ label, value, highlight, color }: { label: string; value: string; highlight?: boolean; color?: string }) {
  return (
    <div style={{ background: highlight ? "#EFF6FF" : C.bg, borderRadius: 8, padding: "14px 16px", border: `1px solid ${highlight ? "#BFDBFE" : C.border}` }}>
      <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color ?? (highlight ? C.blue : C.text), wordBreak: "break-all" }}>{value}</div>
    </div>
  );
}
