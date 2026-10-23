"""Voix reconnues (TASK-055 etape 3, 2026-10-23) : empreinte d'une voix (modele WeSpeaker ResNet34, sherpa-onnx,
sur le serveur -- rien ne sort). Mesure sur les echantillons de Philippe : meme voix 0,62-0,83, autre voix 0,34 ->
seuil 0,5. L'empreinte d'un utilisateur s'enregistre une fois (« Ma voix ») ; celle d'un contact s'apprend quand
Philippe dit qui parle dans une conversation, et s'affine a chaque fois."""
import subprocess
from pathlib import Path

import numpy as np

MODEL = Path(__file__).resolve().parents[2] / "ai_models" / "wespeaker_en_voxceleb_resnet34_LM.onnx"
RATE = 16000
SAME = 0.5            # au-dessus : meme personne
MIN_SECONDS = 1.5     # une phrase plus courte est elargie autour de son centre pour son empreinte

_extractor = None


def _ex():
    global _extractor
    if _extractor is None:
        import sherpa_onnx
        _extractor = sherpa_onnx.SpeakerEmbeddingExtractor(
            sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=str(MODEL), num_threads=4))
    return _extractor


def load_audio(path: str) -> np.ndarray:
    """Son mono 16 kHz en float32 (ffmpeg lit webm/ogg/mp4/wav)."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(RATE), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def _norm(v) -> np.ndarray:
    v = np.asarray(v, dtype=np.float32)
    n = float(np.linalg.norm(v))
    return v / n if n else v


def embed(samples: np.ndarray) -> np.ndarray:
    s = _ex().create_stream()
    s.accept_waveform(RATE, samples)
    s.input_finished()
    return _norm(_ex().compute(s))


def embed_span(audio: np.ndarray, start: float, end: float) -> np.ndarray | None:
    if end - start < MIN_SECONDS:
        mid = (start + end) / 2
        start, end = mid - MIN_SECONDS / 2, mid + MIN_SECONDS / 2
    a = audio[max(0, int(start * RATE)):max(0, int(end * RATE))]
    return embed(a) if len(a) >= RATE // 2 else None


def embed_whole(audio: np.ndarray, window: float = 3.0) -> np.ndarray | None:
    """Empreinte d'un long echantillon : moyenne de fenetres de 3 s (sans les silences presque muets)."""
    step = int(window * RATE)
    parts = [embed(audio[i:i + step]) for i in range(0, max(0, len(audio) - step // 2), step)
             if np.abs(audio[i:i + step]).mean() > 0.003]
    return _norm(np.mean(parts, axis=0)) if parts else None


def similarity(a, b) -> float:
    return float(np.dot(_norm(a), _norm(b)))


def merge(old, samples: int, new: list) -> tuple[list[float], int]:
    """Empreinte affinee : moyenne ponderee de l'ancienne et des nouvelles phrases."""
    total = _norm(old) * samples + np.sum([_norm(v) for v in new], axis=0)
    return _norm(total).tolist(), samples + len(new)
