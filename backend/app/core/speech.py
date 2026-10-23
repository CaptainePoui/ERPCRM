"""Transcription de la voix sur le serveur (TASK-055, 2026-10-23 ; Philippe : « rien ne sort de chez moi ») :
faster-whisper, modele large-v3-turbo. Mesure sur le serveur actuel (Xeon E5-2630 v2, sans AVX2 ni carte graphique) :
~30-40 s pour une phrase de 10 s (le modele traite toujours des fenetres de 30 s), ~1,3x la duree pour un long
enregistrement ; qualite excellente en francais quebecois (« Simple IP », numeros, « jours feries »). Le modele
« small » est 3x plus rapide mais se trompe (« Sainte-Plippee ») -- refuse. Sur le P720 (TASK-053, carte graphique)
la meme phrase prendra moins d'une seconde : SPEECH_DEVICE=cuda.

Une seule transcription a la fois par processus (le processeur est partage avec Zeko/Ollama) ; le modele se charge au
premier usage (~6 s) et reste en memoire."""
import asyncio
import logging
import os
import tempfile
import time

log = logging.getLogger(__name__)

MODEL = os.getenv("SPEECH_MODEL", "large-v3-turbo")
DEVICE = os.getenv("SPEECH_DEVICE", "cpu")
COMPUTE = os.getenv("SPEECH_COMPUTE", "int8" if DEVICE == "cpu" else "float16")
THREADS = int(os.getenv("SPEECH_THREADS", "8"))

_model = None
_lock = asyncio.Lock()


def _load():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        t = time.time()
        _model = WhisperModel(MODEL, device=DEVICE, compute_type=COMPUTE, cpu_threads=THREADS)
        log.info("Modele de transcription %s charge en %.1f s", MODEL, time.time() - t)
    return _model


def _transcribe_file(path: str) -> dict:
    model = _load()
    t = time.time()
    segments, info = model.transcribe(path, language="fr", beam_size=1, vad_filter=True)
    text = " ".join(s.text.strip() for s in segments).strip()
    return {"text": text, "duration": round(info.duration, 1), "seconds": round(time.time() - t, 1)}


async def transcribe(audio: bytes, suffix: str = ".webm") -> dict:
    """Texte d'un enregistrement (webm/ogg/wav/mp4… decode par PyAV) ; {text, duration, seconds}."""
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(audio)
        path = f.name
    try:
        async with _lock:
            return await asyncio.to_thread(_transcribe_file, path)
    finally:
        os.unlink(path)
