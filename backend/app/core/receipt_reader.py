"""Lecture des recus et factures deposes (TASK-044.1, 2026-10-07, demande de Philippe : « je dépose des
zip, des pdf, des jpeg ou n'importe quoi d'autre, l'IA les analyse et me fait les dépenses »).

Etapes (services/receipt_poller.py) :
1. Texte : PDF numerique -> pdftotext ; PDF numerise ou image -> Tesseract (francais + anglais).
2. IA locale (texte seulement) : fournisseur, date, numero, lignes (6 classes + nom de l'article en note),
   sous-total, TPS, TVQ, total, compte de depense.
3. Programme : les lignes donnent le sous-total (ou le total si prix taxes incluses), TPS = 5 % et TVQ =
   9,975 % des lignes taxables (a 3 cents pres : arrondis des caisses), sous-total + taxes = total.
   Tout est vert -> la depense est creee avec les taxes REELLEMENT payees (celles du recu) ; sinon le recu
   attend « A verifier » avec la lecture de l'IA pre-remplie.
Les montants viennent du recu ; l'IA ne fait que les lire, le programme les controle.
"""
import json
import re
import shutil
import subprocess
import tempfile
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

import httpx

from app.core.config import settings
from app.models.purchases import LINE_CLASSES

C = Decimal("0.01")
TAXABLE_CLASSES = {"materiel_taxable", "service_taxable", "repas_representation"}
NON_TAXABLE_CLASSES = {"materiel_non_taxable", "service_non_taxable", "assurance", "frais_bancaires", "salaires_commissions", "versement_gouvernement"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".gif", ".webp"}


class ReadError(Exception):
    pass


def _run(cmd: list[str], timeout: int = 300) -> str:
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise ReadError(f"{cmd[0]} : {r.stderr.strip()[:200]}")
    return r.stdout


def _ocr_image(path: Path) -> str:
    """Photo redressee (orientation du telephone), en gris, contrastee, agrandie si petite : sur un recu
    de test, « 19.99 » etait lu « 13.95 » sans ce pretraitement, et juste avec."""
    from PIL import Image, ImageOps
    with tempfile.TemporaryDirectory() as tmp:
        try:
            im = ImageOps.exif_transpose(Image.open(path)).convert("L")
        except Exception as e:
            raise ReadError(f"Image illisible ({e})")
        if max(im.size) < 2000:
            im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
        im = ImageOps.autocontrast(im)
        prepared = Path(tmp) / "page.png"
        im.save(prepared)
        return _run(["tesseract", str(prepared), "stdout", "-l", "fra+eng", "--psm", "6"])


def extract_text(path: Path) -> tuple[str, str]:
    """(texte, methode). PDF : texte numerique d'abord, OCR page par page s'il est vide."""
    ext = path.suffix.lower()
    if ext == ".pdf":
        text = _run(["pdftotext", "-layout", str(path), "-"])
        if len(re.sub(r"\s", "", text)) >= 40:
            return text, "pdf"
        with tempfile.TemporaryDirectory() as tmp:
            _run(["pdftoppm", "-r", "300", "-png", str(path), f"{tmp}/page"], timeout=600)
            pages = sorted(Path(tmp).glob("page*.png"))[:10]
            return "\n\n".join(_ocr_image(p) for p in pages), "ocr"
    if ext in IMAGE_EXT:
        return _ocr_image(path), "ocr"
    if ext in (".txt", ".csv", ".eml", ".html", ".htm"):
        return path.read_text(errors="ignore"), "texte"
    raise ReadError(f"Format non lu ({ext or 'sans extension'}) : PDF, image (JPEG, PNG…) ou texte")


def compact(text: str) -> str:
    """Texte « mis en page » (pdftotext -layout) : les longues suites d'espaces deviennent deux espaces
    -- une facture Bell de 19 000 caracteres tient alors en entier (avant : coupee a 7 000, totaux perdus)."""
    lines = [re.sub(r"[ \t]{3,}", "  ", l).rstrip() for l in text.splitlines()]
    return "\n".join(l for l in lines if l.strip())


def _system_prompt(categories: list[str], vendors: list[str]) -> str:
    classes = ", ".join(f"« {k} » ({v})" for k, v in LINE_CLASSES.items())
    return (
        "Tu lis le texte d'un reçu ou d'une facture d'achat reçue par l'entreprise Simple IP inc. (Québec) — texte parfois mal lu par OCR. "
        "Simple IP est le CLIENT (« Vendu à », « Facturé à ») : ce n'est jamais le fournisseur. Le fournisseur est l'entreprise qui émet la facture "
        "(son nom, son adresse, son site web ou son courriel en tête de facture).\n"
        "Factures de télécommunications (Bell, Vidéotron, Rogers…) : la dépense est celle de la PÉRIODE COURANTE (« Total du mois courant », "
        "« Nouveaux frais »), jamais le solde antérieur, les paiements reçus ni le « montant total dû ». Les réductions et crédits sont des lignes "
        "négatives. Un forfait, un service ou des frais mensuels sont des services (pas du matériel) ; un paiement d'appareil est du matériel.\n"
        f"Classes possibles pour chaque ligne : {classes}. Matériel = produit, pièce, équipement ; service = main-d'œuvre, "
        "abonnement, logiciel en ligne, télécommunication. Une ligne est taxable si la TPS/TVQ s'applique à elle ; "
        "si le reçu n'a aucune taxe, toutes les lignes sont non taxables. Assurance = prime d'assurance (pas de TPS/TVQ). "
        "Frais de fournisseur = frais facturés par un fournisseur (livraison, frais de service). "
        "Frais bancaires et de carte = frais de banque ou de traitement de cartes (pas de taxes). "
        "Repas et représentation = restaurant, repas d'affaires, cadeaux à des clients. "
        "Salaires, commissions et sous-traitants = rémunération d'une personne. "
        "Versement au gouvernement = paiement à Revenu Québec ou à l'ARC (taxes, impôts, retenues).\n"
        f"Comptes de dépense possibles (choisis le plus juste, nom EXACT) : {json.dumps(categories, ensure_ascii=False)}\n"
        + (f"Fournisseurs déjà connus (réutilise le nom exact si c'est l'un d'eux) : {json.dumps(vendors[:150], ensure_ascii=False)}\n" if vendors else "")
        + "Recopie les montants tels qu'imprimés (ne calcule rien, ne devine pas un montant illisible : mets null). "
        "Le nom de l'article va dans « description ». Date au format AAAA-MM-JJ.\n"
        "Réponds UNIQUEMENT en JSON : {\"fournisseur\": str|null, \"date\": str|null, \"numero\": str|null, "
        "\"lignes\": [{\"description\": str, \"classe\": str, \"taxable\": bool, \"montant\": number|null}], "
        "\"prix_taxes_incluses\": bool, \"sous_total\": number|null, \"tps\": number|null, \"tvq\": number|null, "
        "\"total\": number|null, \"compte\": str|null}"
    )


async def ai_extract(text: str, categories: list[str], vendors: list[str], filename: str = "", examples: list[dict] | None = None) -> dict:
    """examples : lectures deja validees (par le programme ou par Philippe) de factures du meme fournisseur --
    l'IA « apprend par l'exemple » la structure de ses factures (lignes, classes, compte)."""
    if not settings.LOCAL_AI_URL:
        raise ReadError("IA locale non configurée (LOCAL_AI_URL)")
    user = f"Nom du fichier (indice) : {filename}\n" if filename else ""
    for ex in (examples or [])[:2]:
        user += ("Exemple VALIDÉ d'une facture précédente du même fournisseur (même structure attendue ; les montants "
                 "changent, recopie ceux du nouveau reçu) :\n" + json.dumps(ex, ensure_ascii=False) + "\n")
    user += "Texte du reçu :\n" + compact(text)[:24000]
    async with httpx.AsyncClient(timeout=1200) as client:
        r = await client.post(f"{settings.LOCAL_AI_URL.rstrip('/')}/chat/completions", json={
            "model": settings.LOCAL_AI_MODEL, "temperature": 0, "reasoning_effort": "low",
            "messages": [{"role": "system", "content": _system_prompt(categories, vendors)},
                         {"role": "user", "content": user}]})
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"]
    m = re.search(r"\{.*\}", content, re.S)
    if not m:
        raise ReadError("Réponse de l'IA illisible")
    return json.loads(m.group(0))


def money(v) -> Decimal | None:
    if v is None or v == "":
        return None
    try:
        return Decimal(str(v).replace(",", ".").replace("$", "").replace(" ", "")).quantize(C)
    except InvalidOperation:
        return None


def normalize(x: dict) -> dict:
    """Nettoie la lecture de l'IA (classes connues, montants en decimal, taxable coherent avec la classe)."""
    lines = []
    for l in x.get("lignes") or []:
        cls = l.get("classe") if l.get("classe") in LINE_CLASSES else ("materiel_taxable" if l.get("taxable") else "materiel_non_taxable")
        taxable = cls in TAXABLE_CLASSES or (cls not in NON_TAXABLE_CLASSES and bool(l.get("taxable")))
        lines.append({"description": (l.get("description") or "").strip()[:500], "classe": cls, "taxable": taxable,
                      "montant": money(l.get("montant"))})
    d = None
    try:
        d = date.fromisoformat((x.get("date") or "")[:10])
    except ValueError:
        pass
    return {"fournisseur": (x.get("fournisseur") or "").strip()[:255] or None, "date": d, "numero": (x.get("numero") or "").strip()[:100] or None,
            "lignes": lines, "prix_taxes_incluses": bool(x.get("prix_taxes_incluses")),
            "sous_total": money(x.get("sous_total")), "tps": money(x.get("tps")) or Decimal("0.00"),
            "tvq": money(x.get("tvq")) or Decimal("0.00"), "total": money(x.get("total")), "compte": x.get("compte")}


def check(r: dict) -> list[dict]:
    """Verifications du programme : [{ok, label}] -- toutes vertes = depense creee automatiquement."""
    out = []
    def add(ok, label):
        out.append({"ok": bool(ok), "label": label})
    lines, total, tps, tvq = r["lignes"], r["total"], r["tps"], r["tvq"]
    if r.get("correction"):
        add(False, r["correction"])
    add(r["fournisseur"], "Fournisseur trouvé")
    add(r["date"] and r["date"] <= date.today(), "Date trouvée")
    add(total and total > 0, "Total trouvé")
    add(lines and all(l["montant"] is not None for l in lines), "Montant de chaque ligne lu")
    if not (total and lines and all(l["montant"] is not None for l in lines)):
        return out
    s = sum((l["montant"] for l in lines), Decimal("0"))
    taxable = sum((l["montant"] for l in lines if l["taxable"]), Decimal("0"))
    if r["prix_taxes_incluses"]:
        add(abs(s - total) <= Decimal("0.02"), f"Les lignes ({s} $) donnent le total ({total} $)")
        base = taxable / (1 + Decimal("0.14975"))
    else:
        sub = r["sous_total"] if r["sous_total"] is not None else s
        add(abs(s - sub) <= Decimal("0.02"), f"Les lignes ({s} $) donnent le sous-total ({sub} $)")
        add(abs(sub + tps + tvq - total) <= Decimal("0.02"), f"Sous-total + TPS + TVQ = total ({total} $)")
        base = taxable
    if tps or tvq:
        add(taxable > 0, "Lignes taxables présentes (le reçu a des taxes)")
        add(abs(base * Decimal("0.05") - tps) <= Decimal("0.03"), f"TPS {tps} $ = 5 % des lignes taxables")
        add(abs(base * Decimal("0.09975") - tvq) <= Decimal("0.03"), f"TVQ {tvq} $ = 9,975 % des lignes taxables")
    else:
        add(taxable == 0, "Aucune taxe sur le reçu : lignes non taxables")
    return out


_TAX_LINE = re.compile(r"(?i)\b(tps|tvq|tvp|tvh|gst|qst|hst|taxes?)\b")


def aggregate_lines(lines: list[dict]) -> list[dict]:
    """Une ligne par classe (Philippe, 2026-10-07 : « je ne veux pas le détail de tous les articles ; la
    partie taxable et la partie non taxable, mais pas chaque article »). L'IA lit quand meme chaque
    article -- c'est ce qui permet de verifier les totaux -- mais la depense ne garde que les sommes."""
    out: dict = {}
    for l in lines:
        k = (l["classe"], l["taxable"])
        if k not in out:
            out[k] = {"description": None, "classe": l["classe"], "taxable": l["taxable"], "montant": Decimal("0.00")}
        out[k]["montant"] += l["montant"] or 0
    return [l for l in out.values() if l["montant"] != 0]


def settle(r: dict) -> dict:
    """Decide par le calcul (pas par l'IA) si les prix sont hors taxes ou taxes incluses ; si UNE seule
    ligne empeche les lignes de donner le sous-total et que le montant manquant rend aussi la TPS/TVQ
    exactes, propose la correction (a confirmer -- jamais appliquee sans verification)."""
    # Les montants de TPS/TVQ ne sont pas des articles (l'IA les ajoute parfois comme lignes)
    tax_amounts = {r["tps"], r["tvq"]} - {None, Decimal("0.00")}
    r["lignes"] = [l for l in r["lignes"] if not (l["montant"] in tax_amounts and _TAX_LINE.search(l["description"] or ""))]
    lines = r["lignes"]
    # Facture deja payee (« Solde à payer : 0,00 ») : le total de la facture = sous-total + taxes
    if r["sous_total"] and (not r["total"] or r["total"] < r["sous_total"]):
        r["total"] = r["sous_total"] + (r["tps"] or 0) + (r["tvq"] or 0)
    if not lines or any(l["montant"] is None for l in lines) or not r["total"]:
        return r
    s = sum((l["montant"] for l in lines), Decimal("0"))
    tax = (r["tps"] or 0) + (r["tvq"] or 0)
    # Credits et reductions (facture de telecom) : si les taxes sont exactement celles des lignes, le
    # sous-total et le total lus « avant credits » sont remplaces par ceux des lignes -- a confirmer
    taxable = sum((l["montant"] for l in lines if l["taxable"]), Decimal("0"))
    if (tax and taxable > 0 and abs(taxable * Decimal("0.05") - (r["tps"] or 0)) <= Decimal("0.02")
            and abs(taxable * Decimal("0.09975") - (r["tvq"] or 0)) <= Decimal("0.02")
            and abs(s + tax - r["total"]) > Decimal("0.02")):
        r["correction"] = (f"Total lu {r['total']} $ ; les lignes ({s} $) et les taxes ({tax} $) donnent {s + tax} $ "
                           f"(crédits ou réductions déduits) — corrigé, à confirmer")
        r["sous_total"], r["total"] = s, s + tax
        r["prix_taxes_incluses"] = False
        return r
    if r["sous_total"] is not None and abs(s - r["sous_total"]) <= Decimal("0.02"):
        r["prix_taxes_incluses"] = False
    elif abs(s - r["total"]) <= Decimal("0.02") and tax:
        r["prix_taxes_incluses"] = True
    elif r["sous_total"] is not None and abs(r["sous_total"] + tax - r["total"]) <= Decimal("0.02"):
        r["prix_taxes_incluses"] = False
        diff = r["sous_total"] - s
        fits = []
        for l in lines:
            fixed = (l["montant"] + diff).quantize(C)
            if fixed <= 0:
                continue
            taxable = sum((x["montant"] for x in lines if x["taxable"]), Decimal("0")) + (diff if l["taxable"] else 0)
            if not tax or (abs(taxable * Decimal("0.05") - (r["tps"] or 0)) <= Decimal("0.03")
                           and abs(taxable * Decimal("0.09975") - (r["tvq"] or 0)) <= Decimal("0.03")):
                fits.append((l, fixed))
        if len(fits) == 1:      # une seule ligne peut expliquer l'ecart : correction proposee (a confirmer)
            l, fixed = fits[0]
            r["correction"] = (f"Ligne « {l['description']} » lue {l['montant']} $ : le calcul donne {fixed} $ "
                               f"(sous-total et taxes exacts) — corrigée, à confirmer")
            l["montant"] = fixed
        elif fits:              # plusieurs lignes possibles : on ne devine pas
            r["correction"] = f"Les lignes ne donnent pas le sous-total (écart {diff} $) : une ligne a été mal lue, à corriger"
    return r


def to_json(r: dict) -> str:
    def conv(v):
        if isinstance(v, Decimal):
            return float(v)
        if isinstance(v, date):
            return v.isoformat()
        return v
    return json.dumps({k: ([{kk: conv(vv) for kk, vv in l.items()} for l in v] if k == "lignes" else conv(v)) for k, v in r.items()}, ensure_ascii=False)


def from_json(s: str) -> dict:
    x = json.loads(s)
    return normalize({**x, "lignes": [{**l, "classe": l.get("classe")} for l in x.get("lignes") or []]})
