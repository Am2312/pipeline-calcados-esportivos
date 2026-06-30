import ftplib, os, json, py7zr

SCRATCH = os.path.dirname(os.path.abspath(__file__))
# fallback p/ o scratchpad onde os .7z foram baixados na 1a vez
ALT = r'C:\Users\ANDRE~1.MAR\AppData\Local\Temp\claude\G--Shared-drives-Investimentos-Rel-gios-Rel-gios---NS-AM-Dashboards-AM\2e8e52f7-b100-452b-ad71-964c31037a2d\scratchpad'

# código IBGE (6 e 7 dígitos) -> scope, por segmento
FOOT = {
 '292880':'Santo Estêvão/BA','2928802':'Santo Estêvão/BA',
 '291470':'Itaberaba/BA','2914703':'Itaberaba/BA',
 '293330':'Vitória da Conquista/BA','2933307':'Vitória da Conquista/BA',
 '292870':'Santo Antônio de Jesus/BA','2928703':'Santo Antônio de Jesus/BA',
 '230640':'Itapipoca/CE','2306405':'Itapipoca/CE',
 '431080':'Ivoti/RS','4310801':'Ivoti/RS',
 '432260':'Venâncio Aires/RS','4322608':'Venâncio Aires/RS',
}
APP = {
 '293330':'Vitória da Conquista/BA','2933307':'Vitória da Conquista/BA',
 '291350':'Iguaí/BA','2913507':'Iguaí/BA',
 '291230':'Ibicuí/BA','2912301':'Ibicuí/BA',
 '421730':'Saudades/SC','4217303':'Saudades/SC',
}
FOOT_CNAE = {'1531901','1532700','1533500','1539400','1540800'}
MONTHS = ['202511','202512','202601','202602','202603','202604']

def norm(s): return ''.join(c for c in s.lower() if c.isalnum())

def local7z(ym):
    fn = f'CAGEDMOV{ym}.7z'
    for d in (SCRATCH, ALT):
        p = os.path.join(d, fn)
        if os.path.exists(p) and os.path.getsize(p) > 1000: return p
    p = os.path.join(SCRATCH, fn)
    ftp = ftplib.FTP('ftp.mtps.gov.br', timeout=120); ftp.login()
    ftp.cwd(f'/pdet/microdados/NOVO CAGED/{ym[:4]}/{ym}')
    with open(p, 'wb') as f: ftp.retrbinary('RETR ' + fn, f.write)
    ftp.quit(); return p

def process(ym):
    z = local7z(ym)
    outdir = os.path.join(SCRATCH, 'x_' + ym); os.makedirs(outdir, exist_ok=True)
    with py7zr.SevenZipFile(z, 'r') as a: a.extractall(path=outdir)
    txt = [os.path.join(outdir, f) for f in os.listdir(outdir) if f.lower().endswith('.txt')][0]
    agg = {}  # "scope||segment" -> [adm, sep]
    def add(scope, seg, sal):
        a = agg.setdefault(scope + '||' + seg, [0, 0])
        if sal == 1: a[0] += 1
        elif sal == -1: a[1] += 1
    with open(txt, 'r', encoding='latin-1') as fh:
        H = {norm(h): i for i, h in enumerate(fh.readline().rstrip('\n').split(';'))}
        i_m = next(i for k, i in H.items() if k.startswith('munic'))
        i_s = next(i for k, i in H.items() if k.startswith('subclasse') or k.startswith('cnae'))
        i_v = next(i for k, i in H.items() if k.startswith('saldo'))
        for line in fh:
            p = line.rstrip('\n').split(';')
            if len(p) <= max(i_m, i_s, i_v): continue
            mun = p[i_m].strip(); sub = p[i_s].strip()
            try: sal = int(p[i_v].strip())
            except ValueError: continue
            if mun in FOOT and sub in FOOT_CNAE: add(FOOT[mun], 'footwear', sal)
            if mun in APP and sub[:2] == '14': add(APP[mun], 'apparel', sal)
    try: os.remove(txt); os.rmdir(outdir)
    except OSError: pass
    return agg

result = {}
for ym in MONTHS:
    try:
        result[ym] = process(ym)
        print(ym, 'ok', result[ym], flush=True)
    except Exception as e:
        print(ym, 'ERRO', type(e).__name__, e, flush=True)

with open(os.path.join(SCRATCH, 'dass_tail.json'), 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False)
print('DONE', os.path.join(SCRATCH, 'dass_tail.json'))
