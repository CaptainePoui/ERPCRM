"""Lecture des factures PDF de l'ancien logiciel (pdftotext -layout), en local, sans IA (TASK-005.21, 2026-10-14).
Chaque facture est controlee : lignes = sous-total, qte x taux = montant, sous-total + taxes (+ ajustement) = total,
total - paiements - credits = solde. Verifie sur les 773 factures deja importees des CSV : zero ecart.
Usage autonome : python3 zoho_invoice_pdf.py <dossier_pdf> <sortie.json>"""
import json, re, subprocess, sys, glob, os
from decimal import Decimal
from concurrent.futures import ProcessPoolExecutor

MONEY = r'-?\(?-?\$?[\d,]+\.\d{2}\)?'


def money(s):
    s = s.replace('$', '').replace(',', '').replace('(', '').replace(')', '').strip()
    return Decimal(s)


ITEM = re.compile(r'^\s{0,8}(\d{1,3})\s{2,}(?:(\S.*?)\s{2,})?(-?[\d,]*\.?\d+)\s{2,}(-?[\d,]+\.\d{2,4})\s{2,}(-?[\d,]+\.\d{2})\s*$')
TOTAL_LINE = re.compile(r'^\s{20,}(\S.*?)\s{2,}(\(-\)\s*)?(' + MONEY + r')\s*$')
NOISE = re.compile(r'^(\s*TPS - 782680730|\s*\d{1,3}\s*$|\s*Simple IP inc\.\s*$)')


def parse(path):
    t = subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True, text=True).stdout
    lines = t.split('\n')
    r = {'file': os.path.basename(path), 'errors': []}
    m = re.search(r'N° de facture\s+(.+)', t)
    r['number'] = m.group(1).strip() if m else None
    m = re.search(r'Date de facture :\s+(\d{4})/(\d{2})/(\d{2})', t)
    r['date'] = f'{m.group(1)}-{m.group(2)}-{m.group(3)}' if m else None
    m = re.search(r"Date d’échéance :\s+(\d{4})/(\d{2})/(\d{2})", t)
    r['due'] = f'{m.group(1)}-{m.group(2)}-{m.group(3)}' if m else None
    m = re.search(r'Conditions :\s+(.+)', t)
    r['terms'] = m.group(1).strip() if m else None
    # client : ligne qui suit « Facturer à », avant la colonne de droite
    for i, l in enumerate(lines):
        if l.strip().startswith('Facturer à'):
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            r['client'] = re.split(r'\s{3,}', lines[j].strip())[0]
            addr = []
            for k in range(j + 1, min(j + 8, len(lines))):
                s = lines[k]
                if 'Objet' in s or '#' in s and 'Article' in s:
                    break
                left = re.split(r'\s{3,}', s.strip())[0] if s.strip() else ''
                if left and not left.startswith(('Date', 'Conditions')):
                    addr.append(left)
            r['address'] = addr
            break
    m = re.search(r'Objet :\s*\n\s*(.+)', t)
    r['subject'] = m.group(1).strip() if m else None
    # tableau des lignes
    items, pending_header, in_table, cur = [], [], False, None
    totals = []
    for l in lines:
        if re.search(r'#\s+Article & Description', l):
            in_table = True
            continue
        if not in_table:
            continue
        if re.match(r'^\s*Remarques\s*$', l) or re.match(r'^\s*(Options de paiement|Conditions d’utilisation)', l):
            in_table = False
            continue
        mi = ITEM.match(l)
        if mi:
            cur = {'n': int(mi.group(1)), 'name': (mi.group(2) or '').strip(), 'qty': mi.group(3).replace(',', ''),
                   'rate': mi.group(4).replace(',', ''), 'amount': str(money(mi.group(5))),
                   'desc': [], 'header': pending_header}
            pending_header = []
            items.append(cur)
            continue
        mt = TOTAL_LINE.match(l)
        if mt and not re.search(r'\d{4}-\d{2}', mt.group(1)):
            label = mt.group(1).strip()
            totals.append((label, str(money(mt.group(3)) * (-1 if mt.group(2) else 1))))
            cur = None
            continue
        if not l.strip() or NOISE.match(l):
            continue
        indent = len(l) - len(l.lstrip())
        if cur is not None and indent >= 12 and not totals:
            cur['desc'].append(l.strip())
        elif not totals:
            pending_header.append(l.strip())   # titre de groupe au-dessus d'une ligne
    r['items'] = items
    r['totals'] = totals
    # controles
    tot = {}
    for k, v in totals:
        tot.setdefault(k, v)
    r['subtotal'] = tot.get('Sous-total')
    r['total'] = next((v for k, v in totals if k == 'Total'), None)
    r['tps'] = next((v for k, v in totals if k.startswith('TPS')), None)
    r['tvq'] = next((v for k, v in totals if k.startswith('TVQ')), None)
    r['paid'] = str(sum((-Decimal(v) for k, v in totals if k.startswith('Paiement')), Decimal(0)))
    r['credits'] = str(sum((-Decimal(v) for k, v in totals if k.startswith('Crédits')), Decimal(0)))
    r['balance'] = next((v for k, v in reversed(totals) if k == 'Solde dû'), None)
    known = ('Sous-total', 'Total', 'Solde dû')
    r['other_totals'] = [(k, v) for k, v in totals if k not in known and not k.startswith(('TPS', 'TVQ', 'Paiement', 'Crédits'))]
    if not r['number']: r['errors'].append('numero')
    if not r['date']: r['errors'].append('date')
    if not r.get('client'): r['errors'].append('client')
    if not items: r['errors'].append('aucune ligne')
    if r['subtotal'] is None or r['total'] is None: r['errors'].append('totaux')
    else:
        s = sum((Decimal(i['amount']) for i in items), Decimal(0))
        if s != Decimal(r['subtotal']): r['errors'].append(f'lignes {s} != sous-total {r["subtotal"]}')
        tx = Decimal(r['tps'] or 0) + Decimal(r['tvq'] or 0)
        adj = sum((Decimal(v) for _k, v in r['other_totals']), Decimal(0))
        if Decimal(r['subtotal']) + tx + adj != Decimal(r['total']):
            r['errors'].append(f'sous-total+taxes {Decimal(r["subtotal"]) + tx}+{adj} != total {r["total"]}')
        if r['balance'] is not None and Decimal(r['total']) - Decimal(r['paid']) - Decimal(r['credits']) != Decimal(r['balance']):
            r['errors'].append(f'total-paye-credits != solde {r["balance"]}')
    for i in items:
        try:
            if abs(Decimal(i['qty']) * Decimal(i['rate']) - Decimal(i['amount'])) > Decimal('0.01'):
                r['errors'].append(f'ligne {i["n"]} qte x taux != montant')
        except Exception:
            r['errors'].append(f'ligne {i["n"]} illisible')
    return r


if __name__ == '__main__':
    SRC, OUT = sys.argv[1], sys.argv[2]
    files = sorted(glob.glob(os.path.join(SRC, '*.pdf')))
    with ProcessPoolExecutor() as ex:
        res = list(ex.map(parse, files, chunksize=20))
    json.dump(res, open(OUT, 'w'), ensure_ascii=False, indent=1)
    bad = [r for r in res if r['errors']]
    print(f'{len(res)} factures lues, {len(res) - len(bad)} sans ecart, {len(bad)} a verifier')
    from collections import Counter
    print(Counter(e.split(' ')[0] for r in bad for e in r['errors']).most_common())
    print(Counter(k for r in res for k, _v in r['other_totals']).most_common())
