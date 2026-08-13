(() => {
  "use strict";

  const WINDOW_COLORS = { 20: "#245B78", 30: "#2F6F6D", 40: "#856A9D", 50: "#A67C37" };
  const WHOLE_SEGMENT_COLOR = "#8A4F4B";

  const state = {
    datasets: {},
    currentEs: "ES27L",
    currentClade: "Eukaryota",
    selectedWindows: new Set([20, 30, 40, 50]),
    visibleSeries: new Set([20, 30, 40, 50]),
    rankMode: "independent",
    entropyThreshold: 0.65,
    topN: 20,
    results: [],
    selected: null,
    humanReferencePayload: null,
    allEsSummary: null,
    librarySummary: null,
    databaseCatalog: null,
    provenanceCatalog: null
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
    const response = await fetch("data/human_es_reference_v1.2.json?v=1.2.0", { cache: "no-store" });
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
    const response = await fetch("data/all_human_es_mammal_v1.json?v=1.0.0", { cache: "no-store" });
    if (!response.ok) throw new Error(`全ES跨物种数据载入失败（HTTP ${response.status}）`);
    const payload = await response.json();
    if (!payload.summary || !payload.datasets || payload.summary.directly_mapped_28s_es_count !== 20) {
      throw new Error("全ES跨物种数据未通过数据包完整性检查。");
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
        homologyCalls: dataset.homology_calls
      };
    });
    state.allEsSummary = payload.summary;
    renderStatistics();
  }

  async function loadLsuLibraryStatus() {
    const target = document.getElementById("lsuLibraryStatus");
    try {
      const response = await fetch("data/cross_species_lsu_validation_summary.json?v=1.0.0", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const summary = await response.json();
      state.librarySummary = summary;
      target.textContent = `${summary.combined_fasta_records}/${summary.panel_species} 通过QC`;
      renderStatistics();
    } catch {
      target.textContent = "QC状态不可用";
    }
  }

  async function loadDatabaseCatalog() {
    try {
      const response = await fetch("data/database_catalog.json?v=1.0.0", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.databaseCatalog = await response.json();
      renderStatistics();
    } catch (error) {
      console.warn("数据库目录暂不可用", error);
    }
  }

  async function loadProvenanceCatalog() {
    try {
      const response = await fetch("data/provenance_catalog.json?v=1.0.0", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.provenanceCatalog = await response.json();
      renderStatistics();
    } catch (error) {
      console.warn("可追溯目录暂不可用", error);
    }
  }

  function columnLowEntropy(sequences, position) {
    const counts = { A: 0, C: 0, G: 0, U: 0 };
    let total = 0;
    sequences.forEach(item => {
      const base = item.sequence[position];
      if (counts[base] !== undefined) { counts[base]++; total++; }
    });
    if (!total) return 0;
    let entropy = 0;
    Object.values(counts).forEach(count => {
      if (!count) return;
      const p = count / total;
      entropy -= p * Math.log(p);
    });
    return 1 - entropy / Math.log(4);
  }

  function scoreWindow(sequences, columns, lowEntropyColumns) {
    let comparable = 0;
    let matches = 0;
    const n = sequences.length;
    const possible = (n * (n - 1) / 2) * columns.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = sequences[i].sequence;
        const b = sequences[j].sequence;
        for (const p of columns) {
          if (a[p] === "-" || b[p] === "-" || a[p] === "N" || b[p] === "N") continue;
          comparable++;
          if (a[p] === b[p]) matches++;
        }
      }
    }
    const identity = comparable ? matches / comparable : 0;
    const coverage = possible ? comparable / possible : 0;
    const lowEntropy = columns.reduce((sum, position) => sum + lowEntropyColumns[position], 0) / columns.length;
    return { identity, coverage, score: identity * coverage, lowEntropy, comparable, possible };
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
    const sequences = dataset.sequences.filter(s => s.clades.includes(state.currentClade));
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
    const lowEntropyColumns = dataset.structureCertainty?.length === alignmentLength
      ? dataset.structureCertainty
      : Array.from({ length: alignmentLength }, (_, position) => columnLowEntropy(sequences, position));
    const results = [];
    analysisWindowSizes(humanMap.length).forEach(size => {
      for (let humanIndex = 0; humanIndex <= humanMap.length - size; humanIndex++) {
        const columns = humanMap.alignmentColumns.slice(humanIndex, humanIndex + size);
        results.push({
          size,
          start: columns[0],
          end: columns[columns.length - 1],
          alignmentColumns: columns,
          humanStart: humanIndex + 1,
          humanEnd: humanIndex + size,
          ...scoreWindow(sequences, columns, lowEntropyColumns)
        });
      }
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
    const passing = results.filter(item => item.lowEntropy >= state.entropyThreshold);
    const sorted = [...passing].sort((a, b) => b.score - a.score || b.lowEntropy - a.lowEntropy || a.size - b.size || a.start - b.start);
    if (state.rankMode === "all") return sorted;
    const accepted = [];
    for (const candidate of sorted) {
      if (accepted.every(existing => existing.size !== candidate.size || overlapFraction(candidate, existing) < 0.6)) accepted.push(candidate);
      if (accepted.length >= 100) break;
    }
    return accepted;
  }

  function pct(value) { return `${(value * 100).toFixed(1)}%`; }
  function analysisWindowSizes(humanLength) {
    const selected = [...state.selectedWindows].filter(size => size <= humanLength).sort((a, b) => a - b);
    return selected.length ? selected : [humanLength];
  }
  function visibleAnalysisSizes() {
    const available = [...new Set(state.results.map(item => item.size))];
    return available.filter(size => state.visibleSeries.has(size) || !WINDOW_COLORS[size]).sort((a, b) => a - b);
  }
  function windowColor(size) { return WINDOW_COLORS[size] || WHOLE_SEGMENT_COLOR; }
  function scoreFmt(value) { return Number.isFinite(value) ? value.toFixed(3) : "--"; }
  function humanCoordinateText(window) { return `${window.humanStart}–${window.humanEnd}`; }
  function humanAbsoluteCoordinateText(window) {
    const offset = state.datasets[state.currentEs]?.humanCoordinateOffset;
    return Number.isFinite(offset) ? `${offset + window.humanStart}–${offset + window.humanEnd}` : "--";
  }
  function alignmentCoordinateText(window) { return `${window.start + 1}–${window.end + 1}`; }

  function render(dataset, sequences, ranked, humanLength = humanCoordinateMap(findHumanSequence(sequences)).length) {
    document.getElementById("datasetLabel").textContent = dataset.label;
    document.getElementById("speciesCount").textContent = sequences.length;
    document.getElementById("alignmentLength").textContent = `${humanLength} nt`;
    document.getElementById("analysisStatus").textContent = "跨物种MSA已载入";
    document.getElementById("entropyMethod").innerHTML = '<i class="method-symbol coverage"></i>低熵 = 1 − Shannon序列熵 / ln(4)';
    const excludedCount = dataset.alignment?.species_fail_localization ?? dataset.alignment?.excluded_from_scoring?.length ?? 0;
    document.getElementById("dataNotice").textContent = excludedCount
      ? `MAFFT G-INS-i真实MSA；${sequences.length}种参与评分；${excludedCount}种因同源定位QC失败而排除（不等同于ES缺失）`
      : "真实跨物种MSA；低熵为序列熵指标，不作为结构结论";
    renderSummary(state.selected, sequences.length);
    renderLegend();
    renderChart(humanLength);
    renderRanking(ranked.slice(0, state.topN));
    renderSelection(sequences);
  }

  function updateControlsForDataset(dataset, humanLength) {
    const referenceOnly = !dataset.analysisReady;
    document.getElementById("cladeSelect").disabled = referenceOnly;
    document.getElementById("entropyThreshold").disabled = referenceOnly;
    document.getElementById("rankMode").disabled = referenceOnly;
    document.getElementById("exportButton").disabled = referenceOnly;
    document.querySelectorAll('input[name="window"]').forEach(input => {
      input.disabled = referenceOnly || Number(input.value) > humanLength;
    });
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
    [["轨道一", "保守性"], ["轨道二", "低序列熵"]].forEach(([title, subtitle], index) => {
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
      renderPendingConstraintTrack("低序列熵", length, "待跨物种MSA"),
      `<div class="reference-metadata"><span><strong>宿主螺旋</strong>${meta.host_helix || "--"}</span><span><strong>坐标系统</strong>${meta.coord_system_id}</span><span><strong>参考序列</strong>${meta.ref_accession}</span><span><strong>筛选状态</strong>${meta.screening_status}</span></div>`
    ];
    document.getElementById("selectionSubtitle").textContent = `${meta.es_id} · ${meta.molecule} · ${meta.component_coordinates}`;
    document.getElementById("selectedScore").textContent = "--";
    document.getElementById("selectedLowEntropy").textContent = "--";
    document.getElementById("selectedCoverage").textContent = "--";
    document.getElementById("selectedSpecies").textContent = "1";
    document.getElementById("alignmentViewer").innerHTML = rows.join("");
  }

  function renderPendingConstraintTrack(label, length, status) {
    const width = Math.max(60, length * 15);
    return `<div class="alignment-row constraint-row pending-constraint"><span class="alignment-label constraint-label"><strong>${label}</strong><small>不可计算</small></span><span class="constraint-plot"><svg width="${width}" height="48" viewBox="0 0 ${width} 48" role="img" aria-label="${label}${status}"><line class="pending-constraint-line" x1="8" x2="${width - 8}" y1="24" y2="24"></line><text x="${Math.min(width / 2, 210)}" y="17">${status}</text></svg></span></div>`;
  }

  function renderReferenceRanking() {
    document.getElementById("rankingBody").innerHTML = '<tr class="empty-ranking"><td colspan="7"><strong>尚无真实保守窗口排行</strong><span>已载入人源参考；需完成跨物种LSU同源区段定位、MSA与质量控制后启用。</span></td></tr>';
  }

  function renderSummary(top, speciesCount) {
    if (!top) {
      ["topCoordinates", "topScore", "topLowEntropy", "topCoverage"].forEach(id => {
        document.getElementById(id).textContent = "--";
      });
      document.getElementById("topContext").textContent = "当前阈值下无候选窗口";
      document.getElementById("topEntropyContext").textContent = `阈值 ≥ ${state.entropyThreshold.toFixed(2)}`;
      document.getElementById("topCoverageContext").textContent = `${speciesCount}个物种参与比较`;
      return;
    }
    document.getElementById("topCoordinates").textContent = humanCoordinateText(top);
    document.getElementById("topContext").textContent = `${top.size} nt窗口 · ${cladeLabel(state.currentClade)}`;
    document.getElementById("topScore").textContent = scoreFmt(top.score);
    document.getElementById("topLowEntropy").textContent = scoreFmt(top.lowEntropy);
    document.getElementById("topCoverage").textContent = pct(top.coverage);
    document.getElementById("topEntropyContext").textContent = `阈值 ≥ ${state.entropyThreshold.toFixed(2)}`;
    document.getElementById("topCoverageContext").textContent = `${speciesCount}个物种参与比较`;
  }

  function cladeLabel(clade) {
    return { Eukaryota: "全部真核", Metazoa: "后生动物", Vertebrata: "脊椎动物", Mammalia: "哺乳动物" }[clade] || clade;
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
    const yTrack = (value, top) => top + (1 - value) * trackH;
    const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "人源坐标上的保守性与低序列熵双轨图" });

    [conservationTop, entropyTop].forEach(top => {
      svg.appendChild(svgEl("rect", { x: margin.left, y: top, width: plotW, height: trackH, class: "track-bg" }));
      [0, .5, 1].forEach(value => {
        svg.appendChild(svgEl("line", { x1: margin.left, x2: width - margin.right, y1: yTrack(value, top), y2: yTrack(value, top), class: "grid-line" }));
        const label = svgEl("text", { x: margin.left - 8, y: yTrack(value, top) + 4, "text-anchor": "end" });
        label.textContent = value.toFixed(1);
        svg.appendChild(label);
      });
    });
    [[conservationTop + 34, "轨道一", "保守性"], [entropyTop + 34, "轨道二", "低序列熵"]].forEach(([yPos, title, subtitle]) => {
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
      const series = state.results.filter(r => r.size === size);
      if (!series.length) return;
      const conservationPath = series.map((d, i) => `${i ? "L" : "M"}${x((d.humanStart + d.humanEnd) / 2 - 1).toFixed(2)},${yTrack(d.score, conservationTop).toFixed(2)}`).join(" ");
      const entropyPath = series.map((d, i) => `${i ? "L" : "M"}${x((d.humanStart + d.humanEnd) / 2 - 1).toFixed(2)},${yTrack(d.lowEntropy, entropyTop).toFixed(2)}`).join(" ");
      svg.appendChild(svgEl("path", { d: conservationPath, class: "score-line", stroke: windowColor(size), "data-size": size }));
      svg.appendChild(svgEl("path", { d: entropyPath, class: "score-line", stroke: windowColor(size), "data-size": size, opacity: ".72" }));
    });
    svg.appendChild(svgEl("line", { x1: margin.left, x2: width - margin.right, y1: yTrack(state.entropyThreshold, entropyTop), y2: yTrack(state.entropyThreshold, entropyTop), class: "threshold-line" }));
    const threshold = svgEl("text", { x: width - margin.right - 4, y: yTrack(state.entropyThreshold, entropyTop) - 5, "text-anchor": "end" });
    threshold.textContent = `阈值 ${state.entropyThreshold.toFixed(2)}`;
    svg.appendChild(threshold);

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
        return `<span style="color:${windowColor(size)}">●</span> ${size} nt：保守性 <strong>${scoreFmt(datum.score)}</strong> · 低熵 ${scoreFmt(datum.lowEntropy)}`;
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
    rows.forEach((row, index) => {
      const sequences = state.datasets[state.currentEs].sequences.filter(s => s.clades.includes(state.currentClade));
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
        <td><code>${humanSequence}</code></td>`;
      tr.addEventListener("click", () => {
        state.selected = row;
        const ranked = getRankedResults(state.results);
        const dataset = state.datasets[state.currentEs];
        const sequences = dataset.sequences.filter(s => s.clades.includes(state.currentClade));
        render(dataset, sequences, ranked);
      });
      body.appendChild(tr);
    });
  }

  function consensusForWindow(sequences, window) {
    const consensus = [];
    const support = [];
    for (const p of window.alignmentColumns) {
      const counts = { A: 0, C: 0, G: 0, U: 0 };
      sequences.forEach(s => { if (counts[s.sequence[p]] !== undefined) counts[s.sequence[p]]++; });
      const [base, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      consensus.push(count ? base : "-");
      support.push(sequences.length ? count / sequences.length : 0);
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
      document.getElementById("selectionSubtitle").textContent = "当前阈值下无候选窗口";
      ["selectedScore", "selectedLowEntropy", "selectedCoverage", "selectedSpecies"].forEach(id => {
        document.getElementById(id).textContent = "--";
      });
      document.getElementById("alignmentViewer").replaceChildren();
      return;
    }
    const { consensus } = consensusForWindow(sequences, selected);
    document.getElementById("selectionSubtitle").textContent = `${state.currentEs} · ES内 ${humanCoordinateText(selected)} · 人28S ${humanAbsoluteCoordinateText(selected)} · ${selected.size} nt`;
    document.getElementById("selectedScore").textContent = scoreFmt(selected.score);
    document.getElementById("selectedLowEntropy").textContent = scoreFmt(selected.lowEntropy);
    document.getElementById("selectedCoverage").textContent = pct(selected.coverage);
    document.getElementById("selectedSpecies").textContent = sequences.length;
    renderAlignment(sequences, selected, consensus);
  }

  function renderAlignment(sequences, window, consensus) {
    const viewer = document.getElementById("alignmentViewer");
    const dataset = state.datasets[state.currentEs];
    const human = findHumanSequence(sequences);
    const alignmentLength = human.sequence.length;
    const fullWindow = { alignmentColumns: Array.from({ length: alignmentLength }, (_, index) => index) };
    const fullConsensus = consensusForWindow(sequences, fullWindow).consensus;
    const makeBases = (sequence, isConsensus = false, isHuman = false) => sequence.split("").map((base, index) => {
      const classes = ["base"];
      if (isConsensus) classes.push("consensus");
      if (isHuman) classes.push("human-base");
      else if (base === "-") classes.push("gap");
      else if (base !== fullConsensus[index]) classes.push("mismatch");
      if (index >= window.start && index <= window.end) classes.push("selected-base");
      return `<span class="${classes.join(" ")}">${base}</span>`;
    }).join("");
    const rows = [
      renderCoordinateRuler(human.sequence, alignmentLength),
      `<div class="alignment-row human-row"><a class="alignment-label source-anchor" href="${human.source_url || `https://www.ncbi.nlm.nih.gov/nuccore/${human.accession || "NR_003287.4"}`}" target="_blank" rel="noopener" title="打开 ${human.accession || "NR_003287.4"} 原始记录">Homo sapiens</a><span class="alignment-bases">${makeBases(human.sequence, false, true)}</span></div>`,
      `<div class="alignment-row consensus-row"><span class="alignment-label">跨物种共识</span><span class="alignment-bases">${makeBases(fullConsensus, true)}</span></div>`
    ];
    const lowEntropyColumns = dataset.structureCertainty?.length === alignmentLength
      ? dataset.structureCertainty
      : Array.from({ length: alignmentLength }, (_, position) => columnLowEntropy(sequences, position));
    const conservation = Array.from({ length: alignmentLength }, (_, position) => scoreWindow(sequences, [position], lowEntropyColumns).score);
    rows.push('<div class="alignment-divider"><span>逐位点约束轨道</span></div>');
    rows.push(renderConstraintTrack("保守性", conservation, window, "conservation"));
    rows.push(renderConstraintTrack("低序列熵", lowEntropyColumns, window, "entropy", state.entropyThreshold));
    rows.push('<div class="alignment-divider species-divider"><span>其他物种原始比对序列</span></div>');
    sequences.filter(species => species !== human).forEach(species => {
      const sourceUrl = species.source_url || (species.accession ? `https://www.ncbi.nlm.nih.gov/nuccore/${species.accession}` : "");
      const label = sourceUrl
        ? `<a class="alignment-label source-anchor" href="${sourceUrl}" target="_blank" rel="noopener" title="打开 ${species.accession || species.name} 原始记录">${species.name}</a>`
        : `<span class="alignment-label" title="${species.name}">${species.name}</span>`;
      rows.push(`<div class="alignment-row">${label}<span class="alignment-bases">${makeBases(species.sequence)}</span></div>`);
    });
    viewer.innerHTML = rows.join("");
    const target = Math.max(0, window.start * 15 - viewer.clientWidth * 0.35);
    viewer.scrollLeft = target;
  }

  function renderCoordinateRuler(humanSequence, alignmentLength) {
    const width = alignmentLength * 15;
    let humanPosition = 0;
    const ticks = [];
    for (let column = 0; column < alignmentLength; column++) {
      if (humanSequence[column] !== "-") humanPosition++;
      if (humanSequence[column] !== "-" && (humanPosition === 1 || humanPosition % 25 === 0)) {
        const x = column * 15 + 7.5;
        ticks.push(`<line x1="${x}" x2="${x}" y1="19" y2="25"></line><text x="${x}" y="14">${humanPosition}</text>`);
      }
    }
    return `<div class="alignment-row ruler-row"><span class="alignment-label">人源位置</span><span class="sequence-ruler"><svg width="${width}" height="26" viewBox="0 0 ${width} 26" aria-label="人源ES坐标尺"><line x1="0" x2="${width}" y1="25" y2="25"></line>${ticks.join("")}</svg></span></div>`;
  }

  function renderConstraintTrack(label, values, window, type, threshold = null) {
    const width = values.length * 15;
    const height = 48;
    const top = 5;
    const plotHeight = 35;
    const y = value => top + (1 - Math.max(0, Math.min(1, value))) * plotHeight;
    const path = values.map((value, index) => `${index ? "L" : "M"}${(index * 15 + 7.5).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
    const selectedX = window.start * 15;
    const selectedWidth = (window.end - window.start + 1) * 15;
    const thresholdLine = threshold === null ? "" : `<line class="constraint-threshold" x1="0" x2="${width}" y1="${y(threshold)}" y2="${y(threshold)}"></line>`;
    return `<div class="alignment-row constraint-row ${type}-constraint"><span class="alignment-label constraint-label"><strong>${label}</strong><small>0–1</small></span><span class="constraint-plot"><svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}逐位点曲线"><rect class="constraint-selection" x="${selectedX}" y="0" width="${selectedWidth}" height="${height}"></rect><line class="constraint-grid" x1="0" x2="${width}" y1="${y(0.5)}" y2="${y(0.5)}"></line>${thresholdLine}<path class="constraint-path" d="${path}"></path></svg></span></div>`;
  }

  function renderStatistics() {
    const summary = state.allEsSummary;
    if (!summary || !document.getElementById("databaseLayerStats")) return;
    renderDatabaseLayers(summary);
    renderEsCoverage(summary);
    renderSpeciesCoverage(summary);
    renderCoverageMatrix(summary);
    renderSourceTable();
    renderLiteratureTable();
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
    const pending = new Map(summary.pending_composite_es.map(item => [item.es_id, item]));
    const mapped = new Map(summary.per_es.map(item => [item.es_id, item]));
    const ordered = state.humanReferencePayload?.records ?? [];
    document.getElementById("esCoverageChart").innerHTML = ordered.map(record => {
      const item = mapped.get(record.es_id);
      const isPending = pending.has(record.es_id);
      const pass = item?.species_pass ?? 0;
      const total = item?.homology_calls ?? summary.mammal_species_count;
      const percent = total ? pass / total * 100 : 0;
      const statusText = isPending ? "待5.8S/复合LSU" : `${pass}/${total}`;
      return `<button type="button" class="es-coverage-row${isPending ? " pending" : ""}" data-es="${record.es_id}" ${isPending ? "disabled" : ""} aria-label="${record.es_id}：${statusText}">
        <span class="coverage-label"><strong>${record.es_id}</strong><small>${record.length_nt} nt</small></span>
        <span class="coverage-track"><i style="width:${percent.toFixed(2)}%"></i></span>
        <span class="coverage-value">${statusText}</span>
      </button>`;
    }).join("");
    document.querySelectorAll(".es-coverage-row:not(:disabled)").forEach(button => button.addEventListener("click", () => openEsLandscape(button.dataset.es)));
  }

  function renderSpeciesCoverage(summary) {
    const rows = summary.per_species;
    const max = summary.directly_mapped_28s_es_count;
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
    esIds.forEach(esId => state.datasets[esId]?.homologyCalls?.forEach(call => calls.set(`${call.taxid}|${esId}`, call)));
    const header = esIds.map(esId => `<button type="button" data-es="${esId}" aria-label="打开${esId}景观">${esId.replace("ES", "")}</button>`).join("");
    const body = summary.per_species.map(species => {
      const cells = esIds.map(esId => {
        const call = calls.get(`${species.taxid}|${esId}`);
        const pass = call?.qc_status === "PASS";
        const status = pass ? "通过定位QC" : "定位未确定";
        const details = call ? `${call.accession} · 覆盖${pct(call.mapped_human_coverage)} · 一致性${pct(call.identity_to_human)}` : "无判定记录";
        const sourceUrl = call?.source_url || species.source_url;
        return `<a class="matrix-cell ${pass ? "pass" : "fail"}" href="${sourceUrl}" target="_blank" rel="noopener" title="${species.species} × ${esId}：${status}；${details}；点击打开原始 accession" aria-label="${species.species} ${esId} ${status}，打开 ${call?.accession || species.accession}"></a>`;
      }).join("");
      return `<div class="matrix-row"><a class="matrix-species" href="${species.source_url}" target="_blank" rel="noopener" title="${species.accession} · NCBI TaxID ${species.taxid}">${species.species}</a>${cells}<strong>${species.es_pass}</strong></div>`;
    }).join("");
    document.getElementById("coverageMatrix").innerHTML = `<div class="matrix-inner"><div class="matrix-header"><span>物种</span>${header}<strong>通过</strong></div>${body}</div>`;
    document.querySelectorAll(".matrix-header button").forEach(button => button.addEventListener("click", () => openEsLandscape(button.dataset.es)));
    document.getElementById("matrixSummary").textContent = `${summary.pass_calls}/${summary.es_species_calls} 通过定位QC`;
  }

  function renderSourceTable() {
    const sources = state.provenanceCatalog?.databases ?? [];
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

  function parseFasta(text, name) {
    const entries = [];
    let current = null;
    text.split(/\r?\n/).forEach(raw => {
      const line = raw.trim();
      if (!line) return;
      if (line.startsWith(">")) {
        current = { header: line.slice(1).trim(), sequence: "" };
        entries.push(current);
      } else {
        if (!current) throw new Error("FASTA必须以 >序列名 开始。");
        current.sequence += line.toUpperCase().replace(/T/g, "U");
      }
    });
    if (entries.length < 2) throw new Error("至少需要两条已对齐序列。");
    const length = entries[0].sequence.length;
    if (!length || entries.some(e => e.sequence.length !== length)) throw new Error("所有序列必须等长，表示已经完成多序列比对。");
    if (entries.some(e => /[^ACGUN-]/.test(e.sequence))) throw new Error("序列中存在不支持的字符。");
    if (!entries.some(entry => /Homo[ _]sapiens/i.test(entry.header))) throw new Error("必须包含 Homo sapiens 人源参考序列。");
    return {
      name,
      label: `${name} 导入多序列比对`,
      simulated: false,
      analysisReady: true,
      sequences: entries.map(entry => {
        const [speciesName, clade = "Eukaryota"] = entry.header.split("|");
        const clades = ["Eukaryota"];
        if (["Metazoa", "Vertebrata", "Mammalia"].includes(clade)) clades.push("Metazoa");
        if (["Vertebrata", "Mammalia"].includes(clade)) clades.push("Vertebrata");
        if (clade === "Mammalia") clades.push("Mammalia");
        return { name: speciesName.replace(/_/g, " "), lineage: clade, clades: [...new Set(clades)], sequence: entry.sequence };
      })
    };
  }

  function exportCsv() {
    const ranked = getRankedResults(state.results).slice(0, state.topN);
    const sequences = state.datasets[state.currentEs].sequences.filter(s => s.clades.includes(state.currentClade));
    const lines = [["rank", "ES", "clade", "window_nt", "es_start_1based", "es_end_1based", "human_28s_start_1based", "human_28s_end_1based", "alignment_start_1based", "alignment_end_1based", "conservation_score", "low_sequence_entropy_score", "identity", "coverage", "human_sequence"]];
    ranked.forEach((row, index) => {
      const humanSequence = humanSequenceForWindow(sequences, row);
      const offset = state.datasets[state.currentEs]?.humanCoordinateOffset ?? 0;
      lines.push([index + 1, state.currentEs, state.currentClade, row.size, row.humanStart, row.humanEnd, offset ? offset + row.humanStart : "", offset ? offset + row.humanEnd : "", row.start + 1, row.end + 1, row.score.toFixed(6), row.lowEntropy.toFixed(6), row.identity.toFixed(6), row.coverage.toFixed(6), humanSequence]);
    });
    const csv = lines.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.currentEs}_${state.currentClade}_conservation_ranking.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function bindEvents() {
    document.getElementById("esSelect").addEventListener("change", event => { state.currentEs = event.target.value; analyze(); });
    document.getElementById("cladeSelect").addEventListener("change", event => { state.currentClade = event.target.value; analyze(); });
    document.querySelectorAll('input[name="window"]').forEach(input => input.addEventListener("change", event => {
      const size = Number(event.target.value);
      if (event.target.checked) { state.selectedWindows.add(size); state.visibleSeries.add(size); }
      else if (state.selectedWindows.size > 1) { state.selectedWindows.delete(size); state.visibleSeries.delete(size); }
      else event.target.checked = true;
      analyze();
    }));
    document.getElementById("rankMode").addEventListener("change", event => { state.rankMode = event.target.value; analyze(); });
    document.getElementById("entropyThreshold").addEventListener("input", event => {
      state.entropyThreshold = Number(event.target.value);
      document.getElementById("entropyThresholdLabel").textContent = `≥ ${state.entropyThreshold.toFixed(2)}`;
      analyze();
    });
    document.getElementById("topNSelect").addEventListener("change", event => { state.topN = Number(event.target.value); analyze(); });
    document.getElementById("exportButton").addEventListener("click", exportCsv);
    const dialog = document.getElementById("importDialog");
    document.getElementById("importButton").addEventListener("click", () => dialog.showModal());
    document.getElementById("loadFastaButton").addEventListener("click", () => {
      const error = document.getElementById("importError");
      try {
        const name = document.getElementById("importName").value.trim() || "自定义ES";
        const dataset = parseFasta(document.getElementById("fastaInput").value, name);
        const key = `custom-${Date.now()}`;
        state.datasets[key] = dataset;
        const option = new Option(name, key, true, true);
        document.getElementById("esSelect").add(option);
        state.currentEs = key;
        state.currentClade = "Eukaryota";
        document.getElementById("cladeSelect").value = "Eukaryota";
        error.textContent = "";
        dialog.close();
        analyze();
      } catch (err) { error.textContent = err.message; }
    });
    document.querySelectorAll(".view-tab").forEach(tab => tab.addEventListener("click", () => {
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
        const dataset = state.datasets[state.currentEs];
        const sequences = state.datasets[state.currentEs].sequences.filter(s => s.clades.includes(state.currentClade));
        if (!dataset.analysisReady) {
          if (tab.dataset.tab !== "ranking") renderReferenceChart(humanCoordinateMap(findHumanSequence(sequences)).length);
        } else if (tab.dataset.tab === "ranking") renderSelection(sequences);
        else renderChart(humanCoordinateMap(findHumanSequence(sequences)).length);
      });
    }));
    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const dataset = state.datasets[state.currentEs];
        const human = findHumanSequence(dataset.sequences);
        if (dataset.analysisReady) {
          renderChart(humanCoordinateMap(human).length);
          if (state.selected) renderSelection(dataset.sequences.filter(s => s.clades.includes(state.currentClade)));
        } else {
          renderReferenceChart(humanCoordinateMap(human).length);
        }
      }, 120);
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
