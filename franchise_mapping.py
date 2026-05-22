"""
franchise_mapping.py
====================
HUMAN-CURATED franchise mapping. Hand-reviewed against franchise_mapping_summary.csv.

Decisions encoded:
  - Each sub-model is a separate franchise (Adilette Aqua ≠ Adilette Comfort).
  - Special editions (Strava, 50 Anos, Welcome Rio, ...) merge into the base franchise.
  - Cross-naming merges: "Pegasus" + "Air Zoom Pegasus" → "Pegasus".
    Same for Vaporfly/ZoomX, Alphafly, etc.
  - Generations spelled inconsistently are normalized: "24" / "2024" → 24.
  - Sport category attached per franchise so the dashboard can filter
    Performance / Corrida / All consistently with SPORT_CATS_PT.

Each entry:
    franchise:   canonical label shown in the UI
    match:       list of regex patterns (case-insensitive, OR-ed). First brand to
                 match wins.
    exclude:     optional regex that disqualifies a row from this franchise (used
                 when a parent franchise overlaps a child, e.g. "Pegasus" vs
                 "Pegasus Plus")
    sport:       'corrida' | 'performance' | 'football' | 'tennis' | 'basquete' |
                 'training' | 'trail' | 'casual' | 'kids' | 'sandals' | 'racket' |
                 'skate' | 'other'
                 — used by the dashboard sport-filter.
                 'corrida' is the running-only bucket;
                 'performance' = corrida + training + trail (mirroring SPORT_CATS_PT).
    gen_regex:   optional, capture-group 1 = numeric gen. Year-style gens are
                 normalized: 2024 → 24.
"""

import re
from typing import Iterable

# ── ADIDAS ──────────────────────────────────────────────────────────────────
# Order matters: more-specific patterns (e.g. "Ultraboost Light") must come
# BEFORE the broad pattern ("Ultraboost"). When using `exclude`, order is less
# critical but specific-first remains the rule.
ADIDAS = [
    # ── Running flagship ─────────────────────────────────────────────────
    {'franchise':'Ultraboost',            'sport':'corrida',     'match':[r'ultra\s*boost'],            'gen_regex':r'ultra\s*boost\s+(\d+)'},
    {'franchise':'Adizero Adios Pro',     'sport':'corrida',     'match':[r'adizero\s+adios\s+pro'],    'gen_regex':r'adios\s+pro\s+(\d+)'},
    {'franchise':'Adizero Boston',        'sport':'corrida',     'match':[r'adizero\s+boston'],         'gen_regex':r'boston\s+(\d+)'},
    {'franchise':'Adizero Takumi Sen',    'sport':'corrida',     'match':[r'adizero\s+takumi\s+sen'],   'gen_regex':r'takumi\s+sen\s+(\d+)'},
    {'franchise':'Adizero Evo SL',        'sport':'corrida',     'match':[r'adizero\s+evo\s+sl']},
    {'franchise':'Adizero Drive RC',      'sport':'corrida',     'match':[r'adizero\s+drive\s+rc']},
    {'franchise':'Adistar',               'sport':'corrida',     'match':[r'\badistar\b'],              'gen_regex':r'adistar\s+(\d+)'},
    # Adizero generic catch-all AFTER specifics
    {'franchise':'Adizero',               'sport':'corrida',     'match':[r'\badizero\b']},

    # Supernova family — separate sub-franchises
    {'franchise':'Supernova Rise',        'sport':'corrida',     'match':[r'supernova\s+rise'],         'gen_regex':r'supernova\s+rise\s+(\d+)'},
    {'franchise':'Supernova Stride',      'sport':'corrida',     'match':[r'supernova\s+stride'],       'gen_regex':r'supernova\s+stride\s+(\d+)'},
    {'franchise':'Supernova Ease',        'sport':'corrida',     'match':[r'supernova\s+ease'],         'gen_regex':r'supernova\s+ease\s+(\d+)'},
    {'franchise':'Supernova Comfortglide','sport':'corrida',     'match':[r'supernova\s+comfortglide']},
    {'franchise':'Supernova',             'sport':'corrida',     'match':[r'\bsupernova\b']},

    # Response family
    {'franchise':'Response Super',        'sport':'corrida',     'match':[r'response\s+super']},
    {'franchise':'Response Runner',       'sport':'corrida',     'match':[r'response\s+runner'],        'gen_regex':r'response\s+runner\s+(\d+)'},
    {'franchise':'Response',              'sport':'corrida',     'match':[r'\bresponse\b'],             'exclude':r'super|runner', 'gen_regex':r'response\s+(\d+)'},

    # Duramo family
    {'franchise':'Duramo Speed',          'sport':'corrida',     'match':[r'duramo\s+speed'],           'gen_regex':r'duramo\s+speed\s+(\d+)'},
    {'franchise':'Duramo SL',             'sport':'corrida',     'match':[r'duramo\s+sl(?!\d)'],        'gen_regex':r'duramo\s+sl\s+(\d+)'},
    {'franchise':'Duramo SL2',            'sport':'corrida',     'match':[r'duramo\s+sl2\b']},
    {'franchise':'Duramo RC',             'sport':'corrida',     'match':[r'duramo\s+rc(?!\d)'],        'gen_regex':r'duramo\s+rc\s+(\d+)'},
    {'franchise':'Duramo RC2',            'sport':'corrida',     'match':[r'duramo\s+rc2\b']},

    # Other running models
    {'franchise':'Runfalcon',             'sport':'corrida',     'match':[r'run\s*falcon'],             'gen_regex':r'runfalcon\s+(\d+)'},
    {'franchise':'Galaxy',                'sport':'corrida',     'match':[r'\bgalaxy\b'],               'exclude':r'galaxy\s+star', 'gen_regex':r'galaxy\s+(\d+)'},
    {'franchise':'Galaxy Star',           'sport':'corrida',     'match':[r'galaxy\s+star']},
    {'franchise':'Questar',               'sport':'corrida',     'match':[r'\bquestar\b'],              'gen_regex':r'questar\s+(\d+)'},
    {'franchise':'UltraRun',              'sport':'corrida',     'match':[r'ultra\s*run\b'],            'exclude':r'ultraboost', 'gen_regex':r'ultrarun\s+(\d+)'},
    {'franchise':'Latin Run',             'sport':'corrida',     'match':[r'latin\s+run']},
    {'franchise':'Acelera',               'sport':'corrida',     'match':[r'\bacelera\b'],              'gen_regex':r'acelera\s+(\d+)'},
    {'franchise':'Lightblaze',            'sport':'corrida',     'match':[r'\blightblaze\b']},
    {'franchise':'Rapidmove Adv',         'sport':'training',    'match':[r'rapidmove\s+adv'],          'gen_regex':r'rapidmove\s+adv\s+(\d+)'},
    {'franchise':'Lite Racer',            'sport':'corrida',     'match':[r'lite\s+racer']},
    {'franchise':'Boost Run',             'sport':'corrida',     'match':[r'boost\s+run']},
    {'franchise':'Switch Move',           'sport':'corrida',     'match':[r'switch\s+move']},

    # Training
    {'franchise':'Dropset',               'sport':'training',    'match':[r'\bdropset\b'],              'gen_regex':r'dropset\s+(\d+)'},

    # Casual / Court
    {'franchise':'VL Court 3.0',          'sport':'casual',      'match':[r'vl\s+court\s+3\.?0']},
    {'franchise':'VL Court Base',         'sport':'casual',      'match':[r'vl\s+court\s+base']},
    {'franchise':'VL Court Bold',         'sport':'casual',      'match':[r'vl\s+court\s+bold']},
    {'franchise':'VL Court',              'sport':'casual',      'match':[r'\bvl\s+court\b'],           'exclude':r'3\.?0|base|bold'},
    {'franchise':'Grand Court Alpha',     'sport':'casual',      'match':[r'grand\s+court\s+alpha']},
    {'franchise':'Grand Court Base 3.0',  'sport':'casual',      'match':[r'grand\s+court\s+base\s+3\.?0']},
    {'franchise':'Grand Court Base 2.0',  'sport':'casual',      'match':[r'grand\s+court\s+base\s+2\.?0']},
    {'franchise':'Grand Court Base',      'sport':'casual',      'match':[r'grand\s+court\s+base'],     'exclude':r'2\.?0|3\.?0'},
    {'franchise':'Grand Court 3.0',       'sport':'casual',      'match':[r'grand\s+court\s+3\.?0']},
    {'franchise':'Grand Court 2.0',       'sport':'casual',      'match':[r'grand\s+court\s+2\.?0']},
    {'franchise':'Grand Court',           'sport':'casual',      'match':[r'grand\s+court\b'],          'exclude':r'(alpha|base|2\.?0|3\.?0)'},
    {'franchise':'Advantage Base 2.0',    'sport':'casual',      'match':[r'advantage\s+base\s+2\.?0']},
    {'franchise':'Advantage Base',        'sport':'casual',      'match':[r'advantage\s+base\b'],       'exclude':r'2\.?0'},
    {'franchise':'Advantage 2.0',         'sport':'casual',      'match':[r'advantage\s+2\.?0']},
    {'franchise':'Advantage',             'sport':'casual',      'match':[r'\badvantage\b'],            'exclude':r'(base|2\.?0)'},
    {'franchise':'Hoops 4.0',             'sport':'basquete',    'match':[r'hoops\s+4\.?0']},
    {'franchise':'Hoops Classic',         'sport':'basquete',    'match':[r'hoops\s+classic']},
    {'franchise':'Daily 4.0',             'sport':'casual',      'match':[r'daily\s+4\.?0']},
    {'franchise':'Streettalk',            'sport':'casual',      'match':[r'street\s*talk']},
    {'franchise':'Eclyptix',              'sport':'casual',      'match':[r'\beclyptix\b']},
    {'franchise':'Tensaur Sport 3.0',     'sport':'kids',        'match':[r'tensaur\s+sport\s+3\.?0']},
    {'franchise':'Tensaur Sport 2.0',     'sport':'kids',        'match':[r'tensaur\s+sport\s+2\.?0']},
    {'franchise':'Tensaur Run 3.0',       'sport':'kids',        'match':[r'tensaur\s+run\s+3\.?0']},
    {'franchise':'VS Pace 2.0',           'sport':'casual',      'match':[r'vs\s+pace\s+2\.?0']},
    {'franchise':'Urban Court',           'sport':'casual',      'match':[r'urban\s+court']},
    {'franchise':'Courtblock',            'sport':'casual',      'match':[r'\bcourtblock\b']},
    {'franchise':'Barreda Decode',        'sport':'casual',      'match':[r'barreda\s+decode']},
    {'franchise':'Barreda',               'sport':'casual',      'match':[r'\bbarreda\b'],              'exclude':r'decode'},
    {'franchise':'Ownthegame 3.0',        'sport':'basquete',    'match':[r'own\s*the\s*game\s+3\.?0']},
    {'franchise':'Anthony Edwards',       'sport':'basquete',    'match':[r'anthony\s+edwards'],        'gen_regex':r'anthony\s+edwards\s+(\d+)'},
    {'franchise':'Ultimashow 2.0',        'sport':'casual',      'match':[r'ultimashow\s+2\.?0']},
    {'franchise':'Ligra',                 'sport':'racket',      'match':[r'\bligra\b'],                'gen_regex':r'ligra\s+(\d+)'},

    # Tennis
    {'franchise':'Barricade',             'sport':'tennis',      'match':[r'\bbarricade\b'],            'gen_regex':r'barricade\s+(\d+)'},
    {'franchise':'Courtjam Control',      'sport':'tennis',      'match':[r'courtjam\s+control'],       'gen_regex':r'courtjam\s+control\s+(\d+)'},
    {'franchise':'Defiant Speed',         'sport':'tennis',      'match':[r'defiant\s+speed'],          'gen_regex':r'defiant\s+speed\s+(\d+)'},
    {'franchise':'Gamecourt',             'sport':'tennis',      'match':[r'game\s*court'],             'gen_regex':r'game\s*court\s+(\d+)'},
    {'franchise':'Adizero Ubersonic',     'sport':'tennis',      'match':[r'adizero\s+ubersonic'],      'gen_regex':r'ubersonic\s+(\d+)'},

    # Trail
    {'franchise':'Terrex Tracefinder',    'sport':'trail',       'match':[r'terrex\s+tracefinder'],     'gen_regex':r'tracefinder\s+(\d+)'},

    # Skate
    {'franchise':'Park ST 2.0',           'sport':'skate',       'match':[r'park\s+st\s+2\.?0']},
    {'franchise':'Park ST',               'sport':'skate',       'match':[r'park\s+st\b'],              'exclude':r'2\.?0'},

    # Football — chuteiras (Society, Campo, Futsal)
    {'franchise':'F50 Messi Club',        'sport':'football',    'match':[r'f50\s+messi\s+club']},
    {'franchise':'F50 Messi League',      'sport':'football',    'match':[r'f50\s+messi\s+league']},
    {'franchise':'F50 Club Messi',        'sport':'football',    'match':[r'f50\s+club\s+messi']},
    {'franchise':'F50 Club',              'sport':'football',    'match':[r'f50\s+club'],               'exclude':r'messi'},
    {'franchise':'F50 League',            'sport':'football',    'match':[r'f50\s+league']},
    {'franchise':'F50 Elite',             'sport':'football',    'match':[r'f50\s+elite']},
    {'franchise':'Predator Elite',        'sport':'football',    'match':[r'predator\s+elite']},
    {'franchise':'Predator League',       'sport':'football',    'match':[r'predator\s+league']},
    {'franchise':'Predator Club',         'sport':'football',    'match':[r'predator\s+club']},
    {'franchise':'Predator Essentials',   'sport':'football',    'match':[r'predator\s+essentials']},
    {'franchise':'Copa Pure',             'sport':'football',    'match':[r'copa\s+pure'],              'gen_regex':r'copa\s+pure\s+(\d+)'},
    {'franchise':'Copa',                  'sport':'football',    'match':[r'\bcopa\b'],                 'exclude':r'pure'},
    {'franchise':'Deportivo III',         'sport':'football',    'match':[r'deportivo\s+iii']},
    {'franchise':'Predator',              'sport':'football',    'match':[r'\bpredator\b'],             'exclude':r'(club|league|elite|essentials)', 'gen_regex':r'predator\s+(\d+)'},

    # Sandals
    {'franchise':'Adilette Aqua',         'sport':'sandals',     'match':[r'adilette\s+aqua']},
    {'franchise':'Adilette Comfort',      'sport':'sandals',     'match':[r'adilette\s+comfort']},
    {'franchise':'Adilette Lumia',        'sport':'sandals',     'match':[r'adilette\s+lumia']},
    {'franchise':'Adilette Shower',       'sport':'sandals',     'match':[r'adilette\s+shower']},
    {'franchise':'Adilette',              'sport':'sandals',     'match':[r'\badilette\b'],             'exclude':r'(aqua|comfort|lumia|shower)'},
    # Adissage (chinelo família)
    {'franchise':'Adissage Flux',         'sport':'sandals',     'match':[r'adissage\s+flux']},
    {'franchise':'Adissage 360Rec',       'sport':'sandals',     'match':[r'adissage\s+360\s*rec']},
    {'franchise':'Adissage',              'sport':'sandals',     'match':[r'\badissage\b'],             'exclude':r'(flux|360)'},
    # Adilete (typo do Adilette — manter como sub-franquia separada por agora)
    {'franchise':'Adilete Shower',        'sport':'sandals',     'match':[r'adilete\s+shower']},
    {'franchise':'Adillete',              'sport':'sandals',     'match':[r'adillete']},
    # Other adidas footwear
    {'franchise':'A.E.1 / Anthony Edwards 1','sport':'basquete', 'match':[r'a\.?e\.?1\b']},   # Same model as Anthony Edwards 1
    {'franchise':'4DFWD',                 'sport':'corrida',     'match':[r'4dfwd'],                    'gen_regex':r'4dfwd\s+(\d+)'},
    {'franchise':'Acesmash',              'sport':'tennis',      'match':[r'\bacesmash\b']},
    {'franchise':'Adirok',                'sport':'casual',      'match':[r'\badirok\b']},
    {'franchise':'Futsal Predator',       'sport':'football',    'match':[r'futsal.*predator', r'predator.*futsal']},  # catch-all chuteira futsal
    # Amplimove family
    {'franchise':'Amplimove Trainer',     'sport':'training',    'match':[r'amplimove\s+trainer']},
    {'franchise':'Amplimove',             'sport':'training',    'match':[r'\bamplimove\b'],            'exclude':r'trainer'},
    # Alpha family (running)
    {'franchise':'Alphaedge +',           'sport':'corrida',     'match':[r'alphaedge\s*\+']},
    {'franchise':'Alphaedge',             'sport':'corrida',     'match':[r'\balphaedge\b'],            'exclude':r'\+'},
    {'franchise':'Alphaboost',            'sport':'corrida',     'match':[r'\balphaboost\b']},
    {'franchise':'Alpharesponse',         'sport':'corrida',     'match':[r'\balpharesponse\b']},
    # Agravic (trail)
    {'franchise':'Agravic Speed',         'sport':'trail',       'match':[r'agravic\s+speed']},
    {'franchise':'Agravic',               'sport':'trail',       'match':[r'\bagravic\b'],              'exclude':r'speed'},
    # Aspyre (casual feminino)
    {'franchise':'Aspyre',                'sport':'casual',      'match':[r'\baspyre\b']},
    # Artilheira (chuteira feminina linha — Adidas)
    {'franchise':'Artilheira Predator',   'sport':'football',    'match':[r'artilheira\s+predator']},
    {'franchise':'Artilheira',            'sport':'football',    'match':[r'\bartilheira\b'],           'exclude':r'predator'},

    # Run year-stamps (Run 70s, Run 72, Run 80s, Run 84) — these are throwback
    # casual styles, not generations. Treat each as its own franchise.
    {'franchise':'Run 50s',               'sport':'casual',      'match':[r'\brun\s+50']},
    {'franchise':'Run 60s',               'sport':'casual',      'match':[r'\brun\s+60']},
    {'franchise':'Run 70s',               'sport':'casual',      'match':[r'\brun\s+70']},
    {'franchise':'Run 72',                'sport':'casual',      'match':[r'\brun\s+72']},
    {'franchise':'Run 80s',               'sport':'casual',      'match':[r'\brun\s+80']},
    {'franchise':'Run 84',                'sport':'casual',      'match':[r'\brun\s+84']},
]

# ── NIKE ────────────────────────────────────────────────────────────────────
NIKE = [
    # Running flagship
    {'franchise':'Pegasus Premium',       'sport':'corrida',     'match':[r'pegasus\s+premium']},
    {'franchise':'Pegasus Plus',          'sport':'corrida',     'match':[r'pegasus\s+plus']},
    # Merge "Air Zoom Pegasus" + "Pegasus" (same franchise)
    {'franchise':'Pegasus',               'sport':'corrida',     'match':[r'(?:air\s+zoom\s+)?pegasus'], 'exclude':r'(plus|premium)', 'gen_regex':r'pegasus\s+(\d+)'},
    # Merge "Air Zoom Alphafly" + "Alphafly"
    {'franchise':'Alphafly',              'sport':'corrida',     'match':[r'(?:air\s+zoom\s+)?alphafly'], 'gen_regex':r'alphafly[^\d]*(\d+)'},
    # Merge "ZoomX Vaporfly" + "Vaporfly"
    {'franchise':'Vaporfly',              'sport':'corrida',     'match':[r'(?:zoomx\s+)?vapor\s*fly'],  'gen_regex':r'vapor\s*fly[^\d]*(\d+)'},
    {'franchise':'Vomero Plus',           'sport':'corrida',     'match':[r'vomero\s+plus']},
    {'franchise':'Vomero',                'sport':'corrida',     'match':[r'\bvomero\b'],               'exclude':r'plus',                    'gen_regex':r'vomero\s+(\d+)'},
    {'franchise':'Air Winflo',            'sport':'corrida',     'match':[r'air\s+winflo'],             'gen_regex':r'winflo\s+(\d+)'},
    {'franchise':'Winflo',                'sport':'corrida',     'match':[r'\bwinflo\b'],               'exclude':r'air',                     'gen_regex':r'winflo\s+(\d+)'},
    {'franchise':'Structure',             'sport':'corrida',     'match':[r'\bstructure\b'],            'gen_regex':r'structure\s+(\d+)'},
    {'franchise':'Zoom Fly',              'sport':'corrida',     'match':[r'zoom\s+fly'],               'gen_regex':r'zoom\s+fly\s+(\d+)'},
    {'franchise':'Revolution',            'sport':'corrida',     'match':[r'\brevolution\b'],           'gen_regex':r'revolution\s+(\d+)'},
    {'franchise':'Downshifter',           'sport':'corrida',     'match':[r'\bdownshifter\b'],          'gen_regex':r'downshifter\s+(\d+)'},
    {'franchise':'Quest',                 'sport':'corrida',     'match':[r'\bquest\b'],                'gen_regex':r'quest\s+(\d+)'},
    {'franchise':'Journey Run',           'sport':'corrida',     'match':[r'journey\s+run']},
    {'franchise':'Run Defy',              'sport':'corrida',     'match':[r'run\s+defy']},
    {'franchise':'Cosmic Runner',         'sport':'corrida',     'match':[r'cosmic\s+runner']},
    {'franchise':'Promina',               'sport':'corrida',     'match':[r'\bpromina\b']},
    {'franchise':'Uplift SC',             'sport':'corrida',     'match':[r'uplift\s+sc']},
    {'franchise':'Flex Runner',           'sport':'kids',        'match':[r'flex\s+runner'],            'gen_regex':r'flex\s+runner\s+(\d+)'},

    # Training
    {'franchise':'Free Metcon',           'sport':'training',    'match':[r'free\s+metcon'],            'gen_regex':r'free\s+metcon\s+(\d+)'},
    {'franchise':'Metcon',                'sport':'training',    'match':[r'\bmetcon\b'],               'exclude':r'free',                    'gen_regex':r'metcon\s+(\d+)'},
    {'franchise':'MC Trainer',            'sport':'training',    'match':[r'mc\s+trainer'],             'gen_regex':r'mc\s+trainer\s+(\d+)'},
    {'franchise':'Air Max Alpha Trainer', 'sport':'training',    'match':[r'air\s+max\s+alpha\s+trainer'], 'gen_regex':r'alpha\s+trainer\s+(\d+)'},

    # Basketball
    {'franchise':'Giannis Immortality',   'sport':'basquete',    'match':[r'giannis\s+immortality'],    'gen_regex':r'immortality\s+(\d+)'},
    {'franchise':'Precision',             'sport':'basquete',    'match':[r'\bprecision\b'],            'gen_regex':r'precision\s+(\d+|vii|viii|ix|x|xi|xii)'},

    # Casual / Court (Air Max sub-models)
    {'franchise':'Air Max Excee',         'sport':'casual',      'match':[r'air\s+max\s+excee']},
    {'franchise':'Air Max Nuaxis',        'sport':'casual',      'match':[r'air\s+max\s+nuaxis']},
    {'franchise':'Court Borough Low Recraft','sport':'casual',   'match':[r'court\s+borough\s+low\s+recraft']},
    {'franchise':'Court Vision Low Next Nature','sport':'casual','match':[r'court\s+vision\s+low\s+next\s+nature']},
    {'franchise':'Court Vision Low',      'sport':'casual',      'match':[r'court\s+vision\s+low\b'],   'exclude':r'next\s+nature'},
    {'franchise':'Court Vision Lo',       'sport':'casual',      'match':[r'court\s+vision\s+lo\b']},
    {'franchise':'Court Lite',            'sport':'tennis',      'match':[r'court\s+lite'],             'gen_regex':r'court\s+lite\s+(\d+)'},
    {'franchise':'Gamma Force',           'sport':'casual',      'match':[r'gamma\s+force']},
    {'franchise':'Terra Manta',           'sport':'casual',      'match':[r'terra\s+manta']},
    {'franchise':'SB Force',              'sport':'skate',       'match':[r'sb\s+force']},
    {'franchise':'SB Chron',              'sport':'skate',       'match':[r'sb\s+chron'],               'gen_regex':r'sb\s+chron\s+(\d+)'},
    {'franchise':'SB Malor',              'sport':'skate',       'match':[r'sb\s+malor']},

    # Tennis
    {'franchise':'Zoom Vapor Pro',        'sport':'tennis',      'match':[r'zoom\s+vapor\s+pro'],       'gen_regex':r'zoom\s+vapor\s+pro\s+(\d+)'},

    # Football — chuteiras
    {'franchise':'Mercurial Superfly',    'sport':'football',    'match':[r'mercurial\s+superfly'],     'gen_regex':r'superfly\s+(\d+)'},
    {'franchise':'Mercurial Vapor',       'sport':'football',    'match':[r'mercurial\s+vapor'],        'gen_regex':r'mercurial\s+vapor\s+(\d+)'},
    {'franchise':'Zoom Mercurial Vapor',  'sport':'football',    'match':[r'zoom\s+mercurial\s+vapor'], 'gen_regex':r'mercurial\s+vapor\s+(\d+)'},
    {'franchise':'Zoom Vapor',            'sport':'football',    'match':[r'zoom\s+vapor\b'],           'exclude':r'(mercurial|pro)',         'gen_regex':r'zoom\s+vapor\s+(\d+)'},
    {'franchise':'Phantom GX',            'sport':'football',    'match':[r'phantom\s+gx']},
    {'franchise':'Phantom',               'sport':'football',    'match':[r'\bphantom\b'],              'exclude':r'gx',                      'gen_regex':r'phantom\s+(\d+)'},
    {'franchise':'Tiempo Legend',         'sport':'football',    'match':[r'tiempo\s+legend'],          'gen_regex':r'tiempo\s+legend\s+(\d+)'},
    {'franchise':'Tiempo',                'sport':'football',    'match':[r'\btiempo\b'],               'exclude':r'legend',                  'gen_regex':r'tiempo\s+(\d+)'},
    {'franchise':'Beco',                  'sport':'football',    'match':[r'\bbeco\b'],                 'gen_regex':r'beco\s+(\d+)'},

    # Sandals
    {'franchise':'Victori One',           'sport':'sandals',     'match':[r'victori\s+one']},

    # Air Jordan family (each model line = separate franchise)
    {'franchise':'Air Jordan XXXVIII',    'sport':'basquete',    'match':[r'air\s+jordan\s+xxxviii']},
    {'franchise':'Air Jordan XXXVII',     'sport':'basquete',    'match':[r'air\s+jordan\s+xxxvii\b']},
    {'franchise':'Air Jordan 40',         'sport':'basquete',    'match':[r'air\s+jordan\s+40']},
    {'franchise':'Air Jordan Skyline Low','sport':'casual',      'match':[r'air\s+jordan\s+skyline\s+low']},
    {'franchise':'Air Jordan Tatum',      'sport':'basquete',    'match':[r'air\s+jordan\s+tatum'],     'gen_regex':r'tatum\s+(\d+)'},
    {'franchise':'Air Jordan Dawn',       'sport':'casual',      'match':[r'air\s+jordan\s+dawn']},
    {'franchise':'Air Jordan 1',          'sport':'casual',      'match':[r'air\s+jordan\s+1\b']},
    {'franchise':'Air Force 1',           'sport':'casual',      'match':[r'air\s+force\s+1', r'\baf1\b']},
    # ACG Trail
    {'franchise':'ACG Zegama',            'sport':'trail',       'match':[r'acg\s+zegama']},
    # A'One (Air One)
    {'franchise':"A'One",                 'sport':'casual',      'match':[r"a['′]?one\b"]},

    # Air Max family (each sub-model is its own franchise)
    {'franchise':'Air Max Cirro',         'sport':'sandals',     'match':[r'air\s+max\s+cirro']},
    {'franchise':'Air Max Bia',           'sport':'casual',      'match':[r'air\s+max\s+bia']},
    {'franchise':'Air Max Fire',          'sport':'casual',      'match':[r'air\s+max\s+fire']},
    {'franchise':'Air Max 270',           'sport':'casual',      'match':[r'air\s+max\s+270']},
    {'franchise':'Air Max 90',            'sport':'casual',      'match':[r'air\s+max\s+90']},
    {'franchise':'Air Max 95',            'sport':'casual',      'match':[r'air\s+max\s+95']},
    {'franchise':'Air Max 97',            'sport':'casual',      'match':[r'air\s+max\s+97']},
    {'franchise':'Air Max 1',             'sport':'casual',      'match':[r'air\s+max\s+1\b']},
    {'franchise':'Air Max AP',            'sport':'casual',      'match':[r'air\s+max\s+ap']},
    {'franchise':'Air Max DN',            'sport':'casual',      'match':[r'air\s+max\s+dn']},
    {'franchise':'Air Max Plus',          'sport':'casual',      'match':[r'air\s+max\s+plus']},
    {'franchise':'Air Max Pulse',         'sport':'casual',      'match':[r'air\s+max\s+pulse']},
    # Generic Air Max catch-all (after all specific Air Max sub-models)
    {'franchise':'Air Max',               'sport':'casual',      'match':[r'air\s+max\b'],              'exclude':r'(cirro|bia|fire|270|90|95|97|nuaxis|excee|alpha|trainer|\b1\b|ap|dn|plus|pulse|\bap\b)'},
]

# ── ASICS ───────────────────────────────────────────────────────────────────
ASICS = [
    # Running flagships (Gel-* family)
    {'franchise':'Gel-Nimbus',            'sport':'corrida',     'match':[r'gel[\s-]?nimbus'],          'gen_regex':r'nimbus\s+(\d+)'},
    {'franchise':'Gel-Kayano',            'sport':'corrida',     'match':[r'gel[\s-]?kayano'],          'gen_regex':r'kayano\s+(\d+)'},
    {'franchise':'Gel-Cumulus',           'sport':'corrida',     'match':[r'gel[\s-]?cumulus'],         'gen_regex':r'cumulus\s+(\d+)'},
    {'franchise':'Gel-Excite',            'sport':'corrida',     'match':[r'gel[\s-]?excite'],          'gen_regex':r'excite\s+(\d+)'},
    {'franchise':'Gel-Contend',           'sport':'corrida',     'match':[r'gel[\s-]?contend'],         'gen_regex':r'contend\s+(\d+)'},
    {'franchise':'Contend',               'sport':'kids',        'match':[r'\bcontend\b'],              'exclude':r'gel',                     'gen_regex':r'contend\s+(\d+)'},
    {'franchise':'Gel-Pulse',             'sport':'corrida',     'match':[r'gel[\s-]?pulse'],           'gen_regex':r'pulse\s+(\d+)'},
    {'franchise':'Gel-Pacemaker',         'sport':'corrida',     'match':[r'gel[\s-]?pacemaker'],       'gen_regex':r'pacemaker[\s-]+(\d+)'},
    {'franchise':'Gel-Sparta',            'sport':'corrida',     'match':[r'gel[\s-]?sparta'],          'gen_regex':r'sparta\s+(\d+)'},
    {'franchise':'Gel-Hypersonic',        'sport':'corrida',     'match':[r'gel[\s-]?hypersonic'],      'gen_regex':r'hypersonic\s+(\d+)'},
    {'franchise':'Gel-Nagoya ST',         'sport':'corrida',     'match':[r'gel[\s-]?nagoya\s+st']},
    {'franchise':'Gel-Nagoya',            'sport':'corrida',     'match':[r'gel[\s-]?nagoya'],          'exclude':r'\bst\b',                  'gen_regex':r'nagoya\s+(\d+)'},
    {'franchise':'Gel-Takumi',            'sport':'corrida',     'match':[r'gel[\s-]?takumi']},
    {'franchise':'Novablast',             'sport':'corrida',     'match':[r'\bnovablast\b'],            'gen_regex':r'novablast\s+(\d+)'},
    {'franchise':'Dynablast',             'sport':'corrida',     'match':[r'\bdynablast\b'],            'gen_regex':r'dynablast\s+(\d+)'},
    {'franchise':'Superblast',            'sport':'corrida',     'match':[r'\bsuperblast\b'],           'gen_regex':r'superblast\s+(\d+)'},
    {'franchise':'Sonicblast',            'sport':'corrida',     'match':[r'\bsonicblast\b']},
    {'franchise':'Megablast',             'sport':'corrida',     'match':[r'\bmegablast\b']},
    {'franchise':'Versablast',            'sport':'corrida',     'match':[r'\bversablast\b'],           'gen_regex':r'versablast\s+(\d+)'},
    {'franchise':'Magic Speed',           'sport':'corrida',     'match':[r'magic\s+speed'],            'gen_regex':r'magic\s+speed\s+(\d+)'},
    {'franchise':'Japan S Camurça',       'sport':'casual',      'match':[r'japan\s+s\s+camur(ç|c)a']},
    {'franchise':'Japan S PF',            'sport':'casual',      'match':[r'japan\s+s\s+pf']},
    {'franchise':'Japan S',               'sport':'casual',      'match':[r'japan\s+s\b'],              'exclude':r'(camur|pf)'},
    {'franchise':'GT-2000',               'sport':'corrida',     'match':[r'gt[\s-]?2000'],             'gen_regex':r'gt[\s-]?2000\s+(\d+)'},
    {'franchise':'GT-1000',               'sport':'corrida',     'match':[r'gt[\s-]?1000'],             'gen_regex':r'gt[\s-]?1000\s+(\d+)'},
    {'franchise':'GT-2160',               'sport':'corrida',     'match':[r'gt[\s-]?2160']},
    {'franchise':'Raiden',                'sport':'corrida',     'match':[r'\braiden\b'],               'gen_regex':r'raiden\s+(\d+)'},
    {'franchise':'Patriot',               'sport':'corrida',     'match':[r'\bpatriot\b'],              'gen_regex':r'patriot\s+(\d+)'},
    {'franchise':'Jolt',                  'sport':'corrida',     'match':[r'\bjolt\b'],                 'gen_regex':r'jolt\s+(\d+)'},
    {'franchise':'Hyper Speed',           'sport':'corrida',     'match':[r'hyper\s+speed'],            'gen_regex':r'hyper\s+speed\s+(\d+)'},
    {'franchise':'Noosa Tri',             'sport':'corrida',     'match':[r'noosa\s+tri'],              'gen_regex':r'noosa\s+tri\s+(\d+)'},
    {'franchise':'Gel-Shogun ST',         'sport':'corrida',     'match':[r'gel[\s-]?shogun\s+st']},
    {'franchise':'Gel-Shogun',            'sport':'corrida',     'match':[r'gel[\s-]?shogun'],          'exclude':r'\bst\b',                  'gen_regex':r'shogun\s+(\d+)'},

    # Trail
    {'franchise':'Gel-Trabuco',           'sport':'trail',       'match':[r'gel[\s-]?trabuco'],         'exclude':r'terra',                   'gen_regex':r'trabuco\s+(\d+)'},
    {'franchise':'Trabuco Terra',         'sport':'trail',       'match':[r'trabuco\s+terra'],          'gen_regex':r'trabuco\s+terra\s+(\d+)'},
    {'franchise':'Gel-Sonoma',            'sport':'trail',       'match':[r'gel[\s-]?sonoma'],          'gen_regex':r'sonoma\s+(\d+)'},
    {'franchise':'Gel-Venture',           'sport':'trail',       'match':[r'gel[\s-]?venture'],         'gen_regex':r'venture\s+(\d+)'},

    # Tennis
    {'franchise':'Gel-Dedicate',          'sport':'tennis',      'match':[r'gel[\s-]?dedicate'],        'gen_regex':r'dedicate\s+(\d+)'},
    {'franchise':'Solution Speed FF',     'sport':'tennis',      'match':[r'solution\s+speed\s+ff'],    'gen_regex':r'solution\s+speed\s+ff\s+(\d+)'},
    {'franchise':'Court FF',              'sport':'tennis',      'match':[r'court\s+ff'],               'gen_regex':r'court\s+ff\s+(\d+)'},
    {'franchise':'Gel-Resolution X Clay', 'sport':'tennis',      'match':[r'gel[\s-]?resolution\s+x\s+clay']},
    {'franchise':'Gel-Resolution X',      'sport':'tennis',      'match':[r'gel[\s-]?resolution\s+x\b'], 'exclude':r'clay'},
    {'franchise':'Gel-Game',              'sport':'tennis',      'match':[r'gel[\s-]?game'],            'gen_regex':r'game\s+(\d+)'},
    {'franchise':'Gel-Challenger',        'sport':'tennis',      'match':[r'gel[\s-]?challenger'],      'gen_regex':r'challenger\s+(\d+)'},
    {'franchise':'Gel-Task',              'sport':'tennis',      'match':[r'gel[\s-]?task'],            'gen_regex':r'task\s+(\d+)'},
    {'franchise':'Gel-Rocket',            'sport':'racket',      'match':[r'gel[\s-]?rocket'],          'gen_regex':r'rocket\s+(\d+)'},
    {'franchise':'Upcourt',               'sport':'racket',      'match':[r'\bupcourt\b'],              'gen_regex':r'upcourt\s+(\d+)'},
    {'franchise':'Court Slide',           'sport':'tennis',      'match':[r'court\s+slide'],            'gen_regex':r'court\s+slide\s+(\d+)'},
    {'franchise':'Game FF',               'sport':'tennis',      'match':[r'\bgame\s+ff\b']},

    # Volei / Indoor / Handball
    {'franchise':'Gel-Shinobi',           'sport':'racket',      'match':[r'gel[\s-]?shinobi'],         'gen_regex':r'shinobi\s+(\d+)'},
    {'franchise':'Gel-Hyperblade',        'sport':'racket',      'match':[r'gel[\s-]?hyperblade']},
    {'franchise':'Gel-Quantum',           'sport':'casual',      'match':[r'gel[\s-]?quantum'],         'exclude':r'kei',                     'gen_regex':r'quantum\s+(\d+)'},
    {'franchise':'Gel-Quantum Kei',       'sport':'casual',      'match':[r'gel[\s-]?quantum\s+kei']},
    {'franchise':'Quantum',               'sport':'casual',      'match':[r'\bquantum\b'],              'exclude':r'gel',                     'gen_regex':r'quantum\s+(\d+)'},
    {'franchise':'Skyhand OG',            'sport':'casual',      'match':[r'sky\s*hand\s+og']},
    {'franchise':'Gel-1130',              'sport':'casual',      'match':[r'gel[\s-]?1130']},
    {'franchise':'Gel-Kambarah',          'sport':'casual',      'match':[r'gel[\s-]?kambarah']},

    # Kids
    {'franchise':'Buzz',                  'sport':'kids',        'match':[r'\bbuzz\b'],                 'gen_regex':r'buzz\s+(\d+)'},
    {'franchise':'Fantasy',               'sport':'kids',        'match':[r'\bfantasy\b'],              'gen_regex':r'fantasy\s+(\d+)'},

    # Variants without "Gel-" prefix (Centauro listings sometimes drop it)
    {'franchise':'Gel-Cumulus',           'sport':'corrida',     'match':[r'\bcumulus\b'],              'gen_regex':r'cumulus\s+(\d+)'},
    {'franchise':'Gel-Dedicate',          'sport':'tennis',      'match':[r'\bdedicate\b'],             'gen_regex':r'dedicate\s+(\d+)'},
    # Evoride family
    {'franchise':'Evoride Speed',         'sport':'corrida',     'match':[r'evoride\s+speed'],          'gen_regex':r'evoride\s+speed\s+(\d+)'},
    {'franchise':'Evoride',               'sport':'corrida',     'match':[r'\bevoride\b'],              'exclude':r'speed',                   'gen_regex':r'evoride\s+(\d+)'},
    {'franchise':'Ugoki',                 'sport':'corrida',     'match':[r'\bugoki\b']},
    {'franchise':'DS Light X-Fly',        'sport':'football',    'match':[r'ds\s+light\s+x[\s-]?fly'],  'gen_regex':r'fly[\s-]+(\d+)'},
]

# ── MIZUNO ──────────────────────────────────────────────────────────────────
MIZUNO = [
    # Running (Wave family)
    {'franchise':'Wave Prophecy Beta',    'sport':'corrida',     'match':[r'wave\s+prophecy\s+beta'],   'gen_regex':r'beta\s+(\d+)'},
    {'franchise':'Wave Prophecy',         'sport':'corrida',     'match':[r'wave\s+prophecy'],          'exclude':r'beta',                    'gen_regex':r'prophecy\s+(\d+)'},
    {'franchise':'Wave Rider',            'sport':'corrida',     'match':[r'wave\s+rider'],             'gen_regex':r'rider\s+(\d+)'},
    {'franchise':'Wave Mirai',            'sport':'corrida',     'match':[r'wave\s+mirai'],             'gen_regex':r'mirai\s+(\d+)'},
    {'franchise':'Wave Creation',         'sport':'corrida',     'match':[r'wave\s+creation'],          'gen_regex':r'creation\s+(\d+)'},
    {'franchise':'Wave Sky',              'sport':'corrida',     'match':[r'wave\s+sky'],               'gen_regex':r'sky\s+(\d+)'},
    {'franchise':'Wave Dynasty',          'sport':'corrida',     'match':[r'wave\s+dynasty'],           'gen_regex':r'dynasty\s+(\d+)'},
    {'franchise':'Wave Vitality',         'sport':'corrida',     'match':[r'wave\s+vitality'],          'gen_regex':r'vitality\s+(\d+)'},
    {'franchise':'Wave Stratos',          'sport':'corrida',     'match':[r'wave\s+stratos'],           'gen_regex':r'stratos\s+(\d+)'},
    {'franchise':'Wave Endeavor',         'sport':'corrida',     'match':[r'wave\s+endeavor'],          'gen_regex':r'endeavor\s+(\d+)'},
    {'franchise':'Wave Legend',           'sport':'corrida',     'match':[r'wave\s+legend'],            'gen_regex':r'legend\s+(\d+)'},
    {'franchise':'Wave Zest',             'sport':'corrida',     'match':[r'wave\s+zest'],              'gen_regex':r'zest\s+(\d+)'},
    {'franchise':'Wave Way',              'sport':'corrida',     'match':[r'wave\s+way'],               'gen_regex':r'way\s+(\d+)'},
    {'franchise':'Wave Frontier',         'sport':'corrida',     'match':[r'wave\s+frontier'],          'gen_regex':r'frontier\s+(\d+)'},
    {'franchise':'Wave Falcon',           'sport':'corrida',     'match':[r'wave\s+falcon'],            'gen_regex':r'falcon\s+(\d+)'},
    {'franchise':'Wave Rebellion Flash',  'sport':'corrida',     'match':[r'wave\s+rebellion\s+flash'], 'gen_regex':r'rebellion\s+flash\s+(\d+)'},
    {'franchise':'Wave Rebellion Pro',    'sport':'corrida',     'match':[r'wave\s+rebellion\s+pro'],   'gen_regex':r'rebellion\s+pro\s+(\d+)'},
    {'franchise':'Wave Rebellion',        'sport':'corrida',     'match':[r'wave\s+rebellion\b'],       'exclude':r'(flash|pro)'},
    {'franchise':'Wave Invictus',         'sport':'corrida',     'match':[r'wave\s+invictus'],          'gen_regex':r'invictus\s+(\d+)'},
    {'franchise':'Space',                 'sport':'corrida',     'match':[r'\bspace\b'],                'gen_regex':r'space\s+(\d+)'},
    {'franchise':'Cool Ride',             'sport':'corrida',     'match':[r'cool\s+ride'],              'gen_regex':r'cool\s+ride\s+(\d+)'},
    {'franchise':'Jet',                   'sport':'corrida',     'match':[r'\bjet\b'],                  'gen_regex':r'jet\s+(\d+)'},
    {'franchise':'Goya',                  'sport':'corrida',     'match':[r'\bgoya\b'],                 'gen_regex':r'goya\s+(\d+)'},
    {'franchise':'Hawk',                  'sport':'corrida',     'match':[r'\bhawk\b'],                 'gen_regex':r'hawk\s+(\d+)'},
    {'franchise':'Enigma',                'sport':'corrida',     'match':[r'\benigma\b'],               'gen_regex':r'enigma\s+(\d+)'},
    {'franchise':'Neo Zen',               'sport':'corrida',     'match':[r'neo\s+zen'],                'gen_regex':r'neo\s+zen\s+(\d+)'},
    {'franchise':'Neo Vista',             'sport':'corrida',     'match':[r'neo\s+vista'],              'gen_regex':r'neo\s+vista\s+(\d+)'},
    {'franchise':'Neo Aura Knit',         'sport':'corrida',     'match':[r'neo\s+aura\s+knit']},
    {'franchise':'Neo Aura',              'sport':'corrida',     'match':[r'neo\s+aura\b'],             'exclude':r'knit'},
    {'franchise':'Neo Vortex',            'sport':'corrida',     'match':[r'neo\s+vortex']},
    {'franchise':'Neo Pryzma',            'sport':'corrida',     'match':[r'neo\s+pryzma']},
    {'franchise':'Sunrise',               'sport':'corrida',     'match':[r'\bsunrise\b']},
    {'franchise':'Base Prime',            'sport':'corrida',     'match':[r'base\s+prime']},
    {'franchise':'Base Ride',             'sport':'corrida',     'match':[r'base\s+ride']},
    {'franchise':'Base One',              'sport':'corrida',     'match':[r'base\s+one']},
    {'franchise':'Atlantis',              'sport':'corrida',     'match':[r'\batlantis\b'],             'gen_regex':r'atlantis\s+(\d+)'},
    {'franchise':'Glow',                  'sport':'corrida',     'match':[r'\bglow\b'],                 'gen_regex':r'glow\s+(\d+)'},
    {'franchise':'Virtue',                'sport':'corrida',     'match':[r'\bvirtue\b'],               'gen_regex':r'virtue\s+(\d+)'},
    {'franchise':'Oracle',                'sport':'corrida',     'match':[r'\boracle\b']},
    {'franchise':'Action',                'sport':'corrida',     'match':[r'\baction\b'],               'gen_regex':r'action\s+(\d+)'},

    # Casual
    {'franchise':'Street Wind',           'sport':'casual',      'match':[r'street\s+wind']},
    {'franchise':'Edo Cross',             'sport':'casual',      'match':[r'edo\s+cross']},
    {'franchise':'CSD Sport',             'sport':'casual',      'match':[r'csd\s+sport']},

    # Sandals
    {'franchise':'Enerzy',                'sport':'sandals',     'match':[r'\benerzy\b']},

    # Football — chuteiras
    {'franchise':'Morelia Classic AS',    'sport':'football',    'match':[r'morelia\s+classic\s+as']},
    {'franchise':'Morelia Classic MD',    'sport':'football',    'match':[r'morelia\s+classic\s+md']},
    {'franchise':'Morelia Club AS',       'sport':'football',    'match':[r'morelia\s+club\s+as']},
    {'franchise':'Morelia Club MD',       'sport':'football',    'match':[r'morelia\s+club\s+md']},
    {'franchise':'Morelia',               'sport':'football',    'match':[r'\bmorelia\b'],              'exclude':r'(club|classic)'},
    {'franchise':'Regent AS',             'sport':'football',    'match':[r'regent\s+as']},
    {'franchise':'Regent IN',             'sport':'football',    'match':[r'regent\s+in']},

    # Advance family
    {'franchise':'Advance RSP',           'sport':'corrida',     'match':[r'advance\s+rsp']},
    {'franchise':'Advance Response',      'sport':'corrida',     'match':[r'advance\s+response']},
    {'franchise':'Advance',               'sport':'corrida',     'match':[r'\badvance\b'],              'exclude':r'(rsp|response)'},
    # Aero
    {'franchise':'Aero',                  'sport':'corrida',     'match':[r'\baero\b'],                 'gen_regex':r'aero\s+(\d+)'},
    # Alpha (chuteira)
    {'franchise':'Alpha Club AS',         'sport':'football',    'match':[r'alpha\s+club\s+as']},
    {'franchise':'Alfa Select AS',        'sport':'football',    'match':[r'(a\s+select|alfa\s+select)\s+as']},
    # Alpha family (chuteira) — Alpha Elite (futebol elite), Alpha II Japan MD
    {'franchise':'Alpha Elite',           'sport':'football',    'match':[r'alpha\s+elite']},
    {'franchise':'Alpha II Japan MD',     'sport':'football',    'match':[r'alpha\s+ii\s+japan\s+md']},
    {'franchise':'Alpha Japan',           'sport':'football',    'match':[r'alpha\s+japan']},
]

# ── OLYMPIKUS ───────────────────────────────────────────────────────────────
OLYMPIKUS = [
    # Corre family — each sub-line is a separate franchise
    {'franchise':'Corre Pace',            'sport':'corrida',     'match':[r'corre\s+pace']},
    {'franchise':'Corre Turbo',           'sport':'corrida',     'match':[r'corre\s+turbo']},
    {'franchise':'Corre Supra',           'sport':'corrida',     'match':[r'corre\s+supra'],            'gen_regex':r'supra\s+(\d+)'},
    {'franchise':'Corre Grafeno',         'sport':'corrida',     'match':[r'corre\s+grafeno'],          'gen_regex':r'grafeno\s+(\d+)'},
    {'franchise':'Corre Trilha',          'sport':'trail',       'match':[r'corre\s+trilha'],           'gen_regex':r'trilha\s+(\d+)'},
    {'franchise':'Corre Vento',           'sport':'corrida',     'match':[r'corre\s+vento'],            'gen_regex':r'vento\s+(\d+)'},
    {'franchise':'Corre Max',             'sport':'corrida',     'match':[r'corre\s+max']},
    {'franchise':'Corre S',               'sport':'corrida',     'match':[r'corre\s+s\b']},
    {'franchise':'Pós Corre',             'sport':'sandals',     'match':[r'p(ó|o)s\s+corre']},
    # Corre [numbered] — base running franchise. Special editions roll up here.
    {'franchise':'Corre [numbered]',      'sport':'corrida',     'match':[r'\bcorre\s+\d', r'\bcorre\d', r'corre\s+\d+\s+(?:maratona|vanderlei|strava|welcome|consci|50\s+anos|cb\s+outubro)'],
                                          'exclude':r'(pace|turbo|supra|grafeno|trilha|vento|max|p(ó|o)s)',
                                          'gen_regex':r'corre\s*(\d+)'},

    # Other running models — Olympikus has dozens; group by name
    {'franchise':'Challenger',            'sport':'corrida',     'match':[r'\bchallenger\b'],           'gen_regex':r'challenger\s+(\d+)'},
    {'franchise':'Pride',                 'sport':'corrida',     'match':[r'\bpride\b'],                'gen_regex':r'pride\s+(\d+)'},
    {'franchise':'Voa',                   'sport':'corrida',     'match':[r'\bvoa\b'],                  'gen_regex':r'voa\s+(\d+)'},
    {'franchise':'Proof',                 'sport':'corrida',     'match':[r'\bproof\b'],                'gen_regex':r'proof\s+(\d+)'},
    {'franchise':'Reverso',               'sport':'corrida',     'match':[r'\breverso\b'],              'gen_regex':r'reverso\s+(\d+)'},
    {'franchise':'Cyber',                 'sport':'corrida',     'match':[r'\bcyber\b'],                'gen_regex':r'cyber\s+(\d+)'},
    {'franchise':'Swift',                 'sport':'corrida',     'match':[r'\bswift\b'],                'gen_regex':r'swift\s+(\d+)'},
    {'franchise':'Adrena',                'sport':'corrida',     'match':[r'\badrena\b'],               'gen_regex':r'adrena\s+(\d+)'},
    {'franchise':'Soma',                  'sport':'corrida',     'match':[r'\bsoma\b'],                 'gen_regex':r'soma\s+(\d+)'},
    {'franchise':'Index',                 'sport':'corrida',     'match':[r'\bindex\b'],                'gen_regex':r'index\s+(\d+)'},
    {'franchise':'Veloz',                 'sport':'corrida',     'match':[r'\bveloz\b'],                'gen_regex':r'veloz\s+(\d+)'},
    {'franchise':'Triunfo',               'sport':'corrida',     'match':[r'\btriunfo\b'],              'gen_regex':r'triunfo\s+(\d+)'},
    {'franchise':'Sagaz',                 'sport':'corrida',     'match':[r'\bsagaz\b']},
    {'franchise':'Volta',                 'sport':'corrida',     'match':[r'\bvolta\b'],                'gen_regex':r'volta\s+(\d+)'},
    {'franchise':'Inverse',               'sport':'corrida',     'match':[r'\binverse\b'],              'gen_regex':r'inverse\s+(\d+)'},
    {'franchise':'Subverse',              'sport':'corrida',     'match':[r'\bsubverse\b'],             'gen_regex':r'subverse\s+(\d+)'},
    {'franchise':'Jogging 101',           'sport':'corrida',     'match':[r'jogging\s+101']},
    {'franchise':'Jogging 100',           'sport':'corrida',     'match':[r'jogging\s+100']},
    {'franchise':'Perfect',               'sport':'corrida',     'match':[r'\bperfect\b'],              'gen_regex':r'perfect\s+(\d+)'},
    {'franchise':'Only',                  'sport':'corrida',     'match':[r'\bonly\b'],                 'gen_regex':r'only\s+(\d+)'},
    {'franchise':'Diffuse',               'sport':'corrida',     'match':[r'\bdiffuse\b'],              'gen_regex':r'diffuse\s+(\d+)'},

    # Casual / Lifestyle
    {'franchise':'Versa',                 'sport':'casual',      'match':[r'\bversa\b']},
    {'franchise':'Marte',                 'sport':'casual',      'match':[r'\bmarte\b']},
    {'franchise':'Eros',                  'sport':'casual',      'match':[r'\beros\b'],                 'gen_regex':r'eros\s+(\d+)'},
    {'franchise':'Reflect',               'sport':'casual',      'match':[r'\breflect\b']},
    {'franchise':'Beats',                 'sport':'casual',      'match':[r'\bbeats\b']},
    {'franchise':'Asfalto',               'sport':'casual',      'match':[r'\basfalto\b']},
    {'franchise':'Urb',                   'sport':'casual',      'match':[r'\burb\b']},
    {'franchise':'Urbano AST',            'sport':'casual',      'match':[r'urbano\s+ast']},
    {'franchise':'Acqua',                 'sport':'casual',      'match':[r'\bacqua\b']},
    {'franchise':'Flutua',                'sport':'casual',      'match':[r'\bflutua\b'],               'gen_regex':r'flutua\s+(\d+)'},
    {'franchise':'Rua',                   'sport':'casual',      'match':[r'\brua\b']},
    {'franchise':'Stream',                'sport':'kids',        'match':[r'\bstream\b']},
    {'franchise':'Maneiro',               'sport':'kids',        'match':[r'\bmaneiro\b']},
    {'franchise':'Delta',                 'sport':'casual',      'match':[r'\bdelta\b']},
    {'franchise':'Volcan',                'sport':'corrida',     'match':[r'\bvolcan\b'],               'gen_regex':r'volcan\s+(\d+)'},
    {'franchise':'Citrus',                'sport':'casual',      'match':[r'\bcitrus\b'],               'gen_regex':r'citrus\s+(\d+)'},
    {'franchise':'Venus',                 'sport':'corrida',     'match':[r'\bvenus\b', r'\bvênus\b'],  'gen_regex':r'v(e|ê)nus\s+(\d+)'},
    {'franchise':'Easy',                  'sport':'casual',      'match':[r'\beasy\b'],                 'gen_regex':r'easy\s+(\d+)'},
    {'franchise':'Passo',                 'sport':'casual',      'match':[r'\bpasso\b']},
    {'franchise':'Circuito',              'sport':'corrida',     'match':[r'\bcircuito\b']},
    {'franchise':'Dynamic',               'sport':'casual',      'match':[r'\bdynamic\b']},
    {'franchise':'Ultraleve',             'sport':'corrida',     'match':[r'\bultraleve\b']},   # Different weights = same franchise (no gen)
    {'franchise':'Treino',                'sport':'training',    'match':[r'\btreino\b']},
    {'franchise':'Zex',                   'sport':'casual',      'match':[r'\bzex\b'],                  'gen_regex':r'zex\s+(\d+)'},
    {'franchise':'Nuvem',                 'sport':'casual',      'match':[r'\bnuvem\b']},
    {'franchise':'Pixel',                 'sport':'kids',        'match':[r'\bpixel\b']},
    {'franchise':'Curva',                 'sport':'casual',      'match':[r'\bcurva\b']},
    {'franchise':'Gama',                  'sport':'casual',      'match':[r'\bgama\b']},
    {'franchise':'Nível',                 'sport':'corrida',     'match':[r'\bn(í|i)vel\b']},
    {'franchise':'Rush',                  'sport':'corrida',     'match':[r'\brush\b']},
    {'franchise':'Poseidon',              'sport':'casual',      'match':[r'\bposeidon\b']},
    {'franchise':'Plato',                 'sport':'casual',      'match':[r'\bplato\b']},
    {'franchise':'Quartzo',               'sport':'casual',      'match':[r'\bquartzo\b']},
    {'franchise':'Bruma',                 'sport':'casual',      'match':[r'\bbruma\b']},
    {'franchise':'Vértice',               'sport':'casual',      'match':[r'\bv(é|e)rtice\b']},
    {'franchise':'Safira',                'sport':'casual',      'match':[r'\bsafira\b']},
    {'franchise':'Vibe',                  'sport':'casual',      'match':[r'\bvibe\b']},
    {'franchise':'Lance',                 'sport':'casual',      'match':[r'\blance\b']},
    {'franchise':'Virtuose',              'sport':'casual',      'match':[r'\bvirtuose\b']},
    {'franchise':'Qu4dra',                'sport':'casual',      'match':[r'qu4dra']},
    {'franchise':'Conex',                 'sport':'casual',      'match':[r'\bconex\b']},
    {'franchise':'Apolis',                'sport':'casual',      'match':[r'\bapolis\b']},
    {'franchise':'Nyx',                   'sport':'casual',      'match':[r'\bnyx\b']},
    {'franchise':'Atmos',                 'sport':'casual',      'match':[r'\batmos\b']},

    # Sandals
    {'franchise':'Melbourne',             'sport':'sandals',     'match':[r'\bmelbourne\b']},
    {'franchise':'Sereno',                'sport':'sandals',     'match':[r'\bsereno\b']},
    {'franchise':'Caraiva',               'sport':'sandals',     'match':[r'\bcara(í|i)va\b']},
    {'franchise':'Hydra',                 'sport':'sandals',     'match':[r'\bhydra\b']},
    {'franchise':'Patmos',                'sport':'sandals',     'match':[r'\bpatmos\b']},
    {'franchise':'Creta',                 'sport':'sandals',     'match':[r'\bcreta\b']},
    {'franchise':'Ibiza',                 'sport':'sandals',     'match':[r'\bibiza\b']},
    {'franchise':'Angra',                 'sport':'sandals',     'match':[r'\bangra\b']},

    # 921 (chinelo família)
    {'franchise':'Chinelo 921',           'sport':'sandals',     'match':[r'\b921\b']},
    # Alfa
    {'franchise':'Alfa',                  'sport':'corrida',     'match':[r'\balfa\b'],                 'gen_regex':r'alfa\s+(\d+)'},
    # 1975 (retro)
    {'franchise':'1975',                  'sport':'casual',      'match':[r'\b1975\b']},
    # Numbered base "5" — Olympikus 5 standalone
    {'franchise':'Olympikus 5',           'sport':'corrida',     'match':[r'olympikus\s+5\b']},
    # Other unmapped Olympikus
    {'franchise':'Angel',                 'sport':'casual',      'match':[r'\bangel\b'],                'gen_regex':r'angel\s+(\d+)'},
    {'franchise':'Aquarios',              'sport':'casual',      'match':[r'\baquarios\b']},
    {'franchise':'Apice',                 'sport':'corrida',     'match':[r'\b(á|a)pice\b']},
    {'franchise':'Anyway',                'sport':'casual',      'match':[r'\banyway\b'],               'gen_regex':r'anyway\s+(\d+)'},
    {'franchise':'Livre',                 'sport':'sandals',     'match':[r'\blivre\b']},
]

# ── UNDER ARMOUR ────────────────────────────────────────────────────────────
UNDER_ARMOUR = [
    # Running (Charged family)
    {'franchise':'Charged Slight SE',     'sport':'corrida',     'match':[r'charged\s+slight\s+se'],    'gen_regex':r'slight\s+se\s+(\d+)'},
    {'franchise':'Charged Slight',        'sport':'corrida',     'match':[r'charged\s+slight'],         'exclude':r'\bse\b',                  'gen_regex':r'slight\s+(\d+)'},
    {'franchise':'Charged Wing SE',       'sport':'corrida',     'match':[r'charged\s+wing\s+se']},
    {'franchise':'Charged Wing',          'sport':'corrida',     'match':[r'charged\s+wing'],           'exclude':r'\bse\b',                  'gen_regex':r'wing\s+(\d+)'},
    {'franchise':'Charged Skyline',       'sport':'corrida',     'match':[r'charged\s+skyline'],        'gen_regex':r'skyline\s+(\d+)'},
    {'franchise':'Charged Quicker',       'sport':'corrida',     'match':[r'charged\s+quicker'],        'gen_regex':r'quicker\s+(\d+)'},
    {'franchise':'Charged Great',         'sport':'corrida',     'match':[r'charged\s+great']},
    {'franchise':'Charged Hit SE',        'sport':'corrida',     'match':[r'charged\s+hit\s+se']},
    {'franchise':'Charged Hit',           'sport':'corrida',     'match':[r'charged\s+hit\b'],          'exclude':r'\bse\b'},
    {'franchise':'Charged Starlight SE',  'sport':'corrida',     'match':[r'charged\s+starlight\s+se']},
    {'franchise':'Charged Starlight',     'sport':'corrida',     'match':[r'charged\s+starlight\b'],    'exclude':r'\bse\b'},
    {'franchise':'Charged Sunny',         'sport':'corrida',     'match':[r'charged\s+sunny']},
    {'franchise':'Charged Endless',       'sport':'corrida',     'match':[r'charged\s+endless']},
    {'franchise':'Charged Nonstop',       'sport':'corrida',     'match':[r'charged\s+nonstop']},
    {'franchise':'Charged Essential',     'sport':'corrida',     'match':[r'charged\s+essential'],      'gen_regex':r'essential\s+(\d+)'},

    # HOVR family
    {'franchise':'HOVR Phantom',          'sport':'corrida',     'match':[r'hovr\s+phantom'],           'gen_regex':r'phantom\s+(\d+)'},
    {'franchise':'HOVR Sonic',            'sport':'corrida',     'match':[r'hovr\s+sonic'],             'gen_regex':r'sonic\s+(\d+)'},
    {'franchise':'HOVR Infinite',         'sport':'corrida',     'match':[r'hovr\s+infinite'],          'gen_regex':r'infinite\s+(\d+)'},

    # Velociti / Infinite
    {'franchise':'Velociti Elite',        'sport':'corrida',     'match':[r'velociti\s+elite'],         'gen_regex':r'elite\s+(\d+)'},
    {'franchise':'Velociti Pro',          'sport':'corrida',     'match':[r'velociti\s+pro'],           'gen_regex':r'pro\s+(\d+)'},
    {'franchise':'Velociti',              'sport':'corrida',     'match':[r'\bvelociti\b'],             'exclude':r'(elite|pro)',             'gen_regex':r'velociti\s+(\d+)'},
    {'franchise':'Infinite Elite',        'sport':'corrida',     'match':[r'infinite\s+elite']},
    {'franchise':'Infinite Pro',          'sport':'corrida',     'match':[r'infinite\s+pro']},

    # Surge / Pacer / etc.
    {'franchise':'Surge',                 'sport':'corrida',     'match':[r'\bsurge\b'],                'gen_regex':r'surge\s+(\d+)'},
    {'franchise':'Pacer',                 'sport':'corrida',     'match':[r'\bpacer\b']},

    # Phantom (non-HOVR)
    {'franchise':'Sportstyle Phantom',    'sport':'casual',      'match':[r'sportstyle\s+phantom'],     'gen_regex':r'phantom\s+(\d+)'},
    {'franchise':'Phantom',               'sport':'corrida',     'match':[r'\bphantom\b'],              'exclude':r'(hovr|sportstyle)',       'gen_regex':r'phantom\s+(\d+)'},

    # Training (Tribase family)
    {'franchise':'Tribase Reps',          'sport':'training',    'match':[r'tribase\s+reps'],           'gen_regex':r'reps\s+(\d+)'},
    {'franchise':'Tribase Cross SE',      'sport':'training',    'match':[r'tribase\s+cross\s+se']},
    {'franchise':'Tribase Cross',         'sport':'training',    'match':[r'tribase\s+cross'],          'exclude':r'\bse\b',                  'gen_regex':r'cross\s+(\d+)'},
    {'franchise':'Tribase Reign',         'sport':'training',    'match':[r'tribase\s+reign'],          'gen_regex':r'reign\s+(\d+)'},
    {'franchise':'Tribase Lift',          'sport':'training',    'match':[r'tribase\s+lift']},
    {'franchise':'Project Rock',          'sport':'training',    'match':[r'project\s+rock'],           'gen_regex':r'project\s+rock\s+(\d+)'},

    # Basketball
    {'franchise':'Curry 3Z7',             'sport':'basquete',    'match':[r'curry\s+3z7']},
    {'franchise':'Curry',                 'sport':'basquete',    'match':[r'\bcurry\b'],                'exclude':r'3z7',                     'gen_regex':r'curry\s+(\d+)'},
    {'franchise':'Buzzer',                'sport':'basquete',    'match':[r'\bbuzzer\b'],               'gen_regex':r'buzzer\s+(\d+)'},
    {'franchise':'Swish',                 'sport':'basquete',    'match':[r'\bswish\b'],                'gen_regex':r'swish\s+(\d+)'},
    {'franchise':'Dagger',                'sport':'basquete',    'match':[r'\bdagger\b']},
    {'franchise':'Dime',                  'sport':'basquete',    'match':[r'\bdime\b']},
    {'franchise':'Bankshot SE',           'sport':'basquete',    'match':[r'bankshot\s+se']},
    {'franchise':'Bankshot',              'sport':'basquete',    'match':[r'\bbankshot\b'],             'exclude':r'\bse\b'},
    {'franchise':'Hooper',                'sport':'basquete',    'match':[r'\bhooper\b']},
    {'franchise':'JET 21',                'sport':'basquete',    'match':[r'\bjet\s+21\b']},

    # Slight (non-Charged)
    {'franchise':'Slight',                'sport':'corrida',     'match':[r'\bslight\b'],               'exclude':r'charged',                 'gen_regex':r'slight\s+(\d+)'},

    # Other
    {'franchise':'Fat Tire Venture',      'sport':'trail',       'match':[r'fat\s+tire\s+venture']},
    {'franchise':'Defense Mid',           'sport':'casual',      'match':[r'defense\s+mid']},
    {'franchise':'Defense Low',           'sport':'casual',      'match':[r'defense\s+low']},

    # Sandals
    {'franchise':'Core',                  'sport':'sandals',     'match':[r'\bcore\b'],                 'gen_regex':r'core\s+(\d+)'},
    {'franchise':'Daily',                 'sport':'sandals',     'match':[r'\bdaily\b']},
    {'franchise':'Ansa Light',            'sport':'sandals',     'match':[r'ansa\s+light']},
    {'franchise':'Ansa Graphic',          'sport':'sandals',     'match':[r'ansa\s+graphic']},
    {'franchise':'Ansa Fix',              'sport':'sandals',     'match':[r'ansa\s+fix']},
    {'franchise':'Atlantic Dune',         'sport':'sandals',     'match':[r'atlantic\s+dune']},

    # Basketball
    {'franchise':'3Z6',                   'sport':'basquete',    'match':[r'\b3z6\b']},
    {'franchise':'3Z5',                   'sport':'basquete',    'match':[r'\b3z5\b']},

    # Kids — Charged variants
    {'franchise':'Charged Wing SE Kids',  'sport':'kids',        'match':[r'bgs\s+ch[\s\.]+wing\s+se', r'ch\s+wing\s+se.*infantil']},
    {'franchise':'Charged Quicker Kids',  'sport':'kids',        'match':[r'bgs\s+ch[\s\.]+quicker', r'ch[\s\.]+quicker.*infantil']},
    {'franchise':'Assert',                'sport':'kids',        'match':[r'\bassert\b'],               'gen_regex':r'assert\s+(\d+)'},

    # Other
    {'franchise':'Anatomix Suede',        'sport':'casual',      'match':[r'anatomix\s+suede']},
    {'franchise':'Arise',                 'sport':'corrida',     'match':[r'\barise\b']},
    {'franchise':'Aura',                  'sport':'training',    'match':[r'\baura\b']},
]

# ── Registry ────────────────────────────────────────────────────────────────
FRANCHISES_BY_BRAND = {
    'Adidas':       ADIDAS,
    'Nike':         NIKE,
    'Asics':        ASICS,
    'Mizuno':       MIZUNO,
    'Olympikus':    OLYMPIKUS,
    'Under Armour': UNDER_ARMOUR,
}

# Pre-compile regex for performance
for brand, rules in FRANCHISES_BY_BRAND.items():
    for rule in rules:
        rule['_match_compiled']   = [re.compile(p, re.IGNORECASE) for p in rule['match']]
        if 'exclude' in rule:
            rule['_exclude_compiled'] = re.compile(rule['exclude'], re.IGNORECASE)
        if 'gen_regex' in rule:
            rule['_gen_compiled'] = re.compile(rule['gen_regex'], re.IGNORECASE)

# Strip brand + product-type + gender tokens so regex patterns don't need to
# anticipate word-order variations in the catalog ("Tênis Adidas X" vs "X Adidas Tênis").
_NORMALIZE_STRIP = re.compile(
    r'\b(adidas|nike|asics|mizuno|olympikus|under\s+armour|ua|'
    r't[êe]nis|chuteira|chinelo|sand[áa]lia|sapatilha|papete|'
    r'masculino|feminino|unissex|masculina|feminina|junior|j[úu]nior|'
    r'infantil|kids?|menino|menina|adulto|adulta|'
    r'de\s+corrida|de\s+basquete|de\s+treino|de\s+futsal|de\s+campo|'
    r'casual|society|indoor|outdoor|originals|gs|ps|ts)\b',
    re.IGNORECASE
)
def normalize_name(name: str) -> str:
    s = _NORMALIZE_STRIP.sub(' ', name)
    s = re.sub(r'\s*-\s*', ' ', s)
    s = re.sub(r'\s{2,}', ' ', s).strip(' -')
    return s

def classify(brand: str, grandparent_name: str) -> tuple[str | None, int | None, str | None]:
    """Return (franchise, gen, sport_category) for a product, or (None, None, None)
    if it doesn't match any franchise rule for this brand.
    Year-style gens (e.g. 2024) are normalized to 24."""
    rules = FRANCHISES_BY_BRAND.get(brand)
    if not rules:
        return (None, None, None)
    name = normalize_name(grandparent_name)
    for rule in rules:
        # exclude check first
        if '_exclude_compiled' in rule and rule['_exclude_compiled'].search(name):
            continue
        # match check
        if any(pat.search(name) for pat in rule['_match_compiled']):
            gen = None
            if '_gen_compiled' in rule:
                m = rule['_gen_compiled'].search(name)
                if m:
                    # Find last numeric group with content
                    for grp in reversed(m.groups()):
                        if grp and grp.isdigit():
                            gen = int(grp)
                            break
                    if gen is not None and 2000 <= gen <= 2099:
                        gen -= 2000
            return (rule['franchise'], gen, rule['sport'])
    return (None, None, None)
