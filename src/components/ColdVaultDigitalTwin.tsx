import React, { useState } from 'react';
import {
  TimeStepReading,
  SensorMeta,
  SensorHealthSummary,
  SocialImpactMetrics,
  FaultType,
  formatFaultLabel,
  formatMaintenanceLabel,
} from '../utils/sensorEngine';
import { ColdVault3DViewport } from './ColdVault3DViewport';

interface ColdVaultDigitalTwinProps {
  stream: TimeStepReading[];
  sensors: SensorMeta[];
  sensorSummaries: SensorHealthSummary[];
  correlationMatrix: Record<string, Record<string, number>>;
  socialImpact: SocialImpactMetrics;
  selectedStep: number;
  selectedSensorId: string;
  isPlaying: boolean;
  alarmThreshold: number;
  onSelectStep: (step: number) => void;
  onSelectSensor: (sensorId: string) => void;
  onTogglePlay: () => void;
  onChaosSabotage: (sensorId: string, faultType: FaultType) => void;
  onResetVaultToClean: () => void;
}

const BAY_VIAL_COUNTS: Record<string, string> = {
  'S-01': '3,400 Vials · BCG / OPV / Measles',
  'S-02': '3,800 Vials · Maternal Biologics',
  'S-03': '2,900 Vials · Human Insulin & Sera',
  'S-04': '2,300 Vials · Rabies & Tetanus Toxoid',
};

export const ColdVaultDigitalTwin: React.FC<ColdVaultDigitalTwinProps> = ({
  stream,
  sensors,
  sensorSummaries,
  correlationMatrix,
  socialImpact,
  selectedStep,
  selectedSensorId,
  isPlaying,
  alarmThreshold,
  onSelectStep,
  onSelectSensor,
  onTogglePlay,
  onChaosSabotage,
  onResetVaultToClean,
}) => {
  const [twinViewMode, setTwinViewMode] = useState<'3d-webgl' | '2d-floorplan'>(
    '3d-webgl'
  );

  const row = stream[Math.min(selectedStep, stream.length - 1)] || stream[0];
  const activeSensorMeta =
    sensors.find((s) => s.id === selectedSensorId) || sensors[0];
  const activeSummary =
    sensorSummaries.find((s) => s.sensorId === selectedSensorId) ||
    sensorSummaries[0];

  const activeFaultAtStep: FaultType =
    row.injectedLabels[selectedSensorId] ?? activeSummary.dominantFault;
  const activeReading = row.readings[selectedSensorId];
  const isGenuineExcursion = row.consensusEstimate >= alarmThreshold - 0.35;

  // Pairwise links between sensors for the correlation strip
  const sensorPairs: Array<{ a: SensorMeta; b: SensorMeta; r: number }> = [];
  for (let i = 0; i < sensors.length; i++) {
    for (let j = i + 1; j < sensors.length; j++) {
      const a = sensors[i];
      const b = sensors[j];
      const r = correlationMatrix[a.id]?.[b.id] ?? 1.0;
      sensorPairs.push({ a, b, r });
    }
  }

  return (
    <div className="space-y-6">
      {/* Side-by-Side Legacy Monitor vs. VeriSense AI Verdict Comparator */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Legacy Threshold Monitor */}
        <div
          className={`p-4 border transition-colors ${
            socialImpact.legacyVerdictAtStep.status === 'FALSE_ALARM_PANIC' ||
            socialImpact.legacyVerdictAtStep.status === 'MISSED_HAZARD'
              ? 'bg-rose-950/35 border-rose-700/80'
              : socialImpact.legacyVerdictAtStep.status === 'TRUE_ALARM'
              ? 'bg-amber-950/35 border-amber-700/80'
              : 'bg-[#0B0E17] border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between gap-2 text-xs font-mono">
            <span className="text-slate-400">
              CONVENTIONAL SINGLE-THRESHOLD MONITOR (LEGACY SYSTEM)
            </span>
            <span
              className={
                socialImpact.legacyVerdictAtStep.status === 'NOMINAL'
                  ? 'text-slate-300'
                  : 'text-rose-400 font-semibold'
              }
            >
              {socialImpact.legacyVerdictAtStep.status === 'FALSE_ALARM_PANIC'
                ? '✖ FALSE ALARM SIREN'
                : socialImpact.legacyVerdictAtStep.status === 'MISSED_HAZARD'
                ? '✖ BLIND TO FROZEN PROBE'
                : socialImpact.legacyVerdictAtStep.status === 'TRUE_ALARM'
                ? '▲ UNFILTERED ALARM'
                : '● THRESHOLD OK'}
            </span>
          </div>
          <div className="text-sm font-semibold text-slate-100 mt-1.5 font-mono">
            {socialImpact.legacyVerdictAtStep.headline}
          </div>
          <p className="text-xs text-slate-300 mt-1">
            {socialImpact.legacyVerdictAtStep.detail}
          </p>
        </div>

        {/* VeriSense AI Sensor-Fusion Engine */}
        <div
          className={`p-4 border transition-colors ${
            socialImpact.verisenseVerdictAtStep.status === 'VERIFIED_EXCURSION'
              ? 'bg-rose-950/40 border-rose-500'
              : socialImpact.verisenseVerdictAtStep.status === 'FAULT_SUPPRESSED'
              ? 'bg-amber-950/30 border-amber-500/80'
              : 'bg-cyan-950/25 border-cyan-800/80'
          }`}
        >
          <div className="flex items-center justify-between gap-2 text-xs font-mono">
            <span className="text-cyan-400 font-semibold">
              VERISENSE AI SENSOR-FUSION &amp; TRUST ENGINE (OUR SOLUTION)
            </span>
            <span
              className={
                socialImpact.verisenseVerdictAtStep.status ===
                'VERIFIED_EXCURSION'
                  ? 'text-rose-400 font-semibold'
                  : socialImpact.verisenseVerdictAtStep.status ===
                    'FAULT_SUPPRESSED'
                  ? 'text-amber-300 font-semibold'
                  : 'text-emerald-400 font-semibold'
              }
            >
              {socialImpact.verisenseVerdictAtStep.status ===
              'VERIFIED_EXCURSION'
                ? '✖ VERIFIED EXCURSION ALERT'
                : socialImpact.verisenseVerdictAtStep.status ===
                  'FAULT_SUPPRESSED'
                ? '▲ FALSE ALARM SUPPRESSED'
                : '● CONSENSUS VERIFIED'}
            </span>
          </div>
          <div className="text-sm font-semibold text-slate-100 mt-1.5 font-mono">
            {socialImpact.verisenseVerdictAtStep.headline}
          </div>
          <p className="text-xs text-slate-200 mt-1">
            {socialImpact.verisenseVerdictAtStep.detail}
          </p>
        </div>
      </div>

      {/* Main Split: Left 7 Cols Interactive 3D WebGL Twin + Right 5 Cols Visual Hardware Cutaway & Chaos Lab */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 7 Cols: Interactive 3D WebGL Biobank Viewport & Spatial Controls */}
        <div className="lg:col-span-7 bg-[#0B0E17] border border-slate-800 p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h2 className="text-base font-semibold text-slate-100">
                  3D Cryogenic Biobank &amp; Smart Sensor Digital Twin
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Real-time Three.js PBR simulation of 320 vaccine vials, laminar chiller airflow, and 4 PT100 probes
                </p>
              </div>

              {/* View Mode Switcher: 3D WebGL Studio vs 2D Schematic */}
              <div
                role="group"
                aria-label="Digital Twin Visualization Mode"
                className="flex items-center bg-[#111827] p-1 border border-slate-800 rounded"
              >
                <button
                  type="button"
                  onClick={() => setTwinViewMode('3d-webgl')}
                  className={`px-3 py-1 text-xs font-mono rounded transition-colors whitespace-nowrap ${
                    twinViewMode === '3d-webgl'
                      ? 'bg-cyan-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  3D WebGL Studio
                </button>
                <button
                  type="button"
                  onClick={() => setTwinViewMode('2d-floorplan')}
                  className={`px-3 py-1 text-xs font-mono rounded transition-colors whitespace-nowrap ${
                    twinViewMode === '2d-floorplan'
                      ? 'bg-cyan-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  2D Thermal Grid
                </button>
              </div>
            </div>

            {/* Primary Visual Viewport: 3D WebGL Scene or 2D Spatial Grid */}
            <div className="mt-4">
              {twinViewMode === '3d-webgl' ? (
                <ColdVault3DViewport
                  row={row}
                  sensors={sensors}
                  sensorSummaries={sensorSummaries}
                  correlationMatrix={correlationMatrix}
                  selectedSensorId={selectedSensorId}
                  alarmThreshold={alarmThreshold}
                  onSelectSensor={onSelectSensor}
                />
              ) : (
                <div className="relative bg-[#07090E] border border-slate-800 p-4">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-3 px-1">
                    <span>▼ GLYCOL CHILLER INTAKE MANIFOLD (NORTH)</span>
                    <span>VAULT ENVELOPE: 2.0 °C – 8.0 °C</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {sensors.map((s) => {
                      const reading = row.readings[s.id];
                      const trust = row.trustScores[s.id];
                      const injectedFault = row.injectedLabels[s.id];
                      const residual =
                        reading !== null
                          ? reading - row.consensusEstimate
                          : null;
                      const isSelected = selectedSensorId === s.id;
                      const isSensorFault =
                        injectedFault !== 'NONE' &&
                        injectedFault !== 'GENUINE_EVENT';

                      const baySurfaceClass = isGenuineExcursion
                        ? 'bg-gradient-to-br from-rose-950/70 via-rose-900/30 to-[#0B0E17] border-rose-500/80'
                        : isSensorFault || trust < 75
                        ? 'bg-gradient-to-br from-amber-950/55 via-slate-900/80 to-[#0B0E17] border-amber-500/80'
                        : 'bg-gradient-to-br from-cyan-950/35 via-slate-900/70 to-[#0B0E17] border-slate-800';

                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => onSelectSensor(s.id)}
                          className={`text-left p-4 border transition-all relative ${baySurfaceClass} ${
                            isSelected
                              ? 'ring-2 ring-cyan-400'
                              : 'hover:border-slate-600'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-bold text-slate-100">
                              {s.id} · {s.zone.split('·')[0].trim()}
                            </span>
                            <span
                              className={`font-mono text-[11px] font-semibold ${
                                trust >= 80
                                  ? 'text-emerald-400'
                                  : trust >= 55
                                  ? 'text-amber-400'
                                  : 'text-rose-400'
                              }`}
                            >
                              {trust >= 80 ? '●' : trust >= 55 ? '▲' : '✖'}{' '}
                              TRUST {trust.toFixed(0)}%
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {BAY_VIAL_COUNTS[s.id]}
                          </div>

                          <div className="mt-3 flex items-baseline justify-between gap-2 font-mono tabular-nums">
                            <div>
                              <div className="text-[10px] text-slate-400">
                                PROBE OUTPUT
                              </div>
                              <div
                                className={`text-2xl font-bold ${
                                  reading === null
                                    ? 'text-rose-400'
                                    : reading >= alarmThreshold
                                    ? 'text-amber-300'
                                    : 'text-slate-100'
                                }`}
                              >
                                {reading !== null
                                  ? `${reading.toFixed(2)} °C`
                                  : 'NO SIGNAL'}
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-[10px] text-slate-400">
                                CONSENSUS Δ
                              </div>
                              <div
                                className={`text-sm font-semibold ${
                                  residual === null
                                    ? 'text-rose-400'
                                    : Math.abs(residual) >= 1.1
                                    ? 'text-amber-400'
                                    : 'text-cyan-300'
                                }`}
                              >
                                {residual !== null
                                  ? `${
                                      residual >= 0 ? '+' : ''
                                    }${residual.toFixed(2)} °C`
                                  : 'BUS CUT'}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
                            <span
                              className={
                                injectedFault === 'NONE'
                                  ? 'text-slate-400'
                                  : injectedFault === 'GENUINE_EVENT'
                                  ? 'text-rose-300 font-semibold'
                                  : 'text-amber-300 font-semibold'
                              }
                            >
                              {formatFaultLabel(injectedFault)}
                            </span>
                            <span className="text-cyan-400">
                              {isSelected ? 'SELECTED' : 'Inspect →'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quick 4-Probe Selector Strip + Inter-Sensor Correlation Links */}
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
                {sensors.map((s) => {
                  const rVal = row.readings[s.id];
                  const tVal = row.trustScores[s.id];
                  const isSel = selectedSensorId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSelectSensor(s.id)}
                      className={`p-2.5 border text-left transition-colors ${
                        isSel
                          ? 'bg-cyan-950/45 border-cyan-400 text-slate-100'
                          : 'bg-[#07090E] border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold">{s.id}</span>
                        <span
                          className={
                            tVal >= 80
                              ? 'text-emerald-400'
                              : tVal >= 55
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }
                        >
                          {tVal.toFixed(0)}%
                        </span>
                      </div>
                      <div className="text-sm font-bold tabular-nums mt-0.5">
                        {rVal !== null ? `${rVal.toFixed(2)} °C` : 'DROPOUT'}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Inter-Sensor Spatial Correlation Links Bar */}
              <div className="mt-3 pt-3 border-t border-slate-800">
                <div className="text-[11px] font-mono text-slate-400 mb-2">
                  LIVE INTER-SENSOR SPATIAL CORRELATION LINKS (PEARSON r)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 font-mono text-[11px] tabular-nums">
                  {sensorPairs.map(({ a, b, r }) => {
                    const isCoupled = r >= 0.72;
                    return (
                      <div
                        key={`${a.id}-${b.id}`}
                        className={`px-2 py-1.5 border text-center ${
                          isCoupled
                            ? 'bg-cyan-950/30 border-cyan-800/70 text-cyan-200'
                            : 'bg-amber-950/30 border-amber-800/70 text-amber-300'
                        }`}
                      >
                        <div>
                          {a.id}↔{b.id}
                        </div>
                        <div className="font-bold mt-0.5">
                          r = {r.toFixed(2)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Playback & Time Scrubber Bar */}
          <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onTogglePlay}
                className="px-3.5 py-1.5 text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded transition-colors whitespace-nowrap shrink-0"
              >
                {isPlaying ? 'Pause Simulation' : 'Play Live Stream'}
              </button>
              <button
                type="button"
                onClick={() =>
                  onSelectStep(
                    (selectedStep - 1 + stream.length) % stream.length
                  )
                }
                aria-label="Previous time step"
                className="px-2.5 py-1.5 text-xs font-mono bg-[#111827] hover:bg-slate-800 text-slate-200 border border-slate-700 rounded"
              >
                -1 Step
              </button>
              <button
                type="button"
                onClick={() =>
                  onSelectStep((selectedStep + 1) % stream.length)
                }
                aria-label="Next time step"
                className="px-2.5 py-1.5 text-xs font-mono bg-[#111827] hover:bg-slate-800 text-slate-200 border border-slate-700 rounded"
              >
                +1 Step
              </button>
            </div>

            <div className="flex items-center gap-2 flex-1 min-w-[180px]">
              <span className="text-xs font-mono text-slate-400 whitespace-nowrap">
                T+{row.step} ({row.timestamp})
              </span>
              <input
                type="range"
                aria-label="Simulation step timeline"
                min={0}
                max={stream.length - 1}
                value={row.step}
                onChange={(e) => onSelectStep(Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Right 5 Cols: Interactive Hardware Cutaway CAD Diagram & Visual Chaos Monkey Lab */}
        <div className="lg:col-span-5 bg-[#0B0E17] border border-slate-800 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <div>
                <div className="text-xs font-mono text-amber-400">
                  HARDWARE ANATOMY &amp; CHAOS MONKEY SABOTAGE LAB
                </div>
                <h3 className="text-base font-semibold text-slate-100 mt-0.5">
                  Probe {activeSensorMeta.id} Internal Cutaway &amp; Fault Physics
                </h3>
              </div>
              <button
                type="button"
                onClick={onResetVaultToClean}
                className="px-2.5 py-1 text-xs font-mono text-slate-300 hover:text-white bg-[#111827] border border-slate-700 rounded whitespace-nowrap shrink-0"
              >
                Reset Scenario
              </button>
            </div>

            {/* Interactive Vector CAD Schematic of the PT100 Probe Hardware */}
            <div className="mt-3 p-3.5 bg-[#07090E] border border-slate-800">
              <div className="flex items-center justify-between text-[11px] font-mono mb-2">
                <span className="text-slate-300 font-semibold">
                  {activeSensorMeta.name}
                </span>
                <span className="text-cyan-400">
                  TRUST: {activeSummary.trustScore.toFixed(1)}% ·{' '}
                  {formatMaintenanceLabel(activeSummary.maintenanceAction)}
                </span>
              </div>

              {/* Exploded Hardware Cross-Section SVG Diagram */}
              <svg
                viewBox="0 0 460 175"
                className="w-full h-auto bg-[#0B0F19] border border-slate-800/90"
                role="img"
                aria-label={`Exploded hardware schematic for sensor ${activeSensorMeta.id}`}
              >
                {/* Blueprint Grid Lines */}
                <g stroke="#1E293B" strokeWidth="0.6" opacity="0.7">
                  <line x1="0" y1="45" x2="460" y2="45" />
                  <line x1="0" y1="90" x2="460" y2="90" />
                  <line x1="0" y1="135" x2="460" y2="135" />
                  <line x1="115" y1="0" x2="115" y2="175" />
                  <line x1="230" y1="0" x2="230" y2="175" />
                  <line x1="345" y1="0" x2="345" y2="175" />
                </g>

                {/* 1. RS-485 Bus Conduit & Transceiver (Left) */}
                <g>
                  <rect
                    x="16"
                    y="56"
                    width="74"
                    height="62"
                    rx="4"
                    fill={
                      activeFaultAtStep === 'DROPOUT' || activeReading === null
                        ? '#4C0519'
                        : '#111827'
                    }
                    stroke={
                      activeFaultAtStep === 'DROPOUT' || activeReading === null
                        ? '#F43F5E'
                        : '#334155'
                    }
                    strokeWidth="1.8"
                  />
                  <text
                    x="53"
                    y="78"
                    textAnchor="middle"
                    fill="#E2E8F0"
                    fontSize="9"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    RS-485 BUS
                  </text>
                  <text
                    x="53"
                    y="92"
                    textAnchor="middle"
                    fill={
                      activeFaultAtStep === 'DROPOUT' || activeReading === null
                        ? '#FDA4AF'
                        : '#38BDF8'
                    }
                    fontSize="8"
                    fontFamily="monospace"
                  >
                    {activeFaultAtStep === 'DROPOUT' || activeReading === null
                      ? '✖ LINK CUT'
                      : '● PACKET OK'}
                  </text>
                  <text
                    x="53"
                    y="107"
                    textAnchor="middle"
                    fill="#94A3B8"
                    fontSize="7.5"
                    fontFamily="monospace"
                  >
                    MODBUS RTU
                  </text>
                </g>

                {/* Signal Trace 1 -> 2 */}
                <line
                  x1="90"
                  y1="87"
                  x2="118"
                  y2="87"
                  stroke={
                    activeFaultAtStep === 'DROPOUT' || activeReading === null
                      ? '#F43F5E'
                      : '#06B6D4'
                  }
                  strokeWidth="2"
                  strokeDasharray={
                    activeFaultAtStep === 'DROPOUT' || activeReading === null
                      ? '3 3'
                      : 'none'
                  }
                />

                {/* 2. 16-Bit Sigma-Delta ADC & Register Latch */}
                <g>
                  <rect
                    x="118"
                    y="48"
                    width="88"
                    height="78"
                    rx="4"
                    fill={
                      activeFaultAtStep === 'STUCK_AT' ? '#2E1065' : '#0F172A'
                    }
                    stroke={
                      activeFaultAtStep === 'STUCK_AT' ? '#A855F7' : '#334155'
                    }
                    strokeWidth="1.8"
                  />
                  <rect
                    x="134"
                    y="62"
                    width="56"
                    height="32"
                    fill="#090D16"
                    stroke={
                      activeFaultAtStep === 'STUCK_AT' ? '#C084FC' : '#06B6D4'
                    }
                    strokeWidth="1.2"
                  />
                  <text
                    x="162"
                    y="81"
                    textAnchor="middle"
                    fill="#F8FAFC"
                    fontSize="8.5"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    16-BIT ADC
                  </text>
                  <text
                    x="162"
                    y="112"
                    textAnchor="middle"
                    fill={
                      activeFaultAtStep === 'STUCK_AT' ? '#D8B4FE' : '#94A3B8'
                    }
                    fontSize="8"
                    fontFamily="monospace"
                  >
                    {activeFaultAtStep === 'STUCK_AT'
                      ? '▲ LATCH FROZEN'
                      : 'σ² ACTIVE'}
                  </text>
                </g>

                {/* Signal Trace 2 -> 3 */}
                <line
                  x1="206"
                  y1="87"
                  x2="234"
                  y2="87"
                  stroke="#06B6D4"
                  strokeWidth="2"
                />

                {/* 3. Ferrite EMI Choke & Cold-Solder Lead Junction */}
                <g>
                  <rect
                    x="234"
                    y="52"
                    width="92"
                    height="70"
                    rx="4"
                    fill={
                      activeFaultAtStep === 'RANDOM_SPIKE' ||
                      activeFaultAtStep === 'EXCESSIVE_NOISE'
                        ? '#451A03'
                        : '#111827'
                    }
                    stroke={
                      activeFaultAtStep === 'RANDOM_SPIKE' ||
                      activeFaultAtStep === 'EXCESSIVE_NOISE'
                        ? '#F59E0B'
                        : '#334155'
                    }
                    strokeWidth="1.8"
                  />
                  <text
                    x="280"
                    y="75"
                    textAnchor="middle"
                    fill="#E2E8F0"
                    fontSize="8.5"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    EMI &amp; JUNCTION
                  </text>
                  <text
                    x="280"
                    y="91"
                    textAnchor="middle"
                    fill={
                      activeFaultAtStep === 'RANDOM_SPIKE' ||
                      activeFaultAtStep === 'EXCESSIVE_NOISE'
                        ? '#FCD34D'
                        : '#34D399'
                    }
                    fontSize="8"
                    fontFamily="monospace"
                  >
                    {activeFaultAtStep === 'RANDOM_SPIKE'
                      ? '▲ +5.8°C EMI TRANSIENT'
                      : activeFaultAtStep === 'EXCESSIVE_NOISE'
                      ? `▲ JITTER σ=${activeSummary.noiseSigma.toFixed(2)}°C`
                      : `σ=${activeSummary.noiseSigma.toFixed(2)}°C CLEAN`}
                  </text>
                  <text
                    x="280"
                    y="108"
                    textAnchor="middle"
                    fill="#94A3B8"
                    fontSize="7.5"
                    fontFamily="monospace"
                  >
                    FERRITE SHIELD
                  </text>
                </g>

                {/* Stainless Thermowell Stem -> 4. Platinum RTD Tip (Right) */}
                <line
                  x1="326"
                  y1="87"
                  x2="352"
                  y2="87"
                  stroke="#94A3B8"
                  strokeWidth="6"
                />

                <g>
                  <polygon
                    points="352,58 432,68 446,87 432,106 352,116"
                    fill={
                      activeFaultAtStep === 'GENUINE_EVENT' ||
                      isGenuineExcursion
                        ? '#4C0519'
                        : activeFaultAtStep === 'OFFSET_DRIFT'
                        ? '#451A03'
                        : '#083344'
                    }
                    stroke={
                      activeFaultAtStep === 'GENUINE_EVENT' ||
                      isGenuineExcursion
                        ? '#F43F5E'
                        : activeFaultAtStep === 'OFFSET_DRIFT'
                        ? '#F59E0B'
                        : '#22D3EE'
                    }
                    strokeWidth="2"
                  />
                  <text
                    x="395"
                    y="83"
                    textAnchor="middle"
                    fill="#F8FAFC"
                    fontSize="8.5"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    PT100 RTD TIP
                  </text>
                  <text
                    x="395"
                    y="97"
                    textAnchor="middle"
                    fill={
                      activeFaultAtStep === 'OFFSET_DRIFT'
                        ? '#FCD34D'
                        : '#67E8F9'
                    }
                    fontSize="8"
                    fontFamily="monospace"
                  >
                    {activeReading !== null
                      ? `${activeReading.toFixed(2)} °C`
                      : 'NO SIGNAL'}
                  </text>
                </g>

                {/* Bottom Live Physics Caption */}
                <text
                  x="14"
                  y="162"
                  fill="#94A3B8"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  ACTIVE STATE: {formatFaultLabel(activeFaultAtStep)} · DRIFT:{' '}
                  {activeSummary.driftRatePerHour >= 0 ? '+' : ''}
                  {activeSummary.driftRatePerHour.toFixed(2)} °C/h · NEIGHBOUR r
                  = {activeSummary.avgCorrelation.toFixed(2)}
                </text>
              </svg>
            </div>

            {/* Visual Waveform Sabotage Triggers (Each card includes a mini SVG signal signature) */}
            <div className="mt-4">
              <div className="text-xs font-medium text-slate-300 mb-2">
                1. Click Any Fault Waveform to Sabotage{' '}
                <span className="font-mono text-cyan-400">
                  {activeSensorMeta.id}
                </span>{' '}
                in the 3D Vault
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Offset Drift */}
                <button
                  type="button"
                  onClick={() =>
                    onChaosSabotage(activeSensorMeta.id, 'OFFSET_DRIFT')
                  }
                  className="p-2.5 text-left bg-[#111827] hover:bg-slate-800 border border-slate-700 transition-colors flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-semibold text-amber-300 font-mono">
                      +4.8 °C Calibration Drift
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Gradual RTD aging ramp
                    </div>
                  </div>
                  <svg
                    width="54"
                    height="28"
                    viewBox="0 0 54 28"
                    className="shrink-0 bg-[#07090E] border border-slate-800"
                    aria-hidden="true"
                  >
                    <line
                      x1="0"
                      y1="20"
                      x2="54"
                      y2="20"
                      stroke="#06B6D4"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                    />
                    <polyline
                      fill="none"
                      stroke="#F59E0B"
                      strokeWidth="2"
                      points="2,20 14,19 26,15 38,10 52,4"
                    />
                  </svg>
                </button>

                {/* Relay EMI Spike */}
                <button
                  type="button"
                  onClick={() =>
                    onChaosSabotage(activeSensorMeta.id, 'RANDOM_SPIKE')
                  }
                  className="p-2.5 text-left bg-[#111827] hover:bg-slate-800 border border-slate-700 transition-colors flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-semibold text-amber-300 font-mono">
                      +5.8 °C Relay EMI Spike
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Inductive impulse transient
                    </div>
                  </div>
                  <svg
                    width="54"
                    height="28"
                    viewBox="0 0 54 28"
                    className="shrink-0 bg-[#07090E] border border-slate-800"
                    aria-hidden="true"
                  >
                    <polyline
                      fill="none"
                      stroke="#F59E0B"
                      strokeWidth="2"
                      points="2,21 20,21 25,3 30,21 52,21"
                    />
                  </svg>
                </button>

                {/* Stuck-At Freeze */}
                <button
                  type="button"
                  onClick={() =>
                    onChaosSabotage(activeSensorMeta.id, 'STUCK_AT')
                  }
                  className="p-2.5 text-left bg-[#111827] hover:bg-slate-800 border border-slate-700 transition-colors flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-semibold text-purple-300 font-mono">
                      Freeze ADC at 4.62 °C
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Zero-variance register latch
                    </div>
                  </div>
                  <svg
                    width="54"
                    height="28"
                    viewBox="0 0 54 28"
                    className="shrink-0 bg-[#07090E] border border-slate-800"
                    aria-hidden="true"
                  >
                    <polyline
                      fill="none"
                      stroke="#A855F7"
                      strokeWidth="2"
                      points="2,18 12,13 18,14 52,14"
                    />
                  </svg>
                </button>

                {/* Degrade Junction Noise */}
                <button
                  type="button"
                  onClick={() =>
                    onChaosSabotage(activeSensorMeta.id, 'EXCESSIVE_NOISE')
                  }
                  className="p-2.5 text-left bg-[#111827] hover:bg-slate-800 border border-slate-700 transition-colors flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-semibold text-amber-300 font-mono">
                      Degrade Junction (σ=1.85°C)
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      High-frequency thermal jitter
                    </div>
                  </div>
                  <svg
                    width="54"
                    height="28"
                    viewBox="0 0 54 28"
                    className="shrink-0 bg-[#07090E] border border-slate-800"
                    aria-hidden="true"
                  >
                    <polyline
                      fill="none"
                      stroke="#F59E0B"
                      strokeWidth="1.8"
                      points="2,15 8,6 14,23 20,7 26,22 32,5 38,24 44,8 52,16"
                    />
                  </svg>
                </button>

                {/* Sever RS-485 Bus */}
                <button
                  type="button"
                  onClick={() =>
                    onChaosSabotage(activeSensorMeta.id, 'DROPOUT')
                  }
                  className="p-2.5 text-left bg-[#111827] hover:bg-slate-800 border border-slate-700 transition-colors flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-semibold text-rose-300 font-mono">
                      Sever RS-485 Telemetry
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Null packet dropout on bus
                    </div>
                  </div>
                  <svg
                    width="54"
                    height="28"
                    viewBox="0 0 54 28"
                    className="shrink-0 bg-[#07090E] border border-slate-800"
                    aria-hidden="true"
                  >
                    <line
                      x1="2"
                      y1="14"
                      x2="18"
                      y2="14"
                      stroke="#F43F5E"
                      strokeWidth="2"
                    />
                    <line
                      x1="18"
                      y1="14"
                      x2="38"
                      y2="24"
                      stroke="#F43F5E"
                      strokeWidth="1.5"
                      strokeDasharray="2 2"
                    />
                    <text
                      x="28"
                      y="13"
                      textAnchor="middle"
                      fill="#F43F5E"
                      fontSize="8"
                      fontFamily="monospace"
                    >
                      NULL
                    </text>
                  </svg>
                </button>

                {/* Restore Clean Probe */}
                <button
                  type="button"
                  onClick={() => onChaosSabotage(activeSensorMeta.id, 'NONE')}
                  className="p-2.5 text-left bg-emerald-950/30 hover:bg-emerald-950/50 border border-emerald-800/70 transition-colors flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-semibold text-emerald-300 font-mono">
                      Restore {activeSensorMeta.id} Probe
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Clear faults on this channel
                    </div>
                  </div>
                  <svg
                    width="54"
                    height="28"
                    viewBox="0 0 54 28"
                    className="shrink-0 bg-[#07090E] border border-emerald-900/80"
                    aria-hidden="true"
                  >
                    <polyline
                      fill="none"
                      stroke="#10B981"
                      strokeWidth="2"
                      points="2,16 14,15 26,17 38,15 52,16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Vault-Wide Real Emergency Trigger */}
          <div className="mt-4 pt-3 border-t border-slate-800">
            <div className="text-xs font-medium text-slate-300 mb-2">
              2. Trigger Genuine Multi-Sensor Vault Emergency (VeriSense Will Trust &amp; Escalate)
            </div>
            <button
              type="button"
              onClick={() => onChaosSabotage('ALL', 'GENUINE_EVENT')}
              className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded transition-colors"
            >
              Trigger Real Compressor Failure &amp; Door Thermal Breach (+4.9 °C Across All Bays)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
