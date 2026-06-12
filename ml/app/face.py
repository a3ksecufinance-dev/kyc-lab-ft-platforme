"""
Comparaison faciale locale — InsightFace (ArcFace)

Aucun appel externe : les modèles sont téléchargés une seule fois au démarrage
puis stockés dans /app/models/insightface/.

Modèles disponibles :
  buffalo_sc  — CPU-optimisé, ~100 MB, AUC ~0.92  (recommandé POC)
  buffalo_l   — précision maximale, ~300 MB, AUC ~0.97  (recommandé production)

Seuils de décision (similarité cosinus 0-1) :
  >= face_pass_threshold   → PASS    (correspondance confirmée)
  >= face_review_threshold → REVIEW  (correspondance probable, révision manuelle)
   < face_review_threshold → FAIL    (visages différents)
"""

import base64
import io
import threading
import structlog
import numpy as np

log = structlog.get_logger("face")

# ─── Singleton du modèle (chargement lazy thread-safe) ──────────────────────

_lock        = threading.Lock()
_face_app    = None   # insightface.app.FaceAnalysis
_model_ready = False


def init_face_model(model_name: str, models_dir: str) -> bool:
    """
    Charge le modèle InsightFace au démarrage du service.
    Retourne True si succès, False sinon (le service continue sans biométrie).
    """
    global _face_app, _model_ready

    with _lock:
        if _model_ready:
            return True

        try:
            import insightface
            from insightface.app import FaceAnalysis

            log.info("Chargement modèle InsightFace", model=model_name)

            app = FaceAnalysis(
                name=model_name,
                root=models_dir,
                providers=["CPUExecutionProvider"],
            )
            # det_size=(320, 320) = rapide sur CPU, suffisant pour selfies
            app.prepare(ctx_id=0, det_size=(320, 320))

            _face_app    = app
            _model_ready = True
            log.info("InsightFace prêt", model=model_name)
            return True

        except ImportError:
            log.warning("insightface non installé — biométrie locale indisponible")
            return False
        except Exception as e:
            log.error("Erreur chargement InsightFace", error=str(e))
            return False


def is_face_model_ready() -> bool:
    return _model_ready


# ─── Décodage image ──────────────────────────────────────────────────────────

def _decode_image(b64_data: str):
    """Décode un base64 image → numpy array BGR (format OpenCV)."""
    import cv2

    raw   = base64.b64decode(b64_data)
    arr   = np.frombuffer(raw, dtype=np.uint8)
    img   = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return img


# ─── Extraction embedding ────────────────────────────────────────────────────

def _get_embedding(img_bgr) -> np.ndarray | None:
    """
    Extrait l'embedding ArcFace du visage le plus grand dans l'image.
    Retourne None si aucun visage détecté.
    """
    if _face_app is None:
        return None

    faces = _face_app.get(img_bgr)
    if not faces:
        return None

    # Prendre le visage avec la plus grande bbox (cas selfie : visage centré)
    best = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
    return best.embedding


# ─── Similarité cosinus ──────────────────────────────────────────────────────

def _cosine_similarity(emb1: np.ndarray, emb2: np.ndarray) -> float:
    norm1 = np.linalg.norm(emb1)
    norm2 = np.linalg.norm(emb2)
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return float(np.dot(emb1, emb2) / (norm1 * norm2))


# ─── API publique ────────────────────────────────────────────────────────────

class FaceCompareResult:
    def __init__(
        self,
        status: str,
        similarity: float,
        liveness_score: int,
        detail: str,
        selfie_detected: bool,
        doc_detected: bool,
    ):
        self.status          = status           # PASS | REVIEW | FAIL
        self.similarity      = similarity       # 0.0 – 1.0
        self.liveness_score  = liveness_score   # 0 – 100
        self.detail          = detail
        self.selfie_detected = selfie_detected
        self.doc_detected    = doc_detected


def compare_faces(
    selfie_b64: str,
    doc_photo_b64: str | None,
    pass_threshold: float   = 0.40,
    review_threshold: float = 0.25,
) -> FaceCompareResult:
    """
    Compare le selfie avec la photo du document.

    Si doc_photo_b64 est None → pas de matching facial possible → REVIEW systématique.
    Si InsightFace non initialisé → REVIEW systématique.
    """
    if not _model_ready or _face_app is None:
        return FaceCompareResult(
            status="REVIEW",
            similarity=0.0,
            liveness_score=50,
            detail="Modèle InsightFace non disponible — révision manuelle requise",
            selfie_detected=False,
            doc_detected=False,
        )

    try:
        # Décoder le selfie
        selfie_img = _decode_image(selfie_b64)
        if selfie_img is None:
            return FaceCompareResult(
                status="FAIL",
                similarity=0.0,
                liveness_score=0,
                detail="Impossible de décoder l'image selfie",
                selfie_detected=False,
                doc_detected=False,
            )

        emb_selfie = _get_embedding(selfie_img)
        if emb_selfie is None:
            return FaceCompareResult(
                status="FAIL",
                similarity=0.0,
                liveness_score=0,
                detail="Aucun visage détecté dans le selfie",
                selfie_detected=False,
                doc_detected=False,
            )

        # Pas de photo document → on ne peut pas comparer, REVIEW
        if not doc_photo_b64:
            return FaceCompareResult(
                status="REVIEW",
                similarity=0.0,
                liveness_score=60,
                detail="Visage selfie détecté — aucune photo document fournie pour comparaison",
                selfie_detected=True,
                doc_detected=False,
            )

        # Décoder la photo document
        doc_img = _decode_image(doc_photo_b64)
        if doc_img is None:
            return FaceCompareResult(
                status="REVIEW",
                similarity=0.0,
                liveness_score=60,
                detail="Impossible de décoder la photo document — révision manuelle",
                selfie_detected=True,
                doc_detected=False,
            )

        emb_doc = _get_embedding(doc_img)
        if emb_doc is None:
            return FaceCompareResult(
                status="REVIEW",
                similarity=0.0,
                liveness_score=60,
                detail="Aucun visage détecté dans la photo document — révision manuelle",
                selfie_detected=True,
                doc_detected=False,
            )

        # Calcul similarité cosinus
        sim = _cosine_similarity(emb_selfie, emb_doc)

        # Décision
        if sim >= pass_threshold:
            status         = "PASS"
            liveness_score = min(100, int(sim * 120))   # ex: 0.45 → 54, 0.80 → 96
            detail         = f"Correspondance faciale confirmée (similarité: {sim:.3f})"
        elif sim >= review_threshold:
            status         = "REVIEW"
            liveness_score = min(80, int(sim * 100))
            detail         = f"Correspondance incertaine — révision manuelle recommandée (similarité: {sim:.3f})"
        else:
            status         = "FAIL"
            liveness_score = int(sim * 60)
            detail         = f"Visages différents — onboarding refusé (similarité: {sim:.3f})"

        log.info(
            "Comparaison faciale",
            status=status,
            similarity=round(sim, 4),
            selfie_detected=True,
            doc_detected=True,
        )

        return FaceCompareResult(
            status=status,
            similarity=round(sim, 4),
            liveness_score=liveness_score,
            detail=detail,
            selfie_detected=True,
            doc_detected=True,
        )

    except Exception as e:
        log.error("Erreur comparaison faciale", error=str(e))
        return FaceCompareResult(
            status="REVIEW",
            similarity=0.0,
            liveness_score=0,
            detail=f"Erreur technique ({str(e)[:200]}) — révision manuelle requise",
            selfie_detected=False,
            doc_detected=False,
        )
