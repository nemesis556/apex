import React, { useState } from 'react';
import {
  FaultType,
  ScenarioConfig,
  SensorMeta,
  DEFAULT_SENSORS,
  formatFaultLabel,
} from '../utils/sensorEngine';

interface DatasetSynthesisModalProps {
  currentScenario: ScenarioConfig;
  sensors?: SensorMeta[];
  onApplyCustomScenario: (scenario: ScenarioConfig) => void;
  onExportCsv: () => void;
}

const FAULT_OPTIONS: FaultType[] = [
  'OFFSET_DRIFT',
  'RANDOM_SPIKE',
  'STUCK_AT',
  'EXCESSIVE_NOISE',
  'DROPOUT',
  'GAIN_ERROR',
  'GENUINE_EVENT',
];

export const DatasetSynthesisPanel: React.FC<DatasetSynthesisModalProps> = ({
  currentScenario,
  sensors = DEFAULT_SENSORS,
  onApplyCustomScenario,
  onExportCsv,
}) => {
  const [sensorId, setSensorId] = useState<string>('S-02');
  const [faultType, setFaultType] = useState<FaultType>('OFFSET_DRIFT');
  const [startStep, setStartStep] = useState<number>(16);
  const [endStep, setEndStep] = useState<number>(48);
  const [magnitude, setMagnitude] = useState<number>(4.5);
  const [noiseLevel, setNoiseLevel] = useState<number>(currentScenario.noiseLevel);
  const [validationError, setValidationError] = useState<string | null>(null);

  const unit = sensors[0]?.unit || 'gal';

  const handleAddFaultInjection = (e: React.FormEvent) => {
    e.preventDefault();
    if (startStep < 0 || endStep >= currentScenario.steps || startStep >= endStep) {
      setValidationError(
        `Invalid window: Start step (${startStep}) must be less than End step (${endStep}) within [0, ${currentScenario.steps - 1}].`
      );
      return;
    }
    if (Number.isNaN(magnitude) || magnitude <= 0 || magnitude > 15) {
      setValidationError('Fault magnitude must be between 0.1 and 15.0.');
      return;
    }

    setValidationError(null);
    const targetSensor = faultType === 'GENUINE_EVENT' ? 'ALL' : sensorId;
    const updatedScenario: ScenarioConfig = {
      ...currentScenario,
      id: 'custom-synthesised',
      title: 'Custom Synthesised Fault & Event Stream',
      subtitle: `${currentScenario.injections.length + 1} active fault/event injections · σ = ${noiseLevel.toFixed(2)} ${unit}`,
      noiseLevel,
      injections: [
        ...currentScenario.injections,
        {
          sensorId: targetSensor,
          faultType,
          startStep,
          endStep,
          magnitude,
        },
      ],
    };
    onApplyCustomScenario(updatedScenario);
  };

  const handleRemoveInjection = (idx: number) => {
    const updated: ScenarioConfig = {
      ...currentScenario,
      id: 'custom-synthesised',
      injections: currentScenario.injections.filter((_, i) => i !== idx),
    };
    onApplyCustomScenario(updated);
  };

  return (
    <div className="bg-[#111114] border border-white/[0.08] rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 pb-3.5 border-b border-white/[0.07]">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-white">
            Synthetic Fault Injector
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Inject custom station faults or multi-station physical events
          </p>
        </div>
        <button
          type="button"
          onClick={onExportCsv}
          className="px-3 py-1.5 text-xs font-medium bg-[#18181C] hover:bg-white/[0.1] text-zinc-200 border border-white/[0.08] rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          Export Stream CSV
        </button>
      </div>

      <form onSubmit={handleAddFaultInjection} className="space-y-3.5 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="fault-sensor-select" className="block text-zinc-400 mb-1.5">
              Target Station
            </label>
            <select
              id="fault-sensor-select"
              value={faultType === 'GENUINE_EVENT' ? 'ALL' : sensorId}
              disabled={faultType === 'GENUINE_EVENT'}
              onChange={(e) => setSensorId(e.target.value)}
              className="w-full bg-[#18181C] border border-white/[0.1] rounded-lg px-2.5 py-2 text-zinc-100 font-mono focus:outline-none focus:border-white/30"
            >
              {sensors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} ({s.city || s.name.split('(')[1]?.replace(')', '') || s.id})
                </option>
              ))}
              <option value="ALL">ALL STATIONS (Tectonic / Vault Event)</option>
            </select>
          </div>

          <div>
            <label htmlFor="fault-type-select" className="block text-zinc-400 mb-1.5">
              Abnormality Pattern
            </label>
            <select
              id="fault-type-select"
              value={faultType}
              onChange={(e) => setFaultType(e.target.value as FaultType)}
              className="w-full bg-[#18181C] border border-white/[0.1] rounded-lg px-2.5 py-2 text-zinc-100 focus:outline-none focus:border-white/30"
            >
              {FAULT_OPTIONS.map((ft) => (
                <option key={ft} value={ft}>
                  {formatFaultLabel(ft)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5 font-mono tabular-nums">
          <div>
            <label htmlFor="fault-start-step" className="block font-sans text-zinc-400 mb-1.5 text-xs">
              Start Step
            </label>
            <input
              id="fault-start-step"
              type="number"
              value={startStep}
              onChange={(e) => setStartStep(Number(e.target.value))}
              className="w-full bg-[#18181C] border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-zinc-100 focus:outline-none focus:border-white/30"
            />
          </div>
          <div>
            <label htmlFor="fault-end-step" className="block font-sans text-zinc-400 mb-1.5 text-xs">
              End Step
            </label>
            <input
              id="fault-end-step"
              type="number"
              value={endStep}
              onChange={(e) => setEndStep(Number(e.target.value))}
              className="w-full bg-[#18181C] border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-zinc-100 focus:outline-none focus:border-white/30"
            />
          </div>
          <div>
            <label htmlFor="fault-magnitude" className="block font-sans text-zinc-400 mb-1.5 text-xs">
              Magnitude ({unit})
            </label>
            <input
              id="fault-magnitude"
              type="number"
              step="0.1"
              value={magnitude}
              onChange={(e) => setMagnitude(Number(e.target.value))}
              className="w-full bg-[#18181C] border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-zinc-100 focus:outline-none focus:border-white/30"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5">
            <label htmlFor="base-noise-slider">Ambient Gaussian Noise (σ)</label>
            <span className="font-mono text-zinc-200">
              {noiseLevel.toFixed(2)} {unit}
            </span>
          </div>
          <input
            id="base-noise-slider"
            type="range"
            min="0.05"
            max="0.60"
            step="0.01"
            value={noiseLevel}
            onChange={(e) => setNoiseLevel(Number(e.target.value))}
            className="w-full accent-white cursor-pointer"
          />
        </div>

        {validationError && (
          <div className="p-2.5 bg-rose-500/15 border border-rose-500/30 rounded-lg text-rose-200 text-xs">
            {validationError}
          </div>
        )}

        <button
          type="submit"
          className="w-full py-2.5 px-4 bg-white hover:bg-zinc-200 text-zinc-950 font-semibold rounded-lg transition-colors whitespace-nowrap"
        >
          Inject Pattern &amp; Recompute Stream
        </button>
      </form>

      {/* Active Injections List */}
      <div className="pt-3.5 border-t border-white/[0.06] space-y-2">
        <div className="text-xs text-zinc-400">
          Active Injected Conditions ({currentScenario.injections.length})
        </div>
        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
          {currentScenario.injections.map((inj, idx) => (
            <div
              key={`${inj.sensorId}-${inj.faultType}-${idx}`}
              className="flex items-center justify-between gap-2 p-2.5 bg-[#18181C] rounded-lg border border-white/[0.06] text-xs font-mono"
            >
              <div className="truncate">
                <span className="text-white font-semibold">{inj.sensorId}</span>
                <span className="mx-1.5 text-zinc-500">·</span>
                <span className="text-zinc-200 font-sans">{formatFaultLabel(inj.faultType)}</span>
                <span className="mx-1.5 text-zinc-500">·</span>
                <span className="text-zinc-400">
                  T+{inj.startStep}–{inj.endStep} (+{inj.magnitude} {unit})
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveInjection(idx)}
                aria-label={`Remove ${inj.sensorId} ${inj.faultType} injection`}
                className="text-zinc-400 hover:text-rose-400 px-1.5 py-0.5 text-xs font-sans whitespace-nowrap shrink-0"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
