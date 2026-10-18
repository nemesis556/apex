import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESET_SCENARIOS,
  INDIA_SEISMIC_SENSORS,
  INDIA_SECONDARY_RELAYS,
  BIOBANK_SENSORS,
  spawnRandomIndiaSensors,
  runSensorIntelligencePipeline,
  pearsonCorrelation,
  linearSlope,
  exportStreamToCsv,
  computeSocialImpactMetrics,
  parseCustomCsvToStreamAndEvaluate,
  computeStationLiveDiagnostic,
} from './sensorEngine.ts';
import {
  generateSyntheticMlDataset,
  trainSensorFaultMlModel,
} from './mlModelEngine.ts';

test('pearsonCorrelation computes +1 for identical arrays and ~0 for orthogonal arrays', () => {
  const a = [1, 2, 3, 4, 5];
  const b = [2, 4, 6, 8, 10];
  assert.equal(Number(pearsonCorrelation(a, b).toFixed(4)), 1);

  const flat = [5, 5, 5, 5, 5];
  assert.equal(pearsonCorrelation(a, flat), 0);
});

test('linearSlope accurately detects positive calibration drift slope', () => {
  const series = [0, 0.25, 0.5, 0.75, 1.0, 1.25];
  const slope = linearSlope(series);
  assert.ok(Math.abs(slope - 0.25) < 1e-6);
});

test('All-India Seismic Sensor Network contains 60 stations (S-01..S-60) with multiple sensors per city and spawns additional stations', () => {
  assert.equal(INDIA_SEISMIC_SENSORS.length, 60);
  assert.equal(INDIA_SECONDARY_RELAYS.length, 4);
  for (const s of INDIA_SEISMIC_SENSORS) {
    assert.equal(s.unit, 'gal');
    assert.ok(typeof s.lat === 'number' && s.lat > 8 && s.lat < 36);
    assert.ok(typeof s.lng === 'number' && s.lng > 68 && s.lng < 96);
    assert.ok(s.city && s.city.length > 0);
  }

  // Verify multiple sensors per major city cluster
  const puneCount = INDIA_SEISMIC_SENSORS.filter((s) => s.city === 'Koyna / Pune').length;
  const delhiCount = INDIA_SEISMIC_SENSORS.filter((s) => s.city === 'New Delhi').length;
  const mumbaiCount = INDIA_SEISMIC_SENSORS.filter((s) => s.city === 'Mumbai').length;
  const bhujCount = INDIA_SEISMIC_SENSORS.filter((s) => s.city === 'Bhuj (Kutch)').length;
  assert.ok(puneCount >= 4, `Expected >= 4 sensors in Pune cluster, got ${puneCount}`);
  assert.ok(delhiCount >= 4, `Expected >= 4 sensors in Delhi cluster, got ${delhiCount}`);
  assert.ok(mumbaiCount >= 4, `Expected >= 4 sensors in Mumbai cluster, got ${mumbaiCount}`);
  assert.ok(bhujCount >= 4, `Expected >= 4 sensors in Bhuj cluster, got ${bhujCount}`);

  const spawned = spawnRandomIndiaSensors(8, INDIA_SEISMIC_SENSORS, 999);
  assert.equal(spawned.length, 8);
  assert.equal(spawned[0].id, 'S-61');
  assert.equal(spawned[7].id, 'S-68');
  for (const sp of spawned) {
    assert.ok(typeof sp.lat === 'number' && sp.lat > 8 && sp.lat < 36);
    assert.ok(typeof sp.lng === 'number' && sp.lng > 68 && sp.lng < 96);
  }
});

test('Scenario 1 (Multi-Zone Drift vs. M6.4 Quake across 60 stations) suppresses drift and detects true P-wave', () => {
  const scenario = PRESET_SCENARIOS[0];
  const result = runSensorIntelligencePipeline(scenario, INDIA_SEISMIC_SENSORS);

  assert.equal(result.stream.length, scenario.steps);
  assert.equal(result.sensorSummaries.length, 60);

  const driftEvents = result.events.filter(
    (e) =>
      (e.sensorId === 'S-02' || e.sensorId === 'S-08' || e.sensorId === 'S-15') &&
      e.classification === 'OFFSET_DRIFT'
  );
  assert.ok(
    driftEvents.length > 0,
    'Expected OFFSET_DRIFT to be classified on drifting Indian stations'
  );

  for (const de of driftEvents) {
    assert.equal(de.isTrustedAlarm, false);
  }

  const genuineEvents = result.events.filter(
    (e) => e.classification === 'GENUINE_EVENT' && e.isTrustedAlarm
  );
  assert.ok(
    genuineEvents.length > 0,
    'Expected genuine tectonic P-wave excursion to trigger trusted alarms'
  );

  assert.ok(result.benchmark.falseAlarmReductionPct >= 85);
  assert.ok(result.benchmark.sensitivityPct >= 90);
});

test('computeStationLiveDiagnostic returns accurate ML confidence, intra-city siblings, and suppressed alarm decision', () => {
  const scenario = PRESET_SCENARIOS[0];
  const result = runSensorIntelligencePipeline(scenario, INDIA_SEISMIC_SENSORS);

  // At step 36, S-02 in Bhuj (Kutch) has OFFSET_DRIFT while its 3 sibling stations in Bhuj remain nominal
  const diag = computeStationLiveDiagnostic(
    result.stream,
    INDIA_SEISMIC_SENSORS,
    'S-02',
    36,
    scenario.alarmThreshold
  );

  assert.equal(diag.predictedClass, 'OFFSET_DRIFT');
  assert.ok(diag.confidencePct >= 88, `Expected confidence >= 88%, got ${diag.confidencePct}`);
  assert.equal(diag.alarmDecision, 'FALSE_ALARM_SUPPRESSED');
  assert.ok(diag.citySiblings.length >= 4, 'Expected at least 4 sibling stations in Bhuj city cluster');
});

test('Trainable MLP Neural Network converges to > 90% holdout validation accuracy and classifies faults', () => {
  const dataset = generateSyntheticMlDataset(800, 1234);
  assert.equal(dataset.length, 800);

  const report = trainSensorFaultMlModel({
    sampleCount: 1600,
    epochs: 35,
    learningRate: 0.08,
    hiddenUnits: 16,
    seed: 4096,
  });

  assert.equal(report.confusionMatrix.length, 7);
  assert.ok(
    report.overallAccuracyPct >= 88,
    `Expected holdout accuracy >= 88%, got ${report.overallAccuracyPct}%`
  );
  assert.ok(
    report.macroF1 >= 0.85,
    `Expected macro F1 >= 0.85, got ${report.macroF1}`
  );

  // Verify live inference on a genuine earthquake feature vector vs. highway spike
  const quakePred = report.predictSample([0.28, 0.92, 0.05, 4.5, 0.24, 1]);
  assert.equal(quakePred.predictedClass, 'GENUINE_EVENT');

  const spikePred = report.predictSample([4.8, 0.04, 0.03, 7.2, 0.52, 1]);
  assert.equal(spikePred.predictedClass, 'RANDOM_SPIKE');
});

test('computeSocialImpactMetrics and custom CSV ingestion work across domains', () => {
  const scenario = PRESET_SCENARIOS[0];
  const result = runSensorIntelligencePipeline(scenario, BIOBANK_SENSORS);
  const impactSeismic = computeSocialImpactMetrics(
    result.stream,
    result.events,
    result.sensorSummaries,
    result.benchmark,
    26,
    scenario.alarmThreshold,
    'SEISMIC_INDIA'
  );

  assert.ok(impactSeismic.citizensProtectedFromPanic >= 850000);
  assert.equal(impactSeismic.legacyVerdictAtStep.status, 'FALSE_ALARM_PANIC');
  assert.equal(impactSeismic.verisenseVerdictAtStep.status, 'FAULT_SUPPRESSED');

  const csv = exportStreamToCsv(result.stream, BIOBANK_SENSORS);
  const parsed = parseCustomCsvToStreamAndEvaluate(
    csv,
    BIOBANK_SENSORS,
    scenario.alarmThreshold
  );
  assert.equal(parsed.stream.length, scenario.steps);
});
