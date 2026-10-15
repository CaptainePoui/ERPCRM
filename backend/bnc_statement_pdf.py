"""Lecture des releves de compte BNC en PDF (pdftotext -layout), en local, sans IA (TASK-042.7, 2026-10-15).

Format : « MM JJ  DESCRIPTION  [DEBIT|CREDIT]  SOLDE », « Periode du AAAA-MM-JJ au AAAA-MM-JJ », « SOLDE PRECEDENT ».
Le sens de chaque ligne (debit ou credit) est deduit du solde : solde - solde precedent = +/- montant, sinon erreur.
Controles : chaque ligne tombe sur le solde imprime ; nombre et total des debits/credits du releve (page de resume)
quand ils sont imprimes. L'enchainement des mois (solde de fermeture = solde precedent du mois suivant) est verifie
par l'appelant. Usage autonome : python3 bnc_statement_pdf.py <dossier> -> resume.
"""
import re
import subprocess
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

AMT = r"\d+(?:[  ]\d{3})*[.,]\d{2}(?:\s?-)?"     # 1234.56 | 12 674,99 | 24.00 - (negatif)
LINE = re.compile(r"^\s{0,10}(?:(\d{2})\s+)?(\d{2})\s{2,}(\S.*?)\s{2,}(" + AMT + r")(?:\s{2,}(" + AMT + r"))?\s*$")
PERIOD = re.compile(r"P[eé]riode du (\d{2,4})-(\d{2})-(\d{2,4}) au (\d{2,4})-(\d{2})-(\d{2,4})")
TOTALS = re.compile(r"TRANSACTIONS\s+D[EÉ]BIT\s+(\d+)\s+(" + AMT + r")\s+CR[EÉ]DIT\s+(\d+)\s+(" + AMT + r")")


def d(s: str) -> Decimal:
    s = s.strip()
    neg = s.endswith("-")
    s = s.rstrip("-").strip().replace(" ", "").replace(" ", "")
    if "," in s and "." not in s:
        s = s.replace(",", ".")
    s = s.replace(",", "")
    v = Decimal(s)
    return -v if neg else v


def _date(a, b, c) -> date:
    """AAAA-MM-JJ (avant 2025) ou JJ-MM-AAAA (depuis 2025)."""
    return date(int(a), int(b), int(c)) if len(a) == 4 else date(int(c), int(b), int(a))


OCR_LINE = re.compile(r"^(?:(\d{2})\s+)?(\d{2})\s+(\S.*?)\s+((?:\d{1,3}\s)?\d+,\d{2}(?:\s?-)?)(?:\s+((?:\d{1,3}\s)?\d+,\d{2}(?:\s?-)?))?$")


def _ocr_text(path) -> str:
    """Releve imprime avec une police sans table de caracteres (texte illisible) : OCR Tesseract, page par page."""
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdftoppm", "-r", "300", "-gray", str(path), f"{tmp}/p"], capture_output=True)
        pages = sorted(Path(tmp).glob("p-*.pgm"))
        txt = "\n".join(subprocess.run(["tesseract", str(pg), "-", "--psm", "6", "-l", "fra"], capture_output=True, text=True).stdout
                        for pg in pages)
    txt = re.sub(r"\bCP1(\d)", r"CPI\1", txt)          # confusions de l'OCR dans les references BNC
    txt = re.sub(r"\bV1(0\d{7})\b", r"VI\1", txt)
    # remet les colonnes : montants separes par 2 espaces, comme pdftotext -layout
    out = []
    for l in txt.split("\n"):
        m = OCR_LINE.match(l.strip())
        out.append(f"{m[1] or ''}  {m[2]}  {m[3]}  {m[4]}" + (f"  {m[5]}" if m[5] else "") if m else l)
    return "\n".join(out)


def parse(path) -> dict:
    t = subprocess.run(["pdftotext", "-layout", str(path), "-"], capture_output=True, text=True).stdout
    r = {"file": Path(path).name, "errors": [], "lines": [], "ocr": False}
    m = PERIOD.search(t)
    if not m:
        t = _ocr_text(path)
        r["ocr"] = True
        m = PERIOD.search(t)
    if not m:
        r["errors"].append("periode introuvable")
        return r
    start = _date(m[1], m[2], m[3])
    end = _date(m[4], m[5], m[6])
    r["start"], r["end"] = start.isoformat(), end.isoformat()
    acct = re.search(r"No de compte\s+(\S+)", t)
    r["account"] = acct.group(1) if acct else None
    prev = None
    month = start.month                 # depuis 2025, le mois n'est imprime que sur certaines lignes
    for raw in t.split("\n"):
        mm = LINE.match(raw)
        if not mm:
            continue
        if mm[1]:
            month = int(mm[1])
        day, desc = int(mm[2]), mm[3].strip()
        if desc.startswith("SOLDE PRECEDENT"):
            month = start.month
            if prev is None:
                prev = d(mm[5] or mm[4])
                r["opening"] = str(prev)
            continue
        if mm[5] is None:          # ligne sans solde : pas une transaction (ex. detail de frais)
            continue
        amount, balance = d(mm[4]), d(mm[5])
        year = end.year if month <= end.month or start.year == end.year and month >= start.month else end.year - 1
        if start.year != end.year:
            year = start.year if month >= start.month else end.year
        if prev is None:
            r["errors"].append(f"transaction avant le solde precedent : {raw.strip()[:60]}")
            prev = balance
            continue
        if prev + amount == balance:
            signed = amount
        elif prev - amount == balance:
            signed = -amount
        else:
            r["errors"].append(f"{month:02d}-{day:02d} {desc[:40]} : {prev} +/- {amount} != {balance}")
            signed = balance - prev
        r["lines"].append({"date": date(year, month, day).isoformat(), "description": desc, "amount": str(signed),
                           "balance": str(balance)})
        prev = balance
    r["closing"] = str(prev) if prev is not None else None
    tm = TOTALS.search(re.sub(r"\s+", " ", t))
    if tm:
        deb = [Decimal(x["amount"]) for x in r["lines"] if Decimal(x["amount"]) < 0]
        cre = [Decimal(x["amount"]) for x in r["lines"] if Decimal(x["amount"]) > 0]
        if len(deb) != int(tm[1]) or -sum(deb) != d(tm[2]) or len(cre) != int(tm[3]) or sum(cre) != d(tm[4]):
            r["errors"].append(f"resume du releve : debits {len(deb)}/{-sum(deb)} credits {len(cre)}/{sum(cre)} != {tm.groups()}")
        r["summary_checked"] = True
    else:
        r["summary_checked"] = False
    return r


if __name__ == "__main__":
    for f in sorted(Path(sys.argv[1]).glob("RC *.pdf")):
        x = parse(f)
        print(x["file"][:40], x.get("start"), x.get("end"), x.get("account"), len(x["lines"]), x.get("opening"), x.get("closing"),
              "resume" if x.get("summary_checked") else "-", "OCR" if x.get("ocr") else "", "; ".join(x["errors"])[:150])
