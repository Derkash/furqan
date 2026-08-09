#!/usr/bin/env python3
"""Génère des versions EXERCICE des repères : trous aléatoires (cellules vidées)
à retrouver. 3 versions par sourate, avec des cellules masquées différentes.
Chaque cellule est masquée dans 1 ou 2 versions (donc affichée dans au moins une).
Usage : python3 generate_exercices.py [surah_id ...]  (défaut 4 = An-Nisa)
"""
import json, html, subprocess, os, sys, random
import generate_reperes as G  # réutilise XL, vm, chapters, COLORS, POS

PUB=G.PUB; CHROME=G.CHROME; COLORS=G.COLORS; POS=G.POS; vm=G.vm; XL=G.XL; chapters=G.chapters

def gen_exercises(surah_id, versions=3):
    chap=next(c for c in chapters if c['id']==surah_id)
    P0,P1=chap['pages']; NAME=chap['name_simple']; ARNAME=chap['name_arabic']; sid=str(surah_id)
    mor=json.load(open(f"{PUB}/morphology/words/surah-{surah_id}.json"))
    def begin(v,n=6):
        if not v: return ""
        wds=sorted([(int(k.split(':')[1]),m['form']) for k,m in mor.items() if int(k.split(':')[0])==v])
        return " ".join(f for _,f in wds[:n])
    def middle(page,exclude=()):
        pv=vm['pages'].get(str(page))
        if not pv: return None
        def pick(excl):
            best=None; bd=1e9
            for vk,e in pv.items():
                sr,v=vk.split(':')
                if sr!=sid or int(v) in excl: continue
                b=e['boxes'][0] if e.get('boxes') else None
                if not b: continue
                hp=max(0,min(1,(b['right']-7)/86)); pos=b['line']+hp; d=abs(pos-8.5)
                if d<bd: bd=d; best=int(v)
            return best
        return pick(set(exclude)) or pick(set())
    def rows(p):
        d=XL.get((surah_id,p),{}); deb,fin=d.get('Début'),d.get('Fin')
        return {'Début':deb,'Milieu':middle(p,(deb,fin) if deb and fin else ()),'Fin':fin}

    pages=list(range(P0,P1+1))
    data={p:rows(p) for p in pages}

    # Assigne à chaque cellule existante l'ensemble des versions où elle est MASQUÉE.
    random.seed(1000+surah_id)
    blanked={}  # (page,label) -> set(versions)
    for p in pages:
        for label,_ in POS:
            if not data[p][label]: continue
            k=random.choice([1,2])
            blanked[(p,label)]=set(random.sample(range(1,versions+1),k))

    odd=[p for p in pages if p%2==1]
    spreads=[((op+1 if op+1<=P1 else None),op) for op in odd]

    def half(p, ver):
        if p is None:
            return ['<td class="v"></td><td class="sv"></td><td class="pos"></td>' for _ in POS], '<td class="pg" rowspan="3"></td>'
        out=[]
        for label,_ in POS:
            v=data[p][label]; bg=COLORS[label]
            hole = v and ver in blanked.get((p,label),set())
            beg="" if hole else (html.escape(begin(v)) if v else "")
            sv="" if hole else (f"{surah_id}:{v}" if v else "")
            hcls=" hole" if hole else ""
            out.append(f'<td class="v{hcls}" style="background:{bg}" dir="rtl">{beg}</td>'
                       f'<td class="sv{hcls}" style="background:{bg}">{sv}</td>'
                       f'<td class="pos" style="background:{bg}">{label}</td>')
        pg=f'<td class="pg" rowspan="3">{p-P0+1}<span class="sub">/{P1-P0+1}</span></td>'
        return out,pg

    H='<th class="v">Verset</th><th class="sv">Sourate-Verset</th><th class="pos">Pos.</th><th class="pg">Page</th>'
    outdir=os.path.join(os.path.dirname(__file__),"exercice")
    os.makedirs(outdir,exist_ok=True)
    made=[]
    for ver in range(1,versions+1):
        body=[]
        for g,dte in spreads:
            lc,lpg=half(g,ver); rc,rpg=half(dte,ver)
            for i in range(3):
                cls='blockstart' if i==0 else ''
                body.append(f'<tr class="{cls}">{lc[i]}{lpg if i==0 else ""}<td class="sep"></td>{rc[i]}{rpg if i==0 else ""}</tr>')
        doc=f"""<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
@import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap');
@page {{ size:A4; margin:10mm 8mm; }} *{{box-sizing:border-box}} body{{font-family:Arial,sans-serif;margin:0;color:#1a1a1a}}
h1{{text-align:center;font-size:19px;margin:0 0 2px;color:#2f5496}} h1 .ar{{font-family:'Amiri',serif;font-size:25px}}
.sub2{{text-align:center;font-size:12px;color:#7a3030;font-weight:bold;margin:0 0 8px}}
table{{width:100%;border-collapse:collapse;table-layout:fixed}}
th{{background:#2f5496;color:#fff;font-size:12px;padding:5px 4px;border:1px solid #2f5496}}
td{{font-size:11px;padding:3px 5px;border:1px solid #b9c4d6;border-bottom:1px solid #cdd6e4;vertical-align:middle;height:26px}}
td.v{{font-family:'Amiri','Scheherazade New',serif;font-size:15px;text-align:right;white-space:nowrap;overflow:hidden}}
td.sv{{font-size:10px;text-align:center;color:#333;white-space:nowrap}} td.pos{{font-size:10px;text-align:center;font-weight:bold}}
td.pg{{font-size:20px;font-weight:bold;text-align:center;color:#2f5496;background:#eef2f8}}
td.pg .sub{{display:block;font-size:9px;color:#7a8ba6;font-weight:normal;margin-top:-2px}}
td.sep{{width:5px;padding:0;background:#2f5496;border:none}}
th.v{{width:27%}} th.sv{{width:10%}} th.pos{{width:6%}} th.pg{{width:6%}}
tr.blockstart td{{border-top:3px solid #2f5496}} tr.blockstart td.sep{{border:none}} thead th{{border-bottom:3px solid #1f3a63}}
/* Cellule à compléter : léger voile + soulignement pointillé */
td.hole{{background-image:linear-gradient(rgba(255,255,255,.55),rgba(255,255,255,.55)) !important}}
td.v.hole{{border-bottom:1px dashed #9aa7bd}}
</style></head><body>
<h1>Exercice — <span class="ar">سورة {ARNAME}</span> · {NAME}</h1>
<div class="sub2">Retrouve les cases vides (Début / Milieu / Fin) — Version {ver}/{versions}</div>
<table><thead><tr>{H}<th class="sep" style="background:#2f5496;border:none;"></th>{H}</tr></thead><tbody>{''.join(body)}</tbody></table></body></html>"""
        base=os.path.join(outdir,f"{surah_id:03d}-{NAME}-v{ver}")
        open(base+".html","w").write(doc)
        subprocess.run([CHROME,"--headless","--disable-gpu","--no-pdf-header-footer",
            f"--print-to-pdf={base}.pdf","--run-all-compositor-stages-before-draw","--virtual-time-budget=15000",
            "file://"+os.path.abspath(base+".html")],check=True,capture_output=True)
        os.remove(base+".html")
        made.append(base+".pdf")
    # récap trous
    per_ver={v:0 for v in range(1,versions+1)}
    for s in blanked.values():
        for v in s: per_ver[v]+=1
    print(f"✓ {NAME} : {len(made)} versions | cellules totales {len(blanked)} | trous/version {per_ver}")
    for m in made: print("   ", os.path.basename(m), os.path.getsize(m),"o")

if __name__=="__main__":
    ids=[int(x) for x in sys.argv[1:]] or [4]
    for i in ids: gen_exercises(i)
