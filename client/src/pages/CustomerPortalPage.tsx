import { useState } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { trpc } from "../lib/trpc";
import { useAuth } from "../hooks/useAuth";
import {
  User, FileText, ArrowLeftRight, Shield,
  Download, Trash2, AlertTriangle, CheckCircle2, Info,
} from "lucide-react";

const C = {
  surface: "var(--wr-card)",
  border:  "var(--wr-border)",
  border2: "var(--wr-border2)",
  text1:   "var(--wr-text-1)",
  text2:   "var(--wr-text-2)",
  text3:   "var(--wr-text-3)",
  red:     "var(--wr-red)",
  amber:   "var(--wr-amber)",
  green:   "var(--wr-green)",
  blue:    "var(--wr-blue)",
  mono:    "var(--wr-font-mono)",
};

type Tab = "profile" | "transactions" | "documents" | "rights" | "risk";

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600,
        background: active ? C.blue : "transparent",
        border: `1px solid ${active ? C.blue : C.border}`,
        color: active ? "#fff" : C.text2,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 11, color: C.text2 }}>{label}</span>
      <span style={{ fontFamily: C.mono, fontSize: 11, color: value ? C.text1 : C.text3, fontWeight: 600 }}>
        {value ?? "—"}
      </span>
    </div>
  );
}

export function CustomerPortalPage() {
  useAuth();
  const [tab, setTab] = useState<Tab>("profile");
  const [erasureReason, setErasureReason] = useState("");
  const [showErasureForm, setShowErasureForm] = useState(false);

  const { data: profile, isLoading: profileLoading } = trpc.portal.myProfile.useQuery();
  const { data: transactions, isLoading: txLoading } = trpc.portal.myTransactions.useQuery(
    undefined,
    { enabled: tab === "transactions" }
  );
  const { data: documents, isLoading: docsLoading } = trpc.portal.myDocuments.useQuery(
    undefined,
    { enabled: tab === "documents" }
  );
  const { data: riskExplain, isLoading: riskLoading } = trpc.portal.myRiskExplain.useQuery(
    undefined,
    { enabled: tab === "risk" }
  );

  const downloadData = trpc.portal.downloadMyData.useMutation({
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const requestErasure = trpc.portal.requestErasure.useMutation();

  const RISK_COLORS: Record<string, string> = {
    LOW: C.green, MEDIUM: C.amber, HIGH: C.red, CRITICAL: C.red,
  };

  return (
    <AppLayout>
      <div style={{ padding: "24px 28px", maxWidth: 900, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text1, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <User size={20} /> Portail Client — Mes Données
          </h1>
          <p style={{ fontSize: 12, color: C.text2, margin: "4px 0 0" }}>
            Exercez vos droits RGPD / Loi 09-08 Maroc — Accès, rectification, portabilité, effacement
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <TabBtn active={tab === "profile"} onClick={() => setTab("profile")}>
            <User size={12} style={{ display: "inline", marginRight: 5 }} /> Profil
          </TabBtn>
          <TabBtn active={tab === "transactions"} onClick={() => setTab("transactions")}>
            <ArrowLeftRight size={12} style={{ display: "inline", marginRight: 5 }} /> Mes transactions
          </TabBtn>
          <TabBtn active={tab === "documents"} onClick={() => setTab("documents")}>
            <FileText size={12} style={{ display: "inline", marginRight: 5 }} /> Mes documents
          </TabBtn>
          <TabBtn active={tab === "risk"} onClick={() => setTab("risk")}>
            <Shield size={12} style={{ display: "inline", marginRight: 5 }} /> Explication score
          </TabBtn>
          <TabBtn active={tab === "rights"} onClick={() => setTab("rights")}>
            <Info size={12} style={{ display: "inline", marginRight: 5 }} /> Mes droits
          </TabBtn>
        </div>

        {/* PROFIL */}
        {tab === "profile" && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "18px 20px" }}>
            <h3 style={{ fontSize: 12, fontWeight: 600, color: C.text2, margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Informations personnelles
            </h3>
            {profileLoading ? (
              <div style={{ fontSize: 12, color: C.text3 }}>Chargement…</div>
            ) : profile ? (
              <>
                <FieldRow label="Identifiant client" value={profile.customerId} />
                <FieldRow label="Prénom" value={profile.firstName} />
                <FieldRow label="Nom" value={profile.lastName} />
                <FieldRow label="Email" value={profile.email} />
                <FieldRow label="Téléphone" value={profile.phone} />
                <FieldRow label="Nationalité" value={profile.nationality} />
                <FieldRow label="Pays de résidence" value={profile.residenceCountry} />
                <FieldRow label="Adresse" value={profile.address} />
                <FieldRow label="Ville" value={profile.city} />
                <FieldRow label="Statut KYC" value={profile.kycStatus} />
                <FieldRow label="Niveau de risque" value={profile.riskLevel ?? "—"} />
                <FieldRow label="Membre depuis" value={new Date(profile.createdAt).toLocaleDateString("fr-FR")} />
              </>
            ) : (
              <div style={{ fontSize: 12, color: C.text3 }}>Profil introuvable</div>
            )}
          </div>
        )}

        {/* TRANSACTIONS */}
        {tab === "transactions" && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "18px 20px" }}>
            <h3 style={{ fontSize: 12, fontWeight: 600, color: C.text2, margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Historique des transactions (90 derniers jours)
            </h3>
            {txLoading ? (
              <div style={{ fontSize: 12, color: C.text3 }}>Chargement…</div>
            ) : transactions && transactions.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {transactions.map(tx => (
                  <div key={tx.transactionId} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 6,
                  }}>
                    <div>
                      <div style={{ fontFamily: C.mono, fontSize: 11, color: C.text1, fontWeight: 600 }}>
                        {tx.transactionId}
                      </div>
                      <div style={{ fontSize: 10, color: C.text3 }}>
                        {tx.transactionType} | {tx.channel} | {new Date(tx.transactionDate).toLocaleDateString("fr-FR")}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: C.text1 }}>
                        {tx.amount.toLocaleString("fr-FR")} {tx.currency}
                      </div>
                      <div style={{ fontSize: 10, color: C.text3 }}>{tx.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.text3 }}>Aucune transaction dans les 90 derniers jours</div>
            )}
          </div>
        )}

        {/* DOCUMENTS */}
        {tab === "documents" && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "18px 20px" }}>
            <h3 style={{ fontSize: 12, fontWeight: 600, color: C.text2, margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Documents KYC soumis
            </h3>
            {docsLoading ? (
              <div style={{ fontSize: 12, color: C.text3 }}>Chargement…</div>
            ) : documents && documents.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {documents.map(doc => (
                  <div key={doc.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 6,
                  }}>
                    <div>
                      <div style={{ fontSize: 12, color: C.text1, fontWeight: 600 }}>{doc.documentType}</div>
                      <div style={{ fontSize: 10, color: C.text3 }}>{new Date(doc.createdAt).toLocaleDateString("fr-FR")}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                        background: doc.status === "VERIFIED" ? `${C.green}20` : doc.status === "REJECTED" ? `${C.red}20` : `${C.amber}20`,
                        color: doc.status === "VERIFIED" ? C.green : doc.status === "REJECTED" ? C.red : C.amber,
                      }}>
                        {doc.status}
                      </span>
                      {doc.ekycStatus && (
                        <span style={{ fontSize: 10, color: C.text3 }}>eKYC: {doc.ekycStatus}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.text3 }}>Aucun document soumis</div>
            )}
          </div>
        )}

        {/* EXPLICATION SCORE */}
        {tab === "risk" && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "18px 20px" }}>
            <h3 style={{ fontSize: 12, fontWeight: 600, color: C.text2, margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Explication du score de risque (RGPD Art.22)
            </h3>
            {riskLoading ? (
              <div style={{ fontSize: 12, color: C.text3 }}>Chargement…</div>
            ) : riskExplain ? (
              <>
                <div style={{
                  display: "inline-block", padding: "6px 14px", borderRadius: 20,
                  background: `${RISK_COLORS[riskExplain.riskLevel] ?? C.amber}20`,
                  color: RISK_COLORS[riskExplain.riskLevel] ?? C.amber,
                  fontSize: 12, fontWeight: 700, marginBottom: 12,
                }}>
                  Niveau : {riskExplain.riskLevel}
                </div>
                <p style={{ fontSize: 12, color: C.text1, lineHeight: 1.6, marginBottom: 12 }}>
                  {riskExplain.explanation}
                </p>

                {riskExplain.contributingFactors.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <h4 style={{ fontSize: 11, color: C.text2, margin: "0 0 8px", textTransform: "uppercase" }}>
                      Facteurs pris en compte
                    </h4>
                    {riskExplain.contributingFactors.map((f, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontSize: 11, color: C.text2,
                      }}>
                        <AlertTriangle size={10} style={{ color: C.amber }} /> {f}
                      </div>
                    ))}
                  </div>
                )}

                <div style={{
                  background: `${C.blue}08`, border: `1px solid ${C.blue}25`,
                  borderRadius: 7, padding: "10px 12px",
                }}>
                  <h4 style={{ fontSize: 11, color: C.text2, margin: "0 0 6px", textTransform: "uppercase" }}>Vos droits</h4>
                  {riskExplain.rights.map((r, i) => (
                    <div key={i} style={{ fontSize: 11, color: C.text2, padding: "3px 0" }}>
                      <CheckCircle2 size={10} style={{ color: C.green, display: "inline", marginRight: 5 }} />
                      {r}
                    </div>
                  ))}
                  <div style={{ marginTop: 8, fontSize: 10, color: C.text3 }}>
                    Base légale : {riskExplain.legalBasis}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* MES DROITS */}
        {tab === "rights" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Télécharger mes données */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "18px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: C.text1, margin: "0 0 4px" }}>
                    Portabilité des données
                  </h3>
                  <p style={{ fontSize: 11, color: C.text2, margin: 0 }}>
                    Téléchargez l'ensemble de vos données personnelles au format JSON (RGPD Art.20 / Loi 09-08 Art.10)
                  </p>
                </div>
                <button
                  onClick={() => downloadData.mutate()}
                  disabled={downloadData.isPending}
                  style={{
                    padding: "8px 16px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                    background: C.blue, border: "none", color: "#fff",
                    cursor: downloadData.isPending ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
                  }}
                >
                  <Download size={12} /> {downloadData.isPending ? "Préparation…" : "Télécharger"}
                </button>
              </div>
            </div>

            {/* Demande d'effacement */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "18px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: C.text1, margin: "0 0 4px" }}>
                    Droit à l'effacement
                  </h3>
                  <p style={{ fontSize: 11, color: C.text2, margin: 0 }}>
                    Demandez la suppression de vos données (RGPD Art.17 / Loi 09-08 Art.9)
                  </p>
                </div>
                <button
                  onClick={() => setShowErasureForm(!showErasureForm)}
                  style={{
                    padding: "8px 16px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                    background: "transparent", border: `1px solid ${C.red}`, color: C.red,
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <Trash2 size={12} /> Faire une demande
                </button>
              </div>

              {showErasureForm && !requestErasure.isSuccess && (
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                  <div style={{
                    padding: "10px", background: `${C.amber}10`, border: `1px solid ${C.amber}30`,
                    borderRadius: 6, marginBottom: 10, fontSize: 11, color: C.text2,
                  }}>
                    <AlertTriangle size={11} style={{ display: "inline", marginRight: 5, color: C.amber }} />
                    Cette demande sera traitée par notre équipe compliance sous 30 jours.
                    Les données requises par la réglementation LCB-FT ne peuvent pas être supprimées pendant la durée légale de conservation (5-10 ans).
                  </div>
                  <textarea
                    value={erasureReason}
                    onChange={e => setErasureReason(e.target.value)}
                    placeholder="Motif de votre demande (min. 10 caractères)…"
                    rows={3}
                    style={{
                      width: "100%", padding: "8px 10px", borderRadius: 6,
                      border: `1px solid ${C.border}`, background: C.surface,
                      color: C.text1, fontSize: 12, resize: "vertical", boxSizing: "border-box",
                    }}
                  />
                  <button
                    onClick={() => requestErasure.mutate({ reason: erasureReason, confirmation: true })}
                    disabled={erasureReason.length < 10 || requestErasure.isPending}
                    style={{
                      marginTop: 8, padding: "8px 16px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                      background: C.red, border: "none", color: "#fff",
                      cursor: erasureReason.length < 10 || requestErasure.isPending ? "not-allowed" : "pointer",
                      opacity: erasureReason.length < 10 ? 0.5 : 1,
                    }}
                  >
                    {requestErasure.isPending ? "Envoi…" : "Confirmer la demande"}
                  </button>
                </div>
              )}

              {requestErasure.isSuccess && (
                <div style={{
                  padding: "12px", background: `${C.green}10`, border: `1px solid ${C.green}30`,
                  borderRadius: 6, fontSize: 11, color: C.green,
                }}>
                  <CheckCircle2 size={12} style={{ display: "inline", marginRight: 5 }} />
                  <strong>Demande enregistrée</strong> — Référence : {requestErasure.data?.requestId}
                  <br />
                  <span style={{ color: C.text2 }}>Réponse attendue avant : {requestErasure.data?.expectedResponseBy ? new Date(requestErasure.data.expectedResponseBy).toLocaleDateString("fr-FR") : "—"}</span>
                </div>
              )}
            </div>

            {/* Info légale */}
            <div style={{
              background: `${C.blue}08`, border: `1px solid ${C.blue}25`,
              borderRadius: 8, padding: "12px 16px", fontSize: 11, color: C.text2,
            }}>
              <strong style={{ color: C.blue }}>Base légale du traitement</strong> — Vos données sont traitées conformément à :
              la Loi n°09-08 relative à la protection des personnes physiques à l'égard du traitement des données à caractère personnel,
              la Loi n°43-05 relative à la lutte contre le blanchiment de capitaux, et le RGPD (Règlement UE 2016/679) pour les entités opérant dans l'espace européen.
              DPO contact : <strong>dpo@institution.ma</strong>
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
}
