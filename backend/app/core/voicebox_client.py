"""Client pour le service Voicebox (TTS local, TASK-029) -- conteneur Docker
sur ce meme serveur (voir docker-compose.yml dans /home/simpleip/services/voicebox).
API confirmee en lisant le code source du backend Voicebox (pas de doc figee) :

- Les voix "pretes a l'emploi" (sans clonage, sans fichier audio de reference)
  sont les voix PRESET d'un moteur (ex: Kokoro) -- GET /profiles/presets/{engine},
  retourne voice_id/name/gender/language directement, PAS besoin d'un profil
  existant en base pour les lister.
- Mais /generate exige un profile_id (ligne en base) -- pour une voix preset,
  il faut d'abord creer (ou reutiliser) un profil qui pointe vers ce preset
  (voice_type=preset, preset_engine, preset_voice_id).
- POST /generate est ASYNCHRONE (enqueue un job, retourne tout de suite avec
  status="generating") -- il faut poller GET /history/{id} jusqu'a status
  completed/failed, puis recuperer l'audio via GET /audio/{id}.
- Pas d'auth (lie a 127.0.0.1 uniquement).

Seul le moteur Kokoro est expose ici (voix presets enumerable avec genre +
langue, sans clonage) -- "ff_siwis" est la SEULE voix francaise disponible
sur ce moteur (feminine). D'autres langues/genres necessiteraient soit un
autre moteur (qwen_custom_voice -- pas de francais), soit du clonage de voix
(fichier audio de reference, hors scope de cette premiere version)."""
import asyncio
import httpx
from app.core.config import settings

_POLL_INTERVAL = 1.0
_POLL_TIMEOUT = 120.0
PRESET_ENGINE = "kokoro"


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=30.0)


# Renommage d'affichage cote ERPCRM uniquement -- le nom technique Kokoro
# (ex: "Siwis") reste inchange dans Voicebox, on ne renomme que ce qui est
# montre a l'utilisateur (demande 2026-08-10 : "elle a une voix d'Arianne").
VOICE_DISPLAY_NAMES = {
    "ff_siwis": "Arianne",
}


async def list_voices() -> list[dict]:
    """Voix preset Kokoro (voice_id, name, gender, language) -- pas besoin
    qu'un profil existe deja en base pour les lister."""
    async with _client() as client:
        resp = await client.get(f"{settings.VOICEBOX_API_URL}/profiles/presets/{PRESET_ENGINE}")
        resp.raise_for_status()
        voices = resp.json()["voices"]
        for v in voices:
            if v["voice_id"] in VOICE_DISPLAY_NAMES:
                v["name"] = VOICE_DISPLAY_NAMES[v["voice_id"]]
        return voices


async def _get_or_create_profile(client: httpx.AsyncClient, voice_id: str, language: str) -> str:
    """Un profil Voicebox = une ligne en base pointant vers ce preset. On en
    cree un une seule fois par voix (nom stable), reutilise ensuite."""
    profile_name = f"preset-{PRESET_ENGINE}-{voice_id}"
    resp = await client.get(f"{settings.VOICEBOX_API_URL}/profiles")
    resp.raise_for_status()
    for p in resp.json():
        if p["name"] == profile_name:
            return p["id"]
    resp = await client.post(
        f"{settings.VOICEBOX_API_URL}/profiles",
        json={
            "name": profile_name,
            "language": language,
            "voice_type": "preset",
            "preset_engine": PRESET_ENGINE,
            "preset_voice_id": voice_id,
        },
    )
    resp.raise_for_status()
    return resp.json()["id"]


async def generate(text: str, voice_id: str, language: str = "fr") -> tuple[bytes, str]:
    """Lance une generation avec une voix preset Kokoro, attend qu'elle se
    termine (poll), retourne (contenu audio, nom de fichier). Leve
    TimeoutError si ca depasse _POLL_TIMEOUT, RuntimeError si Voicebox
    signale un echec de generation."""
    async with _client() as client:
        profile_id = await _get_or_create_profile(client, voice_id, language)

        resp = await client.post(
            f"{settings.VOICEBOX_API_URL}/generate",
            json={"profile_id": profile_id, "text": text, "language": language, "engine": PRESET_ENGINE},
        )
        resp.raise_for_status()
        generation_id = resp.json()["id"]

        elapsed = 0.0
        while elapsed < _POLL_TIMEOUT:
            await asyncio.sleep(_POLL_INTERVAL)
            elapsed += _POLL_INTERVAL
            status_resp = await client.get(f"{settings.VOICEBOX_API_URL}/history/{generation_id}")
            status_resp.raise_for_status()
            data = status_resp.json()
            if data["status"] == "completed":
                break
            if data["status"] == "failed":
                raise RuntimeError(data.get("error") or "Génération Voicebox échouée")
        else:
            raise TimeoutError("Génération Voicebox trop longue (timeout)")

        audio_resp = await client.get(f"{settings.VOICEBOX_API_URL}/audio/{generation_id}")
        audio_resp.raise_for_status()
        return audio_resp.content, f"{generation_id}.wav"
