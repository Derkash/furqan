import generate_reperes as g, traceback, time
ok=0; err=[]
t0=time.time()
for i in range(1,115):
    try:
        g.gen(i)
        ok+=1
    except Exception as e:
        err.append((i,str(e)))
        print(f"✗ sourate {i}: {e}")
print(f"\n=== TERMINÉ : {ok}/114 en {int(time.time()-t0)}s ===")
if err: print("Erreurs:", err)
