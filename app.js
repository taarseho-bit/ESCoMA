(() => {
  "use strict";

  const WINDOW_COLORS = { 20: "#0072B2", 30: "#009E73", 40: "#CC79A7", 50: "#D55E00" };
  const WHOLE_SEGMENT_COLOR = "#E69F00";
  const TAXON_STYLES = {
    Primates: { label: "灵长目", color: "#0065A8" },
    Rodentia: { label: "啮齿目", color: "#C63D2F" },
    Lagomorpha: { label: "兔形目", color: "#D27A00" },
    Carnivora: { label: "食肉目", color: "#00866A" },
    Cetartiodactyla: { label: "鲸偶蹄目", color: "#9B4F96" },
    Perissodactyla: { label: "奇蹄目", color: "#6C4FA3" },
    Chiroptera: { label: "翼手目", color: "#0087A8" },
    Eulipotyphla: { label: "真盲缺目", color: "#4C7F28" },
    Proboscidea: { label: "长鼻目", color: "#625C57" },
    Cingulata: { label: "有甲目", color: "#B23A73" },
    Didelphimorphia: { label: "负鼠目", color: "#8A4E20" },
    Mammalia: { label: "哺乳纲 · 系统位置未映射", color: "#52616B" },
    Aves: { label: "鸟纲 · 仅展示", color: "#3A6F8F" },
    Reptilia: { label: "爬行类 · 仅展示", color: "#777D2D" },
    Amphibia: { label: "两栖纲 · 仅展示", color: "#31805F" },
    Actinopterygii: { label: "辐鳍鱼纲 · 仅展示", color: "#277DA1" },
    Chondrichthyes: { label: "软骨鱼纲 · 仅展示", color: "#756A78" },
    Vertebrata: { label: "其他脊椎动物 · 仅展示", color: "#5D6D79" },
    Metazoa: { label: "其他动物 · 仅展示", color: "#8A6742" },
    Eukaryota: { label: "其他真核生物 · 仅展示", color: "#76699A" },
    Other: { label: "系统位置未映射 · 仅展示", color: "#9AA2A8" }
  };

  // Relative to the human lineage. Orders in the same distance tier share the
  // same human-facing ancestor; displayRank only keeps sister groups stable.
  const HUMAN_PHYLOGENETIC_ORDER = {
    Human: { distanceTier: -1, displayRank: 0 },
    Primates: { distanceTier: 0, displayRank: 0 },
    Lagomorpha: { distanceTier: 1, displayRank: 0 },
    Rodentia: { distanceTier: 1, displayRank: 1 },
    Eulipotyphla: { distanceTier: 2, displayRank: 0 },
    Chiroptera: { distanceTier: 2, displayRank: 1 },
    Perissodactyla: { distanceTier: 2, displayRank: 2 },
    Cetartiodactyla: { distanceTier: 2, displayRank: 3 },
    Carnivora: { distanceTier: 2, displayRank: 4 },
    Proboscidea: { distanceTier: 3, displayRank: 0 },
    Cingulata: { distanceTier: 3, displayRank: 1 },
    Didelphimorphia: { distanceTier: 4, displayRank: 0 },
    Mammalia: { distanceTier: 5, displayRank: 0 },
    Aves: { distanceTier: 6, displayRank: 0 },
    Reptilia: { distanceTier: 6, displayRank: 1 },
    Amphibia: { distanceTier: 7, displayRank: 0 },
    Actinopterygii: { distanceTier: 8, displayRank: 0 },
    Chondrichthyes: { distanceTier: 9, displayRank: 0 },
    Vertebrata: { distanceTier: 10, displayRank: 0 },
    Metazoa: { distanceTier: 11, displayRank: 0 },
    Eukaryota: { distanceTier: 12, displayRank: 0 },
    Other: { distanceTier: 13, displayRank: 0 }
  };

  const NON_MAMMAL_TAXON_RULES = [
    { key: "Aves", clades: ["Aves"] },
    { key: "Reptilia", clades: ["Reptilia", "Sauropsida"] },
    { key: "Amphibia", clades: ["Amphibia"] },
    { key: "Actinopterygii", clades: ["Actinopterygii"] },
    { key: "Chondrichthyes", clades: ["Chondrichthyes"] },
    { key: "Vertebrata", clades: ["Vertebrata"] },
    { key: "Metazoa", clades: ["Metazoa"] },
    { key: "Eukaryota", clades: ["Eukaryota"] }
  ];

  const PRIMATE_PROXIMITY_BY_GENUS = {
    Pan: 0,
    Gorilla: 1,
    Pongo: 2,
    Nomascus: 3,
    Cercocebus: 4,
    Chlorocebus: 4,
    Colobus: 4,
    Macaca: 4,
    Mandrillus: 4,
    Papio: 4,
    Rhinopithecus: 4,
    Theropithecus: 4,
    Callithrix: 5,
    Cebus: 5,
    Microcebus: 6
  };

  const SPECIES_NAME_COLLATOR = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

  const state = {
    datasets: {},
    currentEs: "ES27L",
    selectedWindows: new Set([20]),
    visibleSeries: new Set([20]),
    rankMode: "all",
    rankMetric: "auto",
    topN: 20,
    results: [],
    selected: null,
    humanReferencePayload: null,
    allEsSummary: null,
    librarySummary: null,
    databaseCatalog: null,
    provenanceCatalog: null,
    lsuInventory: null,
    inventoryFilter: "all",
    inventoryQuery: "",
    selectedInventoryAccession: null,
    allWindowsManifest: null,
    scopeFilter: "all",
    activeTab: "landscape",
    alignmentMode: "full",
    alignmentRenderKey: null,
    activeInsertionButton: null,
    statisticsDirty: true
  };

  const SCOPE_LABELS = {
    preliminary: { label: "纳入当前评分", short: "可评分", className: "preliminary" },
    core_hold: { label: "核心配对风险暂停", short: "核心风险", className: "core-hold" },
    unresolved: { label: "坐标或结构范围未决", short: "定位未决", className: "unresolved" }
  };

  function scopeClassFor(record) {
    if (record.screening_status === "manual_review_coordinate_and_structure_scope") return "unresolved";
    if (record.screening_status === "hold_at_preliminary_structure_gate") return "core_hold";
    return "preliminary";
  }

  function populateEsSelect() {
    const select = document.getElementById("esSelect");
    select.replaceChildren();
    const records = state.humanReferencePayload?.records ?? [];
    const grouped = [
      {
        label: "图谱区段",
        records: records.filter(record => state.datasets[record.es_id]?.analysisReady),
        disabled: false
      },
      {
        label: "核心配对区段",
        records: records.filter(record => !state.datasets[record.es_id]?.analysisReady && scopeClassFor(record) === "core_hold"),
        disabled: true
      },
      {
        label: "边界待确认区段",
        records: records.filter(record => !state.datasets[record.es_id]?.analysisReady && scopeClassFor(record) === "unresolved"),
        disabled: true
      }
    ];
    grouped.filter(group => group.records.length).forEach(group => {
      const optionGroup = document.createElement("optgroup");
      optionGroup.label = `${group.label}（${group.records.length}）`;
      optionGroup.className = group.disabled ? "es-group-disabled" : "es-group-enabled";
      group.records.forEach(record => {
        const option = new Option(`${record.es_id} · ${record.length_nt} nt`, record.es_id);
        option.disabled = group.disabled;
        optionGroup.appendChild(option);
      });
      select.appendChild(optionGroup);
    });
    select.value = state.currentEs;
  }

  function createHumanReferenceDataset(record) {
    return {
      name: record.es_id,
      label: `${record.es_id} 人源真实参考`,
      dataScope: "human_reference_only",
      simulated: false,
      analysisReady: false,
      humanCoordinateOffset: Number.isFinite(record.start_incl) ? record.start_incl - 1 : null,
      metadata: record,
      sequences: [{
        name: "Homo sapiens",
        lineage: "Mammalia",
        clades: ["Eukaryota", "Metazoa", "Vertebrata", "Mammalia"],
        sequence: record.sequence
      }]
    };
  }

  async function loadHumanReferences() {
    const response = await fetch("data/human_es_reference_v1.2.json?v=1.2.0");
    if (!response.ok) throw new Error(`人源参考数据载入失败（HTTP ${response.status}）`);
    const payload = await response.json();
    if (!Array.isArray(payload.records) || payload.records.length !== 22) throw new Error("人源参考数据应包含22条ES记录。");
    state.humanReferencePayload = payload;
    payload.records.forEach(record => {
      state.datasets[record.es_id] = createHumanReferenceDataset(record);
    });
    state.currentEs = state.datasets.ES27L ? "ES27L" : payload.records[0].es_id;
    populateEsSelect();
    renderScopeCurrent();
  }

  async function loadBuiltInAllEsAlignments() {
    const response = await fetch("data/evoes_static_cache_v2.json?v=2.1.0-gpu30");
    if (!response.ok) throw new Error(`EvoES离线评分缓存载入失败（HTTP ${response.status}）`);
    const payload = await response.json();
    if (payload.schema_version !== "2.1.0" || !payload.datasets || !payload.scoring?.human_excluded || payload.scoring?.display_policy !== "complete_representative_windows_only") {
      throw new Error("EvoES离线评分缓存未通过版本或人源排除检查。");
    }
    Object.entries(payload.datasets).forEach(([esId, dataset]) => {
      const humanReference = state.datasets[esId];
      if (!humanReference) throw new Error(`v1.2人源参考中缺少${esId}。`);
      if (!Array.isArray(dataset.sequences) || dataset.sequences.length < 2) throw new Error(`${esId}缺少可评分序列。`);
      const length = dataset.sequences[0].sequence.length;
      if (dataset.sequences.some(sequence => sequence.sequence.length !== length || sequence.qc_status !== "PASS")) {
        throw new Error(`${esId}未通过等长或定位QC检查。`);
      }
      const human = dataset.sequences.find(sequence => sequence.name === "Homo sapiens");
      if (!human || human.sequence.replaceAll("-", "") !== humanReference.metadata.sequence) {
        throw new Error(`${esId}的人源MSA序列与v1.2参考不一致。`);
      }
      state.datasets[esId] = {
        ...humanReference,
        ...dataset,
        dataScope: dataset.data_scope,
        analysisReady: dataset.analysis_ready,
        humanCoordinateOffset: dataset.human_coordinate_offset,
        representativeWindows: dataset.windows,
        allWindowsLoaded: false
      };
    });
    const availableIds = new Set(Object.keys(payload.datasets));
    const preferredEs = availableIds.has("ES27L") && payload.datasets.ES27L.windows.length
      ? "ES27L"
      : Object.entries(payload.datasets).find(([, dataset]) => dataset.windows.length)?.[0];
    state.currentEs = preferredEs || [...availableIds][0];
    populateEsSelect();
    state.staticCache = payload;
    state.allEsSummary = buildStaticSummary(payload);
    markStatisticsDirty();
  }

  async function loadAllWindowManifest() {
    const response = await fetch("data/windows/manifest.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`全滑窗索引载入失败（HTTP ${response.status}）`);
    const manifest = await response.json();
    if (manifest.schema_version !== "1.0.0" || !manifest.datasets || manifest.step_nt !== 1) {
      throw new Error("全滑窗索引未通过版本或步长检查。");
    }
    state.allWindowsManifest = manifest;
    markStatisticsDirty();
  }

  async function ensureAllWindowsLoaded(esId) {
    const dataset = state.datasets[esId];
    const entry = state.allWindowsManifest?.datasets?.[esId];
    if (!dataset?.analysisReady || !entry || dataset.allWindowsLoaded) return;
    document.getElementById("analysisStatus").textContent = `正在载入 ${entry.window_count.toLocaleString()} 个逐 1 nt 窗口`;
    const cacheKey = entry.cache_key || "1.0.0-20260814-b49";
    const response = await fetch(`data/${entry.file}?v=${cacheKey}`);
    if (!response.ok) throw new Error(`${esId}全滑窗载入失败（HTTP ${response.status}）`);
    const payload = await response.json();
    if (payload.es_id !== esId || payload.window_count !== entry.window_count || !Array.isArray(payload.windows)) {
      throw new Error(`${esId}全滑窗缓存未通过完整性检查。`);
    }
    dataset.windows = payload.windows;
    dataset.allWindowsLoaded = true;
    dataset.summary = {
      ...dataset.summary,
      all_window_count: payload.window_count,
      complete_window_count: payload.complete_low_entropy_windows,
      demo_window_count: payload.demo_low_entropy_windows ?? 0,
      scored_window_count: payload.scored_low_entropy_windows ?? payload.complete_low_entropy_windows,
      planned_window_count: payload.window_count,
      step_nt: payload.step_nt
    };
  }

  async function analyzeWithWindowCache() {
    const esId = state.currentEs;
    const dataset = state.datasets[esId];
    renderScopeCurrent();
    if (!dataset?.analysisReady) {
      analyze();
      return;
    }
    try {
      await ensureAllWindowsLoaded(esId);
      if (state.currentEs === esId) analyze();
    } catch (error) {
      document.getElementById("analysisStatus").textContent = error.message;
      console.error(error);
    }
  }

  function buildStaticSummary(payload) {
    const perEs = [];
    const speciesMap = new Map();
    let calls = 0;
    Object.entries(payload.datasets).forEach(([esId, dataset]) => {
      const nonhuman = dataset.sequences.filter(item => !/^Homo sapiens$/i.test(item.name));
      perEs.push({ es_id: esId, homology_calls: nonhuman.length, species_pass: nonhuman.length });
      calls += nonhuman.length;
      nonhuman.forEach(item => {
        const current = speciesMap.get(item.taxid) || {
          species: item.name, taxid: item.taxid, accession: item.accession,
          source_database: item.source_database, source_url: item.source_url,
          order: item.order, es_calls: 0, es_pass: 0
        };
        current.es_calls += 1;
        current.es_pass += 1;
        speciesMap.set(item.taxid, current);
      });
    });
    return {
      human_reference_es_count: state.humanReferencePayload?.records?.length || 22,
      directly_mapped_28s_es_count: perEs.length,
      pending_composite_es: [],
      mammal_species_count: speciesMap.size,
      es_species_calls: calls,
      pass_calls: calls,
      per_es: perEs,
      per_species: [...speciesMap.values()].sort((a, b) => b.es_pass - a.es_pass || a.species.localeCompare(b.species))
    };
  }

  async function loadLsuLibraryStatus() {
    const target = document.getElementById("lsuLibraryStatus");
    try {
      const response = await fetch("data/cross_species_lsu_validation_summary.json?v=1.0.0");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const summary = await response.json();
      state.librarySummary = summary;
      if (target) target.textContent = `${summary.combined_fasta_records}/${summary.panel_species} 通过QC`;
      markStatisticsDirty();
    } catch {
      if (target) target.textContent = "QC状态不可用";
    }
  }

  async function loadDatabaseCatalog() {
    try {
      const response = await fetch("data/database_catalog.json?v=1.0.0");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.databaseCatalog = await response.json();
      markStatisticsDirty();
    } catch (error) {
      console.warn("数据库目录暂不可用", error);
    }
  }

  async function loadProvenanceCatalog() {
    try {
      const response = await fetch("data/provenance_catalog.json?v=1.0.0");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.provenanceCatalog = await response.json();
      markStatisticsDirty();
    } catch (error) {
      console.warn("可追溯目录暂不可用", error);
    }
  }

  async function loadCrossSpeciesInventory() {
    try {
      const response = await fetch("data/cross_species_lsu_inventory_v2.json?v=1.0.0-20260814");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.schema_version !== "1.0.0" || !Array.isArray(payload.records)) {
        throw new Error("跨物种LSU清单格式不完整");
      }
      state.lsuInventory = payload;
      state.selectedInventoryAccession = payload.records[0]?.accession || null;
      markStatisticsDirty();
    } catch (error) {
      const target = document.getElementById("inventoryStatus");
      if (target) target.textContent = "跨物种LSU序列清单暂不可用";
      console.warn("跨物种LSU清单暂不可用", error);
    }
  }

  function taxonomyFor(species) {
    if (/^Homo sapiens$/i.test(species.name)) return { key: "Human", label: "人源参考", color: "#243E55", scoring: false };
    const mammal = species.clades?.includes("Mammalia") || species.lineage === "Mammalia";
    const lineage = new Set([species.lineage, ...(species.clades || [])].filter(Boolean));
    const nonMammalKey = NON_MAMMAL_TAXON_RULES.find(rule => rule.clades.some(clade => lineage.has(clade)))?.key || "Other";
    const key = mammal ? (species.order || "Mammalia") : nonMammalKey;
    const style = TAXON_STYLES[key] || (mammal ? TAXON_STYLES.Mammalia : TAXON_STYLES.Other);
    return { key, ...style, scoring: mammal && Boolean(species.order) };
  }

  function phylogeneticPosition(species) {
    const taxon = taxonomyFor(species);
    const mammal = species.clades?.includes("Mammalia") || species.lineage === "Mammalia";
    const orderPosition = HUMAN_PHYLOGENETIC_ORDER[taxon.key] ||
      HUMAN_PHYLOGENETIC_ORDER[mammal ? "Mammalia" : "Other"];
    const genus = String(species.name || "").trim().split(/\s+/)[0];
    const withinOrderRank = taxon.key === "Primates"
      ? (PRIMATE_PROXIMITY_BY_GENUS[genus] ?? Number.MAX_SAFE_INTEGER)
      : 0;
    return { ...orderPosition, withinOrderRank };
  }

  function compareByHumanPhylogeneticDistance(a, b) {
    const positionA = phylogeneticPosition(a);
    const positionB = phylogeneticPosition(b);
    return positionA.distanceTier - positionB.distanceTier ||
      positionA.displayRank - positionB.displayRank ||
      positionA.withinOrderRank - positionB.withinOrderRank ||
      SPECIES_NAME_COLLATOR.compare(String(a.name || a.accession || ""), String(b.name || b.accession || "")) ||
      SPECIES_NAME_COLLATOR.compare(String(a.taxid || ""), String(b.taxid || ""));
  }

  function findHumanSequence(sequences) {
    return sequences.find(item => /^Homo sapiens$/i.test(item.name.trim())) ||
      sequences.find(item => /Homo[ _]sapiens/i.test(item.name));
  }

  function humanCoordinateMap(human) {
    const alignmentColumns = [];
    for (let column = 0; column < human.sequence.length; column++) {
      if (human.sequence[column] !== "-") alignmentColumns.push(column);
    }
    return { alignmentColumns, length: alignmentColumns.length };
  }

  function analyze() {
    const dataset = state.datasets[state.currentEs];
    if (!dataset) return;
    const sequences = dataset.sequences;
    const alignmentLength = sequences[0]?.sequence.length || 0;
    const human = findHumanSequence(sequences);
    if (!human) throw new Error("当前数据集中未找到 Homo sapiens 人源参考序列。");
    const humanMap = humanCoordinateMap(human);
    updateControlsForDataset(dataset, humanMap.length);
    if (!dataset.analysisReady) {
      state.results = [];
      state.selected = null;
      renderHumanReference(dataset, sequences, humanMap.length);
      return;
    }
    const selectedSizes = new Set(analysisWindowSizes(humanMap.length));
    const results = (dataset.windows || []).filter(window =>
      selectedSizes.has(window.window_length) &&
      [window.S_cons, window.order_coverage].every(Number.isFinite)
    ).map(window => {
      const columns = humanMap.alignmentColumns.slice(window.human_es_start - 1, window.human_es_end);
      return {
        ...window,
        size: window.window_length,
        start: window.alignment_start - 1,
        end: window.alignment_end - 1,
        alignmentColumns: columns,
        humanStart: window.human_es_start,
        humanEnd: window.human_es_end,
        score: window.S_cons,
        lowEntropy: Number.isFinite(window.S_LE) ? window.S_LE : null,
        coverage: window.order_coverage,
        jointScore: Number.isFinite(window.S_joint) ? window.S_joint : null,
        scoreStatus: window.score_status || (Number.isFinite(window.S_LE) && Number.isFinite(window.S_joint) ? `demo_b${window.null_B}` : "conservation_only")
      };
    });
    state.results = results;
    const ranked = getRankedResults(results);
    state.selected = ranked[0] || null;
    render(dataset, sequences, ranked, humanMap.length);
  }

  function overlapFraction(a, b) {
    const overlap = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start) + 1);
    return overlap / Math.min(a.size, b.size);
  }

  function getRankedResults(results) {
    const passing = results.filter(item =>
      item.conservation_qc === "pass" && item.structure_gate_status === "pass" &&
      [item.score, item.coverage].every(Number.isFinite)
    );
    const metric = state.rankMetric === "auto"
      ? (passing.some(item => Number.isFinite(item.jointScore)) ? "joint" : "conservation")
      : state.rankMetric;
    const eligible = passing.filter(item => {
      if (metric === "joint") return Number.isFinite(item.jointScore);
      if (metric === "low_entropy") return Number.isFinite(item.lowEntropy);
      return true;
    });
    const valueFor = item => metric === "joint" ? item.jointScore : metric === "low_entropy" ? item.lowEntropy : item.score;
    const sorted = [...eligible].sort((a, b) => {
      return valueFor(b) - valueFor(a) || b.score - a.score || (b.lowEntropy ?? -1) - (a.lowEntropy ?? -1) || a.size - b.size || a.start - b.start;
    });
    if (state.rankMode === "all") return sorted;
    const accepted = [];
    for (const candidate of sorted) {
      const overlapsPeak = accepted.some(existing => {
        const overlap = Math.max(0, Math.min(existing.humanEnd, candidate.humanEnd) - Math.max(existing.humanStart, candidate.humanStart) + 1);
        return overlap >= 10;
      });
      if (!overlapsPeak) accepted.push(candidate);
      if (accepted.length >= 100) break;
    }
    return accepted;
  }

  function pct(value) { return `${(value * 100).toFixed(1)}%`; }
  function analysisWindowSizes(humanLength) {
    const selected = [...state.selectedWindows].filter(size => size <= humanLength).sort((a, b) => a - b);
    return selected;
  }
  function visibleAnalysisSizes() {
    const available = [...new Set(state.results.map(item => item.size))];
    return available.filter(size => state.visibleSeries.has(size) || !WINDOW_COLORS[size]).sort((a, b) => a - b);
  }
  function windowColor(size) { return WINDOW_COLORS[size] || WHOLE_SEGMENT_COLOR; }
  function scoreFmt(value) { return Number.isFinite(value) ? value.toFixed(1) : "—"; }
  function humanCoordinateText(window) { return `${window.humanStart}–${window.humanEnd}`; }
  function humanAbsolutePosition(position) {
    const offset = state.datasets[state.currentEs]?.humanCoordinateOffset;
    return Number.isFinite(offset) ? offset + position : position;
  }
  function humanAbsoluteCoordinateText(window) {
    const offset = state.datasets[state.currentEs]?.humanCoordinateOffset;
    return Number.isFinite(offset) ? `${offset + window.humanStart}–${offset + window.humanEnd}` : "--";
  }
  function alignmentCoordinateText(window) { return `${window.start + 1}–${window.end + 1}`; }

  function render(dataset, sequences, ranked, humanLength = humanCoordinateMap(findHumanSequence(sequences)).length) {
    const scoringSequences = sequences.filter(item => !/^Homo sapiens$/i.test(item.name));
    const scoringOrders = new Set(scoringSequences.map(item => item.order).filter(Boolean)).size;
    document.getElementById("speciesCount").textContent = `${scoringSequences.length} 种非人哺乳动物 · ${scoringOrders} 目`;
    const allWindows = dataset.summary?.all_window_count ?? dataset.windows?.length ?? 0;
    const completeWindows = dataset.summary?.complete_window_count ?? 0;
    const demoWindows = dataset.summary?.demo_window_count ?? 0;
    const conservationOnlyWindows = Math.max(0, allWindows - completeWindows - demoWindows);
    document.getElementById("analysisStatus").textContent = `${allWindows.toLocaleString()} 个 · 正式 ${completeWindows} · 预览 ${demoWindows}${conservationOnlyWindows ? ` · 仅保守 ${conservationOnlyWindows}` : ""}`;
    document.getElementById("entropyMethod").innerHTML = '<i class="method-symbol coverage"></i>低熵：二核苷酸零模型';
    document.getElementById("dataNotice").textContent = `${dataset.summary?.scoring_species ?? sequences.length - 1}种非人哺乳动物参与评分`;
    const metric = state.rankMetric === "auto" ? (state.results.some(item => Number.isFinite(item.jointScore)) ? "联合分数" : "保守性") : ({ conservation: "保守性", low_entropy: "结构低熵", joint: "联合分数" }[state.rankMetric]);
    document.getElementById("rankingMethodNote").textContent = state.rankMode === "all"
      ? `全部合格窗口 · 按${metric}排序`
      : `去冗余窗口 · 按${metric}排序 · 重叠 ≥ 10 nt 者剔除`;
    renderSummary(state.selected, dataset.summary?.scoring_species ?? sequences.length - 1);
    renderLegend();
    renderTaxonLegend(sequences);
    renderRanking(ranked.slice(0, state.topN));
    if (state.activeTab === "landscape") {
      renderChart(humanLength);
      renderSelection(sequences);
    }
  }

  function updateControlsForDataset(dataset, humanLength) {
    const referenceOnly = !dataset.analysisReady;
    if (!referenceOnly && ![...state.selectedWindows].some(size => size <= humanLength) && humanLength >= 20) {
      state.selectedWindows.add(20);
      state.visibleSeries.add(20);
    }
    document.getElementById("rankMode").disabled = referenceOnly;
    document.getElementById("rankMetric").disabled = referenceOnly;
    document.getElementById("exportButton").disabled = referenceOnly;
    renderWindowPicker(humanLength, referenceOnly);
  }

  function renderHumanReference(dataset, sequences, humanLength) {
    const meta = dataset.metadata;
    document.getElementById("speciesCount").textContent = "当前不评分";
    document.getElementById("analysisStatus").textContent = "仅展示人源参考";
    document.getElementById("rankingMethodNote").textContent = `${SCOPE_LABELS[scopeClassFor(meta)].label}：${scopeAction(meta)}`;
    document.getElementById("entropyMethod").innerHTML = '<i class="method-symbol coverage"></i>低熵：二核苷酸零模型';
    document.getElementById("dataNotice").textContent = "当前 ES 不参与评分";
    document.getElementById("topCoordinates").textContent = "--";
    document.getElementById("topContext").textContent = "仅展示人源参考";
    document.getElementById("topScore").textContent = "--";
    document.getElementById("topLowEntropy").textContent = "--";
    document.getElementById("topEntropyContext").textContent = "当前不评分";
    document.getElementById("topCoverage").textContent = "--";
    document.getElementById("topCoverageContext").textContent = "当前不评分";
    document.getElementById("legend").innerHTML = '<span class="reference-legend">仅展示人源参考</span>';
    renderReferenceChart(humanLength);
    renderReferenceAlignment(dataset, sequences[0]);
    renderReferenceRanking();
  }

  function renderReferenceChart(length) {
    const wrap = document.getElementById("chart");
    const width = Math.max(320, wrap.clientWidth || 900);
    const height = width < 560 ? 340 : 320;
    const margin = { top: 40, right: 20, bottom: 42, left: width < 560 ? 68 : 108 };
    const plotW = width - margin.left - margin.right;
    const trackH = width < 560 ? 94 : 88;
    const trackGap = 38;
    const tops = [margin.top, margin.top + trackH + trackGap];
    const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "当前不评分的双约束轨道" });
    [["轨道一", "目平衡保守性", "conservation-track-label", "conservation-track-bg"], ["轨道二", "结构低熵", "entropy-track-label", "entropy-track-bg"]].forEach(([title, subtitle, labelClass, backgroundClass], index) => {
      const top = tops[index];
      svg.appendChild(svgEl("rect", { x: margin.left, y: top, width: plotW, height: trackH, class: `track-bg pending-track ${backgroundClass}` }));
      const mid = top + trackH / 2;
      svg.appendChild(svgEl("line", { x1: margin.left + 12, x2: width - margin.right - 12, y1: mid, y2: mid, class: "pending-line" }));
      const titleEl = svgEl("text", { x: 12, y: top + 34, class: `track-label ${labelClass}` }); titleEl.textContent = title; svg.appendChild(titleEl);
      const subEl = svgEl("text", { x: 12, y: top + 52, class: `track-subtitle ${labelClass}` }); subEl.textContent = subtitle; svg.appendChild(subEl);
      const wait = svgEl("text", { x: margin.left + plotW / 2, y: mid - 9, "text-anchor": "middle", class: "pending-label" });
      wait.textContent = "当前 ES 仅展示人源参考";
      svg.appendChild(wait);
    });
    const xLabel = svgEl("text", { x: margin.left + plotW / 2, y: height - 9, "text-anchor": "middle", class: "axis-label" });
    xLabel.textContent = `人28S坐标（${humanAbsolutePosition(1)}–${humanAbsolutePosition(length)} nt）`; svg.appendChild(xLabel);
    wrap.replaceChildren(svg);
  }

  function renderReferenceAlignment(dataset, human) {
    const meta = dataset.metadata;
    const length = human.sequence.length;
    const rows = [
      renderProjectedCoordinateRuler(length, "focus"),
      `<div class="alignment-row human-row"><span class="alignment-label">Homo sapiens</span><span class="alignment-bases"><span class="detail-sequence human-base">${human.sequence.split("").map(base => `<span class="base human-base">${escapeHtml(displayBase(base))}</span>`).join("")}</span></span></div>`,
      '<div class="alignment-divider"><span>逐位点约束轨道</span></div>',
      renderPendingConstraintTrack("轨道一 · 目平衡保守性", length, "当前不评分"),
      renderPendingConstraintTrack("轨道二 · 结构低熵", length, "当前不评分"),
      `<div class="reference-metadata"><span><strong>宿主螺旋</strong>${meta.host_helix || "--"}</span><span><strong>坐标系统</strong>${meta.coord_system_id}</span><span><strong>参考序列</strong>${meta.ref_accession}</span><span><strong>分析用途</strong>仅展示人源参考</span></div>`
    ];
    document.getElementById("selectionSubtitle").textContent = `${meta.es_id} · ${meta.molecule} · ${meta.component_coordinates}`;
    document.getElementById("selectedScore").textContent = "--";
    document.getElementById("selectedLowEntropy").textContent = "--";
    document.getElementById("selectedCoverage").textContent = "--";
    document.getElementById("selectedSpecies").textContent = "1";
    renderTaxonLegend([human]);
    const viewer = document.getElementById("alignmentViewer");
    viewer.classList.add("alignment-detail");
    viewer.classList.remove("alignment-overview");
    viewer.innerHTML = rows.join("");
  }

  function renderPendingConstraintTrack(label, length, status) {
    const width = Math.max(60, length * 15);
    return `<div class="alignment-row constraint-row pending-constraint"><span class="alignment-label constraint-label"><strong>${label}</strong><small>不可计算</small></span><span class="constraint-plot"><svg width="${width}" height="48" viewBox="0 0 ${width} 48" role="img" aria-label="${label}${status}"><line class="pending-constraint-line" x1="8" x2="${width - 8}" y1="24" y2="24"></line><text x="${Math.min(width / 2, 210)}" y="17">${status}</text></svg></span></div>`;
  }

  function renderReferenceRanking() {
    document.getElementById("rankingBody").innerHTML = '<tr class="empty-ranking"><td colspan="10"><strong>当前 ES 仅展示人源参考</strong><span>边界或结构门未通过的 ES 不生成保守性、低熵和候选排行窗口。</span></td></tr>';
  }

  function renderSummary(top, speciesCount) {
    if (!top) {
      ["topCoordinates", "topScore", "topLowEntropy", "topCoverage"].forEach(id => {
        document.getElementById(id).textContent = "--";
      });
      document.getElementById("topContext").textContent = "当前条件无候选";
      document.getElementById("topEntropyContext").textContent = "暂无";
      document.getElementById("topCoverageContext").textContent = `${speciesCount}个非人物种`;
      return;
    }
    document.getElementById("topCoordinates").textContent = humanAbsoluteCoordinateText(top);
    document.getElementById("topContext").textContent = `${top.size} nt窗口 · 非人哺乳动物目间等权`;
    document.getElementById("topScore").textContent = scoreFmt(top.score);
    document.getElementById("topLowEntropy").textContent = scoreFmt(top.lowEntropy);
    document.getElementById("topCoverage").textContent = pct(top.coverage);
    document.getElementById("topEntropyContext").textContent = top.scoreStatus === "complete_b500"
      ? "正式 · B=500"
      : Number.isFinite(top.lowEntropy) ? `预览 · B=${top.null_B}` : "暂无";
    document.getElementById("topCoverageContext").textContent = `${top.n_orders_callable}/${top.n_orders_planned}目 · ${speciesCount}种`;
  }

  function renderWindowPicker(humanLength, disabled = false) {
    const chips = document.getElementById("selectedWindowChips");
    document.getElementById("windowAddButton").disabled = disabled;
    chips.replaceChildren();
    [...state.selectedWindows].sort((a, b) => a - b).forEach(size => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "window-chip";
      chip.disabled = disabled;
      chip.style.setProperty("--window-color", windowColor(size));
      chip.innerHTML = `<span>${size} nt</span><b aria-hidden="true">×</b>`;
      chip.setAttribute("aria-label", `移除${size} nt窗口`);
      chip.addEventListener("click", () => {
        if (state.selectedWindows.size === 1) return;
        state.selectedWindows.delete(size);
        state.visibleSeries.delete(size);
        renderWindowPicker(humanLength, disabled);
        analyze();
      });
      chips.appendChild(chip);
    });
    document.querySelectorAll("#windowAddMenu [data-window-size]").forEach(button => {
      const size = Number(button.dataset.windowSize);
      button.disabled = disabled || size > humanLength || state.selectedWindows.has(size);
      button.classList.toggle("added", state.selectedWindows.has(size));
    });
  }

  function renderTaxonLegend(sequences) {
    const legend = document.getElementById("taxonLegend");
    if (!legend) return;
    const counts = new Map();
    sequences.filter(item => !/^Homo sapiens$/i.test(item.name)).forEach(species => {
      const taxon = taxonomyFor(species);
      counts.set(taxon.key, { ...taxon, count: (counts.get(taxon.key)?.count || 0) + 1 });
    });
    legend.innerHTML = [...counts.values()].sort((a, b) => {
      const positionA = HUMAN_PHYLOGENETIC_ORDER[a.key] || HUMAN_PHYLOGENETIC_ORDER[a.scoring ? "Mammalia" : "Other"];
      const positionB = HUMAN_PHYLOGENETIC_ORDER[b.key] || HUMAN_PHYLOGENETIC_ORDER[b.scoring ? "Mammalia" : "Other"];
      return positionA.distanceTier - positionB.distanceTier ||
        positionA.displayRank - positionB.displayRank ||
        SPECIES_NAME_COLLATOR.compare(a.label, b.label);
    }).map(item => `
      <span style="--taxon-color:${item.color}"><i></i><b>${item.label}</b><small>${item.count}种</small></span>`).join("");
  }

  function renderLegend() {
    const legend = document.getElementById("legend");
    legend.innerHTML = "";
    const human = findHumanSequence(state.datasets[state.currentEs].sequences);
    const sizes = analysisWindowSizes(humanCoordinateMap(human).length);
    sizes.forEach(size => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.size = size;
      button.setAttribute("aria-pressed", state.visibleSeries.has(size) || !WINDOW_COLORS[size] ? "true" : "false");
      if (!WINDOW_COLORS[size]) button.disabled = true;
      button.innerHTML = `<span class="legend-swatch" style="background:${windowColor(size)}"></span>${size} nt${WINDOW_COLORS[size] ? "" : " · 整段"}`;
      button.addEventListener("click", () => {
        if (state.visibleSeries.has(size) && state.visibleSeries.size > 1) state.visibleSeries.delete(size);
        else state.visibleSeries.add(size);
        renderLegend();
        const human = findHumanSequence(state.datasets[state.currentEs].sequences);
        renderChart(humanCoordinateMap(human).length);
      });
      legend.appendChild(button);
    });
  }

  function svgEl(name, attrs = {}) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    return el;
  }

  function nearestWindow(series, coordinate) {
    if (!series.length) return null;
    let low = 0;
    let high = series.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const center = (series[middle].humanStart + series[middle].humanEnd) / 2 - 1;
      if (center < coordinate) low = middle + 1;
      else high = middle;
    }
    const before = series[Math.max(0, low - 1)];
    const after = series[low];
    const distance = item => Math.abs(((item.humanStart + item.humanEnd) / 2 - 1) - coordinate);
    return distance(before) <= distance(after) ? before : after;
  }

  function renderChart(length) {
    const wrap = document.getElementById("chart");
    const width = Math.max(320, wrap.clientWidth || 900);
    const height = width < 560 ? 340 : 320;
    const margin = { top: 40, right: 20, bottom: 42, left: width < 560 ? 68 : 108 };
    const plotW = width - margin.left - margin.right;
    const trackH = width < 560 ? 94 : 88;
    const trackGap = 38;
    const conservationTop = margin.top;
    const entropyTop = conservationTop + trackH + trackGap;
    const x = value => margin.left + value / Math.max(1, length - 1) * plotW;
    const xBoundary = value => margin.left + value / Math.max(1, length) * plotW;
    const yTrack = (value, top) => top + (1 - Math.max(0, Math.min(100, value)) / 100) * trackH;
    const hasLowEntropy = state.results.some(item => Number.isFinite(item.lowEntropy));
    const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "人源坐标上的目平衡保守性与结构低熵双轨图" });

    [[conservationTop, "conservation-track-bg"], [entropyTop, "entropy-track-bg"]].forEach(([top, backgroundClass]) => {
      svg.appendChild(svgEl("rect", { x: margin.left, y: top, width: plotW, height: trackH, class: `track-bg ${backgroundClass}` }));
      [0, 50, 100].forEach(value => {
        svg.appendChild(svgEl("line", { x1: margin.left, x2: width - margin.right, y1: yTrack(value, top), y2: yTrack(value, top), class: "grid-line" }));
        const label = svgEl("text", { x: margin.left - 8, y: yTrack(value, top) + 4, "text-anchor": "end" });
        label.textContent = value;
        svg.appendChild(label);
      });
    });
    [[conservationTop + 34, "轨道一", "目平衡保守性", "conservation-track-label"], [entropyTop + 34, "轨道二", "结构低熵", "entropy-track-label"]].forEach(([yPos, title, subtitle, labelClass]) => {
      const titleEl = svgEl("text", { x: 12, y: yPos, class: `track-label ${labelClass}` });
      titleEl.textContent = title;
      svg.appendChild(titleEl);
      const subEl = svgEl("text", { x: 12, y: yPos + 18, class: `track-subtitle ${labelClass}` });
      subEl.textContent = subtitle;
      svg.appendChild(subEl);
    });

    const tickCount = width < 520 ? 4 : 7;
    for (let i = 0; i < tickCount; i++) {
      const value = Math.round(i * (length - 1) / (tickCount - 1)) + 1;
      const tx = x(value - 1);
      svg.appendChild(svgEl("line", { x1: tx, x2: tx, y1: entropyTop + trackH, y2: entropyTop + trackH + 5, class: "axis-line" }));
      const label = svgEl("text", { x: tx, y: entropyTop + trackH + 20, "text-anchor": i === 0 ? "start" : i === tickCount - 1 ? "end" : "middle" });
      label.textContent = humanAbsolutePosition(value);
      svg.appendChild(label);
    }
    const xLabel = svgEl("text", { x: margin.left + plotW / 2, y: height - 9, "text-anchor": "middle", class: "axis-label" });
    xLabel.textContent = "人28S坐标（nt）";
    svg.appendChild(xLabel);

    if (state.selected) {
      const startPosition = state.selected.humanStart - 1;
      const bandX = xBoundary(startPosition);
      const bandWidth = Math.max(2, xBoundary(state.selected.humanEnd) - bandX);
      svg.appendChild(svgEl("rect", { x: bandX, y: conservationTop, width: bandWidth, height: entropyTop + trackH - conservationTop, class: "selected-band" }));
      svg.appendChild(svgEl("rect", { x: bandX, y: conservationTop, width: bandWidth, height: entropyTop + trackH - conservationTop, class: "selected-outline" }));
      const peak = svgEl("text", { x: Math.min(width - margin.right - 145, bandX + 5), y: conservationTop - 12, class: "peak-label" });
      peak.textContent = `当前窗口  人28S ${humanAbsoluteCoordinateText(state.selected)} · ${state.selected.size} nt`;
      svg.appendChild(peak);
    }

    const seriesBySize = new Map();
    const trackPath = (segment, key, top) => {
      if (!segment.length) return "";
      const first = segment[0];
      const last = segment.at(-1);
      const points = [
        `M${x(first.humanStart - 1).toFixed(2)},${yTrack(first[key], top).toFixed(2)}`
      ];
      segment.forEach(datum => {
        points.push(
          `L${x((datum.humanStart + datum.humanEnd) / 2 - 1).toFixed(2)},${yTrack(datum[key], top).toFixed(2)}`
        );
      });
      points.push(
        `L${x(last.humanEnd - 1).toFixed(2)},${yTrack(last[key], top).toFixed(2)}`
      );
      return points.join(" ");
    };
    visibleAnalysisSizes().forEach(size => {
      const series = state.results.filter(r => r.size === size).sort((a, b) => a.humanStart - b.humanStart);
      if (!series.length) return;
      seriesBySize.set(size, series);
      const conservationPath = trackPath(series, "score", conservationTop);
      svg.appendChild(svgEl("path", { d: conservationPath, class: "score-line", stroke: windowColor(size), "data-size": size }));
      const entropySeries = series.filter(item => Number.isFinite(item.lowEntropy));
      if (entropySeries.length) {
        const segments = [];
        entropySeries.forEach(datum => {
          const current = segments.at(-1);
          if (!current || datum.humanStart !== current.at(-1).humanStart + 1) segments.push([datum]);
          else current.push(datum);
        });
        segments.forEach(segment => {
          const entropyPath = trackPath(segment, "lowEntropy", entropyTop);
          svg.appendChild(svgEl("path", { d: entropyPath, class: "score-line", stroke: windowColor(size), "data-size": size }));
        });
      }
    });
    if (!hasLowEntropy) {
      const pending = svgEl("text", { x: margin.left + plotW / 2, y: entropyTop + trackH / 2, "text-anchor": "middle", class: "pending-label" });
      pending.textContent = "部分窗口暂无结构低熵分数";
      svg.appendChild(pending);
    }

    const hoverLine = svgEl("line", { y1: conservationTop, y2: entropyTop + trackH, class: "hover-line", visibility: "hidden" });
    svg.appendChild(hoverLine);
    const hit = svgEl("rect", { x: margin.left, y: conservationTop, width: plotW, height: entropyTop + trackH - conservationTop, class: "hit-layer" });
    const tooltip = document.getElementById("chartTooltip");
    hit.addEventListener("mousemove", event => {
      const rect = svg.getBoundingClientRect();
      const localX = (event.clientX - rect.left) * width / rect.width;
      const coordinate = Math.max(0, Math.min(length - 1, Math.round((localX - margin.left) / plotW * (length - 1))));
      hoverLine.setAttribute("x1", x(coordinate)); hoverLine.setAttribute("x2", x(coordinate)); hoverLine.setAttribute("visibility", "visible");
      const rows = [...seriesBySize.entries()].map(([size, series]) => {
        const datum = nearestWindow(series, coordinate);
        return `<span style="color:${windowColor(size)}">●</span> ${size} nt · 28S ${humanAbsoluteCoordinateText(datum)} · 保守 ${scoreFmt(datum.score)} · 低熵 ${scoreFmt(datum.lowEntropy)}`;
      });
      tooltip.innerHTML = `<strong>人28S位置 ${humanAbsolutePosition(coordinate + 1)}</strong><br>${rows.join("<br>")}`;
      tooltip.hidden = false; tooltip.style.left = `${Math.min(window.innerWidth - 280, event.clientX + 14)}px`; tooltip.style.top = `${Math.max(8, event.clientY - 26)}px`;
    });
    hit.addEventListener("mouseleave", () => { hoverLine.setAttribute("visibility", "hidden"); tooltip.hidden = true; });
    svg.appendChild(hit);
    wrap.replaceChildren(svg);
  }

  function renderRanking(rows) {
    const body = document.getElementById("rankingBody");
    body.innerHTML = "";
    if (!rows.length) {
      body.innerHTML = '<tr class="empty-ranking"><td colspan="10"><strong>当前筛选条件没有可排序窗口</strong><span>联合分数和结构低熵排序只纳入已有零模型分数的窗口。</span></td></tr>';
      return;
    }
    rows.forEach((row, index) => {
      const sequences = state.datasets[state.currentEs].sequences;
      const humanSequence = humanSequenceForWindow(sequences, row);
      const tr = document.createElement("tr");
      if (state.selected && row.size === state.selected.size && row.start === state.selected.start) tr.classList.add("selected");
      const isOfficial = row.scoreStatus === "complete_b500";
      const isDemo = row.scoreStatus.startsWith("demo_b");
      const statusClass = isOfficial ? "complete" : isDemo ? "demo" : "pending";
      const statusLabel = isOfficial ? "正式 · B=500" : isDemo ? `预览 · B=${row.null_B}` : "暂无";
      tr.innerHTML = `
        <td class="rank-number">${String(index + 1).padStart(2, "0")}</td>
        <td><span class="legend-swatch" style="display:inline-block;margin-right:7px;background:${windowColor(row.size)}"></span>${row.size} nt${WINDOW_COLORS[row.size] ? "" : "（整段）"}</td>
        <td>${humanCoordinateText(row)}</td>
        <td>${humanAbsoluteCoordinateText(row)}</td>
        <td class="numeric score-cell">${scoreFmt(row.score)}</td>
        <td class="numeric">${scoreFmt(row.lowEntropy)}</td>
        <td class="numeric">${scoreFmt(row.jointScore)}</td>
        <td class="numeric">${pct(row.coverage)}</td>
        <td><span class="calculation-status ${statusClass}">${statusLabel}</span></td>
        <td><code>${humanSequence}</code></td>`;
      tr.addEventListener("click", () => {
        state.selected = row;
        state.alignmentRenderKey = null;
        document.querySelector('.view-tab[data-tab="landscape"]').click();
      });
      body.appendChild(tr);
    });
  }

  function humanSequenceForWindow(sequences, window) {
    const human = findHumanSequence(sequences);
    return window.alignmentColumns.map(column => human.sequence[column]).join("");
  }

  function humanInsertionBlocks(humanSequence) {
    const blocks = [];
    let column = 0;
    let humanPosition = 0;
    while (column < humanSequence.length) {
      if (humanSequence[column] !== "-") {
        humanPosition += 1;
        column += 1;
        continue;
      }
      const startColumn = column;
      while (column < humanSequence.length && humanSequence[column] === "-") column += 1;
      blocks.push({ startColumn, endColumn: column - 1, anchorHumanPosition: humanPosition });
    }
    return blocks;
  }

  function displayBase(base) {
    const normalized = String(base ?? "-").toUpperCase();
    return normalized === "N" ? "-" : normalized;
  }

  function projectSequenceForDisplay(sequence, humanColumns) {
    return humanColumns.map(column => displayBase(sequence[column])).join("");
  }

  function insertionAnchorLabel(anchor, humanLength) {
    if (anchor <= 0) return `人28S 第${humanAbsolutePosition(1)}位之前`;
    if (anchor >= humanLength) return `人28S 第${humanAbsolutePosition(humanLength)}位之后`;
    return `人28S 第${humanAbsolutePosition(anchor)}位与第${humanAbsolutePosition(anchor + 1)}位之间`;
  }

  function insertionAnchorCompactText(anchor, humanLength) {
    if (anchor <= 0) return `人28S < ${humanAbsolutePosition(1)}`;
    if (anchor >= humanLength) return `人28S > ${humanAbsolutePosition(humanLength)}`;
    return `人28S ${humanAbsolutePosition(anchor)}|${humanAbsolutePosition(anchor + 1)}`;
  }

  function formatInsertionSequence(sequence) {
    const groups = String(sequence || "").match(/.{1,10}/g) || [];
    const lines = [];
    for (let index = 0; index < groups.length; index += 8) lines.push(groups.slice(index, index + 8).join(" "));
    return lines.join("\n");
  }

  function openInsertionDialog(insertion, humanLength, anchorButton) {
    const dialog = document.getElementById("insertionDialog");
    const body = document.getElementById("insertionDialogBody");
    const title = document.getElementById("insertionDialogTitle");
    if (!dialog || !body || !title) return;
    const events = insertion.events || [insertion];
    const totalLength = events.reduce((sum, event) => sum + event.insertedBases.length, 0);
    title.textContent = insertion.species.name;
    const sourceUrl = insertion.species.source_url || (insertion.species.accession
      ? `https://www.ncbi.nlm.nih.gov/nuccore/${insertion.species.accession}`
      : "");
    const source = sourceUrl
      ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(insertion.species.accession || "打开原始记录")}</a>`
      : escapeHtml(insertion.species.accession || "未提供 accession");
    const fragments = events.map(event => `
      <section class="insertion-popover-fragment">
        <div><span>${escapeHtml(insertionAnchorCompactText(event.anchorHumanPosition, humanLength))}</span><strong>+${event.insertedBases.length.toLocaleString()} nt</strong></div>
        <pre>${escapeHtml(formatInsertionSequence(event.insertedBases))}</pre>
      </section>`).join("");
    const clusterSummary = events.length > 1 ? `<strong>${events.length}处 · +${totalLength.toLocaleString()} nt</strong>` : "";
    body.innerHTML = `
      <div class="insertion-popover-summary">${clusterSummary}<span>${source}</span></div>
      <div class="insertion-popover-fragments">${fragments}</div>`;
    if (!dialog.matches(":popover-open")) dialog.showPopover();
    const anchorRect = anchorButton?.getBoundingClientRect();
    if (!anchorRect) return;
    const panelRect = dialog.getBoundingClientRect();
    const gap = 7;
    const left = Math.max(10, Math.min(window.innerWidth - panelRect.width - 10, anchorRect.left + anchorRect.width / 2 - panelRect.width / 2));
    let top = anchorRect.bottom + gap;
    if (top + panelRect.height > window.innerHeight - 10) top = Math.max(10, anchorRect.top - panelRect.height - gap);
    dialog.style.left = `${left}px`;
    dialog.style.top = `${top}px`;
  }

  function resetActiveInsertionMarker() {
    if (!state.activeInsertionButton) return;
    state.activeInsertionButton.classList.remove("active");
    state.activeInsertionButton.setAttribute("aria-expanded", "false");
    state.activeInsertionButton = null;
  }

  function closeInsertionDialog() {
    const dialog = document.getElementById("insertionDialog");
    if (dialog?.matches(":popover-open")) dialog.hidePopover();
    else resetActiveInsertionMarker();
  }

  function renderSelection(sequences) {
    const selected = state.selected;
    if (!selected) {
      closeInsertionDialog();
      document.getElementById("selectionSubtitle").textContent = "当前条件无候选";
      ["selectedScore", "selectedLowEntropy", "selectedCoverage", "selectedSpecies"].forEach(id => {
        document.getElementById(id).textContent = "--";
      });
      document.getElementById("alignmentViewer").replaceChildren();
      state.alignmentRenderKey = null;
      return;
    }
    document.getElementById("selectionSubtitle").textContent = `${state.currentEs} · 人28S ${humanAbsoluteCoordinateText(selected)} · ${selected.size} nt`;
    document.getElementById("selectedScore").textContent = scoreFmt(selected.score);
    document.getElementById("selectedLowEntropy").textContent = scoreFmt(selected.lowEntropy);
    document.getElementById("selectedCoverage").textContent = pct(selected.coverage);
    document.getElementById("selectedSpecies").textContent = state.datasets[state.currentEs].summary?.scoring_species ?? sequences.length - 1;
    document.querySelectorAll("[data-alignment-mode]").forEach(button => {
      const active = button.dataset.alignmentMode === state.alignmentMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const renderKey = `${state.currentEs}|${selected.window_id}|${state.alignmentMode}`;
    if (state.alignmentRenderKey !== renderKey) {
      renderAlignment(sequences, selected);
      state.alignmentRenderKey = renderKey;
    }
  }

  function renderAlignment(sequences, window) {
    const viewer = document.getElementById("alignmentViewer");
    const human = findHumanSequence(sequences);
    const alignmentLength = human.sequence.length;
    const humanMap = humanCoordinateMap(human);
    const humanLength = humanMap.length;
    const humanStart = window.humanStart ?? window.human_es_start ?? 1;
    const humanEnd = window.humanEnd ?? window.human_es_end ?? Math.min(humanLength, humanStart + window.size - 1);
    const insertionBlocks = humanInsertionBlocks(human.sequence);
    const insertionEvents = new Map();
    const detailed = state.alignmentMode === "focus";
    const projectedHuman = projectSequenceForDisplay(human.sequence, humanMap.alignmentColumns);
    closeInsertionDialog();

    const makeInsertionMarkers = (sequence, species, speciesIndex) => {
      const cellWidth = detailed ? 15 : 6.65;
      const events = insertionBlocks.map(block => {
        const alignedFragment = sequence.slice(block.startColumn, block.endColumn + 1)
          .split("").map(displayBase).join("");
        const insertedBases = alignedFragment.replaceAll("-", "");
        return insertedBases.length ? { ...block, alignedFragment, insertedBases } : null;
      }).filter(Boolean);
      const clusters = [];
      const measureCluster = cluster => {
        cluster.totalLength = cluster.events.reduce((sum, event) => sum + event.insertedBases.length, 0);
        cluster.markerText = `${cluster.totalLength}`;
        cluster.centerAnchor = (cluster.events[0].anchorHumanPosition + cluster.events[cluster.events.length - 1].anchorHumanPosition) / 2;
        cluster.markerWidth = Math.max(10, cluster.markerText.length * 4 + 4);
        cluster.start = cluster.centerAnchor * cellWidth - cluster.markerWidth / 2;
        cluster.end = cluster.centerAnchor * cellWidth + cluster.markerWidth / 2;
      };
      events.forEach(event => {
        const cluster = { events: [event] };
        measureCluster(cluster);
        const previous = clusters[clusters.length - 1];
        if (previous && cluster.start <= previous.end + 2) {
          previous.events.push(event);
          measureCluster(previous);
          while (clusters.length > 1) {
            const current = clusters[clusters.length - 1];
            const earlier = clusters[clusters.length - 2];
            if (current.start > earlier.end + 2) break;
            earlier.events.push(...current.events);
            measureCluster(earlier);
            clusters.pop();
          }
        } else {
          clusters.push(cluster);
        }
      });
      return clusters.map((cluster, clusterIndex) => {
        const insertionId = `ins-${speciesIndex}-${clusterIndex}`;
        insertionEvents.set(insertionId, { species, events: cluster.events });
        const selectedClass = cluster.events.some(event => event.anchorHumanPosition >= humanStart && event.anchorHumanPosition < humanEnd)
          ? " selected-insertion"
          : "";
        const firstAnchor = insertionAnchorLabel(cluster.events[0].anchorHumanPosition, humanLength);
        const label = cluster.events.length === 1
          ? `${species.name}：${firstAnchor}，折叠 ${cluster.totalLength} nt，点击查看`
          : `${species.name}：${cluster.events.length}个相邻折叠片段，共 ${cluster.totalLength} nt，点击查看`;
        const left = detailed
          ? `${cluster.centerAnchor * 15}px`
          : `${cluster.centerAnchor / Math.max(1, humanLength) * 100}%`;
        return `<button type="button" class="insertion-count-marker${detailed ? " detailed-insertion" : " overview-insertion"}${selectedClass}" style="left:${left}" data-insertion-id="${insertionId}" aria-label="${escapeHtml(label)}" aria-controls="insertionDialog" aria-expanded="false" title="${escapeHtml(label)}">${cluster.markerText}</button>`;
      }).join("");
    };

    const makeDetailedBases = (sequence, isHuman = false, species = null, speciesIndex = 0) => {
      const projected = projectSequenceForDisplay(sequence, humanMap.alignmentColumns);
      const bases = projected.split("").map((base, localIndex) => {
      const classes = ["base"];
      if (isHuman) classes.push("human-base");
      else if (base === "-") classes.push("gap");
      else if (base !== projectedHuman[localIndex]) classes.push("mismatch");
      if (localIndex >= humanStart - 1 && localIndex < humanEnd) classes.push("selected-base");
      return `<span class="${classes.join(" ")}">${escapeHtml(base)}</span>`;
      }).join("");
      const markers = isHuman ? "" : makeInsertionMarkers(sequence, species, speciesIndex);
      return `<span class="detail-sequence${isHuman ? " human-base" : ""}${markers ? " has-insertions" : ""}">${bases}${markers}</span>`;
    };

    const makeOverviewBases = (sequence, isHuman = false, species = null, speciesIndex = 0) => {
      const projected = projectSequenceForDisplay(sequence, humanMap.alignmentColumns);
      const before = escapeHtml(projected.slice(0, humanStart - 1));
      const selected = escapeHtml(projected.slice(humanStart - 1, humanEnd));
      const after = escapeHtml(projected.slice(humanEnd));
      const markers = isHuman ? "" : makeInsertionMarkers(sequence, species, speciesIndex);
      return `<span class="overview-sequence${isHuman ? " human-base" : ""}${markers ? " has-insertions" : ""}"><span>${before}</span><span class="overview-selected">${selected}</span><span>${after}</span>${markers}</span>`;
    };
    const makeBases = detailed ? makeDetailedBases : makeOverviewBases;
    viewer.classList.toggle("alignment-detail", detailed);
    viewer.classList.toggle("alignment-overview", !detailed);
    const rows = [
      renderProjectedCoordinateRuler(humanLength, state.alignmentMode),
      `<div class="alignment-row human-row"><a class="alignment-label source-anchor" href="${human.source_url || `https://www.ncbi.nlm.nih.gov/nuccore/${human.accession || "NR_003287.4"}`}" target="_blank" rel="noopener" title="打开 ${human.accession || "NR_003287.4"} 原始记录">Homo sapiens</a><span class="alignment-bases">${makeBases(human.sequence, true)}</span></div>`
    ];
    const conservation = cachedConstraintProfile(window.size, "score", alignmentLength);
    const lowEntropyColumns = cachedConstraintProfile(window.size, "lowEntropy", alignmentLength);
    rows.push('<div class="alignment-divider"><span>当前窗口与全长位点约束</span></div>');
    rows.push(renderProjectedConstraintTrack("轨道一", "目平衡保守性", conservation, window, "conservation", humanMap.alignmentColumns, state.alignmentMode));
    rows.push(renderProjectedConstraintTrack("轨道二", "结构低熵", lowEntropyColumns, window, "entropy", humanMap.alignmentColumns, state.alignmentMode));
    const densityLabel = detailed ? "详细全长" : "紧凑概览";
    rows.push(`<div class="alignment-divider species-divider"><span>其他物种 · ${densityLabel}</span><small>数字框：折叠长度，点击查看</small></div>`);
    sequences.filter(species => species !== human).sort(compareByHumanPhylogeneticDistance).forEach((species, speciesIndex) => {
      const sourceUrl = species.source_url || (species.accession ? `https://www.ncbi.nlm.nih.gov/nuccore/${species.accession}` : "");
      const taxon = taxonomyFor(species);
      const phylogeneticPositionData = phylogeneticPosition(species);
      const labelInner = `<span class="species-name">${escapeHtml(species.name)}</span><small>${escapeHtml(taxon.label)}</small>`;
      const label = sourceUrl
        ? `<a class="alignment-label source-anchor taxon-label" style="--taxon-color:${taxon.color}" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener" title="打开 ${escapeHtml(species.accession || species.name)} 原始记录">${labelInner}</a>`
        : `<span class="alignment-label taxon-label" style="--taxon-color:${taxon.color}" title="${escapeHtml(species.name)}">${labelInner}</span>`;
      rows.push(`<div class="alignment-row taxon-row" data-phylogenetic-tier="${phylogeneticPositionData.distanceTier}" style="--taxon-color:${taxon.color}">${label}<span class="alignment-bases">${makeBases(species.sequence, false, species, speciesIndex)}</span></div>`);
    });
    viewer.innerHTML = rows.join("");
    viewer.onclick = event => {
      const button = event.target.closest?.("[data-insertion-id]");
      if (!button || !viewer.contains(button)) return;
      const insertion = insertionEvents.get(button.dataset.insertionId);
      if (!insertion) return;
      if (state.activeInsertionButton && state.activeInsertionButton !== button) {
        state.activeInsertionButton.classList.remove("active");
        state.activeInsertionButton.setAttribute("aria-expanded", "false");
      }
      button.classList.add("active");
      button.setAttribute("aria-expanded", "true");
      state.activeInsertionButton = button;
      openInsertionDialog(insertion, humanLength, button);
    };
    viewer.onscroll = () => {
      if (document.getElementById("insertionDialog")?.matches(":popover-open")) closeInsertionDialog();
    };
    const overviewSequence = viewer.querySelector(".overview-sequence");
    const overviewCellWidth = overviewSequence && humanLength
      ? overviewSequence.getBoundingClientRect().width / humanLength
      : 7.25;
    const target = detailed
      ? Math.max(0, (humanStart - 1) * 15 - viewer.clientWidth * 0.35)
      : Math.max(0, (humanStart - 1) * overviewCellWidth - viewer.clientWidth * 0.35);
    viewer.scrollLeft = target;
  }

  function cachedConstraintProfile(size, key, alignmentLength) {
    const sums = Array(alignmentLength).fill(0);
    const counts = Array(alignmentLength).fill(0);
    state.results.filter(item => item.size === size && Number.isFinite(item[key])).forEach(item => {
      item.alignmentColumns.forEach(column => {
        sums[column] += item[key];
        counts[column] += 1;
      });
    });
    return sums.map((value, index) => counts[index] ? value / counts[index] : null);
  }

  function renderProjectedCoordinateRuler(humanLength, mode = "focus") {
    const compact = mode === "full";
    const absoluteStart = humanAbsolutePosition(1);
    const absoluteEnd = humanAbsolutePosition(humanLength);
    const interval = compact ? (humanLength > 300 ? 100 : 50) : 25;
    const positions = new Set([1, humanLength]);
    const firstRoundCoordinate = Math.ceil(absoluteStart / interval) * interval;
    for (let coordinate = firstRoundCoordinate; coordinate <= absoluteEnd; coordinate += interval) {
      positions.add(coordinate - absoluteStart + 1);
    }
    const width = compact ? `${humanLength}ch` : `${humanLength * 15}px`;
    const ticks = [...positions].filter(position => position >= 1 && position <= humanLength).sort((a, b) => a - b).map(position => {
      const left = compact ? `${position - 0.5}ch` : `${(position - 1) * 15 + 7.5}px`;
      const edgeClass = position === 1 ? " edge-start" : position === humanLength ? " edge-end" : "";
      return `<span class="projected-ruler-tick${edgeClass}" style="left:${left}"><b>${humanAbsolutePosition(position)}</b></span>`;
    }).join("");
    return `<div class="alignment-row ruler-row projected-ruler-row"><span class="alignment-label">人28S位置</span><span class="projected-ruler" style="width:${width}" role="img" aria-label="人28S坐标尺 ${absoluteStart}至${absoluteEnd}">${ticks}</span></div>`;
  }

  function renderProjectedConstraintTrack(trackNumber, label, values, window, type, humanColumns, mode = "focus") {
    const visibleValues = humanColumns.map(column => values[column]);
    const compact = mode === "full";
    const cellWidth = compact ? 1 : 15;
    const width = visibleValues.length * cellWidth;
    const height = 48;
    const top = 5;
    const plotHeight = 35;
    const y = value => top + (1 - Math.max(0, Math.min(100, value)) / 100) * plotHeight;
    let drawing = false;
    const path = visibleValues.map((value, index) => {
      if (!Number.isFinite(value)) { drawing = false; return ""; }
      const command = drawing ? "L" : "M";
      drawing = true;
      return `${command}${(index * cellWidth + cellWidth / 2).toFixed(1)},${y(value).toFixed(1)}`;
    }).filter(Boolean).join(" ");
    const humanStart = window.humanStart ?? window.human_es_start ?? 1;
    const humanEnd = window.humanEnd ?? window.human_es_end ?? humanStart + window.size - 1;
    const selectedX = Math.max(0, humanStart - 1) * cellWidth;
    const selectedWidth = Math.max(1, humanEnd - humanStart + 1) * cellWidth;
    const score = type === "conservation" ? window.score : window.lowEntropy;
    const svgWidth = compact ? `${visibleValues.length}ch` : `${width}`;
    const preserveAspectRatio = compact ? ' preserveAspectRatio="none"' : "";
    const trackColor = type === "conservation" ? "var(--conservation)" : "var(--entropy)";
    return `<div class="alignment-row constraint-row ${type}-constraint" style="--constraint-color:${trackColor};--track-color:${trackColor}"><span class="alignment-label constraint-label"><strong><b>${trackNumber}</b><span>${label}</span></strong><small>当前窗口 <em>${scoreFmt(score)}</em> · 0–100</small></span><span class="constraint-plot projected-constraint ${compact ? "compact-projected" : "detailed-projected"}"><svg width="${svgWidth}" height="${height}" viewBox="0 0 ${width} ${height}"${preserveAspectRatio} role="img" aria-label="${trackNumber}${label}人28S坐标投影曲线，当前窗口得分${scoreFmt(score)}"><rect class="constraint-selection" x="${selectedX}" y="0" width="${selectedWidth}" height="${height}"></rect><line class="constraint-grid" x1="0" x2="${width}" y1="${y(50)}" y2="${y(50)}"></line><path class="constraint-path" d="${path}"></path></svg></span></div>`;
  }

  function markStatisticsDirty() {
    state.statisticsDirty = true;
    if (state.activeTab === "statistics") renderStatistics();
  }

  function renderStatistics() {
    const summary = state.allEsSummary;
    if (!summary || !document.getElementById("databaseLayerStats")) return;
    if (!state.statisticsDirty) return;
    renderDatabaseLayers(summary);
    renderEsCoverage(summary);
    renderSpeciesCoverage(summary);
    renderCoverageMatrix(summary);
    renderLsuInventory();
    renderSourceTable();
    renderLiteratureTable();
    state.statisticsDirty = false;
  }

  function inventoryScope(record) {
    if (record.species === "Homo sapiens") return "human";
    return record.major_clade === "Mammalia" ? "mammal" : "nonmammal";
  }

  function formatSequence(sequence) {
    const groups = String(sequence || "").match(/.{1,10}/g) || [];
    const lines = [];
    for (let index = 0; index < groups.length; index += 10) {
      const start = index * 10 + 1;
      lines.push(`${String(start).padStart(5, " ")}  ${groups.slice(index, index + 10).join(" ")}`);
    }
    return lines.join("\n");
  }

  function renderInventorySequence(record) {
    const target = document.getElementById("inventorySequence");
    if (!target) return;
    if (!record) {
      target.replaceChildren();
      return;
    }
    target.innerHTML = `<div class="inventory-sequence-heading"><strong>${escapeHtml(record.species)} · ${escapeHtml(record.accession)}</strong><span>${record.sequence_length.toLocaleString()} nt · MD5 ${escapeHtml(record.sequence_md5)} · U替代T显示</span></div><pre>${escapeHtml(formatSequence(record.sequence))}</pre>`;
  }

  function renderLsuInventory() {
    const payload = state.lsuInventory;
    const tableTarget = document.getElementById("inventoryTable");
    const statusTarget = document.getElementById("inventoryStatus");
    const filterTarget = document.getElementById("inventoryFilters");
    if (!payload || !tableTarget || !statusTarget || !filterTarget) return;

    const counts = payload.records.reduce((result, record) => {
      result[inventoryScope(record)] += 1;
      return result;
    }, { human: 0, mammal: 0, nonmammal: 0 });
    const filters = [
      ["all", `全部可用 ${payload.records.length}`],
      ["mammal", `非人哺乳动物 ${counts.mammal}`],
      ["nonmammal", `非哺乳动物 ${counts.nonmammal}`],
      ["human", `人源LSU记录 ${counts.human}`]
    ];
    filterTarget.innerHTML = filters.map(([key, label]) =>
      `<button type="button" data-inventory-filter="${key}" class="${state.inventoryFilter === key ? "active" : ""}">${label}</button>`
    ).join("");
    document.querySelectorAll("[data-inventory-filter]").forEach(button => button.addEventListener("click", () => {
      state.inventoryFilter = button.dataset.inventoryFilter;
      renderLsuInventory();
    }));

    const query = state.inventoryQuery.trim().toLocaleLowerCase();
    const visible = payload.records.filter(record => {
      const scope = inventoryScope(record);
      if (state.inventoryFilter !== "all" && scope !== state.inventoryFilter) return false;
      if (!query) return true;
      return [record.species, record.major_clade, record.accession, record.taxid, record.source_database]
        .some(value => String(value ?? "").toLocaleLowerCase().includes(query));
    });
    statusTarget.textContent = `${payload.available_sequence_records} 条已核验记录 · 当前显示 ${visible.length} 条`;

    const rows = visible.map(record => {
      const scope = inventoryScope(record);
      const scoring = scope === "mammal";
      const statusClass = scoring ? "scoring" : "display-only";
      const statusLabel = scoring ? "评分候选" : "仅展示";
      return `<tr>
        <td><strong>${escapeHtml(record.species)}</strong><small>TaxID ${record.taxid ?? "未提供"}</small></td>
        <td>${escapeHtml(record.major_clade)}</td>
        <td><a href="${escapeHtml(record.source_url)}" target="_blank" rel="noopener">${escapeHtml(record.accession)}</a><small>${escapeHtml(record.source_database)}</small></td>
        <td class="numeric">${record.sequence_length.toLocaleString()}</td>
        <td><span class="inventory-status ${statusClass}">${statusLabel}</span></td>
        <td>${escapeHtml(record.retrieval_date)}<small>MD5 ${escapeHtml(record.sequence_md5)}</small></td>
        <td><button type="button" class="inventory-sequence-button" data-inventory-accession="${escapeHtml(record.accession)}">查看序列</button></td>
      </tr>`;
    }).join("");
    tableTarget.innerHTML = `<table class="inventory-table"><thead><tr><th>物种</th><th>类群</th><th>来源记录</th><th class="numeric">长度 / nt</th><th>分析用途</th><th>获取与校验</th><th>原始序列</th></tr></thead><tbody>${rows || '<tr><td colspan="7">当前筛选没有可用序列。</td></tr>'}</tbody></table>`;
    document.querySelectorAll("[data-inventory-accession]").forEach(button => button.addEventListener("click", () => {
      state.selectedInventoryAccession = button.dataset.inventoryAccession;
      renderInventorySequence(payload.records.find(record => record.accession === state.selectedInventoryAccession));
      document.getElementById("inventorySequence").scrollIntoView({ behavior: "smooth", block: "nearest" });
    }));

    const selected = visible.find(record => record.accession === state.selectedInventoryAccession) || visible[0];
    state.selectedInventoryAccession = selected?.accession || null;
    renderInventorySequence(selected);
  }

  function renderDatabaseLayers(summary) {
    const totalWindows = Number(state.allWindowsManifest?.total_windows ?? 0);
    const formalWindows = Number(state.allWindowsManifest?.complete_low_entropy_windows ?? 0);
    const previewWindows = Number(state.allWindowsManifest?.demo_low_entropy_windows ?? 0);
    const conservationOnlyWindows = Math.max(0, totalWindows - formalWindows - previewWindows);
    const layers = [
      { value: totalWindows.toLocaleString(), label: "滑动窗口", context: "8个 ES · 1 nt 步长" },
      { value: `${formalWindows.toLocaleString()}/${totalWindows.toLocaleString()}`, label: "正式 B=500", context: "已完成结构低熵" },
      { value: previewWindows.toLocaleString(), label: "预览结果", context: "显示实际 B 值" },
      { value: conservationOnlyWindows.toLocaleString(), label: "仅保守性", context: "尚无结构低熵分数" },
      { value: summary.mammal_species_count, label: "已定位哺乳动物", context: `${summary.es_species_calls} 条 ES 序列` },
      { value: summary.human_reference_es_count, label: "人源 ES 参考", context: `${summary.directly_mapped_28s_es_count} 个纳入评分` }
    ];
    document.getElementById("databaseLayerStats").innerHTML = layers.map(item => `
      <article><span>${item.label}</span><strong>${item.value}</strong><small>${item.context}</small></article>`).join("");
  }

  function renderEsCoverage(summary) {
    const mapped = new Map(summary.per_es.map(item => [item.es_id, item]));
    const ordered = (state.humanReferencePayload?.records ?? []).filter(record => mapped.has(record.es_id));
    document.getElementById("esCoverageChart").innerHTML = ordered.map(record => {
      const item = mapped.get(record.es_id);
      const pass = item?.species_pass ?? 0;
      const total = item?.homology_calls ?? summary.mammal_species_count;
      const percent = total ? pass / total * 100 : 0;
      const statusText = `${pass}/${total}`;
      return `<button type="button" class="es-coverage-row" data-es="${record.es_id}" aria-label="${record.es_id}：${statusText}">
        <span class="coverage-label"><strong>${record.es_id}</strong><small>${record.length_nt} nt</small></span>
        <span class="coverage-track"><i style="width:${percent.toFixed(2)}%"></i></span>
        <span class="coverage-value">${statusText}</span>
      </button>`;
    }).join("");
    document.querySelectorAll(".es-coverage-row:not(:disabled)").forEach(button => button.addEventListener("click", () => openEsLandscape(button.dataset.es)));
  }

  function renderSpeciesCoverage(summary) {
    const rows = summary.per_species;
    const max = summary.per_es.length;
    document.getElementById("speciesCoverageChart").innerHTML = rows.map(item => `
      <div class="species-coverage-row" title="${item.species} · ${item.accession} · NCBI TaxID ${item.taxid}">
        <a href="${item.source_url}" target="_blank" rel="noopener">${item.species}</a>
        <span class="species-track"><i style="width:${(item.es_pass / max * 100).toFixed(2)}%"></i></span>
        <strong>${item.es_pass}/${max}</strong>
      </div>`).join("");
  }

  function renderCoverageMatrix(summary) {
    const esIds = summary.per_es.map(item => item.es_id);
    const calls = new Map();
    esIds.forEach(esId => state.datasets[esId]?.sequences
      .filter(item => !/^Homo sapiens$/i.test(item.name))
      .forEach(item => calls.set(`${item.taxid}|${esId}`, item)));
    const header = esIds.map(esId => `<button type="button" data-es="${esId}" aria-label="打开${esId}景观">${esId.replace("ES", "")}</button>`).join("");
    const body = summary.per_species.map(species => {
      const cells = esIds.map(esId => {
        const call = calls.get(`${species.taxid}|${esId}`);
        if (!call) return '<span class="matrix-cell missing" aria-hidden="true"></span>';
        return `<a class="matrix-cell pass" href="${call.source_url}" target="_blank" rel="noopener" title="${species.species} × ${esId}：已有 ES 序列；${call.accession}" aria-label="${species.species} ${esId} 已有序列，打开 ${call.accession}"></a>`;
      }).join("");
      return `<div class="matrix-row"><a class="matrix-species" href="${species.source_url}" target="_blank" rel="noopener" title="${species.accession} · NCBI TaxID ${species.taxid}">${species.species}</a>${cells}<strong>${species.es_pass}</strong></div>`;
    }).join("");
    document.getElementById("coverageMatrix").innerHTML = `<div class="matrix-inner" style="--es-count:${esIds.length}"><div class="matrix-header"><span>物种</span>${header}<strong>通过</strong></div>${body}</div>`;
    document.querySelectorAll(".matrix-header button").forEach(button => button.addEventListener("click", () => openEsLandscape(button.dataset.es)));
    document.getElementById("matrixSummary").textContent = `${summary.pass_calls} 条已定位 ES 序列`;
  }

  function renderSourceTable() {
    const sources = (state.provenanceCatalog?.databases ?? []).filter(source => Number.isFinite(source.records));
    document.getElementById("sourceTable").innerHTML = `<table class="provenance-table"><thead><tr><th>来源</th><th>版本/范围</th><th class="numeric">记录数</th><th>状态</th><th>原始入口</th><th>校验与用途</th></tr></thead><tbody>${sources.map(source => `<tr>
      <td><a href="${source.official_url}" target="_blank" rel="noopener"><strong>${source.name}</strong></a><small>${source.source_id}</small></td>
      <td>${source.version}<small>${source.scope}</small></td>
      <td class="numeric">${source.records === null ? "—" : Number(source.records).toLocaleString()}</td>
      <td><span class="source-status ${source.status_class}">${source.status}</span></td>
      <td class="source-links">${source.links.map(link => `<a href="${link.url}" target="_blank" rel="noopener">${link.label}</a>`).join("")}</td>
      <td>${source.provenance}<small>${source.use}</small></td>
    </tr>`).join("")}</tbody></table>`;
  }

  function renderLiteratureTable() {
    const target = document.getElementById("literatureTable");
    if (!target) return;
    const literature = state.provenanceCatalog?.literature ?? [];
    target.innerHTML = `<table class="provenance-table literature-table"><thead><tr><th>论文</th><th>ES / 物种</th><th>证据类型</th><th>原文与结构</th><th>用于本项目</th><th>限制</th></tr></thead><tbody>${literature.map(item => `<tr>
      <td><strong>${item.year} · ${item.title}</strong><small>${item.citation}</small></td>
      <td>${item.es_scope}<small>${item.taxon_scope}</small></td>
      <td>${item.data_type}<small>${item.extractability} 可提取性</small></td>
      <td class="source-links">${item.links.map(link => `<a href="${link.url}" target="_blank" rel="noopener">${link.label}</a>`).join("")}</td>
      <td>${item.use}</td><td>${item.limitations}</td>
    </tr>`).join("")}</tbody></table>`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character]));
  }

  function scopeReason(record) {
    const scopeClass = scopeClassFor(record);
    if (scopeClass === "unresolved") {
      return record.es_id === "ES4L"
        ? "横跨 5.8S 与 28S，坐标轴和结构范围尚未统一。"
        : "位于 5.8S，当前 28S 结构范围不适用。";
    }
    const paired = Number.isFinite(record.paired_fraction_intrasegment)
      ? `${(record.paired_fraction_intrasegment * 100).toFixed(1)}%`
      : "未定";
    if (scopeClass === "core_hold") {
      return `R2DT 段内成对比例 ${paired}（< 30%），且有 ${record.external_pair_count ?? "未定"} 个区外配对；存在宿主根部或核心依赖风险。`;
    }
    return `R2DT 段内成对比例 ${paired}（≥ 30%），通过 ES 级纳入门控。`;
  }

  function scopeAction(record) {
    const scopeClass = scopeClassFor(record);
    if (scopeClass === "unresolved") return "仅展示人源参考；统一坐标与结构范围后再评估。";
    if (scopeClass === "core_hold") return "仅展示人源参考，不生成评分窗口。";
    return "按人源 ES 全跨度生成逐 1 nt 窗口；正式与预览结果分开标记。";
  }

  function renderScopeCurrent() {
    const target = document.getElementById("scopeCurrentSummary");
    const record = state.datasets[state.currentEs]?.metadata;
    if (!target || !record) return;
    const scope = SCOPE_LABELS[scopeClassFor(record)];
    target.innerHTML = `<b class="scope-inline-status ${scope.className}">${scope.label}</b>`;
  }

  function renderScopePage() {
    const records = state.humanReferencePayload?.records ?? [];
    if (!records.length) return;
    const counts = records.reduce((result, record) => {
      result[scopeClassFor(record)] += 1;
      return result;
    }, { preliminary: 0, core_hold: 0, unresolved: 0 });
    document.getElementById("scopeSummary").innerHTML = `
      <article><span>人源 ES</span><strong>${records.length}</strong><small>全部保留</small></article>
      <article class="preliminary"><span>纳入评分</span><strong>${counts.preliminary}</strong><small>通过 ES 级门控</small></article>
      <article class="core-hold"><span>结构风险暂停</span><strong>${counts.core_hold}</strong><small>仅展示人源参考</small></article>
      <article class="unresolved"><span>范围未决</span><strong>${counts.unresolved}</strong><small>仅展示人源参考</small></article>`;

    const filters = [
      ["all", `全部 ${records.length}`],
      ["preliminary", `可评分 ${counts.preliminary}`],
      ["core_hold", `结构风险 ${counts.core_hold}`],
      ["unresolved", `范围未决 ${counts.unresolved}`]
    ];
    document.getElementById("scopeFilters").innerHTML = filters.map(([key, label]) =>
      `<button type="button" data-scope-filter="${key}" class="${state.scopeFilter === key ? "active" : ""}">${label}</button>`
    ).join("");
    document.querySelectorAll("[data-scope-filter]").forEach(button => button.addEventListener("click", () => {
      state.scopeFilter = button.dataset.scopeFilter;
      renderScopePage();
    }));

    const visible = records.filter(record => state.scopeFilter === "all" || scopeClassFor(record) === state.scopeFilter);
    const rows = visible.map(record => {
      const scope = SCOPE_LABELS[scopeClassFor(record)];
      const canAnalyze = Boolean(state.datasets[record.es_id]?.analysisReady);
      const secondary = Number.isFinite(record.secondary_current_start_incl)
        ? `28S:${record.secondary_current_start_incl}–${record.secondary_current_end_incl}`
        : "未提供";
      const literature = String(record.literature_support || "").split(";").map(item => item.trim()).filter(Boolean);
      const links = [
        `<a href="https://www.ncbi.nlm.nih.gov/nuccore/${encodeURIComponent(record.ref_accession)}" target="_blank" rel="noopener">${escapeHtml(record.ref_accession)}</a>`,
        ...literature.slice(0, 2).map((url, index) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">文献 ${index + 1}</a>`)
      ].join("");
      return `<tr>
        <td><span class="scope-status ${scope.className}">${scope.label}</span></td>
        <td><button type="button" class="scope-es-link" data-scope-es="${record.es_id}" ${canAnalyze ? "" : `disabled title="仅展示：${escapeHtml(scope.label)}"`}>${record.es_id}</button><small>${escapeHtml(record.host_helix)} · ${record.length_nt} nt</small></td>
        <td>${escapeHtml(record.component_coordinates || "未冻结")}<small>宿主螺旋全跨度</small></td>
        <td>${secondary}<small>${Number.isFinite(record.primary_vs_secondary_length_delta_nt) ? `与全跨度长度差 ${record.primary_vs_secondary_length_delta_nt > 0 ? "+" : ""}${record.primary_vs_secondary_length_delta_nt} nt` : "无 Parker 插入代理"}</small></td>
        <td>${escapeHtml(scopeReason(record))}</td>
        <td>${escapeHtml(scopeAction(record))}<span class="scope-source-links">${links}</span></td>
      </tr>`;
    }).join("");
    document.getElementById("scopeTable").innerHTML = `<table class="scope-decision-table"><thead><tr><th>当前状态</th><th>ES / 宿主螺旋</th><th>结构全跨度</th><th>插入代理边界</th><th>为什么这样判定</th><th>当前处理与来源</th></tr></thead><tbody>${rows}</tbody></table>`;
    document.querySelectorAll("[data-scope-es]").forEach(button => button.addEventListener("click", () => openEsLandscape(button.dataset.scopeEs)));
  }

  async function openEsLandscape(esId) {
    if (!state.datasets[esId]?.analysisReady) return;
    state.currentEs = esId;
    document.getElementById("esSelect").value = esId;
    document.querySelector('.view-tab[data-tab="landscape"]').click();
    await analyzeWithWindowCache();
    window.scrollTo({ top: document.querySelector(".view-tabs").offsetTop - 12, behavior: "smooth" });
  }

  function exportCsv() {
    const ranked = getRankedResults(state.results).slice(0, state.topN);
    const sequences = state.datasets[state.currentEs].sequences;
    const lines = [["rank", "ES", "window_nt", "es_start_1based", "es_end_1based", "human_28s_start_1based", "human_28s_end_1based", "alignment_start_1based", "alignment_end_1based", "S_cons", "S_LE", "S_joint", "score_status", "order_coverage", "callable_species", "callable_orders", "delta_LOO", "P_intra", "P_external", "null_B", "pareto_status", "priority_class", "human_sequence"]];
    ranked.forEach((row, index) => {
      const humanSequence = humanSequenceForWindow(sequences, row);
      const offset = state.datasets[state.currentEs]?.humanCoordinateOffset ?? 0;
      lines.push([index + 1, state.currentEs, row.size, row.humanStart, row.humanEnd, offset ? offset + row.humanStart : "", offset ? offset + row.humanEnd : "", row.start + 1, row.end + 1, row.score.toFixed(6), Number.isFinite(row.lowEntropy) ? row.lowEntropy.toFixed(6) : "", Number.isFinite(row.jointScore) ? row.jointScore.toFixed(6) : "", row.scoreStatus, row.coverage.toFixed(6), row.n_species_callable, row.n_orders_callable, row.delta_LOO, row.P_intra, row.P_external, row.null_B ?? "", row.pareto_status ?? "", row.priority_class ?? "", humanSequence]);
    });
    const csv = lines.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.currentEs}_evoes_${state.rankMode}_${state.rankMetric}_ranking.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function bindEvents() {
    const insertionDialog = document.getElementById("insertionDialog");
    document.getElementById("closeInsertionDialog").addEventListener("click", closeInsertionDialog);
    insertionDialog.addEventListener("toggle", () => {
      if (!insertionDialog.matches(":popover-open")) resetActiveInsertionMarker();
    });
    document.addEventListener("pointerdown", event => {
      if (!insertionDialog.matches(":popover-open")) return;
      if (insertionDialog.contains(event.target) || event.target.closest?.("[data-insertion-id]")) return;
      closeInsertionDialog();
    });
    document.getElementById("esSelect").addEventListener("change", event => { state.currentEs = event.target.value; analyzeWithWindowCache(); });
    document.getElementById("rankMode").addEventListener("change", event => { state.rankMode = event.target.value; analyze(); });
    document.getElementById("rankMetric").addEventListener("change", event => { state.rankMetric = event.target.value; analyze(); });
    document.getElementById("topNSelect").addEventListener("change", event => { state.topN = Number(event.target.value); analyze(); });
    document.getElementById("exportButton").addEventListener("click", exportCsv);
    document.getElementById("inventorySearch").addEventListener("input", event => {
      state.inventoryQuery = event.target.value;
      renderLsuInventory();
    });
    const addButton = document.getElementById("windowAddButton");
    const addMenu = document.getElementById("windowAddMenu");
    addButton.addEventListener("click", event => {
      event.stopPropagation();
      const open = addMenu.hidden;
      addMenu.hidden = !open;
      addButton.setAttribute("aria-expanded", String(open));
    });
    document.querySelectorAll("#windowAddMenu [data-window-size]").forEach(button => button.addEventListener("click", () => {
      const size = Number(button.dataset.windowSize);
      state.selectedWindows.add(size);
      state.visibleSeries.add(size);
      addMenu.hidden = true;
      addButton.setAttribute("aria-expanded", "false");
      analyzeWithWindowCache();
    }));
    document.addEventListener("click", event => {
      if (!event.target.closest(".window-add-wrap")) {
        addMenu.hidden = true;
        addButton.setAttribute("aria-expanded", "false");
      }
    });
    document.querySelectorAll("[data-alignment-mode]").forEach(button => button.addEventListener("click", () => {
      if (state.alignmentMode === button.dataset.alignmentMode) return;
      state.alignmentMode = button.dataset.alignmentMode;
      state.alignmentRenderKey = null;
      const dataset = state.datasets[state.currentEs];
      if (state.activeTab === "landscape" && dataset?.analysisReady && state.selected) renderSelection(dataset.sequences);
    }));
    document.getElementById("openScopeTab").addEventListener("click", () => {
      document.querySelector('.view-tab[data-tab="scope"]').click();
      window.scrollTo({ top: document.querySelector(".view-tabs").offsetTop - 12, behavior: "smooth" });
    });
    document.querySelectorAll(".view-tab").forEach(tab => tab.addEventListener("click", () => {
      state.activeTab = tab.dataset.tab;
      document.querySelectorAll(".view-tab").forEach(item => {
        const active = item === tab;
        item.classList.toggle("active", active);
        item.setAttribute("aria-selected", String(active));
      });
      document.querySelectorAll(".tab-panel").forEach(panel => {
        const active = panel.id === `${tab.dataset.tab}Tab`;
        panel.classList.toggle("active", active);
        panel.hidden = !active;
      });
      window.requestAnimationFrame(() => {
        if (tab.dataset.tab === "statistics") {
          renderStatistics();
          return;
        }
        if (tab.dataset.tab === "scope") {
          renderScopePage();
          return;
        }
        if (tab.dataset.tab === "methods") return;
        const dataset = state.datasets[state.currentEs];
        const sequences = state.datasets[state.currentEs].sequences;
        if (!dataset.analysisReady) {
          if (tab.dataset.tab === "landscape") renderReferenceChart(humanCoordinateMap(findHumanSequence(sequences)).length);
        } else if (tab.dataset.tab === "landscape") {
          renderChart(humanCoordinateMap(findHumanSequence(sequences)).length);
          renderSelection(sequences);
        }
      });
    }));
    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (state.activeTab !== "landscape") return;
        const dataset = state.datasets[state.currentEs];
        if (!dataset?.sequences?.length) return;
        const human = findHumanSequence(dataset.sequences);
        if (!human) return;
        if (dataset.analysisReady) {
          renderChart(humanCoordinateMap(human).length);
        } else {
          renderReferenceChart(humanCoordinateMap(human).length);
        }
      }, 180);
    });
  }

  bindEvents();
  loadLsuLibraryStatus();
  loadDatabaseCatalog();
  loadProvenanceCatalog();
  loadCrossSpeciesInventory();
  loadHumanReferences()
    .then(() => Promise.all([loadBuiltInAllEsAlignments(), loadAllWindowManifest()]))
    .then(analyzeWithWindowCache)
    .catch(error => {
      document.getElementById("analysisStatus").textContent = `载入失败：${error.message}`;
      document.getElementById("dataNotice").textContent = "数据文件暂不可用";
      console.error(error);
    });
})();
