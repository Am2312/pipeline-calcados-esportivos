"""
validate_franchise_mapping.py
=============================
Applies the curated franchise_mapping to the cleaned catalog (from
franchise_mapping_details.csv) and reports coverage + unmapped names.

Output:
  - franchise_mapping_coverage.txt : per-brand coverage stats, unmapped sample
  - franchise_mapping_classified.csv : every grandparent_name + assigned
    franchise / gen / sport (or blank if unmapped)
"""
import os
import sys
import csv
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8')

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
from franchise_mapping import classify  # noqa: E402

IN_CSV  = os.path.join(SCRIPT_DIR, "franchise_mapping_details.csv")
OUT_CSV = os.path.join(SCRIPT_DIR, "franchise_mapping_classified.csv")
OUT_TXT = os.path.join(SCRIPT_DIR, "franchise_mapping_coverage.txt")

def main():
    rows = []
    with open(IN_CSV, encoding='utf-8-sig', newline='') as f:
        r = csv.DictReader(f)
        for row in r:
            rows.append(row)

    classified = []
    skus_by_brand = defaultdict(int)
    mapped_skus_by_brand = defaultdict(int)
    mapped_franchises_by_brand = defaultdict(set)
    unmapped_samples = defaultdict(list)

    for row in rows:
        brand = row['brand']
        gp    = row['grandparent_name']
        n     = int(row['n_skus_gp'])
        franchise, gen, sport = classify(brand, gp)
        classified.append({**row, 'franchise': franchise or '',
                                  'gen': gen if gen is not None else '',
                                  'sport': sport or ''})
        skus_by_brand[brand] += n
        if franchise:
            mapped_skus_by_brand[brand] += n
            mapped_franchises_by_brand[brand].add(franchise)
        else:
            if len(unmapped_samples[brand]) < 20:
                unmapped_samples[brand].append(f"  ({n:>3} SKUs) {gp}")

    # Write classified CSV
    fields = list(classified[0].keys())
    with open(OUT_CSV, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
        w.writeheader()
        w.writerows(classified)

    # Report
    lines = []
    lines.append("=" * 64)
    lines.append("FRANCHISE MAPPING — Coverage report")
    lines.append("=" * 64)
    lines.append("")
    for b in sorted(skus_by_brand):
        tot = skus_by_brand[b]
        mp  = mapped_skus_by_brand[b]
        cov = 100 * mp / tot if tot else 0
        lines.append(f"  {b:<14}  {mp:>6}/{tot:>6} SKUs ({cov:>5.1f}%)   {len(mapped_franchises_by_brand[b]):>3} franchises mapped")
    lines.append("")
    lines.append("Unmapped sample by brand (high-volume first, top 20):")
    for b in sorted(unmapped_samples):
        if not unmapped_samples[b]: continue
        # Sort by n SKUs desc
        sorted_samples = sorted(unmapped_samples[b], key=lambda s: -int(s.split('(')[1].split(' SKUs')[0]))
        lines.append(f"\n  ─── {b} ───")
        lines += sorted_samples[:20]
    report = "\n".join(lines)
    with open(OUT_TXT, 'w', encoding='utf-8') as f:
        f.write(report)
    print(report)

if __name__ == '__main__':
    main()
