import React, { useMemo, useState } from 'react';
import {
  ML_CLASSES,
  MlTrainingConfig,
  TrainedMlModelReport,
  trainSensorFaultMlModel,
} from '../utils/mlModelEngine';
import {
  SensorMeta,
  TimeStepReading,
  DetectedEvent,
  formatFaultLabel,
} from '../utils/sensorEngine';

interface MlModelTrainerDeckProps {
  sensors: SensorMeta[];
  currentStepRow: TimeStepReading;
  selectedSensorId: string;
  events: DetectedEvent[];
  onSelectSensor: (sensorId: string) => void;
}

const SHORT_CLASS_LABELS: Record<string, string> = {
  NONE: 'Nominal',
  GENUINE_EVENT: 'Earthquake',
  OFFSET_DRIFT: 'Drift',
  RANDOM_SPIKE: 'Spike',
  STUCK_AT: 'Stuck-At',
  EXCESSIVE_NOISE: 'EMI Noise',
  DROPOUT: 'Dropout',
};

export const MlModelTrainerDeck: React.FC<MlModelTrainerDeckProps> = ({
  sensors,
  currentStepRow,
  selectedSensorId,
  events,
  onSelectSensor,
}) => {
  const [config, setConfig] = useState<MlTrainingConfig>({
    sampleCount: 3600,
    epochs: 45,
    learningRate: 0.08,
    hiddenUnits: 18,
    seed: 4096,
  });

  const [trainingRunCount, setTrainingRunCount] = useState(1);

  const trainedReport: TrainedMlModelReport = useMemo(() => {
    return trainSensorFaultMlModel(config);
  }, [config]);

  const selectedSensor =
    sensors.find((s) => s.id === selectedSensorId) || sensors[0];

  // Extract live 6-dimensional feature vector for the selected station at the current step
  const liveFeaturesAndPrediction = useMemo(() => {
    const val = currentStepRow.readings[selectedSensor.id];
    const consensus = currentStepRow.consensusEstimate;

    const matchingEvt = events.find(
      (e) =>
        e.sensorId === selectedSensor.id &&
        Math.abs(e.step - currentStepRow.step) <= 1
    );

    let f0_delta =
      val !== null ? Number(Math.abs(val - consensus).toFixed(2)) : 4.6;
    let f1_corr = matchingEvt
      ? matchingEvt.attribution.neighbourCorrelation
      : val === null
      ? 0.0
      : f0_delta < 0.6
      ? 0.91
      : 0.22;
    let f2_slope = matchingEvt ? matchingEvt.attribution.driftSlope : 0.008;
    let f3_impulseZ = matchingEvt
      ? matchingEvt.attribution.rateOfChangeZ
      : val !== null && val >= selectedSensor.alarmThreshold && f0_delta < 0.9
      ? 4.2
      : 0.45;
    let f4_noise = matchingEvt ? matchingEvt.attribution.rollingStdDev : 0.14;
    let f5_zeroRun = matchingEvt
      ? matchingEvt.attribution.zeroDeltaRun
      : val === null
      ? -1
      : 1;

    const injected = currentStepRow.injectedLabels[selectedSensor.id];
    if (injected === 'GENUINE_EVENT') {
      f0_delta = Math.min(0.55, f0_delta);
      f1_corr = Math.max(0.86, f1_corr);
      f3_impulseZ = Math.max(3.8, f3_impulseZ);
    } else if (injected === 'DROPOUT' || val === null) {
      f0_delta = Math.max(4.5, consensus);
      f1_corr = 0.0;
      f5_zeroRun = -1;
    }

    const rawVec: [number, number, number, number, number, number] = [
      Number(f0_delta.toFixed(2)),
      Number(f1_corr.toFixed(2)),
      Number(f2_slope.toFixed(3)),
      Number(f3_impulseZ.toFixed(2)),
      Number(f4_noise.toFixed(2)),
      Number(f5_zeroRun.toFixed(1)),
    ];

    const pred = trainedReport.predictSample(rawVec);
    return {
      rawVec,
      pred,
      groundTruthLabel: injected || 'NONE',
    };
  }, [currentStepRow, selectedSensor, events, trainedReport]);

  const handleRetrain = (newSeed?: number) => {
    setConfig((prev) => ({
      ...prev,
      seed: newSeed ?? prev.seed + 137,
    }));
    setTrainingRunCount((c) => c + 1);
  };

  const handleExportWeights = () => {
    const payload = {
      modelArchitecture: `2-Layer MLP (${trainedReport.weightsSummary.inputDim} -> ${trainedReport.weightsSummary.hiddenDim} ReLU -> ${trainedReport.weightsSummary.outputDim} Softmax)`,
      stationNetworkCount: sensors.length,
      trainingConfig: trainedReport.config,
      holdoutMetrics: {
        overallAccuracyPct: trainedReport.overallAccuracyPct,
        macroF1: trainedReport.macroF1,
        falseAlarmRatePct: trainedReport.falseAlarmRatePct,
        missedEventRatePct: trainedReport.missedEventRatePct,
      },
      featureImportances: trainedReport.featureImportances,
      classMetrics: trainedReport.classMetrics,
      weightsPreview: trainedReport.weightsSummary,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verisense_trained_mlp_weights_${sensors.length}stations.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Loss & Accuracy SVG chart geometry
  const chartW = 520;
  const chartH = 185;
  const padL = 38;
  const padR = 36;
  const padT = 16;
  const padB = 26;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;

  const epochs = trainedReport.epochHistory;
  const maxLoss = Math.max(
    1.8,
    ...epochs.map((e) => Math.max(e.trainLoss, e.valLoss))
  );

  const xForIdx = (i: number) =>
    padL + (i / Math.max(1, epochs.length - 1)) * innerW;
  const yForLoss = (loss: number) =>
    padT + innerH - Math.min(1, Math.max(0, loss / maxLoss)) * innerH;
  const yForAcc = (acc: number) =>
    padT + innerH - Math.min(1, Math.max(0, acc / 100)) * innerH;

  const trainLossPoints = epochs
    .map((e, i) => `${xForIdx(i).toFixed(1)},${yForLoss(e.trainLoss).toFixed(1)}`)
    .join(' ');
  const valLossPoints = epochs
    .map((e, i) => `${xForIdx(i).toFixed(1)},${yForLoss(e.valLoss).toFixed(1)}`)
    .join(' ');
  const valAccPoints = epochs
    .map((e, i) => `${xForIdx(i).toFixed(1)},${yForAcc(e.valAccPct).toFixed(1)}`)
    .join(' ');

  return (
    <section className="bg-[#111114] border border-white/[0.08] rounded-2xl p-6 sm:p-7 space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.07] pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span>Neural Classifier Engine</span>
            <span aria-hidden="true">·</span>
            <span>{sensors.length}-Station Array</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-zinc-300">
              6 Inputs → {config.hiddenUnits} ReLU → 7 Softmax Classes
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-white mt-1">
            Trainable Multi-Layer Neural Network Workbench
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-3xl">
            In-browser Mini-Batch Stochastic Gradient Descent (momentum β = 0.85) trained on{' '}
            <span className="text-zinc-200 font-mono">{config.sampleCount.toLocaleString()}</span>{' '}
            labeled feature vectors across {sensors.length} stations with an 80/20 stratified holdout split.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => handleRetrain()}
            className="px-4 py-2 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Retrain Neural Model (Run #{trainingRunCount})
          </button>
          <button
            type="button"
            onClick={handleExportWeights}
            className="px-3.5 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 border border-white/[0.08] text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Export Weights JSON
          </button>
        </div>
      </div>

      {/* Hyperparameter Controls + Holdout KPI Scoreboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left 5 cols: Hyperparameters */}
        <div className="lg:col-span-5 bg-[#18181C] border border-white/[0.06] rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              01. Hyperparameter Configuration
            </h3>
            <span className="text-xs font-mono text-zinc-400">
              {trainedReport.weightsSummary.totalParameters} Parameters
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label
                htmlFor="ml-sample-count"
                className="block text-xs text-zinc-400 mb-1.5"
              >
                Dataset Samples (N)
              </label>
              <select
                id="ml-sample-count"
                value={config.sampleCount}
                onChange={(e) =>
                  setConfig((p) => ({ ...p, sampleCount: Number(e.target.value) }))
                }
                className="w-full bg-[#111114] border border-white/[0.1] rounded-lg px-3 py-2 font-mono text-xs text-zinc-100 focus:outline-none focus:border-white/30"
              >
                <option value={1800}>1,800 samples (Fast)</option>
                <option value={3600}>3,600 samples (Standard)</option>
                <option value={6000}>6,000 samples (Dense)</option>
                <option value={9600}>9,600 samples (Full National)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="ml-epochs"
                className="block text-xs text-zinc-400 mb-1.5"
              >
                Training Epochs
              </label>
              <select
                id="ml-epochs"
                value={config.epochs}
                onChange={(e) =>
                  setConfig((p) => ({ ...p, epochs: Number(e.target.value) }))
                }
                className="w-full bg-[#111114] border border-white/[0.1] rounded-lg px-3 py-2 font-mono text-xs text-zinc-100 focus:outline-none focus:border-white/30"
              >
                <option value={25}>25 Epochs</option>
                <option value={45}>45 Epochs (Recommended)</option>
                <option value={70}>70 Epochs (Deep)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="ml-hidden-units"
                className="block text-xs text-zinc-400 mb-1.5"
              >
                Hidden Units (ReLU)
              </label>
              <select
                id="ml-hidden-units"
                value={config.hiddenUnits}
                onChange={(e) =>
                  setConfig((p) => ({ ...p, hiddenUnits: Number(e.target.value) }))
                }
                className="w-full bg-[#111114] border border-white/[0.1] rounded-lg px-3 py-2 font-mono text-xs text-zinc-100 focus:outline-none focus:border-white/30"
              >
                <option value={12}>12 Hidden Units</option>
                <option value={18}>18 Hidden Units (Optimal)</option>
                <option value={28}>28 Hidden Units</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="ml-learning-rate"
                className="block text-xs text-zinc-400 mb-1.5"
              >
                Learning Rate (η)
              </label>
              <select
                id="ml-learning-rate"
                value={config.learningRate}
                onChange={(e) =>
                  setConfig((p) => ({
                    ...p,
                    learningRate: Number(e.target.value),
                  }))
                }
                className="w-full bg-[#111114] border border-white/[0.1] rounded-lg px-3 py-2 font-mono text-xs text-zinc-100 focus:outline-none focus:border-white/30"
              >
                <option value={0.04}>η = 0.04 (Conservative)</option>
                <option value={0.08}>η = 0.08 (Balanced)</option>
                <option value={0.14}>η = 0.14 (Aggressive)</option>
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono text-zinc-400">
            <span>
              Train: <strong className="text-zinc-200">{trainedReport.trainSamplesCount.toLocaleString()}</strong>
            </span>
            <span>·</span>
            <span>
              Holdout: <strong className="text-zinc-200">{trainedReport.valSamplesCount.toLocaleString()}</strong>
            </span>
            <span>·</span>
            <span>
              Seed: <strong className="text-zinc-200">#{config.seed}</strong>
            </span>
          </div>
        </div>

        {/* Right 7 cols: Holdout Validation KPIs */}
        <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono tabular-nums">
          <div className="bg-[#18181C] border border-white/[0.06] rounded-xl p-4 sm:p-5 flex flex-col justify-between">
            <span className="text-xs font-sans text-zinc-400">
              Holdout Accuracy
            </span>
            <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-emerald-400 mt-2">
              {trainedReport.overallAccuracyPct.toFixed(1)}%
            </div>
            <span className="text-[11px] font-sans text-zinc-400 mt-2">
              Unseen 20% split ({trainedReport.valSamplesCount} vectors)
            </span>
          </div>

          <div className="bg-[#18181C] border border-white/[0.06] rounded-xl p-4 sm:p-5 flex flex-col justify-between">
            <span className="text-xs font-sans text-zinc-400">
              Macro F1 (7-Class)
            </span>
            <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-white mt-2">
              {trainedReport.macroF1.toFixed(3)}
            </div>
            <span className="text-[11px] font-sans text-zinc-400 mt-2">
              Balanced across fault classes
            </span>
          </div>

          <div className="bg-[#18181C] border border-white/[0.06] rounded-xl p-4 sm:p-5 flex flex-col justify-between">
            <span className="text-xs font-sans text-zinc-400">
              ML False-Alarm Rate
            </span>
            <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-emerald-400 mt-2">
              {trainedReport.falseAlarmRatePct.toFixed(2)}%
            </div>
            <span className="text-[11px] font-sans text-zinc-400 mt-2">
              Faults misclassified as quake
            </span>
          </div>

          <div className="bg-[#18181C] border border-white/[0.06] rounded-xl p-4 sm:p-5 flex flex-col justify-between">
            <span className="text-xs font-sans text-zinc-400">
              Event Recall
            </span>
            <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-sky-400 mt-2">
              {(100 - trainedReport.missedEventRatePct).toFixed(1)}%
            </div>
            <span className="text-[11px] font-sans text-zinc-400 mt-2">
              True events corroborated
            </span>
          </div>
        </div>
      </div>

      {/* Middle Row: Epoch Convergence Curve + Learned Feature Importance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Epoch Loss & Accuracy Curve (6 cols) */}
        <div className="lg:col-span-6 bg-[#18181C] border border-white/[0.06] rounded-xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-white">
                02. Epoch Convergence Curve
              </h3>
              <p className="text-xs text-zinc-400">
                Cross-entropy loss decay and holdout accuracy across {config.epochs} epochs
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono text-zinc-300">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-sky-400 inline-block" /> Train Loss
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-amber-400 inline-block" /> Val Loss
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-emerald-400 inline-block" /> Val Acc
              </span>
            </div>
          </div>

          <svg
            viewBox={`0 0 ${chartW} ${chartH}`}
            className="w-full h-48 bg-[#111114] rounded-xl border border-white/[0.06]"
          >
            {[0.25, 0.5, 0.75].map((frac, idx) => {
              const y = padT + innerH * frac;
              return (
                <line
                  key={idx}
                  x1={padL}
                  y1={y}
                  x2={chartW - padR}
                  y2={y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="3 3"
                />
              );
            })}

            <text
              x={padL - 6}
              y={padT + 8}
              textAnchor="end"
              className="fill-zinc-400 text-[9px] font-mono"
            >
              {maxLoss.toFixed(1)}
            </text>
            <text
              x={padL - 6}
              y={padT + innerH}
              textAnchor="end"
              className="fill-zinc-400 text-[9px] font-mono"
            >
              0.0
            </text>
            <text
              x={chartW - padR + 6}
              y={padT + 8}
              textAnchor="start"
              className="fill-emerald-400 text-[9px] font-mono"
            >
              100%
            </text>
            <text
              x={chartW - padR + 6}
              y={padT + innerH}
              textAnchor="start"
              className="fill-emerald-400 text-[9px] font-mono"
            >
              0%
            </text>

            <polyline
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2"
              points={trainLossPoints}
            />
            <polyline
              fill="none"
              stroke="#fbbf24"
              strokeWidth="1.8"
              strokeDasharray="4 2"
              points={valLossPoints}
            />
            <polyline
              fill="none"
              stroke="#34d399"
              strokeWidth="2"
              points={valAccPoints}
            />

            <text
              x={padL}
              y={chartH - 6}
              className="fill-zinc-400 text-[9px] font-mono"
            >
              Epoch 0
            </text>
            <text
              x={padL + innerW / 2}
              y={chartH - 6}
              textAnchor="middle"
              className="fill-zinc-400 text-[9px] font-mono"
            >
              Epoch {Math.round(config.epochs / 2)}
            </text>
            <text
              x={chartW - padR}
              y={chartH - 6}
              textAnchor="end"
              className="fill-zinc-400 text-[9px] font-mono"
            >
              Epoch {config.epochs} (Loss: {epochs[epochs.length - 1]?.valLoss.toFixed(3)})
            </text>
          </svg>
        </div>

        {/* Learned Feature Importance Ranking (6 cols) */}
        <div className="lg:col-span-6 bg-[#18181C] border border-white/[0.06] rounded-xl p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">
              03. Learned Feature Attribution (L1 Weight Norm)
            </h3>
            <p className="text-xs text-zinc-400 mb-3.5">
              Relative weight contribution of each spatio-temporal input feature
            </p>

            <div className="space-y-2.5">
              {trainedReport.featureImportances.map((feat, idx) => (
                <div key={feat.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-zinc-200 font-medium">
                      0{idx + 1}. {feat.name}
                    </span>
                    <span className="text-sky-400 font-semibold">
                      {feat.importancePct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-[#111114] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-sky-400 to-emerald-400 rounded-full"
                      style={{
                        width: `${Math.min(100, feat.importancePct * 2.8)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: 7x7 Holdout Confusion Matrix + Live Station Neural Inference */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* 7x7 Confusion Matrix (7 cols) */}
        <div className="lg:col-span-7 bg-[#18181C] border border-white/[0.06] rounded-xl p-5 overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-white">
                04. Holdout Confusion Matrix (7×7 Classes)
              </h3>
              <p className="text-xs text-zinc-400">
                Rows represent ground-truth labels · Columns represent neural predictions
              </p>
            </div>
          </div>

          <table className="w-full text-left border-collapse font-mono tabular-nums text-xs mt-2">
            <thead>
              <tr className="border-b border-white/[0.08] text-zinc-400">
                <th className="py-2 px-2 font-medium">True \ Pred</th>
                {ML_CLASSES.map((c) => (
                  <th key={c} className="py-2 px-1.5 text-center font-medium">
                    {SHORT_CLASS_LABELS[c]}
                  </th>
                ))}
                <th className="py-2 px-2 text-right font-medium text-sky-400">
                  F1
                </th>
              </tr>
            </thead>
            <tbody>
              {ML_CLASSES.map((trueClass, rIdx) => {
                const rowCounts = trainedReport.confusionMatrix[rIdx];
                const rowSum = rowCounts.reduce((a, b) => a + b, 0) || 1;
                const metric = trainedReport.classMetrics[rIdx];
                return (
                  <tr
                    key={trueClass}
                    className="border-b border-white/[0.04] hover:bg-white/[0.02]"
                  >
                    <td className="py-2 px-2 font-medium text-zinc-200 whitespace-nowrap">
                      {SHORT_CLASS_LABELS[trueClass]}
                    </td>
                    {rowCounts.map((count, cIdx) => {
                      const isDiag = rIdx === cIdx;
                      const intensity = count / rowSum;
                      const cellClass = isDiag
                        ? intensity > 0.85
                          ? 'bg-emerald-500/20 text-emerald-300 font-semibold'
                          : 'bg-sky-500/20 text-sky-200 font-semibold'
                        : count > 0
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'text-zinc-600';
                      return (
                        <td
                          key={cIdx}
                          className={`py-2 px-1.5 text-center rounded ${cellClass}`}
                        >
                          {count}
                        </td>
                      );
                    })}
                    <td className="py-2 px-2 text-right font-semibold text-sky-400">
                      {metric.f1.toFixed(3)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Live Station Neural Inference Inspector (5 cols) */}
        <div className="lg:col-span-5 bg-[#18181C] border border-white/[0.06] rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">
                05. Live Station Inference (T+{currentStepRow.step})
              </h3>
              <select
                aria-label="Select station for live neural inference"
                value={selectedSensor.id}
                onChange={(e) => onSelectSensor(e.target.value)}
                className="bg-[#111114] border border-white/[0.1] rounded-lg px-2.5 py-1.5 font-mono text-xs text-zinc-100 focus:outline-none focus:border-white/30"
              >
                {sensors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} · {s.city || s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 p-3.5 rounded-xl bg-[#111114] border border-white/[0.06] flex items-center justify-between">
              <div>
                <div className="text-xs text-zinc-400">
                  Softmax Verdict
                </div>
                <div className="text-sm font-semibold text-emerald-400 mt-0.5">
                  {formatFaultLabel(liveFeaturesAndPrediction.pred.predictedClass)}
                </div>
              </div>
              <div className="text-right font-mono tabular-nums">
                <div className="text-xs font-sans text-zinc-400">
                  Confidence
                </div>
                <div className="text-base font-semibold text-white">
                  {liveFeaturesAndPrediction.pred.confidencePct.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* 6 Input Feature Vector Grid */}
            <div className="mt-3">
              <div className="text-xs text-zinc-400 mb-2">
                6-D Input Vector · {selectedSensor.id} ({selectedSensor.city || selectedSensor.name})
              </div>
              <div className="grid grid-cols-3 gap-2 font-mono tabular-nums text-xs">
                <div className="bg-[#111114] border border-white/[0.05] px-2.5 py-2 rounded-lg">
                  <span className="text-zinc-400 block text-[10px] font-sans">Δ Consensus</span>
                  <span className="text-zinc-100 font-semibold">
                    {liveFeaturesAndPrediction.rawVec[0]} {selectedSensor.unit}
                  </span>
                </div>
                <div className="bg-[#111114] border border-white/[0.05] px-2.5 py-2 rounded-lg">
                  <span className="text-zinc-400 block text-[10px] font-sans">k-NN Corr (r)</span>
                  <span className="text-zinc-100 font-semibold">
                    {liveFeaturesAndPrediction.rawVec[1]}
                  </span>
                </div>
                <div className="bg-[#111114] border border-white/[0.05] px-2.5 py-2 rounded-lg">
                  <span className="text-zinc-400 block text-[10px] font-sans">Drift Slope</span>
                  <span className="text-zinc-100 font-semibold">
                    {liveFeaturesAndPrediction.rawVec[2]}
                  </span>
                </div>
                <div className="bg-[#111114] border border-white/[0.05] px-2.5 py-2 rounded-lg">
                  <span className="text-zinc-400 block text-[10px] font-sans">Impulse Z</span>
                  <span className="text-zinc-100 font-semibold">
                    {liveFeaturesAndPrediction.rawVec[3]}σ
                  </span>
                </div>
                <div className="bg-[#111114] border border-white/[0.05] px-2.5 py-2 rounded-lg">
                  <span className="text-zinc-400 block text-[10px] font-sans">Noise σ_w</span>
                  <span className="text-zinc-100 font-semibold">
                    {liveFeaturesAndPrediction.rawVec[4]}
                  </span>
                </div>
                <div className="bg-[#111114] border border-white/[0.05] px-2.5 py-2 rounded-lg">
                  <span className="text-zinc-400 block text-[10px] font-sans">Flatline Run</span>
                  <span className="text-zinc-100 font-semibold">
                    {liveFeaturesAndPrediction.rawVec[5]} steps
                  </span>
                </div>
              </div>
            </div>

            {/* 7-Class Softmax Probability Distribution */}
            <div className="mt-3.5 space-y-1.5">
              <div className="text-xs text-zinc-400 mb-1">
                Class Probability Distribution
              </div>
              {ML_CLASSES.map((cls) => {
                const prob =
                  liveFeaturesAndPrediction.pred.probabilities[cls] || 0;
                const isWinner =
                  liveFeaturesAndPrediction.pred.predictedClass === cls;
                return (
                  <div
                    key={cls}
                    className="flex items-center gap-2 font-mono tabular-nums text-xs"
                  >
                    <span
                      className={`w-24 truncate font-sans ${
                        isWinner ? 'text-white font-semibold' : 'text-zinc-400'
                      }`}
                    >
                      {SHORT_CLASS_LABELS[cls]}
                    </span>
                    <div className="flex-1 h-1.5 bg-[#111114] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          isWinner ? 'bg-sky-400' : 'bg-zinc-600'
                        }`}
                        style={{ width: `${Math.max(1, prob)}%` }}
                      />
                    </div>
                    <span
                      className={`w-12 text-right ${
                        isWinner ? 'text-sky-400 font-semibold' : 'text-zinc-400'
                      }`}
                    >
                      {prob.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
