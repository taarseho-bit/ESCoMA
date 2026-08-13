# RiboVine prototype

Interactive workspace for browsing curated human expansion-segment references and ranking conserved windows after a validated cross-species alignment is loaded.

## Score

For every sliding window:

- `identity = matching pair-sites / comparable pair-sites`
- `coverage = comparable pair-sites / all possible pair-sites`
- `score = identity * coverage`

The built-in reference layer contains 22 curated Homo sapiens ES records from Human ES Reference v1.2. Twenty 28S ES are projected from a MAFFT G-INS-i whole-28S alignment across 37 mammals and receive separate boundary-anchor and mapped-base QC. This produces 740 auditable ES-by-species calls: 687 pass and 53 remain unresolved. Failed localization is retained but excluded from scoring and is never interpreted as ES absence.

ES3L belongs to 5.8S and ES4L spans the 5.8S/28S boundary. They remain visible as human references but require a dedicated composite LSU alignment before cross-species scoring. ES shorter than 20 nt are scored as a whole segment instead of forcing a 20 nt window.

The **数据总览** view reports upstream database layers, per-ES mammal coverage, per-species ES coverage, the complete ES-by-species QC matrix, clickable source records and literature/structure provenance. Each matrix cell and alignment species label links to its NCBI accession. SILVA, Rfam, ROD and RNAcentral collections overlap and are not summed as unique sequences.

New traceable source layers include the locally verified Rfam RF00002 5.8S family and ROD v1.2 full-length eukaryotic rDNA operons. ROD keeps 5.8S and 28S on the same genomic operon and is therefore the priority substrate for future ES3L/ES4L localization; neither source is treated as a completed ES boundary call until ES-specific QC passes.

The low-entropy track is normalized sequence entropy (`1 - H/ln(4)`) from the MSA. It is not structural entropy and the interface does not generate structural predictions.

## Input

Use the **导入对齐 FASTA** command for custom data. Sequences must already be aligned and have equal lengths. Optional headers can specify a clade:

```fasta
>Homo_sapiens|Mammalia
ACGUACGU--ACGU
>Mus_musculus|Mammalia
ACGUACGUUUACGU
```
