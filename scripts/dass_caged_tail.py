import ftplib, os, io, json, py7zr, sys

SCRATCH = os.path.dirname(os.path.abspath(__file__))
muni_lookup = {
 '292880':'Santo Estêvão/BA','2928802':'Santo Estêvão/BA',
 '291470':'Itaberaba/BA','2914703':'Itaberaba/BA',
 '293330':'Vitória da Conquista/BA','2933307':'Vitória da Conquista/BA',
 '292870':'Santo Antônio de Jesus/BA','2928703':'Santo Antônio de Jesus/BA',
 '230640':'Itapipoca/CE','2306405':'Itapipoca/CE',
}
CNAES = {'1531901','1532700','1533500','1539400','1540800'}
MONTHS = ['202511','202512','202601','202602','202603','202604']

def norm(s):
    return ''.join(c for c in s.lower() if c.isalnum())

def download(ym):
    year = ym[:4]
    fn = f'CAGEDMOV{ym}.7z'
    local = os.path.join(SCRATCH, fn)
    if os.path.exists(local) and os.path.getsize(local) > 1000:
        return local
    ftp = ftplib.FTP('ftp.mtps.gov.br', timeout=120)
    ftp.login()
    ftp.cwd(f'/pdet/microdados/NOVO CAGED/{year}/{ym}')
    with open(local, 'wb') as f:
        ftp.retrbinary('RETR ' + fn, f.write)
    ftp.quit()
    return local

def process(ym):
    local = download(ym)
    outdir = os.path.join(SCRATCH, 'x_'+ym)
    os.makedirs(outdir, exist_ok=True)
    with py7zr.SevenZipFile(local, 'r') as z:
        z.extractall(path=outdir)
    txt = [os.path.join(outdir,f) for f in os.listdir(outdir) if f.lower().endswith('.txt')][0]
    agg = {}  # name -> [adm, sep]
    with open(txt, 'r', encoding='latin-1') as fh:
        header = fh.readline().rstrip('\n').split(';')
        H = {norm(h): i for i, h in enumerate(header)}
        i_mun = next(i for k,i in H.items() if k.startswith('munic'))
        i_sub = next(i for k,i in H.items() if k.startswith('subclasse') or k=='cnae' or k.startswith('cnae'))
        i_sal = next(i for k,i in H.items() if k.startswith('saldo'))
        for line in fh:
            p = line.rstrip('\n').split(';')
            if len(p) <= max(i_mun, i_sub, i_sal):
                continue
            mun = p[i_mun].strip()
            if mun not in muni_lookup:
                continue
            sub = p[i_sub].strip()
            if sub not in CNAES:
                continue
            name = muni_lookup[mun]
            a = agg.setdefault(name, [0,0])
            try:
                sal = int(p[i_sal].strip())
            except ValueError:
                continue
            if sal == 1: a[0]+=1
            elif sal == -1: a[1]+=1
    # cleanup extracted txt to save disk
    try:
        os.remove(txt); os.rmdir(outdir)
    except OSError:
        pass
    return agg

result = {}
for ym in MONTHS:
    try:
        agg = process(ym)
        result[ym] = agg
        tot_a = sum(v[0] for v in agg.values()); tot_s = sum(v[1] for v in agg.values())
        print(f'{ym}: adm={tot_a} sep={tot_s} net={tot_a-tot_s}  {agg}', flush=True)
    except Exception as e:
        print(f'{ym}: ERRO {type(e).__name__}: {e}', flush=True)

with open(os.path.join(SCRATCH,'dass_tail.json'),'w',encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=0)
print('DONE')
