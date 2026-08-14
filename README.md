# RiboVine EvoES

RiboVine is a static research interface for inspecting traceable mammalian LSU
alignments and complete, offline-computed EvoES candidate scores. GitHub Pages
only downloads frozen JSON; MAFFT, RNAstructure CUDA, and random-null calculations never
run in the browser.

## Frozen scoring panel

- 61 mammalian LSU records: one human coordinate anchor and 60 nonhuman mammals
- 11 mammalian orders
- Rfam `RF02543` full-model coverage, bit score >= 1000, span 4,000-8,000 nt,
  ambiguous fraction <= 1%
- Every sequence keeps species, TaxID, accession, source URL, source coordinates,
  strand, MD5, and evidence class
- MAFFT E-INS-i (`--genafpair --maxiterate 1000 --ep 0`)

Only nonhuman mammals contribute to scores. Human defines ES and mature-28S
coordinates. Records with unresolved localization remain visible as
reference-only entries. They do not contribute to scores, and missing values are
never converted to zero.

## EvoES v2.0 scoring

For each human-coordinate window, species-level conservation is:

```text
C_i = M / (M + X + D + I)
```

Species require a callable fraction of at least 0.80. Scores are averaged first
within each mammalian order and then equally across callable orders. At least six
orders and order coverage >= 0.80 are required. Leave-one-order-out sensitivity
is retained in the cache.

Structural low entropy is calculated on the human reference with RNAstructure
5.7 `partition-cuda` (CUDA 11.8, `sm_89`, float fast-math) in a fixed `100 nt +
complete ES + 100 nt` context. Windows require `P_intra >= 0.30`. A `B=500`
dinucleotide-preserving null model yields `S_LE`, and the optional joint ranking
is:

```text
S_joint = sqrt(S_cons * S_LE)
```

The page lazily loads all 8,026 valid step-1 conservation windows from
`data/windows/<ES>.json`. The 30 windows that have completed the `B=500` GPU
null model also expose `S_LE` and `S_joint`; other windows are explicitly marked
as conservation-only while background checkpoints continue.

The scoring-boundary view keeps all 22 human ES records visible and separates
8 preliminary candidates, 12 core-pairing holds, and 2 unresolved coordinate or
structure scopes. No ES is labeled as a confirmed evolutionary birth event:
the deep covariance-model birth-node gate remains pending.

## Rebuild

The reproducible offline steps live outside the static site:

- `../scripts/fetch_expanded_mammal_lsu.py`
- `../scripts/build_evoes_static_cache.py`
- `../scripts/compute_evoes_null_cache.py`
- `../scripts/compute_evoes_gpu_cache.py`
- `../scripts/publish_evoes_checkpoints.py`
- `../scripts/publish_evoes_all_windows.py`

The representative cache is `data/evoes_static_cache_v2.json`; the all-window
manifest is `data/windows/manifest.json`.
