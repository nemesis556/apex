import React, { useState } from 'react';
import {
  DetectedEvent,
  SensorHealthSummary,
  BenchmarkMetrics,
  formatFaultLabel,
  formatMaintenanceLabel,
} from '../utils/sensorEngine';

interface ExplainableForensicsPanelProps {
  selectedEvent: DetectedEvent | null;
  scenarioTitle: string;
  sensorSummaries: SensorHealthSummary[];
  benchmark: BenchmarkMetrics;
  unit?: string;
}

interface HighThinkingResult {
  verdictHeadline: string;
  rootCauseAnalysis: string;
  trustAssessment: string;
  recommendedActions: string[];
  riskLevel: string;
}

export const ExplainableForensicsPanel: React.FC<ExplainableForensicsPanelProps> = ({
  selectedEvent,
  scenarioTitle,
  sensorSummaries,
  benchmark,
  unit = 'gal',
}) => {
  const [customQuery, setCustomQuery] = useState(
    'Analyze why the system suppressed single-station threshold crossings (e.g. Bhuj MEMS drift & Koyna highway truck spike) while preserving 100% sensitivity to the multi-station tectonic earthquake wave.'
  );
  const [isLoading, setIsLoading] = useState(false);
  const [aiResult, setAiResult] = useState<HighThinkingResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const runHighThinkingForensics = async (promptToRun?: string) => {
    const queryText = (promptToRun ?? customQuery).trim();
    if (!queryText) {
      setAiError('Please enter a diagnostic question before running analysis.');
      return;
    }

    setIsLoading(true);
    setAiError(null);

    try {
      const response = await fetch('/api/sensor-forensics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryText,
          scenarioTitle,
          selectedEvent,
          sensorSummaries,
          benchmark,
        }),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || `Server returned ${response.status}`);
      }
      setAiResult(data.analysis);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to reach Gemini 4 Argon endpoint.';
      setAiError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left 6 Cols: Deterministic Mathematical Explainable AI (XAI) Attribution */}
      <div className="lg:col-span-6 bg-[#111114] border border-white/[0.08] rounded-2xl p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
            <div>
              <h3 className="text-base sm:text-lg font-semibold tracking-tight text-white">
                Explainable AI (XAI) Decision Attribution
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Quantitative feature weights explaining why an abnormal reading was classified as Genuine or Faulty
              </p>
            </div>
            {selectedEvent && (
              <span className="text-xs font-mono text-zinc-300 whitespace-nowrap shrink-0">
                {selectedEvent.id} · {selectedEvent.confidence}% Confidence
              </span>
            )}
          </div>

          {selectedEvent ? (
            <div className="mt-4 space-y-4">
              {/* Verdict Banner */}
              <div className="p-4 bg-[#18181C] rounded-xl border border-white/[0.06]">
                <div className="flex items-center justify-between gap-2 text-xs font-medium">
                  <span
                    className={
                      selectedEvent.isTrustedAlarm
                        ? 'text-rose-400 font-semibold'
                        : 'text-amber-300 font-semibold'
                    }
                  >
                    {selectedEvent.isTrustedAlarm
                      ? '✖ Trusted Physical Alarm (Action Required)'
                      : '▲ False Alarm Suppressed (Station-Specific Fault)'}
                  </span>
                  <span className="font-mono text-zinc-400">
                    Step #{selectedEvent.step} ({selectedEvent.timestamp})
                  </span>
                </div>
                <p className="text-xs text-zinc-200 mt-2 leading-relaxed">
                  {selectedEvent.explanationSummary}
                </p>
                <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                  <span>
                    Classification:{' '}
                    <strong className="text-white font-medium">
                      {formatFaultLabel(selectedEvent.classification)}
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Routing:{' '}
                    <strong className="text-sky-400 font-medium">
                      {formatMaintenanceLabel(selectedEvent.maintenanceAction)}
                    </strong>
                  </span>
                </div>
              </div>

              {/* 4-Metric Attribution Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono tabular-nums">
                <div className="p-3.5 bg-[#18181C] rounded-xl border border-white/[0.06]">
                  <div className="text-xs font-sans text-zinc-400">Consensus Δ</div>
                  <div className="text-lg font-semibold text-white mt-1">
                    {selectedEvent.attribution.consensusDelta.toFixed(2)}
                    <span className="text-xs font-normal text-zinc-400 ml-1">
                      {unit}
                    </span>
                  </div>
                  <div className="text-[11px] font-sans text-zinc-400 mt-0.5">
                    vs. {selectedEvent.consensusValue.toFixed(2)} {unit}
                  </div>
                </div>

                <div className="p-3.5 bg-[#18181C] rounded-xl border border-white/[0.06]">
                  <div className="text-xs font-sans text-zinc-400">Station Corr (r)</div>
                  <div className="text-lg font-semibold text-white mt-1">
                    {selectedEvent.attribution.neighbourCorrelation.toFixed(2)}
                  </div>
                  <div className="text-[11px] font-sans text-zinc-400 mt-0.5">
                    {selectedEvent.attribution.neighbourCorrelation >= 0.7
                      ? 'Spatial agreement'
                      : 'Decoupled channel'}
                  </div>
                </div>

                <div className="p-3.5 bg-[#18181C] rounded-xl border border-white/[0.06]">
                  <div className="text-xs font-sans text-zinc-400">Impulse Z</div>
                  <div className="text-lg font-semibold text-white mt-1">
                    {selectedEvent.attribution.rateOfChangeZ.toFixed(1)}
                    <span className="text-xs font-normal text-zinc-400 ml-1">σ</span>
                  </div>
                  <div className="text-[11px] font-sans text-zinc-400 mt-0.5">
                    Rate-of-change Z
                  </div>
                </div>

                <div className="p-3.5 bg-[#18181C] rounded-xl border border-white/[0.06]">
                  <div className="text-xs font-sans text-zinc-400">Residual Noise</div>
                  <div className="text-lg font-semibold text-white mt-1">
                    {selectedEvent.attribution.rollingStdDev.toFixed(2)}
                    <span className="text-xs font-normal text-zinc-400 ml-1">
                      {unit}
                    </span>
                  </div>
                  <div className="text-[11px] font-sans text-zinc-400 mt-0.5">
                    Flatline run: {selectedEvent.attribution.zeroDeltaRun}
                  </div>
                </div>
              </div>

              {/* Primary & Secondary Physical Factors */}
              <div className="space-y-2.5 text-xs">
                <div className="p-3.5 bg-[#18181C] rounded-xl border border-white/[0.06]">
                  <span className="text-sky-400 font-semibold">
                    01. Primary Signature:{' '}
                  </span>
                  <span className="text-zinc-200">
                    {selectedEvent.attribution.primaryFactor}
                  </span>
                </div>
                <div className="p-3.5 bg-[#18181C] rounded-xl border border-white/[0.06]">
                  <span className="text-zinc-400 font-semibold">
                    02. Spatial Corroboration:{' '}
                  </span>
                  <span className="text-zinc-300">
                    {selectedEvent.attribution.secondaryFactor}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 p-6 text-center text-xs text-zinc-400 rounded-xl border border-white/[0.06] bg-[#18181C]">
              Select any detected event in the Alarm Ledger or click an anomaly point on the chart to inspect its XAI attribution.
            </div>
          )}
        </div>
      </div>

      {/* Right 6 Cols: Gemini 4 Argon (High Thinking) Deep Forensic Synthesis */}
      <div className="lg:col-span-6 bg-[#111114] border border-white/[0.08] rounded-2xl p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
            <div>
              <h3 className="text-base sm:text-lg font-semibold tracking-tight text-white">
                Deep Reasoning Sensor Forensics
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Multi-step root-cause reasoning over multivariate drift, spatial correlation, and failure modes
              </p>
            </div>
            <span className="text-xs font-mono text-zinc-400 whitespace-nowrap shrink-0">
              High-Thinking Engine
            </span>
          </div>

          <div className="mt-4 space-y-3.5">
            <label
              htmlFor="forensic-query-input"
              className="block text-xs font-medium text-zinc-300"
            >
              Diagnostic Engineering Query
            </label>
            <textarea
              id="forensic-query-input"
              rows={2}
              value={customQuery}
              onChange={(e) => setCustomQuery(e.target.value)}
              className="w-full bg-[#18181C] border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 focus:outline-none focus:border-white/30"
              placeholder="Ask a question about multi-station drift, false-alarm suppression, or recalibration intervals..."
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const q =
                      'Compare S-02 (Bhuj) drift slope against the network consensus and determine whether S-02 can be software-compensated or requires physical zero-point recalibration.';
                    setCustomQuery(q);
                    runHighThinkingForensics(q);
                  }}
                  className="px-3 py-1.5 text-xs bg-[#18181C] hover:bg-white/[0.08] text-zinc-300 border border-white/[0.08] rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Evaluate Software Compensation
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const q =
                      'Audit false-alarm risk if a second station simultaneously develops stuck-at freeze during a genuine tectonic P-wave event.';
                    setCustomQuery(q);
                    runHighThinkingForensics(q);
                  }}
                  className="px-3 py-1.5 text-xs bg-[#18181C] hover:bg-white/[0.08] text-zinc-300 border border-white/[0.08] rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Dual-Fault Failure Audit
                </button>
              </div>

              <button
                type="button"
                disabled={isLoading}
                onClick={() => runHighThinkingForensics()}
                className="px-4 py-2 text-xs font-semibold bg-white hover:bg-zinc-200 disabled:opacity-50 text-zinc-950 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {isLoading ? 'Running Analysis...' : 'Run Forensic Analysis'}
              </button>
            </div>
          </div>

          {/* Output Area */}
          <div className="mt-4">
            {isLoading && (
              <div className="p-4 bg-[#18181C] rounded-xl border border-white/[0.06] space-y-2 animate-pulse">
                <div className="h-3.5 bg-zinc-800 rounded w-2/3" />
                <div className="h-3 bg-zinc-800 rounded w-full" />
                <div className="h-3 bg-zinc-800 rounded w-5/6" />
              </div>
            )}

            {!isLoading && aiError && (
              <div className="p-4 bg-rose-500/10 rounded-xl border border-rose-500/30 text-xs text-rose-200 space-y-1.5">
                <div className="font-medium text-rose-300">
                  ✖ Live Gemini API Notice: {aiError}
                </div>
                <p className="text-zinc-300">
                  Deterministic XAI mathematical attribution on the left remains 100% active.
                </p>
              </div>
            )}

            {!isLoading && aiResult && (
              <div className="p-4 bg-[#18181C] rounded-xl border border-white/[0.06] space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
                  <span className="font-semibold text-sky-400">
                    {aiResult.verdictHeadline}
                  </span>
                  <span className="font-mono text-zinc-400">
                    {aiResult.riskLevel}
                  </span>
                </div>
                <p className="text-zinc-200 leading-relaxed">
                  {aiResult.rootCauseAnalysis}
                </p>
                <p className="text-zinc-300 leading-relaxed">
                  <strong className="text-white">Trust Assessment: </strong>
                  {aiResult.trustAssessment}
                </p>
                {aiResult.recommendedActions?.length > 0 && (
                  <div className="pt-2 border-t border-white/[0.06]">
                    <div className="text-xs font-medium text-zinc-400 mb-1">
                      Recommended Engineering Actions
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-zinc-200">
                      {aiResult.recommendedActions.map((act, idx) => (
                        <li key={idx}>{act}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
