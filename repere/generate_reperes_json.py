#!/usr/bin/env python3
"""Génère public/reperes.json (Début / Milieu / Fin par page, toutes les sourates)
pour l'exercice web /reperes.

Milieu = MÊME règle que la partie Lecture (src/utils/exercises/getMiddleVerse.ts) :
le verset dont le début est le plus proche du centre de la ligne 8 (position 8.5),
position = ligne + clamp((right-7)/86, 0, 1). AUCUNE exclusion de Début/Fin.
"""
import json, openpyxl, re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, "public")

vm = json.load(open(f"{PUB}/verse-map.json"))
chapters = json.load(open(f"{PUB}/qcf-data/chapters.json"))

# XLSX -> (surah,page) -> {Début, Fin}
wb = openpyxl.load_workbook(os.path.join(os.path.dirname(__file__), "reperes_coran_complet.xlsx"), data_only=True)
ws = wb.active
XL = {}


def parse(sv):
    m = re.match(r'(\d+)-[^:]+:(\d+)', str(sv or ''))
    return (int(m.group(1)), int(m.group(2))) if m else (None, None)


last = {'p': None, 'i': None}
for row in ws.iter_rows(values_only=True):
    for col, sv, pos, pg in [('p', row[1], row[2], row[3]), ('i', row[5], row[6], row[7])]:
        s, v = parse(sv)
        if not s:
            continue
        page = int(pg) if pg not in (None, '') else (last[col] or {}).get('pg')
        last[col] = {'pg': page, 's': s}
        if page:
            XL.setdefault((s, page), {})[str(pos)] = v


def gen(surah_id):
    chap = next(c for c in chapters if c['id'] == surah_id)
    P0, P1 = chap['pages']
    sid = str(surah_id)
    mor = json.load(open(f"{PUB}/morphology/words/surah-{surah_id}.json"))

    def begin(v, n=6):
        if not v:
            return ""
        wds = sorted([(int(k.split(':')[1]), m['form']) for k, m in mor.items() if int(k.split(':')[0]) == v])
        return " ".join(f for _, f in wds[:n])

    # Milieu — identique à getMiddleVerse (aucune exclusion).
    def middle(page):
        pv = vm['pages'].get(str(page))
        if not pv:
            return None
        best, bd = None, 1e9
        for vk, e in pv.items():
            sr, v = vk.split(':')
            if sr != sid:
                continue
            b = e['boxes'][0] if e.get('boxes') else None
            if not b:
                continue
            hp = max(0, min(1, (b['right'] - 7) / 86))
            pos = b['line'] + hp
            d = abs(pos - 8.5)
            if d < bd:
                bd, best = d, int(v)
        return best

    def cell(v):
        return {'v': v, 't': begin(v)} if v else None

    rows = []
    for p in range(P0, P1 + 1):
        d = XL.get((surah_id, p), {})
        deb, fin = d.get('Début'), d.get('Fin')
        mid = middle(p)
        rows.append({'page': p, 'sp': p - P0 + 1, 'd': cell(deb), 'm': cell(mid), 'f': cell(fin)})

    return {
        'name': chap['name_simple'],
        'arname': chap['name_arabic'],
        'start': P0,
        'end': P1,
        'total': P1 - P0 + 1,
        'rows': rows,
    }


out = {str(c['id']): gen(c['id']) for c in chapters}
with open(f"{PUB}/reperes.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False)
print(f"reperes.json écrit : {len(out)} sourates")
