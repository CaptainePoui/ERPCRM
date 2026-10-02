"""Lecture des releves bancaires importes dans l'onglet Banque (TASK-042).

Formats acceptes :
- OFX / QFX / QBO (OFX 1.x SGML ou 2.x XML) : identifiant unique par ligne (FITID),
  solde du releve (LEDGERBAL), numero de compte (ACCTID).
- CSV : colonnes reperees par leur en-tete (francais ou anglais) -- date,
  description, montant signe OU colonnes debit/credit separees.

Sortie commune : ParsedStatement (lignes avec montant signe : positif = depot,
negatif = retrait). Aucune ecriture en base ici.
"""
import csv
import hashlib
import io
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation


class StatementParseError(ValueError):
    """Fichier illisible -- le message est affiche tel quel a l'utilisateur."""


@dataclass
class ParsedLine:
    posted_date: date
    amount: Decimal
    description: str
    payee: str | None = None
    reference: str | None = None
    fitid: str | None = None
    dedup_key: str = ""


@dataclass
class ParsedStatement:
    file_format: str                       # ofx | csv
    lines: list[ParsedLine] = field(default_factory=list)
    account_number: str | None = None      # tel que fourni par le fichier (OFX ACCTID)
    ledger_balance: Decimal | None = None
    ledger_balance_date: date | None = None

    @property
    def period_start(self) -> date | None:
        return min((l.posted_date for l in self.lines), default=None)

    @property
    def period_end(self) -> date | None:
        return max((l.posted_date for l in self.lines), default=None)


def decode_bytes(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    raise StatementParseError("Encodage du fichier non reconnu")


def parse_statement(raw: bytes, filename: str) -> ParsedStatement:
    text = decode_bytes(raw)
    head = text[:2000].upper()
    if "<OFX" in head or "OFXHEADER" in head:
        st = _parse_ofx(text)
    elif filename.lower().endswith((".ofx", ".qfx", ".qbo")):
        raise StatementParseError("Le fichier porte une extension OFX mais son contenu n'est pas de l'OFX")
    else:
        st = _parse_csv(text)
    if not st.lines:
        raise StatementParseError("Aucune transaction trouvée dans le fichier")
    _assign_dedup_keys(st)
    return st


# ── OFX / QFX / QBO ──────────────────────────────────────────────────────────

def _ofx_value(block: str, tag: str) -> str | None:
    # SGML (balise non fermee) et XML (<TAG>valeur</TAG>) : valeur jusqu'au prochain '<' ou fin de ligne
    m = re.search(rf"<{tag}>\s*([^<\r\n]*)", block, re.IGNORECASE)
    if not m:
        return None
    v = m.group(1).strip()
    return v or None


def _ofx_date(v: str | None) -> date | None:
    if not v or len(v) < 8 or not v[:8].isdigit():
        return None
    return date(int(v[0:4]), int(v[4:6]), int(v[6:8]))


def _parse_ofx(text: str) -> ParsedStatement:
    st = ParsedStatement(file_format="ofx")
    st.account_number = _ofx_value(text, "ACCTID")

    ledger = re.search(r"<LEDGERBAL>(.*?)(</LEDGERBAL>|<AVAILBAL>|</STMTRS>|</CCSTMTRS>)", text, re.IGNORECASE | re.DOTALL)
    if ledger:
        bal = _ofx_value(ledger.group(1), "BALAMT")
        if bal:
            st.ledger_balance = _to_decimal(bal)
        st.ledger_balance_date = _ofx_date(_ofx_value(ledger.group(1), "DTASOF"))

    blocks = re.findall(r"<STMTTRN>(.*?)</STMTTRN>", text, re.IGNORECASE | re.DOTALL)
    if not blocks:
        # SGML sans balise fermante pour STMTTRN (rare) : decouper sur l'ouverture
        parts = re.split(r"<STMTTRN>", text, flags=re.IGNORECASE)[1:]
        blocks = [re.split(r"</BANKTRANLIST>", p, flags=re.IGNORECASE)[0] for p in parts]

    for b in blocks:
        d = _ofx_date(_ofx_value(b, "DTPOSTED"))
        amt = _ofx_value(b, "TRNAMT")
        if not d or amt is None:
            raise StatementParseError("Transaction OFX sans date (DTPOSTED) ou sans montant (TRNAMT)")
        name = _ofx_value(b, "NAME")
        memo = _ofx_value(b, "MEMO")
        desc = " — ".join(x for x in (name, memo) if x) or (_ofx_value(b, "TRNTYPE") or "")
        st.lines.append(ParsedLine(
            posted_date=d,
            amount=_to_decimal(amt),
            description=_unescape(desc),
            payee=_unescape(_ofx_value(b, "PAYEE") or "") or None,
            reference=_ofx_value(b, "CHECKNUM") or _ofx_value(b, "REFNUM"),
            fitid=_ofx_value(b, "FITID"),
        ))
    return st


def _unescape(s: str) -> str:
    return s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&apos;", "'").replace("&quot;", '"')


# ── CSV ──────────────────────────────────────────────────────────────────────

def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


# Mots-cles d'en-tete (normalises, sans accents). Ordre = priorite.
_COLS = {
    "date":        ["date posted", "posting date", "date de transaction", "transaction date", "date de l operation", "date d inscription", "date"],
    "description": ["description", "details", "libelle", "transaction details", "memo", "narrative", "detail"],
    "amount":      ["transaction amount", "montant de la transaction", "amount", "montant"],
    "debit":       ["debit", "withdrawal", "withdrawals", "retrait", "retraits", "paiement"],
    "credit":      ["credit", "deposit", "deposits", "depot", "depots"],
    "reference":   ["reference", "ref", "numero de reference", "cheque", "check number", "no"],
    # BNC (Banque Nationale) : « Autres détails » porte le nom du payeur / beneficiaire
    "payee":       ["autres details", "payee", "beneficiaire", "contrepartie nom", "name", "nom"],
    # Solde apres chaque ligne (BNC : « Solde total ») -- donne le solde du releve
    "balance":     ["solde total", "running balance", "solde", "balance"],
}


def _find_col(headers: list[str], key: str, taken: set[int]) -> int | None:
    norm = [_norm(h) for h in headers]
    for kw in _COLS[key]:
        for i, h in enumerate(norm):
            if i not in taken and h == kw:
                return i
    # Sinon, en-tete qui contient le mot-cle (mot entier pour un mot seul : « no » ne doit pas matcher « nom »)
    for kw in _COLS[key]:
        for i, h in enumerate(norm):
            if i in taken:
                continue
            if (kw in h.split()) if " " not in kw else (kw in h):
                return i
    return None


def _parse_csv(text: str) -> ParsedStatement:
    sample = text[:5000]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    rows = [r for r in csv.reader(io.StringIO(text), dialect) if any(c.strip() for c in r)]
    if not rows:
        raise StatementParseError("Fichier CSV vide")

    # L'en-tete n'est pas toujours la premiere ligne (certaines banques ajoutent un titre)
    header_idx, cols = None, None
    for i, r in enumerate(rows[:15]):
        taken: set[int] = set()
        c = {}
        for key in ("date", "amount", "debit", "credit", "description", "reference", "payee", "balance"):
            idx = _find_col(r, key, taken)
            if idx is not None:
                c[key] = idx
                taken.add(idx)
        if "date" in c and ("amount" in c or "debit" in c or "credit" in c):
            header_idx, cols = i, c
            break
    if cols is None:
        found = " | ".join(rows[0][:12])
        raise StatementParseError(
            "Colonnes non reconnues : il faut au moins une colonne de date et une colonne de montant "
            f"(ou débit/crédit). En-tête lu : {found}"
        )

    data = rows[header_idx + 1:]
    st = ParsedStatement(file_format="csv")
    # Numero de compte dans les lignes de titre au-dessus de l'en-tete (BNC : 0006-00701-0601228)
    for r in rows[:header_idx]:
        for c in r:
            if re.fullmatch(r"[\d\- ]+", c.strip()) and len(re.sub(r"\D", "", c)) >= 7:
                st.account_number = c.strip()

    raw_dates = [r[cols["date"]].strip() for r in data if len(r) > cols["date"] and r[cols["date"]].strip()]
    day_first = _guess_day_first(raw_dates)

    balances: list[tuple[date, Decimal]] = []
    for n, r in enumerate(data, start=header_idx + 2):
        def cell(key):
            i = cols.get(key)
            return r[i].strip() if i is not None and i < len(r) else ""
        if not cell("date"):
            continue
        d = _parse_date(cell("date"), day_first)
        if d is None:
            raise StatementParseError(f"Ligne {n} : date illisible « {cell('date')} »")
        if "amount" in cols and cell("amount"):
            amt = _to_decimal(cell("amount"))
        else:
            deb = _to_decimal(cell("debit")) if cell("debit") else Decimal("0")
            cre = _to_decimal(cell("credit")) if cell("credit") else Decimal("0")
            amt = cre - abs(deb)
        st.lines.append(ParsedLine(
            posted_date=d,
            amount=amt,
            description=cell("description"),
            payee=re.sub(r"\s+", " ", cell("payee")) or None,
            reference=cell("reference") or None,
        ))
        if cell("balance"):
            balances.append((d, _to_decimal(cell("balance"))))

    # Solde du releve = solde courant de la ligne la plus recente. Le fichier peut etre
    # trie du plus recent au plus ancien (BNC) ou l'inverse : dans un meme jour, la ligne
    # la plus recente est la premiere si l'ordre est decroissant, la derniere sinon.
    if balances:
        descending = balances[0][0] >= balances[-1][0]
        latest = max(b[0] for b in balances)
        same_day = [b for b in balances if b[0] == latest]
        st.ledger_balance_date = latest
        st.ledger_balance = (same_day[0] if descending else same_day[-1])[1]
    return st


def _guess_day_first(values: list[str]) -> bool:
    """Pour les dates a 3 nombres ambigues (01/02/2026), regarde tout le fichier."""
    for v in values:
        parts = re.split(r"[/.\-]", v)
        if len(parts) == 3 and len(parts[0]) <= 2 and len(parts[1]) <= 2:
            a, b = int(parts[0] or 0), int(parts[1] or 0)
            if a > 12:
                return True
            if b > 12:
                return False
    return False  # ambigu partout : mois/jour (format nord-americain)


def _parse_date(v: str, day_first: bool) -> date | None:
    v = v.strip()
    try:
        if re.fullmatch(r"\d{8}", v):
            return date(int(v[:4]), int(v[4:6]), int(v[6:8]))
        m = re.fullmatch(r"(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})", v)
        if m:
            return date(int(m[1]), int(m[2]), int(m[3]))
        m = re.fullmatch(r"(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})", v)
        if m:
            a, b, y = int(m[1]), int(m[2]), int(m[3])
            return date(y, b, a) if day_first else date(y, a, b)
    except ValueError:
        return None
    return None


def _to_decimal(v: str) -> Decimal:
    s = v.strip().replace("$", "").replace("CAD", "").replace(" ", "").replace(" ", "")
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()")
    if s.endswith("-"):
        neg, s = True, s[:-1]
    if "," in s and "." in s:
        s = s.replace(",", "")                 # 1,234.56
    elif "," in s:
        s = s.replace(",", ".")                # 1234,56
    try:
        d = Decimal(s)
    except InvalidOperation:
        raise StatementParseError(f"Montant illisible « {v} »")
    return (-d if neg else d).quantize(Decimal("0.01"))


# ── Doublons ─────────────────────────────────────────────────────────────────

def _assign_dedup_keys(st: ParsedStatement) -> None:
    """FITID si la banque en fournit un ; sinon date+montant+description+rang d'apparition
    (deux lignes identiques le meme jour restent distinctes, et un releve qui chevauche
    le precedent retombe sur les memes cles)."""
    seen: dict[str, int] = {}
    for l in st.lines:
        if l.fitid:
            l.dedup_key = f"fitid:{l.fitid}"[:300]
            continue
        base = f"{l.posted_date.isoformat()}|{l.amount}|{_norm(l.description)}"
        seen[base] = seen.get(base, 0) + 1
        l.dedup_key = "h:" + hashlib.sha256(f"{base}|{seen[base]}".encode()).hexdigest()
