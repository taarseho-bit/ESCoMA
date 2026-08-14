(() => {
  "use strict";

  const WINDOW_COLORS = { 20: "#245B78", 30: "#2F6F6D", 40: "#856A9D", 50: "#A67C37" };
  const WHOLE_SEGMENT_COLOR = "#8A4F4B";
  const TAXON_STYLES = {
    Primates: { label: "灵长目", color: "#315E7D" },
    Rodentia: { label: "啮齿目", color: "#A35C45" },
    Lagomorpha: { label: "兔形目", color: "#92713B" },
    Carnivora: { label: "食肉目", color: "#34766F" },
    Cetartiodactyla: { label: "鲸偶蹄目", color: "#8A6D2F" },
    Perissodactyla: { label: "奇蹄目", color: "#795E8E" },
    Chiroptera: { label: "翼手目", color: "#55738F" },
    Eulipotyphla: { label: "真盲缺目", color: "#5B7D62" },
    Proboscidea: { label: "长鼻目", color: "#776B5D" },
    Cingulata: { label: "有甲目", color: "#9A6374" },
    Didelphimorphia: { label: "负鼠目", color: "#657480" },
    Mammalia: { label: "哺乳纲 · 目未定", color: "#68757A" },
    Other: { label: "其他类群 · 仅展示", color: "#8A9294" }
  };

  const state = {
    datasets: {},
    currentEs: "ES27L",
    selectedWindows: new Set([20]),
    visibleSeries: new Set([20]),
    rankMode: "peaks",
    topN: 20,
    results: [],
    selected: null,
    humanReferencePayload: null,
    allEsSummary: null,
    librarySummary: null,
    databaseCatalog: null,
    provenanceCatalog: null,
    activeTab: "landscape",
    alignmentMode: "focus",
    alignmentRenderKey: null,
    statisticsDirty: true
  };

  function createHumanReferenceDataset(record) {
    return {
      name: record.es_id,
      label: `${record.es_id} 人源真实参考`,
      dataScope: "human_reference_only",
      simulated: false,
      analysisReady: false,
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
    const select = document.getElementById("esSelect");
    state.humanReferencePayload = payload;
    select.replaceChildren();
    payload.records.forEach(record => {
      state.datasets[record.es_id] = createHumanReferenceDataset(record);
      select.add(new Option(`${record.es_id} · ${record.length_nt} nt · ${record.molecule}`, record.es_id));
    });
    state.currentEs = state.datasets.ES27L ? "ES27L" : payload.records[0].es_id;
    select.value = state.currentEs;
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
        humanCoordinateOffset: dataset.human_coordinate_offset
      };
    });
    const availableIds = new Set(Object.keys(payload.datasets));
    const select = document.getElementById("esSelect");
    select.replaceChildren();
    state.humanReferencePayload.records.filter(record => availableIds.has(record.es_id)).forEach(record => {
      select.add(new Option(`${record.es_id} · ${record.length_nt} nt · 完整缓存`, record.es_id));
    });
    const preferredEs = availableIds.has("ES27L") && payload.datasets.ES27L.windows.length
      ? "ES27L"
      : Object.entries(payload.datasets).find(([, dataset]) => dataset.windows.length)?.[0];
    state.currentEs = preferredEs || [...availableIds][0];
    select.value = state.currentEs;
    state.staticCache = payload;
    state.allEsSummary = buildStaticSummary(payload);
    markStatisticsDirty();
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
      target.textContent = `${summary.combined_fasta_records}/${summary.panel_species} 通过QC`;
      markStatisticsDirty();
    } catch {
      target.textContent = "QC状态不可用";
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

  function taxonomyFor(species) {
    if (/^Homo sapiens$/i.test(species.name)) return { key: "Human", label: "人源参考", color: "#243E55", scoring: false };
    const mammal = species.clades?.includes("Mammalia") || species.lineage === "Mammalia";
    const key = mammal ? (species.order || "Mammalia") : "Other";
    const style = TAXON_STYLES[key] || TAXON_STYLES.Other;
    return { key, ...style, scoring: mammal && Boolean(species.order) };
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
      [window.S_cons, window.S_LE, window.S_joint, window.order_coverage].every(Number.isFinite) &&
      window.conservation_qc === "pass" && window.structure_gate_status === "pass"
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
        lowEntropy: window.S_LE,
        coverage: window.order_coverage,
        jointScore: window.S_joint
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
      [item.score, item.lowEntropy, item.jointScore, item.coverage].every(Number.isFinite)
    );
    const sorted = [...passing].sort((a, b) => {
      return b.jointScore - a.jointScore || b.score - a.score || b.lowEntropy - a.lowEntropy || a.size - b.size || a.start - b.start;
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
  function humanAbsoluteCoordinateText(window) {
    const offset = state.datasets[state.currentEs]?.humanCoordinateOffset;
    return Number.isFinite(offset) ? `${offset + window.humanStart}–${offset + window.humanEnd}` : "--";
  }
  function alignmentCoordinateText(window) { return `${window.start + 1}–${window.end + 1}`; }

  function render(dataset, sequences, ranked, humanLength = humanCoordinateMap(findHumanSequence(sequences)).length) {
    document.getElementById("datasetLabel").textContent = dataset.label;
    document.getElementById("speciesCount").textContent = `${dataset.summary?.scoring_species ?? sequences.length - 1}计分 / ${sequences.length}展示`;
    document.getElementById("alignmentLength").textContent = `${humanLength} nt`;
    const completeWindows = dataset.summary?.complete_window_count ?? dataset.windows?.length ?? 0;
    const plannedWindows = dataset.summary?.planned_window_count ?? completeWindows;
    document.getElementById("analysisStatus").textContent = completeWindows === plannedWindows
      ? `已载入 ${completeWindows} 个完整离线窗口`
      : `已载入 ${completeWindows}/${plannedWindows} 个完整窗口`;
    document.getElementById("entropyMethod").innerHTML = '<i class="method-symbol coverage"></i>结构低熵 = RNAstructure CUDA分区函数 + 二核苷酸零模型';
    document.getElementById("dataNotice").textContent = `离线E-INS-i缓存；人源不计分；${dataset.summary?.scoring_species ?? sequences.length - 1}种非人哺乳动物按目等权`;
    document.getElementById("rankingMethodNote").textContent = "仅显示完成B=500零模型与全部质控的代表峰；按几何平均排序，缺失记录不进入页面";
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
    document.getElementById("exportButton").disabled = referenceOnly;
    renderWindowPicker(humanLength, referenceOnly);
  }

  function renderHumanReference(dataset, sequences, humanLength) {
    const meta = dataset.metadata;
    document.getElementById("datasetLabel").textContent = `${dataset.label} · Human ES Reference v1.2`;
    document.getElementById("speciesCount").textContent = "1（人源）";
    document.getElementById("alignmentLength").textContent = `${humanLength} nt`;
    document.getElementById("analysisStatus").textContent = "跨物种MSA待构建";
    document.getElementById("entropyMethod").innerHTML = '<i class="method-symbol coverage"></i>低熵 = 待同源定位与MSA后计算';
    document.getElementById("dataNotice").textContent = "人源真实参考；保守性与低熵不从单序列推断";
    document.getElementById("topCoordinates").textContent = `1–${humanLength}`;
    document.getElementById("topContext").textContent = meta.window_strategy;
    document.getElementById("topScore").textContent = "--";
    document.getElementById("topLowEntropy").textContent = "--";
    document.getElementById("topEntropyContext").textContent = "跨物种MSA待构建";
    document.getElementById("topCoverage").textContent = "--";
    document.getElementById("topCoverageContext").textContent = "待跨物种MSA";
    document.getElementById("legend").innerHTML = '<span class="reference-legend">真实人源序列 · 约束轨道待计算</span>';
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
    const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "等待跨物种多序列比对的双约束轨道" });
    [["轨道一", "保守性"], ["轨道二", "结构低熵"]].forEach(([title, subtitle], index) => {
      const top = tops[index];
      svg.appendChild(svgEl("rect", { x: margin.left, y: top, width: plotW, height: trackH, class: "track-bg pending-track" }));
      const mid = top + trackH / 2;
      svg.appendChild(svgEl("line", { x1: margin.left + 12, x2: width - margin.right - 12, y1: mid, y2: mid, class: "pending-line" }));
      const titleEl = svgEl("text", { x: 12, y: top + 34, class: "track-label" }); titleEl.textContent = title; svg.appendChild(titleEl);
      const subEl = svgEl("text", { x: 12, y: top + 52, class: "track-subtitle" }); subEl.textContent = subtitle; svg.appendChild(subEl);
      const wait = svgEl("text", { x: margin.left + plotW / 2, y: mid - 9, "text-anchor": "middle", class: "pending-label" });
      wait.textContent = index === 0 ? "待定位跨物种ES同源区段并构建MSA" : "待从验证后的比对/结构概率计算";
      svg.appendChild(wait);
    });
    const xLabel = svgEl("text", { x: margin.left + plotW / 2, y: height - 9, "text-anchor": "middle", class: "axis-label" });
    xLabel.textContent = `人源ES坐标（1–${length} nt）`; svg.appendChild(xLabel);
    wrap.replaceChildren(svg);
  }

  function renderReferenceAlignment(dataset, human) {
    const meta = dataset.metadata;
    const length = human.sequence.length;
    const rows = [
      renderCoordinateRuler(human.sequence, length),
      `<div class="alignment-row human-row"><span class="alignment-label">Homo sapiens</span><span class="alignment-bases">${human.sequence.split("").map(base => `<span class="base human-base">${base}</span>`).join("")}</span></div>`,
      '<div class="alignment-divider"><span>逐位点约束轨道</span></div>',
      renderPendingConstraintTrack("保守性", length, "待跨物种MSA"),
      renderPendingConstraintTrack("结构低熵", length, "待跨物种MSA"),
      `<div class="reference-metadata"><span><strong>宿主螺旋</strong>${meta.host_helix || "--"}</span><span><strong>坐标系统</strong>${meta.coord_system_id}</span><span><strong>参考序列</strong>${meta.ref_accession}</span><span><strong>筛选状态</strong>${meta.screening_status}</span></div>`
    ];
    document.getElementById("selectionSubtitle").textContent = `${meta.es_id} · ${meta.molecule} · ${meta.component_coordinates}`;
    document.getElementById("selectedScore").textContent = "--";
    document.getElementById("selectedLowEntropy").textContent = "--";
    document.getElementById("selectedCoverage").textContent = "--";
    document.getElementById("selectedSpecies").textContent = "1";
    renderTaxonLegend([human]);
    document.getElementById("alignmentViewer").innerHTML = rows.join("");
  }

  function renderPendingConstraintTrack(label, length, status) {
    const width = Math.max(60, length * 15);
    return `<div class="alignment-row constraint-row pending-constraint"><span class="alignment-label constraint-label"><strong>${label}</strong><small>不可计算</small></span><span class="constraint-plot"><svg width="${width}" height="48" viewBox="0 0 ${width} 48" role="img" aria-label="${label}${status}"><line class="pending-constraint-line" x1="8" x2="${width - 8}" y1="24" y2="24"></line><text x="${Math.min(width / 2, 210)}" y="17">${status}</text></svg></span></div>`;
  }

  function renderReferenceRanking() {
    document.getElementById("rankingBody").innerHTML = '<tr class="empty-ranking"><td colspan="8"><strong>尚无完整二维窗口排行</strong><span>未完成跨物种定位或结构零模型的ES不显示缺失值。</span></td></tr>';
  }

  function renderSummary(top, speciesCount) {
    if (!top) {
      ["topCoordinates", "topScore", "topLowEntropy", "topCoverage"].forEach(id => {
        document.getElementById(id).textContent = "--";
      });
      document.getElementById("topContext").textContent = "当前长度无完整缓存候选";
      document.getElementById("topEntropyContext").textContent = "缺失记录不显示";
      document.getElementById("topCoverageContext").textContent = `${speciesCount}个非人物种`;
      return;
    }
    document.getElementById("topCoordinates").textContent = humanCoordinateText(top);
    document.getElementById("topContext").textContent = `${top.size} nt窗口 · 非人哺乳动物目间等权`;
    document.getElementById("topScore").textContent = scoreFmt(top.score);
    document.getElementById("topLowEntropy").textContent = scoreFmt(top.lowEntropy);
    document.getElementById("topCoverage").textContent = pct(top.coverage);
    document.getElementById("topEntropyContext").textContent = Number.isFinite(top.lowEntropy) ? `RNAstructure CUDA · 零模型 B=${top.null_B}` : "待结构零模型缓存";
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
    legend.innerHTML = [...counts.values()].map(item => `
      <span style="--taxon-color:${item.color}"><i></i><b>${item.label}</b><small>${item.count}种${item.scoring ? " · 计分" : " · 仅展示"}</small></span>`).join("");
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
    const yTrack = (value, top) => top + (1 - Math.max(0, Math.min(100, value)) / 100) * trackH;
    const hasLowEntropy = state.results.some(item => Number.isFinite(item.lowEntropy));
    const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "人源坐标上的目平衡保守性与结构低熵双轨图" });

    [conservationTop, entropyTop].forEach(top => {
      svg.appendChild(svgEl("rect", { x: margin.left, y: top, width: plotW, height: trackH, class: "track-bg" }));
      [0, 50, 100].forEach(value => {
        svg.appendChild(svgEl("line", { x1: margin.left, x2: width - margin.right, y1: yTrack(value, top), y2: yTrack(value, top), class: "grid-line" }));
        const label = svgEl("text", { x: margin.left - 8, y: yTrack(value, top) + 4, "text-anchor": "end" });
        label.textContent = value;
        svg.appendChild(label);
      });
    });
    [[conservationTop + 34, "轨道一", "目平衡保守性"], [entropyTop + 34, "轨道二", "结构低熵"]].forEach(([yPos, title, subtitle]) => {
      const titleEl = svgEl("text", { x: 12, y: yPos, class: "track-label" });
      titleEl.textContent = title;
      svg.appendChild(titleEl);
      const subEl = svgEl("text", { x: 12, y: yPos + 18, class: "track-subtitle" });
      subEl.textContent = subtitle;
      svg.appendChild(subEl);
    });

    const tickCount = width < 520 ? 4 : 7;
    for (let i = 0; i < tickCount; i++) {
      const value = Math.round(i * (length - 1) / (tickCount - 1)) + 1;
      const tx = x(value - 1);
      svg.appendChild(svgEl("line", { x1: tx, x2: tx, y1: entropyTop + trackH, y2: entropyTop + trackH + 5, class: "axis-line" }));
      const label = svgEl("text", { x: tx, y: entropyTop + trackH + 20, "text-anchor": i === 0 ? "start" : i === tickCount - 1 ? "end" : "middle" });
      label.textContent = value;
      svg.appendChild(label);
    }
    const xLabel = svgEl("text", { x: margin.left + plotW / 2, y: height - 9, "text-anchor": "middle", class: "axis-label" });
    xLabel.textContent = "人源ES坐标（nt）";
    svg.appendChild(xLabel);

    if (state.selected) {
      const startPosition = state.selected.humanStart - 1;
      const endPosition = state.selected.humanEnd - 1;
      const bandWidth = Math.max(2, x(endPosition) - x(startPosition));
      svg.appendChild(svgEl("rect", { x: x(startPosition), y: conservationTop, width: bandWidth, height: entropyTop + trackH - conservationTop, class: "selected-band" }));
      svg.appendChild(svgEl("rect", { x: x(startPosition), y: conservationTop, width: bandWidth, height: entropyTop + trackH - conservationTop, class: "selected-outline" }));
      const peak = svgEl("text", { x: Math.min(width - margin.right - 105, x(startPosition) + 5), y: conservationTop - 12, class: "peak-label" });
      peak.textContent = `最高分  ${humanCoordinateText(state.selected)} · ${state.selected.size} nt`;
      svg.appendChild(peak);
    }

    visibleAnalysisSizes().forEach(size => {
      const series = state.results.filter(r => r.size === size).sort((a, b) => a.humanStart - b.humanStart);
      if (!series.length) return;
      const conservationPath = series.map((d, i) => `${i ? "L" : "M"}${x((d.humanStart + d.humanEnd) / 2 - 1).toFixed(2)},${yTrack(d.score, conservationTop).toFixed(2)}`).join(" ");
      svg.appendChild(svgEl("path", { d: conservationPath, class: "score-line", stroke: windowColor(size), "data-size": size }));
      series.forEach(d => svg.appendChild(svgEl("circle", {
        cx: x((d.humanStart + d.humanEnd) / 2 - 1), cy: yTrack(d.score, conservationTop), r: 3.2,
        class: "score-point", fill: windowColor(size)
      })));
      const entropySeries = series.filter(item => Number.isFinite(item.lowEntropy));
      if (entropySeries.length) {
        const entropyPath = entropySeries.map((d, i) => `${i ? "L" : "M"}${x((d.humanStart + d.humanEnd) / 2 - 1).toFixed(2)},${yTrack(d.lowEntropy, entropyTop).toFixed(2)}`).join(" ");
        svg.appendChild(svgEl("path", { d: entropyPath, class: "score-line", stroke: windowColor(size), "data-size": size, opacity: ".72" }));
        entropySeries.forEach(d => svg.appendChild(svgEl("circle", {
          cx: x((d.humanStart + d.humanEnd) / 2 - 1), cy: yTrack(d.lowEntropy, entropyTop), r: 3.2,
          class: "score-point", fill: windowColor(size), opacity: ".82"
        })));
      }
    });
    if (!hasLowEntropy) {
      const pending = svgEl("text", { x: margin.left + plotW / 2, y: entropyTop + trackH / 2, "text-anchor": "middle", class: "pending-label" });
      pending.textContent = "当前窗口长度没有完整二维缓存候选";
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
      const rows = visibleAnalysisSizes().map(size => {
        const series = state.results.filter(r => r.size === size);
        const datum = series.reduce((best, current) => Math.abs(((current.humanStart + current.humanEnd) / 2 - 1) - coordinate) < Math.abs(((best.humanStart + best.humanEnd) / 2 - 1) - coordinate) ? current : best, series[0]);
        return `<span style="color:${windowColor(size)}">●</span> ${size} nt：保守性 <strong>${scoreFmt(datum.score)}</strong> · 结构低熵 ${scoreFmt(datum.lowEntropy)}`;
      });
      tooltip.innerHTML = `<strong>人源ES位置 ${coordinate + 1}</strong><br>${rows.join("<br>")}`;
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
      body.innerHTML = '<tr class="empty-ranking"><td colspan="8"><strong>当前窗口长度没有完整缓存候选</strong><span>未完成结构零模型、低覆盖或结构门控未通过的记录不会显示。</span></td></tr>';
      return;
    }
    rows.forEach((row, index) => {
      const sequences = state.datasets[state.currentEs].sequences;
      const humanSequence = humanSequenceForWindow(sequences, row);
      const tr = document.createElement("tr");
      if (state.selected && row.size === state.selected.size && row.start === state.selected.start) tr.classList.add("selected");
      tr.innerHTML = `
        <td class="rank-number">${String(index + 1).padStart(2, "0")}</td>
        <td><span class="legend-swatch" style="display:inline-block;margin-right:7px;background:${windowColor(row.size)}"></span>${row.size} nt${WINDOW_COLORS[row.size] ? "" : "（整段）"}</td>
        <td>${humanCoordinateText(row)}</td>
        <td>${humanAbsoluteCoordinateText(row)}</td>
        <td class="numeric score-cell">${scoreFmt(row.score)}</td>
        <td class="numeric">${scoreFmt(row.lowEntropy)}</td>
        <td class="numeric">${pct(row.coverage)}</td>
        <td><code>${humanSequence}</code></td>`;
      tr.addEventListener("click", () => {
        state.selected = row;
        state.alignmentRenderKey = null;
        document.querySelector('.view-tab[data-tab="landscape"]').click();
      });
      body.appendChild(tr);
    });
  }

  function consensusForWindow(sequences, window) {
    const consensus = [];
    const support = [];
    const nonhuman = sequences.filter(s => !/^Homo sapiens$/i.test(s.name));
    for (const p of window.alignmentColumns) {
      const counts = { A: 0, C: 0, G: 0, U: 0 };
      nonhuman.forEach(s => { if (counts[s.sequence[p]] !== undefined) counts[s.sequence[p]]++; });
      const [base, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      consensus.push(count ? base : "-");
      support.push(nonhuman.length ? count / nonhuman.length : 0);
    }
    return { consensus: consensus.join(""), support };
  }

  function humanSequenceForWindow(sequences, window) {
    const human = findHumanSequence(sequences);
    return window.alignmentColumns.map(column => human.sequence[column]).join("");
  }

  function renderSelection(sequences) {
    const selected = state.selected;
    if (!selected) {
      document.getElementById("selectionSubtitle").textContent = "当前长度无完整缓存候选";
      ["selectedScore", "selectedLowEntropy", "selectedCoverage", "selectedSpecies"].forEach(id => {
        document.getElementById(id).textContent = "--";
      });
      document.getElementById("alignmentViewer").replaceChildren();
      state.alignmentRenderKey = null;
      return;
    }
    document.getElementById("selectionSubtitle").textContent = `${state.currentEs} · ES内 ${humanCoordinateText(selected)} · 人28S ${humanAbsoluteCoordinateText(selected)} · ${selected.size} nt`;
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
    const focusPadding = 60;
    const sliceStart = state.alignmentMode === "focus" ? Math.max(0, window.start - focusPadding) : 0;
    const sliceEnd = state.alignmentMode === "focus" ? Math.min(alignmentLength, window.end + focusPadding + 1) : alignmentLength;
    const displayColumns = Array.from({ length: sliceEnd - sliceStart }, (_, index) => sliceStart + index);
    const displayConsensus = consensusForWindow(sequences, { alignmentColumns: displayColumns }).consensus;
    const makeDetailedBases = (sequence, isConsensus = false, isHuman = false, sequenceIsSliced = false) => (sequenceIsSliced ? sequence : sequence.slice(sliceStart, sliceEnd)).split("").map((base, localIndex) => {
      const globalIndex = sliceStart + localIndex;
      const classes = ["base"];
      if (isConsensus) classes.push("consensus");
      if (isHuman) classes.push("human-base");
      else if (base === "-") classes.push("gap");
      else if (base !== displayConsensus[localIndex]) classes.push("mismatch");
      if (globalIndex >= window.start && globalIndex <= window.end) classes.push("selected-base");
      return `<span class="${classes.join(" ")}">${base}</span>`;
    }).join("");
    const makeOverviewBases = (sequence, extraClass = "") => {
      const before = sequence.slice(0, window.start);
      const selected = sequence.slice(window.start, window.end + 1);
      const after = sequence.slice(window.end + 1);
      return `<span class="overview-sequence ${extraClass}"><span>${before}</span><span class="overview-selected">${selected}</span><span>${after}</span></span>`;
    };
    const makeBases = state.alignmentMode === "focus"
      ? makeDetailedBases
      : (sequence, isConsensus = false, isHuman = false) => makeOverviewBases(
        sequence,
        [isConsensus ? "consensus" : "", isHuman ? "human-base" : ""].filter(Boolean).join(" ")
      );
    viewer.classList.toggle("alignment-overview", state.alignmentMode === "full");
    const rows = [
      state.alignmentMode === "focus"
        ? renderCoordinateRuler(human.sequence, alignmentLength, sliceStart, sliceEnd)
        : `<div class="alignment-row overview-ruler-row"><span class="alignment-label">MSA全长</span><span class="overview-range">1–${alignmentLength}列 · 选中 ${window.start + 1}–${window.end + 1}</span></div>`,
      `<div class="alignment-row human-row"><a class="alignment-label source-anchor" href="${human.source_url || `https://www.ncbi.nlm.nih.gov/nuccore/${human.accession || "NR_003287.4"}`}" target="_blank" rel="noopener" title="打开 ${human.accession || "NR_003287.4"} 原始记录">Homo sapiens</a><span class="alignment-bases">${makeBases(human.sequence, false, true)}</span></div>`,
      `<div class="alignment-row consensus-row"><span class="alignment-label">跨物种共识</span><span class="alignment-bases">${state.alignmentMode === "focus" ? makeDetailedBases(displayConsensus, true, false, true) : makeBases(displayConsensus, true)}</span></div>`
    ];
    const conservation = cachedConstraintProfile(window.size, "score", alignmentLength);
    const lowEntropyColumns = cachedConstraintProfile(window.size, "lowEntropy", alignmentLength);
    rows.push('<div class="alignment-divider"><span>完整缓存代表峰的窗口约束轨道</span></div>');
    rows.push(renderConstraintTrack("保守性", conservation, window, "conservation", sliceStart, sliceEnd));
    rows.push(renderConstraintTrack("结构低熵", lowEntropyColumns, window, "entropy", sliceStart, sliceEnd));
    rows.push('<div class="alignment-divider species-divider"><span>其他物种原始比对序列</span></div>');
    sequences.filter(species => species !== human).sort((a, b) => {
      const taxonA = taxonomyFor(a);
      const taxonB = taxonomyFor(b);
      return taxonA.key.localeCompare(taxonB.key) || a.name.localeCompare(b.name);
    }).forEach(species => {
      const sourceUrl = species.source_url || (species.accession ? `https://www.ncbi.nlm.nih.gov/nuccore/${species.accession}` : "");
      const taxon = taxonomyFor(species);
      const labelInner = `<span class="species-name">${species.name}</span><small>${taxon.label} · ${taxon.scoring ? "计分" : "仅展示"}</small>`;
      const label = sourceUrl
        ? `<a class="alignment-label source-anchor taxon-label" style="--taxon-color:${taxon.color}" href="${sourceUrl}" target="_blank" rel="noopener" title="打开 ${species.accession || species.name} 原始记录">${labelInner}</a>`
        : `<span class="alignment-label taxon-label" style="--taxon-color:${taxon.color}" title="${species.name}">${labelInner}</span>`;
      rows.push(`<div class="alignment-row taxon-row" style="--taxon-color:${taxon.color}">${label}<span class="alignment-bases">${makeBases(species.sequence)}</span></div>`);
    });
    viewer.innerHTML = rows.join("");
    const target = state.alignmentMode === "focus"
      ? Math.max(0, (window.start - sliceStart) * 15 - viewer.clientWidth * 0.35)
      : Math.max(0, window.start * 7.25 - viewer.clientWidth * 0.35);
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

  function renderCoordinateRuler(humanSequence, alignmentLength, sliceStart = 0, sliceEnd = alignmentLength) {
    const width = (sliceEnd - sliceStart) * 15;
    let humanPosition = 0;
    const ticks = [];
    for (let column = 0; column < alignmentLength; column++) {
      if (humanSequence[column] !== "-") humanPosition++;
      if (column >= sliceStart && column < sliceEnd && humanSequence[column] !== "-" && (humanPosition === 1 || humanPosition % 25 === 0)) {
        const x = (column - sliceStart) * 15 + 7.5;
        ticks.push(`<line x1="${x}" x2="${x}" y1="19" y2="25"></line><text x="${x}" y="14">${humanPosition}</text>`);
      }
    }
    return `<div class="alignment-row ruler-row"><span class="alignment-label">人源位置</span><span class="sequence-ruler"><svg width="${width}" height="26" viewBox="0 0 ${width} 26" aria-label="人源ES坐标尺"><line x1="0" x2="${width}" y1="25" y2="25"></line>${ticks.join("")}</svg></span></div>`;
  }

  function renderConstraintTrack(label, values, window, type, sliceStart = 0, sliceEnd = values.length) {
    const visibleValues = values.slice(sliceStart, sliceEnd);
    const width = visibleValues.length * 15;
    const height = 48;
    const top = 5;
    const plotHeight = 35;
    const y = value => top + (1 - Math.max(0, Math.min(100, value)) / 100) * plotHeight;
    let drawing = false;
    const path = visibleValues.map((value, index) => {
      if (!Number.isFinite(value)) { drawing = false; return ""; }
      const command = drawing ? "L" : "M";
      drawing = true;
      return `${command}${(index * 15 + 7.5).toFixed(1)},${y(value).toFixed(1)}`;
    }).filter(Boolean).join(" ");
    const selectedX = (window.start - sliceStart) * 15;
    const selectedWidth = (window.end - window.start + 1) * 15;
    return `<div class="alignment-row constraint-row ${type}-constraint"><span class="alignment-label constraint-label"><strong>${label}</strong><small>0–100 · 离线缓存</small></span><span class="constraint-plot"><svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}缓存代表峰曲线"><rect class="constraint-selection" x="${selectedX}" y="0" width="${selectedWidth}" height="${height}"></rect><line class="constraint-grid" x1="0" x2="${width}" y1="${y(50)}" y2="${y(50)}"></line><path class="constraint-path" d="${path}"></path></svg></span></div>`;
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
    renderSourceTable();
    renderLiteratureTable();
    state.statisticsDirty = false;
  }

  function renderDatabaseLayers(summary) {
    const catalog = state.databaseCatalog;
    const silvaCount = catalog?.collections?.silva_lsu_ref_nr99?.records ?? 95279;
    const rfamCount = catalog?.collections?.rfam_rf02543?.records ?? 107553;
    const rodCount = catalog?.collections?.rod_v1_2?.records ?? 69480;
    const rodPanel = catalog?.collections?.rod_species_panel_v1;
    const eukLsu = catalog?.collections?.eukaryome_lsu_v2_0;
    const eukLong = catalog?.collections?.eukaryome_long_v2_0;
    const eukPanel = catalog?.collections?.eukaryome_species_panel_v1;
    const lsuPass = state.librarySummary?.combined_fasta_records ?? 79;
    const panel = state.librarySummary?.panel_species ?? 135;
    const layers = [
      { value: silvaCount.toLocaleString(), label: "SILVA LSU底库", context: "全量参考序列 · 已校验MD5" },
      { value: rfamCount.toLocaleString(), label: "Rfam RF02543", context: "2,616物种 · 结构感知模型" },
      { value: rodCount.toLocaleString(), label: "ROD完整operon", context: "11,935个基因组 · 已下载校验" },
      { value: `${rodPanel?.matched_species ?? 37}/${rodPanel?.target_species ?? 135}`, label: "ROD目标物种候选", context: `${Number(rodPanel?.matching_operon_variants ?? 10383).toLocaleString()}条候选 · 尚未ES定位` },
      { value: `${eukLsu?.matched_species ?? 78}/${eukLsu?.target_species ?? 135}`, label: "EUKARYOME LSU", context: `${Number(eukLsu?.matching_candidates ?? 646).toLocaleString()}条候选 · v2.0全量校验` },
      { value: `${eukLong?.matched_species ?? 62}/${eukLong?.target_species ?? 135}`, label: "EUKARYOME长读长", context: `${Number(eukLong?.matching_candidates ?? 447).toLocaleString()}条候选 · 同记录5.8S/28S` },
      { value: `${lsuPass}/${panel}`, label: "NCBI核LSU工作集", context: "版本化原始记录通过QC" },
      { value: summary.human_reference_es_count, label: "人源ES参考", context: `${summary.directly_mapped_28s_es_count}个已跨物种映射` },
      { value: summary.mammal_species_count, label: "当前哺乳动物", context: `${summary.es_species_calls}个ES×物种判定` },
      { value: `${eukPanel?.selected_unique_sequence_md5 ?? 224}/310`, label: "EUK入选唯一序列", context: "按MD5去重 · 候选不等于定位通过" }
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
        return `<a class="matrix-cell pass" href="${call.source_url}" target="_blank" rel="noopener" title="${species.species} × ${esId}：通过定位QC；${call.accession}" aria-label="${species.species} ${esId} 通过定位QC，打开 ${call.accession}"></a>`;
      }).join("");
      return `<div class="matrix-row"><a class="matrix-species" href="${species.source_url}" target="_blank" rel="noopener" title="${species.accession} · NCBI TaxID ${species.taxid}">${species.species}</a>${cells}<strong>${species.es_pass}</strong></div>`;
    }).join("");
    document.getElementById("coverageMatrix").innerHTML = `<div class="matrix-inner" style="--es-count:${esIds.length}"><div class="matrix-header"><span>物种</span>${header}<strong>通过</strong></div>${body}</div>`;
    document.querySelectorAll(".matrix-header button").forEach(button => button.addEventListener("click", () => openEsLandscape(button.dataset.es)));
    document.getElementById("matrixSummary").textContent = `${summary.pass_calls}/${summary.es_species_calls} 通过定位QC`;
  }

  function renderSourceTable() {
    const sources = (state.provenanceCatalog?.databases ?? []).filter(source => Number.isFinite(source.records));
    document.getElementById("sourceTable").innerHTML = `<table class="provenance-table"><thead><tr><th>来源</th><th>版本/范围</th><th class="numeric">记录数</th><th>状态</th><th>原始入口</th><th>本地校验与用途</th></tr></thead><tbody>${sources.map(source => `<tr>
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

  function openEsLandscape(esId) {
    if (!state.datasets[esId]) return;
    state.currentEs = esId;
    document.getElementById("esSelect").value = esId;
    document.querySelector('.view-tab[data-tab="landscape"]').click();
    analyze();
    window.scrollTo({ top: document.querySelector(".view-tabs").offsetTop - 12, behavior: "smooth" });
  }

  function exportCsv() {
    const ranked = getRankedResults(state.results).slice(0, state.topN);
    const sequences = state.datasets[state.currentEs].sequences;
    const lines = [["rank", "ES", "window_nt", "es_start_1based", "es_end_1based", "human_28s_start_1based", "human_28s_end_1based", "alignment_start_1based", "alignment_end_1based", "S_cons", "S_LE", "S_joint", "order_coverage", "callable_species", "callable_orders", "delta_LOO", "P_intra", "P_external", "null_B", "pareto_status", "priority_class", "human_sequence"]];
    ranked.forEach((row, index) => {
      const humanSequence = humanSequenceForWindow(sequences, row);
      const offset = state.datasets[state.currentEs]?.humanCoordinateOffset ?? 0;
      lines.push([index + 1, state.currentEs, row.size, row.humanStart, row.humanEnd, offset ? offset + row.humanStart : "", offset ? offset + row.humanEnd : "", row.start + 1, row.end + 1, row.score.toFixed(6), row.lowEntropy.toFixed(6), row.jointScore.toFixed(6), row.coverage.toFixed(6), row.n_species_callable, row.n_orders_callable, row.delta_LOO, row.P_intra, row.P_external, row.null_B, row.pareto_status, row.priority_class, humanSequence]);
    });
    const csv = lines.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.currentEs}_evoes_complete_cached_ranking.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function bindEvents() {
    document.getElementById("esSelect").addEventListener("change", event => { state.currentEs = event.target.value; analyze(); });
    document.getElementById("rankMode").addEventListener("change", event => { state.rankMode = event.target.value; analyze(); });
    document.getElementById("topNSelect").addEventListener("change", event => { state.topN = Number(event.target.value); analyze(); });
    document.getElementById("exportButton").addEventListener("click", exportCsv);
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
      analyze();
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
  loadHumanReferences().then(loadBuiltInAllEsAlignments).then(analyze).catch(error => {
    document.getElementById("datasetLabel").textContent = "数据载入失败";
    document.getElementById("analysisStatus").textContent = error.message;
    document.getElementById("dataNotice").textContent = "请检查本地数据文件与服务路径";
    console.error(error);
  });
})();
