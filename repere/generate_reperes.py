#!/usr/bin/env python3
"""Génère un PDF de repères (Début / Milieu / Fin par page) — UN PDF PAR SOURATE.
Usage : python3 generate_reperes.py [surah_id ...]   (défaut : 4 = An-Nisa)
Format : double page (paire à gauche, impaire à droite), numéro de page DE LA
SOURATE, cellules colorées Début/Milieu/Fin, séparateurs épais. Milieu = verset
du milieu (même logique que l'app) en l'excluant de Début/Fin quand c'est possible.
"""
import json, openpyxl, re, html, subprocess, os, sys

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB=os.path.join(ROOT,"public")
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
COLORS={'Début':'#dbead5','Milieu':'#fdf0cf','Fin':'#d9e6f5'}
POS=[('Début','deb'),('Milieu','mid'),('Fin','fin')]

vm=json.load(open(f"{PUB}/verse-map.json"))
chapters=json.load(open(f"{PUB}/qcf-data/chapters.json"))

# XLSX -> (surah,page) -> {Début, Fin}
wb=openpyxl.load_workbook(os.path.join(os.path.dirname(__file__),"reperes_coran_complet.xlsx"), data_only=True)
ws=wb.active
XL={}
def parse(sv):
    m=re.match(r'(\d+)-[^:]+:(\d+)', str(sv or '')); return (int(m.group(1)),int(m.group(2))) if m else (None,None)
last={'p':None,'i':None}
for row in ws.iter_rows(values_only=True):
    for col,sv,pos,pg in [('p',row[1],row[2],row[3]),('i',row[5],row[6],row[7])]:
        s,v=parse(sv)
        if not s: continue
        page=int(pg) if pg not in (None,'') else (last[col] or {}).get('pg')
        last[col]={'pg':page,'s':s}
        if page: XL.setdefault((s,page),{})[str(pos)]=v

def gen(surah_id):
    chap=next(c for c in chapters if c['id']==surah_id)
    P0,P1=chap['pages']; NAME=chap['name_simple']; ARNAME=chap['name_arabic']
    mor=json.load(open(f"{PUB}/morphology/words/surah-{surah_id}.json"))
    sid=str(surah_id)
    def begin(v,n=6):
        if not v: return ""
        wds=sorted([(int(k.split(':')[1]),m['form']) for k,m in mor.items() if int(k.split(':')[0])==v])
        return " ".join(f for _,f in wds[:n])
    # Milieu — MÊME règle que la partie Lecture (getMiddleVerse), aucune exclusion.
    def middle(page):
        pv=vm['pages'].get(str(page));
        if not pv: return None
        best=None; bd=1e9
        for vk,e in pv.items():
            sr,v=vk.split(':')
            if sr!=sid: continue
            b=e['boxes'][0] if e.get('boxes') else None
            if not b: continue
            hp=max(0,min(1,(b['right']-7)/86)); pos=b['line']+hp; d=abs(pos-8.5)
            if d<bd: bd=d; best=int(v)
        return best
    def rows(p):
        d=XL.get((surah_id,p),{}); deb,fin=d.get('Début'),d.get('Fin')
        return {'Début':deb,'Milieu':middle(p),'Fin':fin}
    def half(p):
        if p is None:
            return ['<td class="v"></td><td class="sv"></td><td class="pos"></td>' for _ in POS], '<td class="pg" rowspan="3"></td>'
        r=rows(p); out=[]
        for label,_ in POS:
            v=r[label]; bg=COLORS[label]; beg=html.escape(begin(v)) if v else ""; sv=f"{surah_id}:{v}" if v else ""
            out.append(f'<td class="v" style="background:{bg}" dir="rtl">{beg}</td><td class="sv" style="background:{bg}">{sv}</td><td class="pos" style="background:{bg}">{label}</td>')
        pg=f'<td class="pg" rowspan="3">{p-P0+1}<span class="sub">/{P1-P0+1}</span></td>'
        return out,pg
    odd=[p for p in range(P0,P1+1) if p%2==1]
    spreads=[((op+1 if op+1<=P1 else None),op) for op in odd]
    body=[]
    for g,dte in spreads:
        lc,lpg=half(g); rc,rpg=half(dte)
        for i in range(3):
            cls='blockstart' if i==0 else ''
            body.append(f'<tr class="{cls}">{lc[i]}{lpg if i==0 else ""}<td class="sep"></td>{rc[i]}{rpg if i==0 else ""}</tr>')
    H='<th class="v">Verset</th><th class="sv">Sourate-Verset</th><th class="pos">Pos.</th><th class="pg">Page</th>'
    doc=f"""<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
@import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap');
@page {{ size:A4; margin:10mm 8mm; }} *{{box-sizing:border-box}} body{{font-family:Arial,sans-serif;margin:0;color:#1a1a1a}}
h1{{text-align:center;font-size:20px;margin:0 0 8px;color:#2f5496}} h1 .ar{{font-family:'Amiri',serif;font-size:26px}}
table{{width:100%;border-collapse:collapse;table-layout:fixed}}
th{{background:#2f5496;color:#fff;font-size:12px;padding:5px 4px;border:1px solid #2f5496}}
td{{font-size:11px;padding:3px 5px;border:1px solid #b9c4d6;border-bottom:1px solid #cdd6e4;vertical-align:middle}}
td.v{{font-family:'Amiri','Scheherazade New',serif;font-size:15px;text-align:right;white-space:nowrap;overflow:hidden}}
td.sv{{font-size:10px;text-align:center;color:#333;white-space:nowrap}} td.pos{{font-size:10px;text-align:center;font-weight:bold}}
td.pg{{font-size:20px;font-weight:bold;text-align:center;color:#2f5496;background:#eef2f8}}
td.pg .sub{{display:block;font-size:9px;color:#7a8ba6;font-weight:normal;margin-top:-2px}}
td.sep{{width:5px;padding:0;background:#2f5496;border:none}}
th.v{{width:27%}} th.sv{{width:10%}} th.pos{{width:6%}} th.pg{{width:6%}}
tr.blockstart td{{border-top:3px solid #2f5496}} tr.blockstart td.sep{{border:none}} thead th{{border-bottom:3px solid #1f3a63}}
</style></head><body>
<h1>Repères — <span class="ar">سورة {ARNAME}</span> · {NAME} (Début · Milieu · Fin)</h1>
<table><thead><tr>{H}<th class="sep" style="background:#2f5496;border:none;"></th>{H}</tr></thead><tbody>{''.join(body)}</tbody></table></body></html>"""
    os.makedirs(os.path.join(os.path.dirname(__file__),"out"),exist_ok=True)
    base=os.path.join(os.path.dirname(__file__),"out",f"{surah_id:03d}-{NAME}")
    open(base+".html","w").write(doc)
    subprocess.run([CHROME,"--headless","--disable-gpu","--no-pdf-header-footer",
        f"--print-to-pdf={base}.pdf","--run-all-compositor-stages-before-draw","--virtual-time-budget=15000",
        "file://"+os.path.abspath(base+".html")],check=True,capture_output=True)
    os.remove(base+".html")
    print(f"✓ {NAME} → {base}.pdf ({os.path.getsize(base+'.pdf')} o, pages {P0}-{P1})")

if __name__=="__main__":
    ids=[int(x) for x in sys.argv[1:]] or [4]
    for i in ids: gen(i)
