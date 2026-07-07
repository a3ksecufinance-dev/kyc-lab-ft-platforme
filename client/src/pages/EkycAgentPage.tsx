/**
 * Page eKYC — Poste Agent (intégré CBS)
 *
 * Layout desktop 3 colonnes :
 *  ┌────────────┬─────────────────────────┬───────────────────┐
 *  │ Sessions   │   Preview OCR (R + V)   │  Champs + valid.  │
 *  │ actives    │   Upload progressif     │  Historique CIN   │
 *  └────────────┴─────────────────────────┴───────────────────┘
 *
 * Raccourcis :
 *  N       Nouvelle session
 *  R / V   Upload recto / verso
 *  Enter   Sauvegarder (patch)
 *  Ctrl+S  Finaliser (créer client)
 *  Esc     Fermer session courante
 *
 * Consomme /api/ekyc/* (session-driven).
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { Button }    from "../components/ui/Button";
import { Badge }     from "../components/ui/Badge";
import {
  Plus, RefreshCw, Upload, Send, Trash2, Search, Loader2,
  AlertTriangle, CheckCircle2, FileText, Zap,
  Camera, Link2, XCircle,
} from "lucide-react";
import { useI18n } from "../hooks/useI18n";
import { checkClientImageQuality, compressImageIfNeeded } from "../lib/image-quality";

// ─── Palette (identique EkycPage) ─────────────────────────────────────────────

const C = {
  bg:      "var(--wr-page)",
  card:    "var(--wr-card)",
  border:  "var(--wr-border)",
  border2: "var(--wr-border2)",
  hover:   "var(--wr-hover)",
  text1:   "var(--wr-text-1)",
  text2:   "var(--wr-text-2)",
  text3:   "var(--wr-text-3)",
  teal:    "var(--wr-accent)",
  blue:    "var(--wr-blue)",
  red:     "var(--wr-red)",
  amber:   "var(--wr-amber)",
  green:   "var(--wr-green)",
  mono:    "var(--wr-font-mono)",
  sans:    "var(--wr-font-sans)",
};

// ─── Types (miroir du backend ekyc-session.service) ────────────────────────────

type SessionStatus =
  | "DRAFT" | "RECTO_ONLY" | "OCR_DONE" | "AGENT_REVIEW"
  | "PENDING_CA" | "DECIDED" | "ABANDONED";

type Channel = "CBS_API" | "DIGITAL_WEB" | "AGENT_OFFICE" | "MOBILE_APP";

interface CandidateFields {
  nom?:            string;
  prenom?:         string;
  cin?:            string;
  dateNaissance?:  string;
  dateExpiration?: string;
  lieuNaissance?:  string;
  sexe?:           string;
  adresse?:        string;
  ville?:          string;
  quartier?:       string;
  [k: string]:     string | undefined;
}

interface FieldMatch {
  field:  string;
  cbs:    string;
  ocr:    string;
  score:  number;
  status: "MATCH" | "PARTIAL" | "MISMATCH" | "MISSING";
}

interface MatchScore {
  score:            number;
  verdict:          "MATCH" | "REVIEW" | "HIGH_RISK";
  fields:           FieldMatch[];
  criticalMismatch: string[];
}

interface DuplicateInfo {
  exists:       boolean;
  customerId?:  number;
  customerRef?: string;
  kycStatus?:   string;
  riskLevel?:   string;
}

interface DecisionResult {
  matchScore?: MatchScore;
  duplicate?:  DuplicateInfo;
}

interface EkycSession {
  sessionRef:      string;
  status:          SessionStatus;
  channel:         Channel;
  rectoUploaded:   boolean;
  versoUploaded:   boolean;
  rectoConfidence: number | null;
  versoConfidence: number | null;
  candidateFields: CandidateFields | null;
  cbsFields:       CandidateFields | null;
  qualityChecks:   Record<string, unknown> | null;
  decisionResult:  DecisionResult | null;
  modifiedFields:  string[] | null;
  retryCount:      number;
  createdAt:       string;
  updatedAt:       string;
  expiresAt:       string | null;
  finalCustomerId: number | null;
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  DRAFT:            "Draft",
  RECTO_ONLY:       "Recto seul",
  OCR_DONE:         "OCR complet",
  AGENT_REVIEW:     "Revue",
  PENDING_CA:       "Approbation CA",
  DECIDED:          "Décidé",
  ABANDONED:        "Abandonné",
};

const CHANNEL_LABEL: Record<Channel, string> = {
  CBS_API:      "CBS",
  DIGITAL_WEB:  "Web",
  AGENT_OFFICE: "Agence",
  MOBILE_APP:   "Mobile",
};

const FIELD_LABELS: Record<string, string> = {
  nom:            "Nom",
  prenom:         "Prénom",
  cin:            "CIN",
  dateNaissance:  "Date naissance",
  dateExpiration: "Date expiration",
  lieuNaissance:  "Lieu naissance",
  sexe:           "Sexe",
  adresse:        "Adresse",
  ville:          "Ville",
  quartier:       "Quartier",
};

const REQUIRED_FIELDS = ["nom", "prenom", "cin", "dateNaissance"];

// ─── API client léger ──────────────────────────────────────────────────────────

const API_KEY = "cbs-staging-key-change-me"; // TODO: à récupérer depuis settings

async function api<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`/api/ekyc${path}`, {
    ...init,
    headers: {
      "Content-Type":  "application/json",
      "X-CBS-Api-Key": API_KEY,
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = (data as { error?: string }).error ?? `HTTP ${res.status}`;
    throw new Error(err);
  }
  return data as T;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture fichier échouée"));
    reader.onload  = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.readAsDataURL(file);
  });
}

// ─── Composant ────────────────────────────────────────────────────────────────

export function EkycAgentPage() {
  const { t: _t } = useI18n();

  // Liste sessions actives (filtres)
  const [statusFilter, setStatusFilter] = useState<SessionStatus | "ALL">("ALL");
  const [channelFilter, setChannelFilter] = useState<Channel | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sessions, setSessions] = useState<EkycSession[]>([]);
  const [listLoading, setListLoading] = useState(false);

  // Session active
  const [activeRef, setActiveRef] = useState<string | null>(null);
  const [active, setActive] = useState<EkycSession | null>(null);
  const [activeLoading, setActiveLoading] = useState(false);

  // Édition champs
  const [fields, setFields] = useState<CandidateFields>({});
  const [dirty, setDirty] = useState(false);
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());

  // Historique CIN
  const [historyState, setHistoryState] = useState<{
    exists: boolean; customerId?: number; kycStatus?: string; lastKycRef?: string;
  } | null>(null);

  // UI state
  const [uploading, setUploading] = useState<"recto" | "verso" | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" | "warn" } | null>(null);
  const [showFinalize, setShowFinalize] = useState(false);
  const [notes, setNotes] = useState("");

  const rectoInputRef = useRef<HTMLInputElement>(null);
  const versoInputRef = useRef<HTMLInputElement>(null);

  // ── Toast auto-clear ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const to = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(to);
  }, [toast]);

  // ── Fetch liste ─────────────────────────────────────────────────────────────

  const fetchSessions = useCallback(async () => {
    setListLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL")  params.set("status", statusFilter);
      if (channelFilter !== "ALL") params.set("channel", channelFilter);
      params.set("limit", "50");
      const data = await api<{ sessions: EkycSession[] }>(`/sessions?${params}`);
      setSessions(data.sessions ?? []);
    } catch (err) {
      setToast({ msg: `Chargement sessions échoué : ${(err as Error).message}`, type: "err" });
    } finally {
      setListLoading(false);
    }
  }, [statusFilter, channelFilter]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);
  // Rafraîchit toutes les 30 s
  useEffect(() => {
    const int = setInterval(fetchSessions, 30_000);
    return () => clearInterval(int);
  }, [fetchSessions]);

  // ── Fetch session active ────────────────────────────────────────────────────

  const fetchActive = useCallback(async (ref: string) => {
    setActiveLoading(true);
    try {
      const data = await api<{ session: EkycSession }>(`/sessions/${ref}`);
      setActive(data.session);
      setFields(data.session.candidateFields ?? {});
      setDirty(false);
      setDirtyFields(new Set());

      // Fetch historique si CIN présent
      const cin = data.session.candidateFields?.cin;
      if (cin) fetchHistory(cin);
      else setHistoryState(null);
    } catch (err) {
      setToast({ msg: `Chargement session : ${(err as Error).message}`, type: "err" });
    } finally {
      setActiveLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeRef) fetchActive(activeRef);
    else { setActive(null); setFields({}); setHistoryState(null); }
  }, [activeRef, fetchActive]);

  // ── Historique CIN ──────────────────────────────────────────────────────────

  const fetchHistory = useCallback(async (cin: string) => {
    if (!cin || cin.length < 4) return;
    try {
      const data = await api<typeof historyState & { exists: boolean }>(
        `/history?cin=${encodeURIComponent(cin)}`
      );
      setHistoryState(data);
    } catch {
      setHistoryState(null);
    }
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const createSession = useCallback(async () => {
    try {
      const data = await api<{ sessionRef: string }>(`/sessions`, {
        method: "POST",
        body: JSON.stringify({ channel: "AGENT_OFFICE" }),
      });
      setToast({ msg: `Session ${data.sessionRef} créée`, type: "ok" });
      setActiveRef(data.sessionRef);
      fetchSessions();
    } catch (err) {
      setToast({ msg: `Création : ${(err as Error).message}`, type: "err" });
    }
  }, [fetchSessions]);

  const uploadImage = useCallback(async (side: "recto" | "verso", file: File) => {
    if (!activeRef) return;
    setUploading(side);
    try {
      // Preflight qualité côté navigateur (feedback rapide sans aller-retour)
      const preflight = await checkClientImageQuality(file);
      if (!preflight.passed) {
        setToast({
          msg: `Qualité locale ${preflight.score}/100 — ${preflight.issues[0] ?? "vérifier"}. Envoi quand même…`,
          type: "warn",
        });
      }
      // Compression pour réduire la taille (agents peuvent scanner en très haute déf)
      const compressed = await compressImageIfNeeded(file, 2400, 0.9);
      const base64 = await fileToBase64(compressed);
      const data = await api<{ session: EkycSession; extracted: CandidateFields; confidence: number; quality: { score: number; passed: boolean; issues: string[] } }>(
        `/sessions/${activeRef}/images`,
        {
          method: "POST",
          body: JSON.stringify({
            side,
            base64,
            mimeType: compressed.type || "image/jpeg",
          }),
        }
      );
      setActive(data.session);
      // Fusionne les champs — les nouveaux ne doivent pas écraser les édits agent
      setFields(prev => ({ ...data.session.candidateFields, ...prev }));
      const qMsg = data.quality.passed
        ? `${side} OK (qualité ${data.quality.score}/100, OCR ${data.confidence}/100)`
        : `${side} qualité faible (${data.quality.score}/100) — vérifier`;
      setToast({ msg: qMsg, type: data.quality.passed ? "ok" : "warn" });
      fetchSessions();
      const cin = data.session.candidateFields?.cin;
      if (cin) fetchHistory(cin);
    } catch (err) {
      setToast({ msg: `Upload ${side} : ${(err as Error).message}`, type: "err" });
    } finally {
      setUploading(null);
    }
  }, [activeRef, fetchSessions, fetchHistory]);

  const retryOcr = useCallback(async (side: "recto" | "verso", file: File) => {
    if (!activeRef) return;
    setUploading(side);
    try {
      const base64 = await fileToBase64(file);
      const data = await api<{ session: EkycSession; confidence: number }>(
        `/sessions/${activeRef}/retry-ocr`,
        {
          method: "POST",
          body: JSON.stringify({ side, base64, mimeType: file.type || "image/jpeg" }),
        }
      );
      setActive(data.session);
      setFields(prev => ({ ...data.session.candidateFields, ...prev }));
      setToast({ msg: `Retry OCR ${side} — confiance ${data.confidence}/100`, type: "ok" });
    } catch (err) {
      setToast({ msg: `Retry : ${(err as Error).message}`, type: "err" });
    } finally {
      setUploading(null);
    }
  }, [activeRef]);

  const saveFields = useCallback(async () => {
    if (!activeRef || !dirty) return;
    try {
      await api(`/sessions/${activeRef}`, {
        method: "PATCH",
        body: JSON.stringify({ fields }),
      });
      setDirty(false);
      setDirtyFields(new Set());
      setToast({ msg: "Modifications sauvegardées", type: "ok" });
    } catch (err) {
      setToast({ msg: `Sauvegarde : ${(err as Error).message}`, type: "err" });
    }
  }, [activeRef, dirty, fields]);

  const finalizeSession = useCallback(async () => {
    if (!activeRef) return;
    try {
      // Save first if dirty
      if (dirty) await saveFields();
      const data = await api<{ customerId: number; kycRef: string }>(
        `/sessions/${activeRef}/finalize`,
        {
          method: "POST",
          body: JSON.stringify({ notes: notes || undefined, code: "entree" }),
        }
      );
      setToast({ msg: `Client #${data.customerId} créé (KYC ${data.kycRef})`, type: "ok" });
      setShowFinalize(false);
      setActiveRef(null);
      fetchSessions();
    } catch (err) {
      setToast({ msg: `Finalisation : ${(err as Error).message}`, type: "err" });
    }
  }, [activeRef, dirty, saveFields, notes, fetchSessions]);

  const abandonSession = useCallback(async (ref: string) => {
    if (!confirm(`Abandonner la session ${ref} ?`)) return;
    try {
      await api(`/sessions/${ref}`, { method: "DELETE" });
      setToast({ msg: `Session ${ref} abandonnée`, type: "ok" });
      if (activeRef === ref) setActiveRef(null);
      fetchSessions();
    } catch (err) {
      setToast({ msg: `Abandon : ${(err as Error).message}`, type: "err" });
    }
  }, [activeRef, fetchSessions]);

  const generateMagicLink = useCallback(async () => {
    if (!activeRef) return;
    try {
      const data = await api<{ url: string; expiresAt: string }>(
        `/sessions/${activeRef}/magic-link`,
        { method: "POST" }
      );
      await navigator.clipboard.writeText(data.url);
      setToast({ msg: "Lien copié dans le presse-papier", type: "ok" });
    } catch (err) {
      setToast({ msg: `Magic link : ${(err as Error).message}`, type: "err" });
    }
  }, [activeRef]);

  // ── Édition champs ──────────────────────────────────────────────────────────

  const updateField = useCallback((key: string, value: string) => {
    setFields(prev => ({ ...prev, [key]: value }));
    setDirty(true);
    setDirtyFields(prev => new Set(prev).add(key));
    if (key === "cin" && value.length >= 4) fetchHistory(value);
  }, [fetchHistory]);

  // ── Raccourcis clavier ──────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = ["INPUT", "TEXTAREA", "SELECT"].includes(
        (e.target as HTMLElement).tagName
      );
      // Save : Ctrl+S (partout)
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (dirty) saveFields();
        return;
      }
      if (inField) return;
      if (e.key === "n" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        createSession();
      } else if (e.key === "r" && activeRef) {
        e.preventDefault();
        rectoInputRef.current?.click();
      } else if (e.key === "v" && activeRef) {
        e.preventDefault();
        versoInputRef.current?.click();
      } else if (e.key === "Escape" && activeRef) {
        setActiveRef(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeRef, dirty, saveFields, createSession]);

  // ── Filtrage sessions ───────────────────────────────────────────────────────

  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(s =>
      s.sessionRef.toLowerCase().includes(q) ||
      (s.candidateFields?.cin ?? "").toLowerCase().includes(q) ||
      (s.candidateFields?.nom ?? "").toLowerCase().includes(q) ||
      (s.candidateFields?.prenom ?? "").toLowerCase().includes(q)
    );
  }, [sessions, searchQuery]);

  // ── Validation champs ───────────────────────────────────────────────────────

  const validation = useMemo(() => {
    const missing = REQUIRED_FIELDS.filter(k => !(fields[k]?.trim()));
    const canFinalize = missing.length === 0 && !!active && active.status !== "DECIDED";
    return { missing, canFinalize };
  }, [fields, active]);

  // Doublon détecté soit à l'OCR (backend écrit dans decisionResult) soit par
  // recherche manuelle sur le CIN saisi
  const duplicateFromOcr = active?.decisionResult?.duplicate;
  const hasDuplicate = (duplicateFromOcr?.exists && duplicateFromOcr.customerId) ||
                       (historyState?.exists && historyState.customerId);
  const dupCustomerId  = duplicateFromOcr?.customerId  ?? historyState?.customerId;
  const dupCustomerRef = duplicateFromOcr?.customerRef ?? historyState?.lastKycRef;
  const dupKycStatus   = duplicateFromOcr?.kycStatus   ?? historyState?.kycStatus;

  const matchScore = active?.decisionResult?.matchScore;

  // ─── Rendu ───────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div style={{
        display: "grid",
        gridTemplateColumns: "320px 1fr 420px",
        gap: 16,
        height: "calc(100vh - 100px)",
        minHeight: 600,
      }}>

        {/* ═══ COL 1 — Sessions actives ═══════════════════════════════════════ */}
        <div style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "14px 14px 8px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontFamily: C.mono, fontSize: 11, color: C.text2, letterSpacing: 0.5 }}>
                SESSIONS
              </span>
              <Button variant="gold" size="sm" icon={Plus} onClick={createSession} ariaLabel="N — Nouvelle session">
                Nouvelle (N)
              </Button>
            </div>

            {/* Search */}
            <div style={{ position: "relative", marginBottom: 8 }}>
              <Search size={11} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: C.text3 }} />
              <input
                type="text"
                placeholder="CIN, nom, ref…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 8px 6px 26px",
                  background: C.bg,
                  border: `1px solid ${C.border2}`,
                  borderRadius: 6,
                  fontSize: 11,
                  fontFamily: C.mono,
                  color: C.text1,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Filtres */}
            <div style={{ display: "flex", gap: 4 }}>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as SessionStatus | "ALL")}
                style={selectStyle}
              >
                <option value="ALL">Statuts</option>
                <option value="DRAFT">Draft</option>
                <option value="RECTO_ONLY">Recto seul</option>
                <option value="OCR_DONE">OCR OK</option>
                <option value="AGENT_REVIEW">Revue</option>
                <option value="DECIDED">Décidé</option>
              </select>
              <select
                value={channelFilter}
                onChange={e => setChannelFilter(e.target.value as Channel | "ALL")}
                style={selectStyle}
              >
                <option value="ALL">Canaux</option>
                <option value="CBS_API">CBS</option>
                <option value="AGENT_OFFICE">Agence</option>
                <option value="DIGITAL_WEB">Web</option>
                <option value="MOBILE_APP">Mobile</option>
              </select>
              <button
                onClick={fetchSessions}
                disabled={listLoading}
                style={{
                  background: "transparent",
                  border: `1px solid ${C.border2}`,
                  color: C.text3,
                  borderRadius: 6,
                  padding: "4px 6px",
                  cursor: "pointer",
                }}
                aria-label="Rafraîchir"
              >
                <RefreshCw size={11} style={{ animation: listLoading ? "spin 1s linear infinite" : "none" }} />
              </button>
            </div>
          </div>

          {/* Liste */}
          <div style={{ flex: 1, overflow: "auto", padding: "4px 0" }}>
            {filteredSessions.length === 0 && !listLoading && (
              <div style={{ padding: 20, textAlign: "center", color: C.text3, fontSize: 11, fontFamily: C.mono }}>
                Aucune session
              </div>
            )}
            {filteredSessions.map(s => (
              <SessionRow
                key={s.sessionRef}
                session={s}
                active={s.sessionRef === activeRef}
                onClick={() => setActiveRef(s.sessionRef)}
                onAbandon={() => abandonSession(s.sessionRef)}
              />
            ))}
          </div>

          <div style={{ padding: "8px 14px", borderTop: `1px solid ${C.border}`, fontSize: 10, fontFamily: C.mono, color: C.text3 }}>
            {filteredSessions.length}/{sessions.length} sessions
          </div>
        </div>

        {/* ═══ COL 2 — Preview images + upload ═══════════════════════════════ */}
        <div style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {!active && !activeLoading && (
            <EmptyPanel />
          )}
          {activeLoading && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Loader2 size={24} style={{ color: C.teal, animation: "spin 1s linear infinite" }} />
            </div>
          )}
          {active && !activeLoading && (
            <>
              {/* Header session */}
              <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text1, fontFamily: C.sans }}>
                    {active.sessionRef}
                  </div>
                  <div style={{ fontSize: 10, fontFamily: C.mono, color: C.text3, marginTop: 2, display: "flex", gap: 10 }}>
                    <span>{CHANNEL_LABEL[active.channel]}</span>
                    <span>·</span>
                    <span>Retries : {active.retryCount}/5</span>
                    {active.expiresAt && (
                      <>
                        <span>·</span>
                        <span title={active.expiresAt}>expire {timeUntil(active.expiresAt)}</span>
                      </>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Badge label={STATUS_LABEL[active.status]} variant="status" />
                  <Button variant="ghost" size="sm" icon={Link2} onClick={generateMagicLink} ariaLabel="Générer lien magique">
                    Lien
                  </Button>
                </div>
              </div>

              {/* Zone preview */}
              <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: 18, overflow: "auto" }}>
                <ImageSide
                  label="RECTO"
                  uploaded={active.rectoUploaded}
                  confidence={active.rectoConfidence}
                  hotkey="R"
                  uploading={uploading === "recto"}
                  inputRef={rectoInputRef}
                  onUpload={f => (active.rectoUploaded ? retryOcr("recto", f) : uploadImage("recto", f))}
                  isRetry={active.rectoUploaded}
                />
                <ImageSide
                  label="VERSO"
                  uploaded={active.versoUploaded}
                  confidence={active.versoConfidence}
                  hotkey="V"
                  uploading={uploading === "verso"}
                  inputRef={versoInputRef}
                  onUpload={f => (active.versoUploaded ? retryOcr("verso", f) : uploadImage("verso", f))}
                  isRetry={active.versoUploaded}
                />
              </div>

              {/* Quality info */}
              {active.qualityChecks && (
                <QualityStrip checks={active.qualityChecks} />
              )}
            </>
          )}
        </div>

        {/* ═══ COL 3 — Édition champs + historique ═══════════════════════════ */}
        <div style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {!active && (
            <div style={{ flex: 1, padding: 24, color: C.text3, fontSize: 11, fontFamily: C.mono, textAlign: "center" }}>
              Sélectionne une session pour éditer.
            </div>
          )}
          {active && (
            <>
              <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: C.mono, fontSize: 11, color: C.text2, letterSpacing: 0.5 }}>
                  DONNÉES CLIENT
                </span>
                {dirty && (
                  <span style={{ fontSize: 10, fontFamily: C.mono, color: C.amber }}>
                    ● {dirtyFields.size} modifié(s)
                  </span>
                )}
              </div>

              <div style={{ flex: 1, overflow: "auto", padding: "12px 18px" }}>
                {/* Alerte doublon */}
                {hasDuplicate && (
                  <div style={{
                    background: "rgba(251,191,36,0.10)",
                    border: `1px solid ${C.amber}`,
                    borderRadius: 8,
                    padding: 10,
                    marginBottom: 12,
                    display: "flex", gap: 8, alignItems: "flex-start",
                  }}>
                    <AlertTriangle size={14} style={{ color: C.amber, flexShrink: 0, marginTop: 1 }} />
                    <div style={{ fontSize: 11, fontFamily: C.mono, color: C.text1, lineHeight: 1.5 }}>
                      <b>Client existant</b>{dupCustomerId ? ` #${dupCustomerId}` : ""}
                      {dupCustomerRef && <><br /><span style={{ color: C.text3 }}>Ref {dupCustomerRef}</span></>}
                      {dupKycStatus && <><br /><span style={{ color: C.text3 }}>KYC {dupKycStatus}</span></>}
                    </div>
                  </div>
                )}

                {/* Match score CBS ↔ OCR */}
                {matchScore && (
                  <MatchScorePanel score={matchScore} />
                )}

                {/* Champs */}
                {Object.keys(FIELD_LABELS).map(key => {
                  const fm = matchScore?.fields.find(f => f.field === key);
                  return (
                    <FieldInput
                      key={key}
                      label={FIELD_LABELS[key]!}
                      value={fields[key] ?? ""}
                      required={REQUIRED_FIELDS.includes(key)}
                      dirty={dirtyFields.has(key)}
                      error={REQUIRED_FIELDS.includes(key) && !fields[key]?.trim()}
                      onChange={v => updateField(key, v)}
                      {...(fm ? { fieldMatch: fm } : {})}
                    />
                  );
                })}

                {/* Missing summary */}
                {validation.missing.length > 0 && (
                  <div style={{ marginTop: 12, fontSize: 10, fontFamily: C.mono, color: C.red }}>
                    Manquant : {validation.missing.map(k => FIELD_LABELS[k]).join(", ")}
                  </div>
                )}
              </div>

              {/* Actions footer */}
              <div style={{ padding: 14, borderTop: `1px solid ${C.border}`, display: "flex", gap: 6, flexDirection: "column" }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <Button variant="secondary" size="sm" onClick={saveFields} disabled={!dirty}>
                    Sauver (Ctrl+S)
                  </Button>
                  <Button
                    variant="gold" size="sm" icon={Send}
                    onClick={() => setShowFinalize(true)}
                    disabled={!validation.canFinalize || !!hasDuplicate}
                  >
                    Finaliser
                  </Button>
                </div>
                <Button variant="ghost" size="sm" icon={XCircle} onClick={() => abandonSession(active.sessionRef)}>
                  Abandonner session
                </Button>
              </div>
            </>
          )}
        </div>

      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 100,
          background: toast.type === "err" ? "rgba(248,113,113,0.15)"
                    : toast.type === "warn" ? "rgba(251,191,36,0.15)"
                    : "rgba(52,211,153,0.15)",
          border: `1px solid ${toast.type === "err" ? C.red : toast.type === "warn" ? C.amber : C.green}`,
          color: toast.type === "err" ? C.red : toast.type === "warn" ? C.amber : C.green,
          padding: "10px 14px",
          borderRadius: 10,
          fontSize: 12,
          fontFamily: C.mono,
          maxWidth: 380,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Modal finalize */}
      {showFinalize && active && (
        <FinalizeModal
          session={active}
          fields={fields}
          notes={notes}
          setNotes={setNotes}
          onConfirm={finalizeSession}
          onCancel={() => setShowFinalize(false)}
        />
      )}
    </AppLayout>
  );
}

// ─── Sous-composants ──────────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  flex: 1,
  padding: "3px 4px",
  background: C.bg,
  border: `1px solid ${C.border2}`,
  borderRadius: 4,
  fontSize: 10,
  fontFamily: C.mono,
  color: C.text2,
  outline: "none",
};

function SessionRow({
  session, active, onClick, onAbandon,
}: {
  session: EkycSession;
  active: boolean;
  onClick: () => void;
  onAbandon: () => void;
}) {
  const label = session.candidateFields?.nom
    ? `${session.candidateFields.nom} ${session.candidateFields.prenom ?? ""}`
    : session.sessionRef;
  const sub = session.candidateFields?.cin ?? session.sessionRef;
  return (
    <div
      onClick={onClick}
      style={{
        padding: "10px 14px",
        cursor: "pointer",
        borderLeft: `3px solid ${active ? C.teal : "transparent"}`,
        background: active ? C.hover : "transparent",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: 8,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: C.text1, fontFamily: C.sans, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {label}
        </div>
        <div style={{ fontSize: 10, color: C.text3, fontFamily: C.mono, marginTop: 2, display: "flex", gap: 6 }}>
          <span>{sub}</span>
          <span>·</span>
          <span>{CHANNEL_LABEL[session.channel]}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        <Badge label={STATUS_LABEL[session.status]} variant="status" />
        {!active && (
          <button
            onClick={e => { e.stopPropagation(); onAbandon(); }}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: C.text3, padding: 0 }}
            aria-label="Abandonner"
          >
            <Trash2 size={10} />
          </button>
        )}
      </div>
    </div>
  );
}

function ImageSide({
  label, uploaded, confidence, hotkey, uploading, inputRef, onUpload, isRetry,
}: {
  label: string;
  uploaded: boolean;
  confidence: number | null;
  hotkey: string;
  uploading: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onUpload: (file: File) => void;
  isRetry: boolean;
}) {
  return (
    <div style={{
      background: C.bg, border: `1px solid ${uploaded ? C.teal : C.border2}`,
      borderRadius: 10, padding: 12,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
      minHeight: 240,
    }}>
      <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: C.mono, fontSize: 10, color: C.text2, letterSpacing: 0.5 }}>
          {label}
        </span>
        {uploaded && confidence !== null && (
          <span style={{
            fontFamily: C.mono, fontSize: 10,
            color: confidence >= 70 ? C.green : confidence >= 40 ? C.amber : C.red,
          }}>
            OCR {confidence}/100
          </span>
        )}
      </div>

      <div style={{
        flex: 1, width: "100%",
        border: `2px dashed ${uploaded ? C.teal : C.border2}`,
        borderRadius: 8,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 8, padding: 20,
        background: uploaded ? "rgba(20,184,166,0.05)" : "transparent",
      }}>
        {uploading ? (
          <>
            <Loader2 size={28} style={{ color: C.teal, animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>OCR en cours…</span>
          </>
        ) : uploaded ? (
          <>
            <CheckCircle2 size={28} style={{ color: C.teal }} />
            <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text2 }}>Uploadé</span>
          </>
        ) : (
          <>
            <Upload size={22} style={{ color: C.text3 }} />
            <span style={{ fontSize: 10, fontFamily: C.mono, color: C.text3 }}>
              Glissez fichier ou clic bas
            </span>
          </>
        )}
      </div>

      <label style={{ width: "100%" }}>
        <Button
          variant={uploaded ? "secondary" : "gold"}
          size="sm"
          icon={isRetry ? RefreshCw : Camera}
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          fullWidth
        >
          {uploading ? "…" : isRetry ? `Recharger (${hotkey})` : `Uploader (${hotkey})`}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = ""; // reset pour retry same file
          }}
        />
      </label>
    </div>
  );
}

function FieldInput({
  label, value, required, dirty, error, onChange, fieldMatch,
}: {
  label:       string;
  value:       string;
  required:    boolean;
  dirty:       boolean;
  error:       boolean;
  onChange:    (v: string) => void;
  fieldMatch?: FieldMatch;
}) {
  const matchColor =
    !fieldMatch                     ? undefined :
    fieldMatch.status === "MATCH"   ? C.green   :
    fieldMatch.status === "PARTIAL" ? C.amber   :
                                       C.red;
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{
        display: "flex", justifyContent: "space-between",
        fontSize: 10, fontFamily: C.mono, color: C.text3, marginBottom: 3,
      }}>
        <span>
          {label}
          {required && <span style={{ color: C.red, marginLeft: 3 }}>*</span>}
        </span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {fieldMatch && (
            <span
              title={`CBS: ${fieldMatch.cbs}\nOCR: ${fieldMatch.ocr}`}
              style={{ color: matchColor, fontSize: 9 }}
            >
              CBS {fieldMatch.score}%
            </span>
          )}
          {dirty && <span style={{ color: C.amber }}>●</span>}
        </span>
      </label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "6px 8px",
          background: C.bg,
          border: `1px solid ${error ? C.red : dirty ? C.amber : matchColor ?? C.border2}`,
          borderRadius: 5,
          fontSize: 12,
          fontFamily: C.sans,
          color: C.text1,
          outline: "none",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

function MatchScorePanel({ score }: { score: MatchScore }) {
  const color =
    score.verdict === "MATCH"     ? C.green :
    score.verdict === "REVIEW"    ? C.amber :
                                     C.red;
  const bg =
    score.verdict === "MATCH"     ? "rgba(52,211,153,0.08)"  :
    score.verdict === "REVIEW"    ? "rgba(251,191,36,0.08)"  :
                                     "rgba(248,113,113,0.10)";
  return (
    <div style={{
      background: bg,
      border: `1px solid ${color}`,
      borderRadius: 8,
      padding: 10,
      marginBottom: 12,
      fontSize: 11,
      fontFamily: C.mono,
      color: C.text1,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>
          <b style={{ color }}>Match CBS ↔ OCR : {score.verdict}</b>
        </span>
        <span style={{ color, fontSize: 14, fontWeight: 700 }}>
          {score.score}/100
        </span>
      </div>
      {score.criticalMismatch.length > 0 && (
        <div style={{ marginTop: 4, color: C.red, fontSize: 10 }}>
          ⚠ Champs critiques divergents : {score.criticalMismatch.join(", ")}
        </div>
      )}
    </div>
  );
}

function EmptyPanel() {
  return (
    <div style={{
      flex: 1,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 12, color: C.text3, textAlign: "center", padding: 40,
    }}>
      <FileText size={40} style={{ opacity: 0.4 }} />
      <div style={{ fontSize: 13, fontFamily: C.sans, color: C.text2 }}>
        Aucune session sélectionnée
      </div>
      <div style={{ fontSize: 11, fontFamily: C.mono, color: C.text3, lineHeight: 1.5 }}>
        Sélectionne une session à gauche<br />ou <b style={{ color: C.teal }}>N</b> pour en créer une.
      </div>
    </div>
  );
}

function QualityStrip({ checks }: { checks: Record<string, unknown> }) {
  const entries = Object.entries(checks).slice(0, 4);
  if (entries.length === 0) return null;
  return (
    <div style={{
      padding: "8px 18px",
      borderTop: `1px solid ${C.border}`,
      background: C.bg,
      fontSize: 10,
      fontFamily: C.mono,
      color: C.text3,
      display: "flex",
      gap: 16,
      overflow: "auto",
    }}>
      <Zap size={11} style={{ color: C.text3, flexShrink: 0 }} />
      {entries.map(([k, v]) => {
        const val = typeof v === "object" && v !== null ? JSON.stringify(v).slice(0, 40) : String(v);
        return (
          <span key={k}><b style={{ color: C.text2 }}>{k}:</b> {val}</span>
        );
      })}
    </div>
  );
}

function FinalizeModal({
  session, fields, notes, setNotes, onConfirm, onCancel,
}: {
  session: EkycSession;
  fields: CandidateFields;
  notes: string;
  setNotes: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 12, padding: 24, minWidth: 440, maxWidth: 560,
        }}
      >
        <h3 style={{ fontFamily: C.sans, fontSize: 16, color: C.text1, margin: "0 0 12px" }}>
          Finaliser la session ?
        </h3>
        <p style={{ fontFamily: C.mono, fontSize: 11, color: C.text3, margin: "0 0 16px" }}>
          Un client sera créé dans le CBS avec les données ci-dessous.
        </p>

        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ fontFamily: C.mono, fontSize: 10, color: C.text3, marginBottom: 6 }}>
            Session {session.sessionRef}
          </div>
          <div style={{ fontFamily: C.sans, fontSize: 14, color: C.text1, fontWeight: 700 }}>
            {fields.nom} {fields.prenom}
          </div>
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.text2, marginTop: 4 }}>
            CIN {fields.cin} · Né(e) {fields.dateNaissance}
          </div>
        </div>

        <label style={{ fontFamily: C.mono, fontSize: 10, color: C.text3, display: "block", marginBottom: 4 }}>
          Notes (optionnel)
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="Commentaires agent…"
          style={{
            width: "100%", padding: 8,
            background: C.bg, border: `1px solid ${C.border2}`,
            borderRadius: 6, fontFamily: C.sans, fontSize: 12, color: C.text1,
            outline: "none", boxSizing: "border-box", resize: "vertical",
          }}
        />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <Button variant="secondary" onClick={onCancel}>Annuler</Button>
          <Button variant="gold" icon={Send} onClick={onConfirm}>Créer le client</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return "expiré";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}j`;
}
