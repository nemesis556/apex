import React, { useMemo, useState } from 'react';
import {
  TimeStepReading,
  SensorMeta,
  DetectedEvent,
  formatFaultLabel,
} from '../utils/sensorEngine';

interface MultiSensorChartProps {
  stream: TimeStepReading[];
  sensors: SensorMeta[];
  events: DetectedEvent[];
  alarmThreshold: number;
  selectedStep: number;
  onSelectStep: (step: number) => void;
  onSelectEvent: (evt: DetectedEvent) => void;
}

const PALETTE = [
  '#38bdf8', // Sky cyan
  '#f59e0b', // Telemetry amber
  '#a78bfa', // Violet
  '#fb7185', // Rose
  '#34d399', // Emerald
  '#facc15', // Yellow
  '#60a5fa', // Blue
  '#f472b6', // Pink
  '#2dd4bf', // Teal
  '#fb923c', // Orange
  '#c084fc', // Purple
  '#4ade80', // Green
];

function getSensorColor(sensorId: string, index: number): string {
  const num = parseInt(sensorId.replace(/[^0-9]/g, ''), 10);
  if (!Number.isNaN(num) && num > 0) {
    return PALETTE[(num - 1) % PALETTE.length];
  }
  return PALETTE[index % PALETTE.length];
}

export const MultiSensorChart: React.FC<MultiSensorChartProps> = ({
  stream,
  sensors,
  events,
  alarmThreshold,
  selectedStep,
  onSelectStep,
  onSelectEvent,
}) => {
  // Determine which stations have anomalies across the stream so they are enabled by default
  const anomalousSensorIds = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) {
      if (e.classification !== 'GENUINE_EVENT') {
        set.add(e.sensorId);
      }
    }
    return set;
  }, [events]);

  const [manualToggles, setManualToggles] = useState<Record<string, boolean>>({});
  const [showAllStations, setShowAllStations] = useState(false);
  const [showConsensus, setShowConsensus] = useState(true);
  const [showGroundTruth, setShowGroundTruth] = useState(false);
  const [chartMode, setChartMode] = useState<'temperature' | 'trust'>('temperature');

  const unit = sensors[0]?.unit || 'gal';
  const isSeismic = unit === 'gal';

  const isSensorVisible = (sId: string, idx: number): boolean => {
    if (sId in manualToggles) return manualToggles[sId];
    if (showAllStations) return true;
    return idx < 4 || anomalousSensorIds.has(sId);
  };

  const toggleChannel = (id: string, idx: number) => {
    const current = isSensorVisible(id, idx);
    setManualToggles((prev) => ({ ...prev, [id]: !current }));
  };

  if (stream.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-slate-400 border border-slate-800 bg-[#0B0E17]">
        No telemetry stream loaded. Select a scenario or synthesize a dataset to inspect curves.
      </div>
    );
  }

  const width = 880;
  const height = 300;
  const padLeft = 52;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const minVal = chartMode === 'temperature' ? 1.5 : 0;
  const maxVal = chartMode === 'temperature' ? 12.5 : 105;

  const xForStep = (step: number) =>
    padLeft + (step / Math.max(1, stream.length - 1)) * plotW;

  const yForValue = (val: number) => {
    const clamped = Math.max(minVal, Math.min(maxVal, val));
    return padTop + plotH - ((clamped - minVal) / (maxVal - minVal)) * plotH;
  };

  const buildPolyline = (getter: (row: TimeStepReading) => number | null): string => {
    const segments: string[] = [];
    let currentSegment: string[] = [];
    for (const row of stream) {
      const v = getter(row);
      if (v === null || v === undefined) {
        if (currentSegment.length > 0) {
          segments.push(currentSegment.join(' '));
          currentSegment = [];
        }
      } else {
        const x = xForStep(row.step).toFixed(1);
        const y = yForValue(v).toFixed(1);
        currentSegment.push(`${currentSegment.length === 0 ? 'M' : 'L'}${x},${y}`);
      }
    }
    if (currentSegment.length > 0) {
      segments.push(currentSegment.join(' '));
    }
    return segments.join(' ');
  };

  const activeRow = stream[Math.min(selectedStep, stream.length - 1)] || stream[0];
  const yTicks =
    chartMode === 'temperature'
      ? [2, 4, 6, 8, 10, 12]
      : [0, 25, 50, 75, 100];

  const snapshotSensors = useMemo(() => {
    const visible = sensors.filter((s, i) => isSensorVisible(s.id, i));
    return visible.slice(0, 6);
  }, [sensors, manualToggles, showAllStations, anomalousSensorIds]);

  return (
    <div className="bg-[#111114] border border-white/[0.08] rounded-2xl p-6">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div>
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-white">
            {chartMode === 'temperature'
              ? isSeismic
                ? `Multi-Station Ground Acceleration & Consensus (${sensors.length} Nodes)`
                : 'Multivariate Sensor Telemetry & Trust-Weighted Consensus'
              : `Per-Station Trust Trajectory (${sensors.length} Nodes, 0–100%)`}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {chartMode === 'temperature'
              ? `Solid white curve shows fused network consensus; dashed crimson line marks ${alarmThreshold.toFixed(1)} ${unit} trigger threshold`
              : 'Station trustworthiness derived from spatial k-NN correlation, residual drift slope, and noise variance'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setManualToggles({});
              setShowAllStations((p) => !p);
            }}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-white/[0.08] bg-white/[0.05] text-zinc-200 hover:bg-white/[0.1] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {showAllStations
              ? 'Focus Anomalous Nodes'
              : `Plot All ${sensors.length} Curves`}
          </button>

          <div
            role="group"
            aria-label="Chart display mode"
            className="flex items-center bg-[#18181C] p-1 rounded-xl border border-white/[0.08]"
          >
            <button
              type="button"
              onClick={() => setChartMode('temperature')}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                chartMode === 'temperature'
                  ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {isSeismic ? 'Ground Accel (gal)' : 'Temperature (°C)'}
            </button>
            <button
              type="button"
              onClick={() => setChartMode('trust')}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                chartMode === 'trust'
                  ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Sensor Trust (%)
            </button>
          </div>
        </div>
      </div>

      {/* Channel Toggle Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 py-3 border-b border-white/[0.06] text-xs">
        <div className="flex flex-wrap items-center gap-1.5 max-h-16 overflow-y-auto pr-1">
          {sensors.map((s, idx) => {
            const active = isSensorVisible(s.id, idx);
            const color = getSensorColor(s.id, idx);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleChannel(s.id, idx)}
                aria-pressed={active}
                className={`px-2 py-0.5 rounded-md border transition-colors font-mono text-[11px] whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#18181C] border-white/[0.12] text-zinc-100'
                    : 'bg-transparent border-white/[0.04] text-zinc-500'
                }`}
              >
                <span
                  style={{ color: active ? color : '#52525b' }}
                  className="mr-1 font-bold"
                >
                  ■
                </span>
                {s.id} {s.city ? `(${s.city.split(' ')[0]})` : ''}
              </button>
            );
          })}

          {chartMode === 'temperature' && (
            <>
              <button
                type="button"
                onClick={() => setShowConsensus((p) => !p)}
                aria-pressed={showConsensus}
                className={`px-2 py-0.5 rounded-md border transition-colors font-mono text-[11px] whitespace-nowrap shrink-0 ${
                  showConsensus
                    ? 'bg-[#18181C] border-white/[0.12] text-zinc-100'
                    : 'bg-transparent border-white/[0.04] text-zinc-500'
                }`}
              >
                <span className="mr-1 text-white font-bold">━</span>
                Consensus
              </button>
              <button
                type="button"
                onClick={() => setShowGroundTruth((p) => !p)}
                aria-pressed={showGroundTruth}
                className={`px-2 py-0.5 rounded-md border transition-colors font-mono text-[11px] whitespace-nowrap shrink-0 ${
                  showGroundTruth
                    ? 'bg-[#18181C] border-white/[0.12] text-emerald-300'
                    : 'bg-transparent border-white/[0.04] text-zinc-500'
                }`}
              >
                <span className="mr-1 text-emerald-400 font-bold">┈</span>
                True State
              </button>
            </>
          )}
        </div>

        {/* Live Crosshair Readout */}
        <div className="font-mono tabular-nums text-xs text-zinc-400 flex items-center gap-3 shrink-0">
          <span>
            Step <strong className="text-white">#{activeRow.step}</strong> ({activeRow.timestamp})
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Consensus{' '}
            <strong className="text-sky-400">
              {activeRow.consensusEstimate.toFixed(2)} {unit}
            </strong>
          </span>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative mt-3 select-none">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible cursor-crosshair"
          role="img"
          aria-label="Multi-sensor telemetry time-series chart"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = ((e.clientX - rect.left) / rect.width) * width;
            const ratio = Math.max(0, Math.min(1, (relX - padLeft) / plotW));
            const stepIdx = Math.round(ratio * (stream.length - 1));
            onSelectStep(stepIdx);
          }}
        >
          {/* Horizontal grid lines */}
          {yTicks.map((tick) => {
            const y = yForValue(tick);
            return (
              <g key={tick}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="#1e293b"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px] font-mono"
                >
                  {chartMode === 'temperature'
                    ? `${tick.toFixed(0)} ${unit}`
                    : `${tick}%`}
                </text>
              </g>
            );
          })}

          {/* X-axis step ticks */}
          {stream
            .filter((_, i) => i % 12 === 0 || i === stream.length - 1)
            .map((row) => {
              const x = xForStep(row.step);
              return (
                <g key={row.step}>
                  <line
                    x1={x}
                    y1={padTop}
                    x2={x}
                    y2={height - padBottom}
                    stroke="#1e293b"
                    strokeDasharray="2 3"
                    strokeWidth="1"
                  />
                  <text
                    x={x}
                    y={height - 10}
                    textAnchor="middle"
                    className="fill-slate-400 text-[10px] font-mono"
                  >
                    {row.timestamp} (T+{row.step})
                  </text>
                </g>
              );
            })}

          {/* Alarm Threshold Line */}
          {chartMode === 'temperature' && (
            <g>
              <line
                x1={padLeft}
                y1={yForValue(alarmThreshold)}
                x2={width - padRight}
                y2={yForValue(alarmThreshold)}
                stroke="#ef4444"
                strokeWidth="1.5"
                strokeDasharray="6 4"
              />
              <text
                x={width - padRight - 4}
                y={yForValue(alarmThreshold) - 6}
                textAnchor="end"
                className="fill-rose-400 text-[10px] font-mono font-semibold"
              >
                {isSeismic ? 'NDMA P-WAVE TRIGGER' : 'ALARM THRESHOLD'} ({alarmThreshold.toFixed(1)} {unit})
              </text>
            </g>
          )}

          {/* Trust Threshold Line in Trust Mode */}
          {chartMode === 'trust' && (
            <g>
              <line
                x1={padLeft}
                y1={yForValue(60)}
                x2={width - padRight}
                y2={yForValue(60)}
                stroke="#f59e0b"
                strokeWidth="1.2"
                strokeDasharray="5 4"
              />
              <text
                x={width - padRight - 4}
                y={yForValue(60) - 6}
                textAnchor="end"
                className="fill-amber-400 text-[10px] font-mono"
              >
                RECALIBRATION THRESHOLD (60%)
              </text>
            </g>
          )}

          {/* Ground Truth Curve */}
          {chartMode === 'temperature' && showGroundTruth && (
            <path
              d={buildPolyline((r) => r.groundTruthEnv)}
              fill="none"
              stroke="#10b981"
              strokeWidth="2"
              strokeDasharray="3 3"
            />
          )}

          {/* Individual Sensor Curves */}
          {sensors.map((s, idx) => {
            if (!isSensorVisible(s.id, idx)) return null;
            const color = getSensorColor(s.id, idx);
            const pathData = buildPolyline((r) =>
              chartMode === 'temperature' ? r.readings[s.id] : r.trustScores[s.id]
            );
            return (
              <path
                key={s.id}
                d={pathData}
                fill="none"
                stroke={color}
                strokeWidth={anomalousSensorIds.has(s.id) ? '2.1' : '1.4'}
                strokeOpacity={anomalousSensorIds.has(s.id) ? '0.95' : '0.75'}
              />
            );
          })}

          {/* Trust-Weighted Consensus Curve */}
          {chartMode === 'temperature' && showConsensus && (
            <path
              d={buildPolyline((r) => r.consensusEstimate)}
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.4"
            />
          )}

          {/* Event Anomaly Markers */}
          {chartMode === 'temperature' &&
            events.map((evt) => {
              if (evt.measuredValue === null) return null;
              const cx = xForStep(evt.step);
              const cy = yForValue(evt.measuredValue);
              const isGenuine = evt.isTrustedAlarm;
              return (
                <g
                  key={evt.id}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectStep(evt.step);
                    onSelectEvent(evt);
                  }}
                >
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isGenuine ? 5 : 4}
                    fill={isGenuine ? '#ef4444' : '#0f172a'}
                    stroke={isGenuine ? '#fecaca' : '#f59e0b'}
                    strokeWidth="2"
                  />
                </g>
              );
            })}

          {/* Selected Step Vertical Crosshair */}
          <line
            x1={xForStep(activeRow.step)}
            y1={padTop}
            x2={xForStep(activeRow.step)}
            y2={height - padBottom}
            stroke="#06b6d4"
            strokeWidth="1.5"
          />
        </svg>
      </div>

      {/* Step Scrubber & Per-Channel Snapshot Strip */}
      <div className="mt-4 pt-4 border-t border-white/[0.06] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <label
            htmlFor="time-step-scrubber"
            className="text-xs font-medium text-zinc-400 whitespace-nowrap shrink-0"
          >
            Time Scrubber
          </label>
          <input
            id="time-step-scrubber"
            type="range"
            min={0}
            max={stream.length - 1}
            value={activeRow.step}
            onChange={(e) => onSelectStep(Number(e.target.value))}
            className="w-full accent-white cursor-pointer"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs font-mono tabular-nums">
          {snapshotSensors.map((s, idx) => {
            const val = activeRow.readings[s.id];
            const trust = activeRow.trustScores[s.id] ?? 98;
            const label = activeRow.injectedLabels[s.id];
            return (
              <div
                key={s.id}
                className="px-2.5 py-1.5 bg-[#18181C] rounded-lg border border-white/[0.06] flex items-center justify-between gap-1.5"
              >
                <span
                  style={{ color: getSensorColor(s.id, idx) }}
                  className="font-semibold"
                >
                  {s.id}
                </span>
                <span className="text-zinc-100">
                  {val !== null && val !== undefined ? `${val.toFixed(1)}` : 'DROP'}
                </span>
                <span
                  className={
                    trust >= 80
                      ? 'text-emerald-400'
                      : trust >= 55
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }
                  title={formatFaultLabel(label)}
                >
                  {trust.toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
