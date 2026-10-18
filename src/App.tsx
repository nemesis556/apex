/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  DeploymentDomain,
  INDIA_SEISMIC_SENSORS,
  BIOBANK_SENSORS,
  PRESET_SCENARIOS,
  ScenarioConfig,
  SensorMeta,
  DetectedEvent,
  FaultType,
  spawnRandomIndiaSensors,
  runSensorIntelligencePipeline,
  computeSocialImpactMetrics,
  parseCustomCsvToStreamAndEvaluate,
  exportStreamToCsv,
  formatFaultLabel,
  formatMaintenanceLabel,
} from './utils/sensorEngine';
import { AllIndiaSeismicTwin } from './components/AllIndiaSeismicTwin';
import { ColdVaultDigitalTwin } from './components/ColdVaultDigitalTwin';
import { MlModelTrainerDeck } from './components/MlModelTrainerDeck';
import { MultiSensorChart } from './components/MultiSensorChart';
import { SensorHealthMatrix } from './components/SensorHealthMatrix';
import { ExplainableForensicsPanel } from './components/ExplainableForensicsPanel';
import { DatasetSynthesisPanel } from './components/DatasetSynthesisModal';
import { UstJuryEvaluationDeck } from './components/UstJuryEvaluationDeck';

type WorkspaceSectionFilter =
  | 'all'
  | 'spatial-twin'
  | 'ml-trainer'
  | 'telemetry-health'
  | 'forensics-eval';

export default function App() {
  const [domain, setDomain] = useState<DeploymentDomain>('SEISMIC_INDIA');
  const [seismicSensors, setSeismicSensors] = useState<SensorMeta[]>(
    INDIA_SEISMIC_SENSORS
  );
  const [activeScenario, setActiveScenario] = useState<ScenarioConfig>(
    PRESET_SCENARIOS[0]
  );
  const [customCsvOverride, setCustomCsvOverride] = useState<ReturnType<
    typeof parseCustomCsvToStreamAndEvaluate
  > | null>(null);

  const [selectedStep, setSelectedStep] = useState<number>(36);
  const [selectedSensorId, setSelectedSensorId] = useState<string>('S-02');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [workspaceFilter, setWorkspaceFilter] =
    useState<WorkspaceSectionFilter>('all');
  const [ledgerFilter, setLedgerFilter] = useState<
    'all' | 'trusted' | 'suppressed'
  >('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const activeSensors = useMemo(
    () => (domain === 'SEISMIC_INDIA' ? seismicSensors : BIOBANK_SENSORS),
    [domain, seismicSensors]
  );
  const unit = activeSensors[0]?.unit || 'gal';
  const isSeismic = domain === 'SEISMIC_INDIA';

  const pipelineOutput = useMemo(() => {
    if (customCsvOverride) {
      return customCsvOverride;
    }
    return runSensorIntelligencePipeline(activeScenario, activeSensors);
  }, [activeScenario, activeSensors, customCsvOverride]);

  const { stream, events, sensorSummaries, correlationMatrix, benchmark } =
    pipelineOutput;

  // Live simulation playback loop
  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      setSelectedStep((prev) => (prev + 1) % Math.max(1, stream.length));
    }, 650);
    return () => window.clearInterval(timer);
  }, [isPlaying, stream.length]);

  const socialImpact = useMemo(
    () =>
      computeSocialImpactMetrics(
        stream,
        events,
        sensorSummaries,
        benchmark,
        selectedStep,
        activeScenario.alarmThreshold,
        domain
      ),
    [
      stream,
      events,
      sensorSummaries,
      benchmark,
      selectedStep,
      activeScenario.alarmThreshold,
      domain,
    ]
  );

  const selectedEvent: DetectedEvent | null = useMemo(() => {
    if (selectedEventId) {
      const found = events.find((e) => e.id === selectedEventId);
      if (found) return found;
    }
    const nearStep = events.find((e) => Math.abs(e.step - selectedStep) <= 3);
    return nearStep || events[0] || null;
  }, [events, selectedEventId, selectedStep]);

  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      if (ledgerFilter === 'trusted' && !evt.isTrustedAlarm) return false;
      if (ledgerFilter === 'suppressed' && evt.isTrustedAlarm) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchSensor = evt.sensorId.toLowerCase().includes(q);
        const matchName = evt.sensorName.toLowerCase().includes(q);
        const matchClass = formatFaultLabel(evt.classification)
          .toLowerCase()
          .includes(q);
        const matchSummary = evt.explanationSummary.toLowerCase().includes(q);
        if (!matchSensor && !matchName && !matchClass && !matchSummary)
          return false;
      }
      return true;
    });
  }, [events, ledgerFilter, searchQuery]);

  const handleSelectScenario = (scenario: ScenarioConfig) => {
    setCustomCsvOverride(null);
    setActiveScenario(scenario);
    setSelectedEventId(null);
    setSelectedStep(Math.min(36, scenario.steps - 1));
  };

  const handleSpawnRandomIndiaSensors = (count = 6) => {
    setCustomCsvOverride(null);
    const spawned = spawnRandomIndiaSensors(
      count,
      seismicSensors,
      Date.now() + seismicSensors.length * 97
    );
    const updatedSensors = [...seismicSensors, ...spawned];
    setSeismicSensors(updatedSensors);
    if (spawned.length > 0) {
      setSelectedSensorId(spawned[0].id);
    }
  };

  const handleRandomizeIndiaFaults = () => {
    setCustomCsvOverride(null);
    const faultPool: FaultType[] = [
      'OFFSET_DRIFT',
      'RANDOM_SPIKE',
      'STUCK_AT',
      'EXCESSIVE_NOISE',
      'DROPOUT',
    ];
    const totalStations = activeSensors.length;
    const pickedIndices = new Set<number>();
    let seedVal = Date.now() % 10000;
    while (pickedIndices.size < Math.min(6, totalStations)) {
      seedVal = (seedVal * 1664525 + 1013904223) % 4294967296;
      pickedIndices.add(seedVal % totalStations);
    }

    const randomInjections: ScenarioConfig['injections'] = [
      {
        sensorId: 'ALL',
        faultType: 'GENUINE_EVENT',
        startStep: 33,
        endStep: 42,
        magnitude: 4.8,
      },
    ];

    let idxCounter = 0;
    for (const sIdx of pickedIndices) {
      const targetSensor = activeSensors[sIdx];
      const fault = faultPool[idxCounter % faultPool.length];
      const start = 8 + ((idxCounter * 6) % 24);
      const end = fault === 'RANDOM_SPIKE' ? start + 1 : Math.min(56, start + 18);
      const mag =
        fault === 'OFFSET_DRIFT'
          ? 4.6
          : fault === 'RANDOM_SPIKE'
          ? 5.8
          : fault === 'STUCK_AT'
          ? 4.62
          : fault === 'EXCESSIVE_NOISE'
          ? 1.85
          : 1.0;

      randomInjections.push({
        sensorId: targetSensor.id,
        faultType: fault,
        startStep: start,
        endStep: end,
        magnitude: mag,
      });
      idxCounter++;
    }

    const firstFaultStation =
      randomInjections.find((i) => i.sensorId !== 'ALL')?.sensorId || 'S-02';
    setSelectedSensorId(firstFaultStation);
    setActiveScenario({
      ...activeScenario,
      id: 'india-random-multi-fault',
      title: `All-India Multi-Station Fault Scatter (${randomInjections.length - 1} Faulty Nodes + M6.4 Quake)`,
      description: `Randomly injected ${randomInjections.length - 1} localized sensor faults across the ${activeSensors.length}-station All-India Seismic Array alongside a corroborated tectonic P-wave event.`,
      injections: randomInjections,
    });
    setSelectedStep(20);
  };

  const handleChaosSabotage = (sensorId: string, faultType: FaultType) => {
    setCustomCsvOverride(null);

    if (faultType === 'NONE') {
      const cleanedInjections = activeScenario.injections.filter(
        (inj) => inj.sensorId !== sensorId
      );
      setActiveScenario({
        ...activeScenario,
        id: 'chaos-custom',
        title: `Live Chaos Lab · Restored ${sensorId} Station`,
        injections: cleanedInjections,
      });
      return;
    }

    const start = Math.max(
      4,
      Math.min(selectedStep - 2, activeScenario.steps - 16)
    );
    const end =
      faultType === 'RANDOM_SPIKE'
        ? Math.min(activeScenario.steps - 1, start + 2)
        : Math.min(activeScenario.steps - 2, start + 22);

    const magnitude =
      faultType === 'OFFSET_DRIFT'
        ? 4.8
        : faultType === 'RANDOM_SPIKE'
        ? 5.8
        : faultType === 'STUCK_AT'
        ? 4.62
        : faultType === 'EXCESSIVE_NOISE'
        ? 1.85
        : faultType === 'DROPOUT'
        ? 1.0
        : faultType === 'GENUINE_EVENT'
        ? 4.9
        : 4.5;

    const targetId = faultType === 'GENUINE_EVENT' ? 'ALL' : sensorId;
    const filteredPrior = activeScenario.injections.filter(
      (inj) =>
        !(
          inj.sensorId === targetId &&
          Math.abs(inj.startStep - start) <= 8
        )
    );

    const nextScenario: ScenarioConfig = {
      ...activeScenario,
      id: 'chaos-custom',
      title: `Live Chaos Lab · ${targetId} ${formatFaultLabel(faultType)}`,
      injections: [
        ...filteredPrior,
        {
          sensorId: targetId,
          faultType,
          startStep: start,
          endStep: end,
          magnitude,
        },
      ],
    };

    setActiveScenario(nextScenario);
    setSelectedStep(
      faultType === 'RANDOM_SPIKE'
        ? start
        : Math.min(activeScenario.steps - 1, start + 10)
    );
  };

  const handleIngestCustomCsv = (csvText: string) => {
    const evaluated = parseCustomCsvToStreamAndEvaluate(
      csvText,
      activeSensors,
      activeScenario.alarmThreshold
    );
    setCustomCsvOverride(evaluated);
    setSelectedStep(Math.min(6, evaluated.stream.length - 1));
    setSelectedEventId(null);
  };

  const handleDownloadCsv = () => {
    const csvContent = exportStreamToCsv(stream, activeSensors);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verisense-${domain.toLowerCase()}-${activeSensors.length}stations-${activeScenario.id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const activeStepRow =
    stream[Math.min(selectedStep, stream.length - 1)] || stream[0];

  const residualFocusSensors = useMemo(() => {
    const list: SensorMeta[] = [];
    const add = (s?: SensorMeta) => {
      if (s && !list.some((x) => x.id === s.id) && list.length < 8) {
        list.push(s);
      }
    };
    add(activeSensors.find((s) => s.id === selectedSensorId));
    for (const s of activeSensors) {
      const f = activeStepRow?.injectedLabels[s.id];
      const v = activeStepRow?.readings[s.id];
      if (v === null || (f && f !== 'NONE')) add(s);
    }
    for (const s of activeSensors) add(s);
    return list;
  }, [activeSensors, selectedSensorId, activeStepRow]);

  const showSpatialTwin =
    workspaceFilter === 'all' || workspaceFilter === 'spatial-twin';
  const showMlTrainer =
    workspaceFilter === 'all' || workspaceFilter === 'ml-trainer';
  const showTelemetryHealth =
    workspaceFilter === 'all' || workspaceFilter === 'telemetry-health';
  const showForensicsEval =
    workspaceFilter === 'all' || workspaceFilter === 'forensics-eval';

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract: Apple Frosted Glass Vibrancy */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-white/[0.08] bg-black/75 backdrop-blur-xl sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={() => setWorkspaceFilter('all')}
          className="text-lg font-semibold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          VeriSense
        </a>

        {/* Zone 2: 5 clean single-line text navigation links */}
        <nav
          aria-label="Primary Workspace Sections"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-400"
        >
          <a
            href="#digital-twin"
            onClick={() => setWorkspaceFilter('all')}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Spatial Array
          </a>
          <a
            href="#ml-trainer"
            onClick={() => setWorkspaceFilter('all')}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Neural Engine
          </a>
          <a
            href="#telemetry-stage"
            onClick={() => setWorkspaceFilter('all')}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Telemetry
          </a>
          <a
            href="#xai-forensics"
            onClick={() => setWorkspaceFilter('all')}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Forensics
          </a>
          <a
            href="#jury-rubric"
            onClick={() => setWorkspaceFilter('all')}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Evaluation
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="px-4 py-1.5 text-xs font-semibold text-zinc-950 bg-white hover:bg-zinc-200 rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Export CSV
          </button>
        </div>
      </header>

      <main
        id="top"
        className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-8 space-y-8"
      >
        {/* Apple Keynote Hero & Segmented Command Architecture */}
        <section
          aria-labelledby="workspace-heading"
          className="space-y-6"
        >
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="space-y-2.5 max-w-3xl">
              {/* Unboxed Editorial Metadata */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <span>VIT Code Apex 3.0</span>
                <span aria-hidden="true">·</span>
                <span>Track 3 Social Impact (UST)</span>
                <span aria-hidden="true">·</span>
                <span className="text-zinc-200 font-medium">
                  {activeSensors.length} Active Observatories
                </span>
              </div>

              <h1
                id="workspace-heading"
                style={{ textWrap: 'balance' }}
                className="text-3xl sm:text-4xl font-semibold tracking-tight text-white leading-[1.12]"
              >
                Sensor Trust, Drift &amp; False-Alarm Intelligence.
              </h1>

              <p className="text-sm sm:text-base text-zinc-400 leading-relaxed max-w-2xl">
                {isSeismic
                  ? `National ${activeSensors.length}-station earthquake early warning and borehole telemetry engine. Isolates highway spikes, MEMS drift, frozen digitizers, and satellite dropouts while preserving 100% P-wave sensitivity.`
                  : 'Cryogenic vaccine biobank digital twin and multivariate sensor-fusion engine. Isolates thermistor drift, EMI spikes, and packet dropouts while preserving 100% thermal excursion sensitivity.'}
              </p>
            </div>

            {/* Domain Switcher (Apple Segmented Control) */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
              <div
                role="group"
                aria-label="Deployment infrastructure domain"
                className="flex items-center bg-[#18181C] p-1 border border-white/[0.08] rounded-xl text-xs"
              >
                <button
                  type="button"
                  onClick={() => {
                    setCustomCsvOverride(null);
                    setDomain('SEISMIC_INDIA');
                  }}
                  className={`px-3.5 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isSeismic
                      ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  India Seismic ({seismicSensors.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustomCsvOverride(null);
                    setDomain('BIOBANK_COLDCHAIN');
                    setSelectedSensorId('S-02');
                  }}
                  className={`px-3.5 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    !isSeismic
                      ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Biobank Vault
                </button>
              </div>
            </div>
          </div>

          {/* 4-Card Apple Bento KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono tabular-nums">
            <div className="p-6 rounded-2xl bg-[#111114] border border-white/[0.08] flex flex-col justify-between">
              <div className="text-xs font-sans text-zinc-400">
                {isSeismic
                  ? 'Citizens Protected from False Panic'
                  : 'Public-Health Vaccines Protected'}
              </div>
              <div className="mt-2 flex items-baseline">
                <span className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
                  {isSeismic
                    ? `${(socialImpact.citizensProtectedFromPanic / 1000000).toFixed(2)}M`
                    : socialImpact.vaccineVialsProtected.toLocaleString()}
                </span>
                <span className="text-xs font-sans text-zinc-400 ml-2">
                  {isSeismic ? 'Citizens' : 'Vials'}
                </span>
              </div>
              <div className="text-xs font-sans text-zinc-400 mt-2">
                {isSeismic
                  ? `INR ${socialImpact.infraLossAvoidedCrInr} Cr grid & transit halt losses avoided`
                  : `INR ${socialImpact.spoilageAvoidedLakhsInr} Lakhs spoilage & callouts avoided`}
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-[#111114] border border-white/[0.08] flex flex-col justify-between">
              <div className="text-xs font-sans text-zinc-400">
                False-Alarm Reduction
              </div>
              <div className="mt-2 flex items-baseline">
                <span className="text-3xl sm:text-4xl font-semibold tracking-tight text-emerald-400">
                  {benchmark.falseAlarmReductionPct.toFixed(1)}%
                </span>
              </div>
              <div className="text-xs font-sans text-zinc-400 mt-2">
                {benchmark.naiveFalseAlarms} legacy false sirens reduced to {benchmark.aiFalseAlarms}
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-[#111114] border border-white/[0.08] flex flex-col justify-between">
              <div className="text-xs font-sans text-zinc-400">
                {isSeismic
                  ? 'Real P-Wave Quake Sensitivity'
                  : 'Genuine Excursion Sensitivity'}
              </div>
              <div className="mt-2 flex items-baseline">
                <span className="text-3xl sm:text-4xl font-semibold tracking-tight text-sky-400">
                  {benchmark.sensitivityPct.toFixed(1)}%
                </span>
              </div>
              <div className="text-xs font-sans text-zinc-400 mt-2">
                {benchmark.genuineEventsDetected} of {benchmark.genuineEventsTotal} genuine event intervals captured
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-[#111114] border border-white/[0.08] flex flex-col justify-between">
              <div className="text-xs font-sans text-zinc-400">
                Trust-Validated F1 Score
              </div>
              <div className="mt-2 flex items-baseline">
                <span className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
                  {benchmark.f1Score.toFixed(3)}
                </span>
                <span className="text-xs font-sans text-zinc-400 ml-2">F1</span>
              </div>
              <div className="text-xs font-sans text-zinc-400 mt-2">
                {socialImpact.activeFaultyProbesIsolated} faulty station(s) isolated across {activeSensors.length} nodes
              </div>
            </div>
          </div>

          {/* Segmented Scenario & Progressive Disclosure Bar */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 p-2 rounded-2xl bg-[#111114] border border-white/[0.08]">
            {/* Scenario Presets */}
            <div
              role="group"
              aria-label="Operating Scenarios"
              className="flex flex-wrap items-center gap-1"
            >
              {PRESET_SCENARIOS.map((scen, idx) => {
                const isActive =
                  !customCsvOverride && activeScenario.id === scen.id;
                return (
                  <button
                    key={scen.id}
                    type="button"
                    onClick={() => handleSelectScenario(scen)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                        : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    0{idx + 1}.{' '}
                    {scen.id === 'drift-vs-excursion'
                      ? isSeismic
                        ? 'Multi-Zone Drift vs. M6.4 Quake'
                        : 'Drift vs. Excursion'
                      : scen.id === 'stuck-and-spikes'
                      ? isSeismic
                        ? 'Frozen ADCs & Highway Spikes'
                        : 'Stuck-At & Spikes'
                      : scen.id === 'noise-and-dropout'
                      ? isSeismic
                        ? 'Substation EMI & VSAT Drops'
                        : 'Noise & Dropout'
                      : 'Hidden Holdout Split'}
                  </button>
                );
              })}
            </div>

            {/* Workspace Module Filter (Progressive Disclosure) */}
            <div
              role="group"
              aria-label="Workspace View Focus"
              className="flex flex-wrap items-center gap-1 bg-[#18181C] p-1 rounded-xl border border-white/[0.06]"
            >
              {(
                [
                  ['all', 'All Modules'],
                  ['spatial-twin', 'Spatial Array'],
                  ['ml-trainer', 'Neural Trainer'],
                  ['telemetry-health', 'Telemetry & Matrix'],
                  ['forensics-eval', 'XAI & Evaluation'],
                ] as Array<[WorkspaceSectionFilter, string]>
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setWorkspaceFilter(mode)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    workspaceFilter === mode
                      ? 'bg-white/15 text-white font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Visual Centerpiece: All-India 24+ Station Seismic Map & 3D Borehole Twin OR Cryogenic Biobank Twin */}
        {showSpatialTwin && (
          <section id="digital-twin">
            {isSeismic ? (
              <AllIndiaSeismicTwin
                stream={stream}
                sensors={activeSensors}
                sensorSummaries={sensorSummaries}
                correlationMatrix={correlationMatrix}
                socialImpact={socialImpact}
                selectedStep={selectedStep}
                selectedSensorId={selectedSensorId}
                isPlaying={isPlaying}
                alarmThreshold={activeScenario.alarmThreshold}
                onSelectStep={setSelectedStep}
                onSelectSensor={setSelectedSensorId}
                onTogglePlay={() => setIsPlaying((p) => !p)}
                onChaosSabotage={handleChaosSabotage}
                onResetVaultToClean={() => {
                  setSeismicSensors(INDIA_SEISMIC_SENSORS);
                  handleSelectScenario(PRESET_SCENARIOS[0]);
                }}
                onSpawnRandomSensors={handleSpawnRandomIndiaSensors}
                onRandomizeIndiaFaults={handleRandomizeIndiaFaults}
              />
            ) : (
              <ColdVaultDigitalTwin
                stream={stream}
                sensors={activeSensors}
                sensorSummaries={sensorSummaries}
                correlationMatrix={correlationMatrix}
                socialImpact={socialImpact}
                selectedStep={selectedStep}
                selectedSensorId={selectedSensorId}
                isPlaying={isPlaying}
                alarmThreshold={activeScenario.alarmThreshold}
                onSelectStep={setSelectedStep}
                onSelectSensor={setSelectedSensorId}
                onTogglePlay={() => setIsPlaying((p) => !p)}
                onChaosSabotage={handleChaosSabotage}
                onResetVaultToClean={() => handleSelectScenario(PRESET_SCENARIOS[0])}
              />
            )}
          </section>
        )}

        {/* Trainable Machine Learning Classifier Workbench */}
        {showMlTrainer && (
          <div id="ml-trainer">
            <MlModelTrainerDeck
              sensors={activeSensors}
              currentStepRow={activeStepRow}
              selectedSensorId={selectedSensorId}
              events={events}
              onSelectSensor={setSelectedSensorId}
            />
          </div>
        )}

        {/* Asymmetric Split Console: Left Parameter/Injector Column + Right Multi-Sensor Chart Stage */}
        {showTelemetryHealth && (
          <>
            <section
              id="telemetry-stage"
              className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
            >
              {/* Left 4 Cols: Scenario Brief & Synthetic Fault Injector */}
              <div className="lg:col-span-4 flex flex-col justify-between gap-6">
                <div className="bg-[#111114] border border-white/[0.08] rounded-2xl p-6">
                  <div className="text-xs text-zinc-400">
                    Active Scenario Specification · {activeSensors.length} Stations
                  </div>
                  <h2 className="text-base font-semibold tracking-tight text-white mt-1">
                    {customCsvOverride
                      ? 'Custom Hidden Evaluation CSV Stream'
                      : activeScenario.title}
                  </h2>
                  <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                    {customCsvOverride
                      ? `Evaluating ${stream.length} custom time-series frames ingested via the Common Schema CSV evaluator.`
                      : activeScenario.description}
                  </p>
                  <div className="mt-4 pt-3.5 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono text-zinc-400">
                    <span>
                      Base: {activeScenario.baseTemp.toFixed(1)} {unit}
                    </span>
                    <span>·</span>
                    <span>
                      Limit: {activeScenario.alarmThreshold.toFixed(1)} {unit}
                    </span>
                    <span>·</span>
                    <span>
                      Noise: {activeScenario.noiseLevel.toFixed(2)} {unit}
                    </span>
                  </div>
                </div>

                <DatasetSynthesisPanel
                  currentScenario={activeScenario}
                  sensors={activeSensors}
                  onApplyCustomScenario={handleSelectScenario}
                  onExportCsv={handleDownloadCsv}
                />
              </div>

              {/* Right 8 Cols: Multi-Sensor Telemetry & Trust-Score Chart + Instantaneous Residual Inspector */}
              <div className="lg:col-span-8 flex flex-col justify-between gap-6">
                <MultiSensorChart
                  stream={stream}
                  sensors={activeSensors}
                  events={events}
                  alarmThreshold={activeScenario.alarmThreshold}
                  selectedStep={selectedStep}
                  onSelectStep={setSelectedStep}
                  onSelectEvent={(evt) => setSelectedEventId(evt.id)}
                />

                {/* Instantaneous Step Sensor Fusion & Residual Breakdown Card */}
                {activeStepRow && (
                  <div className="bg-[#111114] border border-white/[0.08] rounded-2xl p-6 flex-1 flex flex-col justify-between">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-white/[0.07]">
                      <div>
                        <h3 className="text-base font-semibold tracking-tight text-white">
                          Step #{activeStepRow.step} ({activeStepRow.timestamp}) · Focus Station Residuals
                        </h3>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          Compares each station reading against the trust-weighted network consensus ({activeStepRow.consensusEstimate.toFixed(2)} {unit}) and true physical ground state ({activeStepRow.groundTruthEnv.toFixed(2)} {unit})
                        </p>
                      </div>
                      <span className="text-xs font-mono text-sky-400">
                        Fusion Error:{' '}
                        {Math.abs(
                          activeStepRow.consensusEstimate -
                            activeStepRow.groundTruthEnv
                        ).toFixed(2)}{' '}
                        {unit}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-4 font-mono tabular-nums text-xs">
                      {residualFocusSensors.map((s) => {
                        const val = activeStepRow.readings[s.id];
                        const residual =
                          val !== null && val !== undefined
                            ? val - activeStepRow.consensusEstimate
                            : null;
                        const trust = activeStepRow.trustScores[s.id] ?? 98;
                        const gtFault =
                          activeStepRow.injectedLabels[s.id] || 'NONE';
                        const isSel = s.id === selectedSensorId;
                        return (
                          <div
                            key={s.id}
                            onClick={() => setSelectedSensorId(s.id)}
                            className={`p-3.5 bg-[#18181C] rounded-xl border cursor-pointer space-y-1 transition-all ${
                              isSel
                                ? 'border-white/50 ring-1 ring-white/20'
                                : 'border-white/[0.06] hover:border-white/[0.18]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-white truncate">
                                {s.id} {s.city ? `· ${s.city.split(' ')[0]}` : ''}
                              </span>
                              <span
                                className={
                                  trust >= 80
                                    ? 'text-emerald-400'
                                    : trust >= 55
                                    ? 'text-amber-400'
                                    : 'text-rose-400'
                                }
                              >
                                {trust.toFixed(0)}%
                              </span>
                            </div>
                            <div className="text-base font-semibold text-white">
                              {val !== null && val !== undefined
                                ? `${val.toFixed(2)} ${unit}`
                                : 'Dropout'}
                            </div>
                            <div className="text-[11px] font-sans text-zinc-400">
                              Residual:{' '}
                              <span className="font-mono text-zinc-200">
                                {residual !== null
                                  ? `${residual >= 0 ? '+' : ''}${residual.toFixed(2)} ${unit}`
                                  : 'N/A'}
                              </span>
                            </div>
                            <div className="text-[11px] font-sans text-sky-400 truncate">
                              {formatFaultLabel(gtFault)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Sensor Health, Trust Score & Inter-Sensor Correlation Matrix */}
            <section id="sensor-health">
              <SensorHealthMatrix
                summaries={sensorSummaries}
                sensors={activeSensors}
                correlationMatrix={correlationMatrix}
                selectedSensorId={selectedSensorId}
                onSelectSensor={setSelectedSensorId}
              />
            </section>
          </>
        )}

        {/* Explainable AI (XAI), UST Jury Rubric & Alarm Ledger */}
        {showForensicsEval && (
          <>
            <section id="xai-forensics">
              <ExplainableForensicsPanel
                selectedEvent={selectedEvent}
                scenarioTitle={activeScenario.title}
                sensorSummaries={sensorSummaries}
                benchmark={benchmark}
                unit={unit}
              />
            </section>

            <UstJuryEvaluationDeck
              currentStepRow={activeStepRow}
              selectedEvent={selectedEvent}
              sensorSummaries={sensorSummaries}
              benchmark={benchmark}
              unit={unit}
              onIngestCustomCsv={handleIngestCustomCsv}
            />

            {/* Bottom Explainable Alarm & Abnormality Classification Ledger */}
            <section
              id="alarm-ledger"
              aria-labelledby="ledger-heading"
              className="bg-[#111114] border border-white/[0.08] rounded-2xl p-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
                <div>
                  <h3
                    id="ledger-heading"
                    className="text-base sm:text-lg font-semibold tracking-tight text-white"
                  >
                    Explainable Alarm &amp; Station Abnormality Ledger
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Select any row to load its feature attribution into XAI Forensics and sync the India Seismic Map
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <label htmlFor="ledger-search" className="sr-only">
                      Filter events by station or fault type
                    </label>
                    <input
                      id="ledger-search"
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search S-02, Bhuj, drift..."
                      className="bg-[#18181C] border border-white/[0.1] rounded-xl px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-white/30"
                    />
                  </div>

                  <div
                    role="group"
                    aria-label="Filter alarms by trust status"
                    className="flex items-center bg-[#18181C] p-1 border border-white/[0.08] rounded-xl"
                  >
                    <button
                      type="button"
                      onClick={() => setLedgerFilter('all')}
                      className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        ledgerFilter === 'all'
                          ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      All ({events.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setLedgerFilter('trusted')}
                      className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        ledgerFilter === 'trusted'
                          ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Trusted Alarms ({events.filter((e) => e.isTrustedAlarm).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setLedgerFilter('suppressed')}
                      className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        ledgerFilter === 'suppressed'
                          ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Suppressed Faults (
                      {events.filter((e) => !e.isTrustedAlarm).length})
                    </button>
                  </div>
                </div>
              </div>

              {filteredEvents.length > 0 ? (
                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-xs font-medium text-zinc-400">
                        <th className="py-3 pr-3 font-medium">Step / Time</th>
                        <th className="py-3 px-3 font-medium">Station</th>
                        <th className="py-3 px-3 text-right font-medium">Reading</th>
                        <th className="py-3 px-3 text-right font-medium">Consensus</th>
                        <th className="py-3 px-3 font-medium">Classification</th>
                        <th className="py-3 px-3 font-medium">Verdict</th>
                        <th className="py-3 px-3 text-right font-medium">Trust</th>
                        <th className="py-3 pl-3 font-medium">Attribution Summary</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05] text-xs">
                      {filteredEvents.slice(0, 18).map((evt) => {
                        const isSelected = selectedEvent?.id === evt.id;
                        return (
                          <tr
                            key={evt.id}
                            onClick={() => {
                              setSelectedEventId(evt.id);
                              setSelectedStep(evt.step);
                              setSelectedSensorId(evt.sensorId);
                            }}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-white/[0.07]'
                                : 'hover:bg-white/[0.03]'
                            }`}
                          >
                            <td className="py-3 pr-3 font-mono tabular-nums text-zinc-300 whitespace-nowrap">
                              T+{evt.step} · {evt.timestamp}
                            </td>
                            <td className="py-3 px-3 font-mono font-semibold text-white whitespace-nowrap">
                              {evt.sensorId}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums text-zinc-100 whitespace-nowrap">
                              {evt.measuredValue !== null
                                ? `${evt.measuredValue.toFixed(2)} ${unit}`
                                : 'NULL'}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums text-sky-400 whitespace-nowrap">
                              {evt.consensusValue.toFixed(2)} {unit}
                            </td>
                            <td className="py-3 px-3 text-zinc-200 whitespace-nowrap">
                              {formatFaultLabel(evt.classification)}
                            </td>
                            <td className="py-3 px-3 font-medium whitespace-nowrap">
                              {evt.isTrustedAlarm ? (
                                <span className="text-rose-400 font-semibold">
                                  ✖ Trusted Alarm
                                </span>
                              ) : (
                                <span className="text-amber-300">
                                  ▲ Suppressed Fault
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums text-zinc-200 whitespace-nowrap">
                              {evt.sensorTrustAtEvent.toFixed(1)}%
                            </td>
                            <td className="py-3 pl-3 text-zinc-300 max-w-md">
                              <div className="truncate">
                                {evt.attribution.primaryFactor}
                              </div>
                              <div className="text-[11px] text-zinc-400">
                                {formatMaintenanceLabel(evt.maintenanceAction)}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-4 p-8 text-center rounded-xl border border-white/[0.06] bg-[#18181C] space-y-2">
                  <div className="text-sm font-medium text-zinc-200">
                    No matching anomaly or alarm events in current view
                  </div>
                  <p className="text-xs text-zinc-400">
                    Clear the search filter or inject a new station fault pattern to populate the ledger.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setLedgerFilter('all');
                      setSearchQuery('');
                    }}
                    className="mt-2 px-4 py-1.5 text-xs font-semibold bg-white text-zinc-950 rounded-lg"
                  >
                    Reset Ledger Filters
                  </button>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <footer className="border-t border-white/[0.08] py-6 px-6 text-xs text-zinc-400 max-w-[1440px] w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>
          VeriSense · VIT Code Apex 3.0 · Track 3: Technology for Social Impact (UST)
        </span>
        <span>
          {activeSensors.length}-Station All-India Seismic &amp; Multi-Domain Sensor Trust Engine
        </span>
      </footer>
    </div>
  );
}
