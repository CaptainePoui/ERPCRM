"""Verification de la lecture de la voix (TASK-055, 2026-10-24 ; Philippe : « prends le temps de le reconnaitre, je
reviendrai dans Voix, il y aura un bouton Vérifier qui fera apparaitre le texte reconnu et je pourrai cliquer sur les
mots gris pour les enregistrer »). Le son de la lecture est transcrit en arriere-plan (meme moteur que les
conversations, lent sans carte graphique), puis compare au texte : un booleen par mot de chaque phrase. Le son est
efface une fois verifie ; seule l'empreinte et le resultat restent."""
import asyncio
import logging
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

from sqlalchemy import select, update

from app.core import speech
from app.core.database import AsyncSessionLocal
from app.models.conversation import VoiceCheck, VoicePrint

log = logging.getLogger(__name__)

DIR = Path(__file__).resolve().parents[2] / "storage" / "voices"

# Une phrase par ligne, lue en ~1 min ; le meme texte sert a l'ecran et a la verification
READ_LINES = [
    "Bonjour, ici c'est moi qui parle.",
    "J'enregistre ma voix pour qu'ERPCRM la reconnaisse dans les conversations avec les clients.",
    "Je lis ce texte lentement, comme je parle d'habitude au téléphone ou chez un client.",
    "Le technicien passera jeudi matin vers dix heures pour vérifier le portier, le poste de la réception et la boîte vocale.",
    "Si le problème revient, rappelez-nous au service technique.",
    "Pour la facture du mois dernier, je vais vérifier le paiement reçu par Interac.",
    "Je vous envoie un reçu par courriel dès aujourd'hui.",
    "Le nouveau téléphone sera installé lundi.",
    "Je reviendrai mardi après-midi pour configurer les postes et montrer comment transférer un appel.",
    "Merci et bonne journée.",
]
NUMBERS = {"10": "dix", "10h": "dix heures"}     # Whisper ecrit parfois les nombres en chiffres


def path_of(check: VoiceCheck) -> Path:
    return DIR / f"{check.id}{check.suffix}"


def save(check: VoiceCheck, data: bytes) -> None:
    DIR.mkdir(parents=True, exist_ok=True)
    path_of(check).write_bytes(data)


def remove_file(check: VoiceCheck) -> None:
    path_of(check).unlink(missing_ok=True)


def tokens(text: str) -> list[str]:
    """Mots comparables : minuscules, sans accents ni ponctuation, « c'est » -> « c », « est »."""
    t = unicodedata.normalize("NFD", text.lower())
    t = "".join(ch for ch in t if unicodedata.category(ch) != "Mn")
    out = []
    for w in re.findall(r"[a-z0-9]+", t):
        out += NUMBERS.get(w, w).split()
    return out


def _close(a: str, b: str) -> bool:
    return a == b or (len(a) > 3 and SequenceMatcher(None, a, b).ratio() >= 0.8)


def compare(lines: list[int], heard: str) -> dict[int, list[bool]]:
    """Pour chaque phrase demandee, un booleen par mot affiche (separe par des espaces) : entendu ou non."""
    expected, owner = [], []           # mots attendus a la suite, et (phrase, mot affiche) de chacun
    for li in lines:
        for wi, word in enumerate(READ_LINES[li].split(" ")):
            for tok in tokens(word):
                expected.append(tok)
                owner.append((li, wi))
    got = tokens(heard)
    hit = [False] * len(expected)
    for tag, i1, i2, j1, j2 in SequenceMatcher(None, expected, got, autojunk=False).get_opcodes():
        if tag == "equal":
            hit[i1:i2] = [True] * (i2 - i1)
        elif tag == "replace":         # mot mal transcrit mais proche (« reconnaisse » / « reconnaise »)
            for i in range(i1, i2):
                hit[i] = any(_close(expected[i], g) for g in got[j1:j2])
    result = {li: [True] * len(READ_LINES[li].split(" ")) for li in lines}
    for (li, wi), ok in zip(owner, hit):
        result[li][wi] = result[li][wi] and ok
    return result


async def _verify(check_id) -> None:
    async with AsyncSessionLocal() as db:
        check = await db.get(VoiceCheck, check_id)
        if not check:
            return
        try:
            heard = " ".join(w["word"] for w in (await speech.transcribe_segments(str(path_of(check))))["words"])
        except Exception:
            log.exception("Verification de voix echouee")
            check.status, check.error = "error", "Le son n'a pas pu être transcrit."
            await db.commit()
            return
        vp = await db.get(VoicePrint, check.voice_print_id)
        if not vp:                     # voix effacee pendant la verification
            remove_file(check)
            return
        lines = list(range(len(READ_LINES))) if check.line is None else [check.line]
        found = compare(lines, heard)
        old = vp.check_lines if vp.check_lines and len(vp.check_lines) == len(READ_LINES) else None
        new = [list(x) for x in old] if old else [[False] * len(l.split(" ")) for l in READ_LINES]
        for li, flags in found.items():
            # phrase relue : un mot deja reconnu le reste
            new[li] = [a or b for a, b in zip(new[li], flags)] if check.line is not None and old else flags
        vp.check_lines = new
        remove_file(check)
        await db.delete(check)
        await db.commit()


async def run_voice_check_poller():
    await asyncio.sleep(25)
    async with AsyncSessionLocal() as db:   # verification coupee par un redemarrage : elle reprend
        await db.execute(update(VoiceCheck).where(VoiceCheck.status == "transcribing").values(status="pending"))
        await db.commit()
    while True:
        try:
            async with AsyncSessionLocal() as db:
                cid = (await db.execute(select(VoiceCheck.id).where(VoiceCheck.status == "pending")
                                        .order_by(VoiceCheck.created_at).limit(1))).scalar_one_or_none()
                if cid:
                    await db.execute(update(VoiceCheck).where(VoiceCheck.id == cid).values(status="transcribing"))
                    await db.commit()
            if cid:
                await _verify(cid)
                continue
        except Exception:
            log.exception("Iteration des verifications de voix echouee")
        await asyncio.sleep(5)
