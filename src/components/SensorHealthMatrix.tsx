import React, { useMemo, useState } from 'react';
import {
  SensorHealthSummary,
  SensorMeta,
  formatFaultLabel,
  formatMaintenanceLabel,
} from '../utils/sensorEngine';

interface SensorHealthMatrixProps {
  summaries: SensorHealthSummary[];
  sensors: SensorMeta[];
  correlationMatrix: Record<string, Record<string, number>>;
  selectedSensorId: string | null;
  onSelectSensor: (sensorId: string) => void;
}

export const SensorHealthMatrix: React.FC<SensorHealthMatrixProps> = ({
  summaries,
  sensors,
  correlationMatrix,
  selectedSensorId,
  onSelectSensor,
}) => {
  const [showFaultyOnly, setShowFaultyOnly] = useState(false);
  const unit = sensors[0]?.unit || 'gal';
  const isSeismic = unit === 'gal';

  const displayedSummaries = useMemo(() => {
    if (!showFaultyOnly) return summaries;
    return summaries.filter(
      (s) =>
        s.dominantFault !== 'NONE' ||
        s.trustScore < 85 ||
        s.sensorId === selectedSensorId
    );
  }, [summaries, showFaultyOnly, selectedSensorId]);

  const matrixSensors = useMemo(() => {
    const chosen: SensorMeta[] = [];
    const addIfMissing = (s?: SensorMeta) => {
      if (s && !chosen.some((c) => c.id === s.id) && chosen.length < 6) {
        chosen.push(s);
      }
    };

    if (selectedSensorId) {
      addIfMissing(sensors.find((s) => s.id === selectedSensorId));
    }
    for (const sum of summaries) {
      if (sum.dominantFault !== 'NONE') {
        addIfMissing(sensors.find((s) => s.id === sum.sensorId));
      }
    }
    for (const s of sensors) {
      addIfMissing(s);
    }
    return chosen;
  }, [sensors, summaries, selectedSensorId]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left 8 Cols: Per-Sensor Trust, Drift & Maintenance Table */}
      <div className="lg:col-span-8 bg-[#111114] border border-white/[0.08] rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
          <div>
            <h3 className="text-base sm:text-lg font-semibold tracking-tight text-white">
              {isSeismic
                ? `Station Health, Trust Score & Maintenance Routing (${sensors.length} Nodes)`
                : 'Sensor Health, Trust Score & Calibration Prognostics'}
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Continuous station trustworthiness assessment and automated field maintenance routing
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowFaultyOnly((p) => !p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                showFaultyOnly
                  ? 'bg-white text-zinc-950 border-white font-semibold'
                  : 'bg-[#18181C] border-white/[0.08] text-zinc-300 hover:text-white'
              }`}
            >
              {showFaultyOnly
                ? `Showing Anomalous (${displayedSummaries.length})`
                : 'Filter Anomalous Only'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[420px] overflow-y-auto mt-3 pr-1">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#111114] z-10">
              <tr className="border-b border-white/[0.08] text-xs font-medium text-zinc-400">
                <th className="py-3 pr-3 font-medium">Station</th>
                <th className="py-3 px-3 text-right font-medium">Reading</th>
                <th className="py-3 px-3 text-right font-medium">Consensus Δ</th>
                <th className="py-3 px-3 text-right font-medium">Drift / Hr</th>
                <th className="py-3 px-3 text-right font-medium">Trust Score</th>
                <th className="py-3 px-3 font-medium">State</th>
                <th className="py-3 pl-3 font-medium">Maintenance Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05] text-xs">
              {displayedSummaries.map((s) => {
                const isSelected = selectedSensorId === s.sensorId;
                const trustTone =
                  s.trustScore >= 80
                    ? 'text-emerald-400'
                    : s.trustScore >= 55
                    ? 'text-amber-400'
                    : 'text-rose-400';
                const statusGlyph =
                  s.trustScore >= 80 ? '●' : s.trustScore >= 55 ? '▲' : '✖';

                return (
                  <tr
                    key={s.sensorId}
                    onClick={() => onSelectSensor(s.sensorId)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-white/[0.07]'
                        : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <td className="py-3 pr-3">
                      <div className="font-mono font-semibold text-white">
                        {s.sensorId}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {s.sensorName}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-zinc-100">
                      {s.currentReading !== null
                        ? `${s.currentReading.toFixed(2)} ${unit}`
                        : 'Dropout'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-zinc-300">
                      {s.consensusDelta >= 0 ? '+' : ''}
                      {s.consensusDelta.toFixed(2)} {unit}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-zinc-300">
                      {s.driftRatePerHour >= 0 ? '+' : ''}
                      {s.driftRatePerHour.toFixed(2)} {unit}/h
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono tabular-nums font-semibold ${trustTone}`}
                    >
                      {statusGlyph} {s.trustScore.toFixed(1)}%
                    </td>
                    <td className="py-3 px-3 text-zinc-200">
                      {formatFaultLabel(s.dominantFault)}
                    </td>
                    <td className="py-3 pl-3">
                      <div
                        className={`font-medium ${
                          s.maintenanceAction === 'NOMINAL'
                            ? 'text-emerald-400'
                            : s.maintenanceAction === 'RECALIBRATE'
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {formatMaintenanceLabel(s.maintenanceAction)}
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        {s.recommendationReason}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right 4 Cols: Neighbouring Sensor Cross-Correlation Heatmap */}
      <div className="lg:col-span-4 bg-[#111114] border border-white/[0.08] rounded-2xl p-6 flex flex-col justify-between">
        <div>
          <div className="pb-4 border-b border-white/[0.07]">
            <h3 className="text-base sm:text-lg font-semibold tracking-tight text-white">
              Spatial Pearson Correlation (r)
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Genuine physical events preserve spatial coupling (r ≥ 0.75); isolated faults decouple
            </p>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse font-mono text-xs tabular-nums">
              <thead>
                <tr>
                  <th className="bg-[#18181C] border border-white/[0.06] p-2 text-center text-zinc-500">
                    r
                  </th>
                  {matrixSensors.map((s) => (
                    <th
                      key={s.id}
                      className="bg-[#18181C] border border-white/[0.06] p-2 text-center font-medium text-zinc-300"
                    >
                      {s.id}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixSensors.map((rowSensor) => (
                  <tr key={rowSensor.id}>
                    <td className="bg-[#18181C] border border-white/[0.06] p-2 text-center font-medium text-zinc-300">
                      {rowSensor.id}
                    </td>
                    {matrixSensors.map((colSensor) => {
                      const rVal =
                        correlationMatrix[rowSensor.id]?.[colSensor.id] ?? 0;
                      const isSelf = rowSensor.id === colSensor.id;
                      const cellBg = isSelf
                        ? 'bg-[#18181C] text-zinc-500'
                        : rVal >= 0.75
                        ? 'bg-emerald-500/15 text-emerald-300 font-medium'
                        : rVal >= 0.4
                        ? 'bg-amber-500/15 text-amber-200'
                        : 'bg-rose-500/15 text-rose-300';
                      return (
                        <td
                          key={`${rowSensor.id}-${colSensor.id}`}
                          className={`border border-white/[0.06] p-2 text-center ${cellBg}`}
                        >
                          {rVal.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center justify-between text-xs text-zinc-400">
          <span>■ r ≥ 0.75 Coupled</span>
          <span>·</span>
          <span>■ 0.40–0.74 Degraded</span>
          <span>·</span>
          <span>■ r &lt; 0.40 Decoupled</span>
        </div>
      </div>
    </div>
  );
};
