import React, { useEffect, useMemo, useState } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  TimeStepReading,
  SensorMeta,
  SensorHealthSummary,
  SocialImpactMetrics,
  FaultType,
  formatFaultLabel,
  formatMaintenanceLabel,
  computeStationLiveDiagnostic,
} from '../utils/sensorEngine';
import { ML_CLASSES } from '../utils/mlModelEngine';
import { Seismic3DViewport } from './Seismic3DViewport';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

interface AllIndiaSeismicTwinProps {
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
  onSpawnRandomSensors?: (count: number) => void;
  onRandomizeIndiaFaults?: () => void;
  mlPredictor?: (rawFeatures: [number, number, number, number, number, number]) => {
    predictedClass: FaultType;
    confidencePct: number;
    probabilities: Record<FaultType, number>;
  };
}

type TwinStageMode = 'split-map-3d' | 'google-map-india' | 'tectonic-3d-only';
type StationFilterMode = 'ALL' | 'ANOMALIES' | 'ZONE_V' | 'PENINSULAR';
type ArmedFaultBrush = 'INSPECT_ONLY' | FaultType;

const TECTONIC_FAULT_LINES: Array<{
  name: string;
  zone: string;
  color: string;
  path: Array<{ lat: number; lng: number }>;
}> = [
  {
    name: 'Himalayan Frontal & Main Central Thrust (Zone V)',
    zone: 'Zone V',
    color: '#ef4444',
    path: [
      { lat: 34.2, lng: 74.6 },
      { lat: 32.219, lng: 76.323 },
      { lat: 30.5506, lng: 79.566 },
      { lat: 27.6, lng: 85.3 },
      { lat: 27.3389, lng: 88.6065 },
      { lat: 27.1, lng: 93.6 },
    ],
  },
  {
    name: 'Kutch Mainland & Katrol Hill Rift (Zone V)',
    zone: 'Zone V',
    color: '#f59e0b',
    path: [
      { lat: 23.9, lng: 68.4 },
      { lat: 23.242, lng: 69.6669 },
      { lat: 23.0225, lng: 72.5714 },
    ],
  },
  {
    name: 'Narmada-Son Lineament & Central Tectonic Zone (Zone III)',
    zone: 'Zone III',
    color: '#38bdf8',
    path: [
      { lat: 21.7, lng: 72.9 },
      { lat: 22.7196, lng: 75.8577 },
      { lat: 23.1815, lng: 79.9864 },
      { lat: 25.5941, lng: 85.1376 },
    ],
  },
  {
    name: 'Koyna-Warna & Western Ghats Escarpment (Zone IV)',
    zone: 'Zone IV',
    color: '#38bdf8',
    path: [
      { lat: 19.076, lng: 72.8777 },
      { lat: 18.5204, lng: 73.8567 },
      { lat: 17.398, lng: 73.748 },
      { lat: 13.0, lng: 74.8 },
    ],
  },
  {
    name: 'Dauki-Kopili & Indo-Burmese Subduction Arc (Zone V)',
    zone: 'Zone V',
    color: '#ef4444',
    path: [
      { lat: 25.5, lng: 89.9 },
      { lat: 25.5788, lng: 91.8933 },
      { lat: 26.1445, lng: 91.7362 },
      { lat: 24.8, lng: 94.0 },
      { lat: 11.6234, lng: 92.7265 },
    ],
  },
];

/**
 * Computes visual display coordinates so multiple sensors in the same city
 * form a visible, non-overlapping satellite constellation even at national zoom,
 * and converge to exact neighborhood coordinates when zoomed into a city.
 */
function buildCityConstellationCoords(
  sensors: SensorMeta[],
  focusedCity: string | null
): Record<string, { lat: number; lng: number }> {
  const byCity: Record<string, SensorMeta[]> = {};
  for (const s of sensors) {
    const key = (s.city || 'Other').toLowerCase();
    if (!byCity[key]) byCity[key] = [];
    byCity[key].push(s);
  }

  const out: Record<string, { lat: number; lng: number }> = {};
  for (const group of Object.values(byCity)) {
    if (group.length === 1) {
      const s = group[0];
      out[s.id] = { lat: s.lat ?? 22, lng: s.lng ?? 79 };
      continue;
    }

    const avgLat =
      group.reduce((acc, s) => acc + (s.lat ?? 22), 0) / group.length;
    const avgLng =
      group.reduce((acc, s) => acc + (s.lng ?? 79), 0) / group.length;
    const isFocused =
      focusedCity !== null &&
      focusedCity !== 'ALL_INDIA' &&
      group[0].city?.toLowerCase() === focusedCity.toLowerCase();

    // When viewing All-India, fan out city sensors on a 0.46° ring so every dot in the city is clearly visible and clickable
    const radiusDeg = isFocused ? 0.14 : 0.46;

    group.forEach((s, idx) => {
      if (idx === 0) {
        out[s.id] = { lat: avgLat, lng: avgLng };
      } else {
        const angle =
          ((idx - 1) / Math.max(1, group.length - 1)) * 2 * Math.PI + 0.35;
        out[s.id] = {
          lat: Number((avgLat + radiusDeg * Math.cos(angle)).toFixed(4)),
          lng: Number((avgLng + radiusDeg * 1.12 * Math.sin(angle)).toFixed(4)),
        };
      }
    });
  }
  return out;
}

function buildNationalMeshEdges(sensors: SensorMeta[]): Array<[SensorMeta, SensorMeta]> {
  const edges: Array<[SensorMeta, SensorMeta]> = [];
  const seen = new Set<string>();

  for (const sA of sensors) {
    if (sA.lat === undefined || sA.lng === undefined) continue;
    const ranked = sensors
      .filter((sB) => sB.id !== sA.id && sB.lat !== undefined && sB.lng !== undefined)
      .map((sB) => {
        const dLat = (sA.lat! - sB.lat!) * 111;
        const dLng = (sA.lng! - sB.lng!) * 98;
        return { sB, distKm: Math.sqrt(dLat * dLat + dLng * dLng) };
      })
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, 2);

    for (const { sB } of ranked) {
      const key = [sA.id, sB.id].sort().join('--');
      if (!seen.has(key)) {
        seen.add(key);
        edges.push([sA, sB]);
      }
    }
  }
  return edges;
}

const IndiaSeismicMapVectors: React.FC<{
  sensors: SensorMeta[];
  displayCoords: Record<string, { lat: number; lng: number }>;
  activeRow: TimeStepReading;
  correlationMatrix: Record<string, Record<string, number>>;
  alarmThreshold: number;
  selectedSensorId: string;
  focusedCity: string;
  cameraTarget: { lat: number; lng: number; zoom: number } | null;
}> = ({
  sensors,
  displayCoords,
  activeRow,
  correlationMatrix,
  alarmThreshold,
  selectedSensorId,
  cameraTarget,
}) => {
  const map = useMap();
  const meshEdges = useMemo(() => buildNationalMeshEdges(sensors), [sensors]);

  useEffect(() => {
    if (!map || !cameraTarget) return;
    map.panTo({ lat: cameraTarget.lat, lng: cameraTarget.lng });
    map.setZoom(cameraTarget.zoom);
  }, [map, cameraTarget]);

  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps) return;

    const overlays: Array<google.maps.Polyline | google.maps.Circle> = [];
    const isRealQuake = activeRow.consensusEstimate >= alarmThreshold - 0.35;

    // 1. Tectonic Fault Lines across India
    for (const fault of TECTONIC_FAULT_LINES) {
      const faultLine = new google.maps.Polyline({
        path: fault.path,
        geodesic: true,
        strokeColor: fault.color,
        strokeOpacity: 0.55,
        strokeWeight: 2.0,
        map,
      });
      overlays.push(faultLine);
    }

    // 2. All-India & Intra-City k-NN Station Correlation Mesh
    for (const [sA, sB] of meshEdges) {
      const cA = displayCoords[sA.id];
      const cB = displayCoords[sB.id];
      if (!cA || !cB) continue;
      const r = correlationMatrix[sA.id]?.[sB.id] ?? 0.85;
      const sameCity =
        sA.city && sB.city && sA.city.toLowerCase() === sB.city.toLowerCase();
      const coupled = r >= 0.65;
      const linkLine = new google.maps.Polyline({
        path: [cA, cB],
        geodesic: true,
        strokeColor: isRealQuake
          ? '#ef4444'
          : !coupled
          ? '#f59e0b'
          : sameCity
          ? '#38bdf8'
          : '#06b6d4',
        strokeOpacity: !coupled ? 0.85 : sameCity ? 0.65 : 0.3,
        strokeWeight: !coupled ? 2.2 : sameCity ? 1.8 : 1.1,
        map,
      });
      overlays.push(linkLine);
    }

    // 3. Seismic Wavefront Circles around selected or anomalous stations
    for (const s of sensors) {
      const pos = displayCoords[s.id];
      if (!pos) continue;
      const val = activeRow.readings[s.id];
      const fault = activeRow.injectedLabels[s.id];
      const isSelected = s.id === selectedSensorId;
      const isAnom =
        val === null ||
        (fault && fault !== 'NONE') ||
        (val !== null && val >= alarmThreshold);

      if (!isSelected && !isAnom && !isRealQuake) continue;

      const color =
        val === null || fault === 'DROPOUT'
          ? '#f43f5e'
          : isRealQuake && val !== null && val >= alarmThreshold - 0.35
          ? '#ef4444'
          : isAnom
          ? '#f59e0b'
          : '#38bdf8';

      const radiusMeters = isRealQuake
        ? 180000
        : isSelected
        ? 140000
        : 105000;

      const circle = new google.maps.Circle({
        strokeColor: color,
        strokeOpacity: 0.85,
        strokeWeight: isSelected ? 2.2 : 1.3,
        fillColor: color,
        fillOpacity: isRealQuake ? 0.18 : 0.12,
        map,
        center: pos,
        radius: radiusMeters,
        clickable: false,
      });
      overlays.push(circle);
    }

    return () => {
      overlays.forEach((o) => o.setMap(null));
    };
  }, [
    map,
    sensors,
    displayCoords,
    meshEdges,
    activeRow,
    correlationMatrix,
    alarmThreshold,
    selectedSensorId,
  ]);

  return null;
};

export const AllIndiaSeismicTwin: React.FC<AllIndiaSeismicTwinProps> = ({
  stream,
  sensors,
  sensorSummaries,
  correlationMatrix,
  socialImpact,
  selectedStep,
  selectedSensorId,
  isPlaying,
  alarmThreshold,
  onSelectSensor,
  onTogglePlay,
  onChaosSabotage,
  onResetVaultToClean,
  onSpawnRandomSensors,
  onRandomizeIndiaFaults,
  mlPredictor,
}) => {
  const [stageMode, setStageMode] = useState<TwinStageMode>('split-map-3d');
  const [quotaExceeded, setQuotaExceeded] = useState<boolean>(false);
  const [useGeodeticSvgMap, setUseGeodeticSvgMap] = useState<boolean>(false);
  const [stationFilter, setStationFilter] = useState<StationFilterMode>('ALL');
  const [focusedCity, setFocusedCity] = useState<string>('ALL_INDIA');
  const [armedFaultBrush, setArmedFaultBrush] =
    useState<ArmedFaultBrush>('INSPECT_ONLY');
  const [cameraTarget, setCameraTarget] = useState<{
    lat: number;
    lng: number;
    zoom: number;
  } | null>(null);

  useEffect(() => {
    const handleQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuota);
  }, []);

  const activeRow =
    stream[Math.min(selectedStep, stream.length - 1)] || stream[0];
  const isRealQuake = activeRow.consensusEstimate >= alarmThreshold - 0.35;

  const displayCoords = useMemo(
    () => buildCityConstellationCoords(sensors, focusedCity),
    [sensors, focusedCity]
  );

  const meshEdges = useMemo(() => buildNationalMeshEdges(sensors), [sensors]);

  // Group sensors by city so users can see & select multi-sensor city clusters
  const cityClusters = useMemo(() => {
    const map = new globalThis.Map<
      string,
      { city: string; sensors: SensorMeta[]; anomalyCount: number; lat: number; lng: number }
    >();
    for (const s of sensors) {
      const c = s.city || 'Regional';
      const entry = map.get(c) || {
        city: c,
        sensors: [],
        anomalyCount: 0,
        lat: s.lat ?? 22.0,
        lng: s.lng ?? 79.0,
      };
      entry.sensors.push(s);
      const v = activeRow.readings[s.id];
      const f = activeRow.injectedLabels[s.id];
      if (v === null || (f && f !== 'NONE') || (v !== null && v >= alarmThreshold)) {
        entry.anomalyCount++;
      }
      entry.lat =
        entry.sensors.reduce((acc, item) => acc + (item.lat ?? 22), 0) /
        entry.sensors.length;
      entry.lng =
        entry.sensors.reduce((acc, item) => acc + (item.lng ?? 79), 0) /
        entry.sensors.length;
      map.set(c, entry);
    }
    return Array.from(map.values()).sort(
      (a, b) => b.sensors.length - a.sensors.length
    );
  }, [sensors, activeRow, alarmThreshold]);

  // Live ML Classification, Softmax Confidence, and Intra-City Sibling Consensus Diagnostic
  const liveDiagnostic = useMemo(
    () =>
      computeStationLiveDiagnostic(
        stream,
        sensors,
        selectedSensorId,
        selectedStep,
        alarmThreshold,
        mlPredictor
      ),
    [stream, sensors, selectedSensorId, selectedStep, alarmThreshold, mlPredictor]
  );

  const selectedMeta = liveDiagnostic.sensor;
  const selectedReading = liveDiagnostic.reading;
  const activeFaultForSelected = liveDiagnostic.predictedClass;

  const anomalyCount = useMemo(() => {
    return sensors.filter((s) => {
      const v = activeRow.readings[s.id];
      const f = activeRow.injectedLabels[s.id];
      return v === null || (f && f !== 'NONE') || (v !== null && v >= alarmThreshold);
    }).length;
  }, [sensors, activeRow, alarmThreshold]);

  const filteredSensors = useMemo(() => {
    return sensors.filter((s) => {
      if (
        focusedCity !== 'ALL_INDIA' &&
        s.city?.toLowerCase() !== focusedCity.toLowerCase() &&
        s.id !== selectedSensorId
      ) {
        return false;
      }
      if (stationFilter === 'ANOMALIES') {
        const v = activeRow.readings[s.id];
        const f = activeRow.injectedLabels[s.id];
        return (
          v === null ||
          (f && f !== 'NONE') ||
          (v !== null && v >= alarmThreshold) ||
          s.id === selectedSensorId
        );
      }
      if (stationFilter === 'ZONE_V') {
        return s.seismicZone?.includes('Zone V') || s.id === selectedSensorId;
      }
      if (stationFilter === 'PENINSULAR') {
        return (
          s.seismicZone?.includes('Zone II') ||
          s.seismicZone?.includes('Zone III') ||
          s.id === selectedSensorId
        );
      }
      return true;
    });
  }, [
    sensors,
    focusedCity,
    stationFilter,
    activeRow,
    alarmThreshold,
    selectedSensorId,
  ]);

  const handleFocusCity = (cityName: string) => {
    setFocusedCity(cityName);
    if (cityName === 'ALL_INDIA') {
      setCameraTarget({ lat: 22.0, lng: 80.5, zoom: 4.1 });
      return;
    }
    const cluster = cityClusters.find(
      (c) => c.city.toLowerCase() === cityName.toLowerCase()
    );
    if (cluster && cluster.sensors.length > 0) {
      onSelectSensor(cluster.sensors[0].id);
      setCameraTarget({
        lat: cluster.lat,
        lng: cluster.lng,
        zoom: 7.8,
      });
    }
  };

  const handleMapStationClick = (sensorId: string) => {
    onSelectSensor(sensorId);
    if (armedFaultBrush !== 'INSPECT_ONLY') {
      onChaosSabotage(sensorId, armedFaultBrush);
    }
  };

  const CHAOS_CARDS: Array<{
    fault: FaultType;
    shortTitle: string;
    subtitle: string;
    color: string;
    svgPath: string;
  }> = [
    {
      fault: 'OFFSET_DRIFT',
      shortTitle: 'MEMS Spring Drift (+4.8 gal)',
      subtitle: 'Gradual zero-offset creep on selected station',
      color: '#f59e0b',
      svgPath: 'M 2 22 L 18 20 L 34 16 L 50 11 L 66 5 L 78 2',
    },
    {
      fault: 'RANDOM_SPIKE',
      shortTitle: 'Highway Truck / Blast Spike',
      subtitle: 'Single-station +5.8 gal surface vibration impulse',
      color: '#fbbf24',
      svgPath: 'M 2 20 L 26 20 L 34 2 L 42 20 L 78 20',
    },
    {
      fault: 'STUCK_AT',
      shortTitle: 'Freeze 24-Bit ADC (4.62 gal)',
      subtitle: 'Locks digitizer output at constant flatline value',
      color: '#a855f7',
      svgPath: 'M 2 18 L 20 14 L 32 14 L 56 14 L 78 14',
    },
    {
      fault: 'EXCESSIVE_NOISE',
      shortTitle: '400kV Substation EMI Noise',
      subtitle: 'High-variance ground-loop jitter (σ = 1.85 gal)',
      color: '#fb923c',
      svgPath:
        'M 2 14 L 10 4 L 18 23 L 26 5 L 34 22 L 42 3 L 50 23 L 58 6 L 66 21 L 78 12',
    },
    {
      fault: 'DROPOUT',
      shortTitle: 'Cut VSAT Satellite Link (NULL)',
      subtitle: 'Simulates monsoon landslide packet loss',
      color: '#f43f5e',
      svgPath: 'M 2 16 L 26 16 M 54 16 L 78 16',
    },
    {
      fault: 'GENUINE_EVENT',
      shortTitle: 'Trigger M6.4 Tectonic Quake',
      subtitle: 'Propagates real P-wave across ALL Indian stations',
      color: '#ef4444',
      svgPath: 'M 2 22 Q 20 22 30 12 T 55 3 L 78 3',
    },
  ];

  const projectIndiaLatLng = (lat: number, lng: number) => {
    const x = ((lng - 66.5) / (97.5 - 66.5)) * 720 + 40;
    const y = ((36.5 - lat) / (36.5 - 7.5)) * 460 + 30;
    return { x, y };
  };

  const showGoogleMap = !quotaExceeded && Boolean(API_KEY) && !useGeodeticSvgMap;

  return (
    <div className="bg-[#111114] border border-white/[0.08] rounded-2xl p-6 sm:p-7 space-y-6">
      {/* Top Bar: Clean Unboxed Metadata + Apple Segmented Controls */}
      <div className="flex flex-col gap-4 pb-5 border-b border-white/[0.07]">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span>All-India Multi-Sensor City Array</span>
              <span aria-hidden="true">·</span>
              <span className="text-zinc-200 font-medium">
                {sensors.length} Active Borehole Sensors across {cityClusters.length} Cities
              </span>
              <span aria-hidden="true">·</span>
              <span
                className={
                  anomalyCount > 0 ? 'text-amber-400 font-medium' : 'text-emerald-400'
                }
              >
                {anomalyCount} Active Station {anomalyCount === 1 ? 'Anomaly' : 'Anomalies'}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-white mt-1">
              National Multi-Sensor City Clusters &amp; Interactive Fault Injection Lab
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-3xl">
              Every major city operates a 3–4 sensor micro-array. Click any sensor dot on the map to inject a hardware fault and inspect live ML classification confidence, sensor trust, and intra-city consensus.
            </p>
          </div>

          {/* Primary Viewport Switcher */}
          <div
            role="group"
            aria-label="Digital twin visualization mode"
            className="flex items-center bg-[#18181C] p-1 border border-white/[0.08] rounded-xl shrink-0 self-start lg:self-auto"
          >
            <button
              type="button"
              onClick={() => setStageMode('split-map-3d')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                stageMode === 'split-map-3d'
                  ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Split View
            </button>
            <button
              type="button"
              onClick={() => setStageMode('google-map-india')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                stageMode === 'google-map-india'
                  ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              India Map
            </button>
            <button
              type="button"
              onClick={() => setStageMode('tectonic-3d-only')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                stageMode === 'tectonic-3d-only'
                  ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              3D Borehole
            </button>
          </div>
        </div>

        {/* Row 2: Multi-Sensor City Cluster Quick-Zoom Strip */}
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>
              City Micro-Array Clusters (Multiple Sensors per City · Click to Zoom or Filter):
            </span>
            <span className="font-mono text-zinc-300">
              Active Focus:{' '}
              <strong className="text-white">
                {focusedCity === 'ALL_INDIA' ? `All India (${sensors.length} Dots)` : focusedCity}
              </strong>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleFocusCity('ALL_INDIA')}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                focusedCity === 'ALL_INDIA'
                  ? 'bg-white text-zinc-950 border-white font-semibold'
                  : 'bg-[#18181C] text-zinc-300 border-white/[0.08] hover:border-white/20'
              }`}
            >
              All India ({sensors.length})
            </button>
            {cityClusters.slice(0, 14).map((cluster) => {
              const isFocus =
                focusedCity.toLowerCase() === cluster.city.toLowerCase();
              return (
                <button
                  key={cluster.city}
                  type="button"
                  onClick={() => handleFocusCity(cluster.city)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer flex items-center gap-1.5 ${
                    isFocus
                      ? 'bg-sky-400 text-zinc-950 border-sky-300 font-semibold'
                      : cluster.anomalyCount > 0
                      ? 'bg-amber-500/10 text-amber-200 border-amber-500/30 hover:bg-amber-500/20'
                      : 'bg-[#18181C] text-zinc-300 border-white/[0.07] hover:border-white/20'
                  }`}
                >
                  <span>{cluster.city}</span>
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.2 rounded-full ${
                      isFocus
                        ? 'bg-zinc-950/20 text-zinc-950 font-bold'
                        : cluster.anomalyCount > 0
                        ? 'bg-amber-400/20 text-amber-300'
                        : 'bg-white/[0.07] text-zinc-400'
                    }`}
                  >
                    {cluster.sensors.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 3: Interactive Click-to-Inject Fault Brush + Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/[0.05]">
          {/* Click-on-Map Fault Brush */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-zinc-400 mr-1 font-medium">
              Click Any Map Dot To:
            </span>
            {(
              [
                ['INSPECT_ONLY', 'Inspect Dot', 'border-white/10 text-zinc-300'],
                ['OFFSET_DRIFT', 'Inject Drift', 'border-amber-500/40 text-amber-300'],
                ['RANDOM_SPIKE', 'Inject Spike', 'border-yellow-500/40 text-yellow-300'],
                ['STUCK_AT', 'Freeze ADC', 'border-purple-500/40 text-purple-300'],
                ['EXCESSIVE_NOISE', 'Inject EMI Noise', 'border-orange-500/40 text-orange-300'],
                ['DROPOUT', 'Cut VSAT Link', 'border-rose-500/40 text-rose-300'],
                ['GENUINE_EVENT', 'Trigger Quake', 'border-red-500/40 text-red-300'],
                ['NONE', 'Restore Healthy', 'border-emerald-500/40 text-emerald-300'],
              ] as Array<[ArmedFaultBrush, string, string]>
            ).map(([mode, label, tone]) => {
              const active = armedFaultBrush === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setArmedFaultBrush(mode)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-white text-zinc-950 border-white font-semibold shadow-sm'
                      : `bg-[#18181C] hover:bg-white/[0.08] ${tone}`
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onSpawnRandomSensors && (
              <button
                type="button"
                onClick={() => onSpawnRandomSensors(12)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/[0.07] hover:bg-white/[0.13] text-white border border-white/[0.1] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                + Spawn 12 More City Dots
              </button>
            )}

            {onRandomizeIndiaFaults && (
              <button
                type="button"
                onClick={onRandomizeIndiaFaults}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Scatter Multi-City Faults
              </button>
            )}

            <button
              type="button"
              onClick={onTogglePlay}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                isPlaying
                  ? 'bg-amber-400 text-zinc-950 border-amber-300 font-semibold'
                  : 'bg-white/[0.05] text-zinc-200 border-white/[0.1] hover:bg-white/[0.1]'
              }`}
            >
              {isPlaying ? 'Pause Stream' : 'Play Stream'}
            </button>

            <button
              type="button"
              onClick={onResetVaultToClean}
              className="px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-white bg-transparent hover:bg-white/[0.05] rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Reset Array
            </button>
          </div>
        </div>
      </div>

      {/* Main Visual Grid: Left/Top Map & 3D Viewports + Right Live ML Confidence & Fault Injection Lab */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 7 Cols: All-India Multi-Sensor Map & 3D Borehole Studio */}
        <div className="lg:col-span-7 flex flex-col justify-between gap-5">
          <div className="grid grid-cols-1 gap-5">
            {/* Panel A: All-India Seismic Network Map (Google Maps + Geodetic Tectonic SVG Toggle) */}
            {(stageMode === 'split-map-3d' || stageMode === 'google-map-india') && (
              <div
                className={`relative w-full ${
                  stageMode === 'split-map-3d' ? 'h-[470px]' : 'h-[580px]'
                } bg-[#09090B] border border-white/[0.08] rounded-xl overflow-hidden`}
              >
                {/* Map Mode Toggle + Filter */}
                <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
                  <div className="flex items-center gap-1 bg-black/85 backdrop-blur-xl p-1 border border-white/[0.12] rounded-xl pointer-events-auto">
                    <button
                      type="button"
                      onClick={() => setUseGeodeticSvgMap(false)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        !useGeodeticSvgMap
                          ? 'bg-white text-zinc-950 font-semibold'
                          : 'text-zinc-300 hover:text-white'
                      }`}
                    >
                      Dark Satellite Map ({sensors.length} Dots)
                    </button>
                    <button
                      type="button"
                      onClick={() => setUseGeodeticSvgMap(true)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        useGeodeticSvgMap
                          ? 'bg-white text-zinc-950 font-semibold'
                          : 'text-zinc-300 hover:text-white'
                      }`}
                    >
                      Geodetic Vector Radar
                    </button>
                  </div>

                  {armedFaultBrush !== 'INSPECT_ONLY' && (
                    <div className="bg-amber-500/95 text-zinc-950 px-3 py-1 rounded-xl text-xs font-semibold shadow-lg pointer-events-auto flex items-center gap-2">
                      <span>
                        Armed Brush: Click any map dot to inject{' '}
                        {formatFaultLabel(armedFaultBrush)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setArmedFaultBrush('INSPECT_ONLY')}
                        className="underline font-mono text-[11px]"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {showGoogleMap ? (
                  <APIProvider apiKey={API_KEY}>
                    <div className="w-full h-full">
                      <Map
                        defaultCenter={{ lat: 22.0, lng: 80.5 }}
                        defaultZoom={4.1}
                        mapId="DEMO_MAP_ID"
                        colorScheme="DARK"
                        gestureHandling="greedy"
                        disableDefaultUI={false}
                        className="w-full h-full"
                      >
                        <IndiaSeismicMapVectors
                          sensors={sensors}
                          displayCoords={displayCoords}
                          activeRow={activeRow}
                          correlationMatrix={correlationMatrix}
                          alarmThreshold={alarmThreshold}
                          selectedSensorId={selectedSensorId}
                          focusedCity={focusedCity}
                          cameraTarget={cameraTarget}
                        />

                        {/* Render All 60+ Multi-Sensor City Dots */}
                        {filteredSensors.map((s) => {
                          const pos = displayCoords[s.id] || {
                            lat: s.lat ?? 22,
                            lng: s.lng ?? 79,
                          };
                          const val = activeRow.readings[s.id];
                          const trust = activeRow.trustScores[s.id] ?? 98;
                          const fault = activeRow.injectedLabels[s.id];
                          const isSelected = selectedSensorId === s.id;
                          const isSameCityAsSelected =
                            s.city &&
                            selectedMeta.city &&
                            s.city.toLowerCase() === selectedMeta.city.toLowerCase();
                          const isAnom =
                            val === null ||
                            (fault && fault !== 'NONE') ||
                            (val !== null && val >= alarmThreshold);

                          const shortNum = s.id.replace('S-', '');

                          return (
                            <AdvancedMarker
                              key={s.id}
                              position={pos}
                              zIndex={
                                isSelected
                                  ? 80
                                  : isAnom
                                  ? 50
                                  : isSameCityAsSelected
                                  ? 30
                                  : 15
                              }
                              onClick={() => handleMapStationClick(s.id)}
                            >
                              {isSelected ? (
                                <div className="cursor-pointer px-3 py-1.5 rounded-xl bg-black/95 backdrop-blur-xl border-2 border-sky-400 text-white font-mono text-left shadow-2xl transition-transform scale-105">
                                  <div className="flex items-center justify-between gap-2 text-[10px]">
                                    <span className="font-bold text-sky-400">
                                      {s.id} · {s.city}
                                    </span>
                                    <span className="px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 font-bold">
                                      {liveDiagnostic.confidencePct.toFixed(1)}% Conf
                                    </span>
                                  </div>
                                  <div className="text-xs font-bold tabular-nums mt-0.5 flex items-center justify-between gap-2">
                                    <span>
                                      {val !== null
                                        ? `${val.toFixed(2)} gal`
                                        : 'VSAT DROP'}
                                    </span>
                                    <span
                                      className={`text-[10px] ${
                                        trust >= 80
                                          ? 'text-emerald-400'
                                          : 'text-amber-300'
                                      }`}
                                    >
                                      Trust {trust.toFixed(0)}%
                                    </span>
                                  </div>
                                  <div className="text-[9px] text-amber-300 font-semibold mt-0.5">
                                    {formatFaultLabel(liveDiagnostic.predictedClass)}
                                  </div>
                                </div>
                              ) : isAnom ? (
                                <div
                                  title={`${s.id} · ${s.name} (${s.city}) — ${
                                    val !== null ? `${val.toFixed(2)} gal` : 'DROP'
                                  } [${fault}]`}
                                  className={`cursor-pointer px-1.5 py-0.5 rounded-full border font-mono text-[9px] font-bold shadow-lg transition-transform hover:scale-125 flex items-center gap-1 ${
                                    val === null || fault === 'DROPOUT'
                                      ? 'bg-rose-950/95 border-rose-400 text-rose-100'
                                      : isRealQuake
                                      ? 'bg-red-950/95 border-red-400 text-red-100'
                                      : 'bg-amber-950/95 border-amber-400 text-amber-100'
                                  }`}
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                  <span>{s.id}</span>
                                </div>
                              ) : (
                                <div
                                  title={`${s.id} · ${s.name} (${s.city}) — ${
                                    val !== null ? `${val.toFixed(2)} gal` : 'DROP'
                                  } · Click to select or inject fault`}
                                  className={`cursor-pointer w-5 h-5 rounded-full font-mono text-[8px] font-bold shadow-md transition-transform hover:scale-125 flex items-center justify-center ${
                                    isSameCityAsSelected
                                      ? 'bg-sky-950 border-2 border-sky-300 text-white ring-2 ring-sky-400/30'
                                      : 'bg-zinc-950/90 border border-sky-400/80 text-sky-300'
                                  }`}
                                >
                                  {shortNum}
                                </div>
                              )}
                            </AdvancedMarker>
                          );
                        })}
                      </Map>
                    </div>
                  </APIProvider>
                ) : (
                  /* High-Precision Geodetic All-India Tectonic SVG Radar Map (All 60+ Multi-Sensor City Dots) */
                  <svg
                    viewBox="0 0 800 520"
                    className="w-full h-full bg-[#050811]"
                    role="img"
                    aria-label="All-India Multi-Sensor City Seismic Network Map"
                  >
                    <defs>
                      <radialGradient id="quakePulseGrad" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity="0.45" />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
                      </radialGradient>
                      <radialGradient id="faultPulseGrad" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                      </radialGradient>
                      <radialGradient id="nominalPulseGrad" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                      </radialGradient>
                    </defs>

                    {[100, 200, 300, 400, 500, 600, 700].map((gx) => (
                      <line
                        key={`gx-${gx}`}
                        x1={gx}
                        y1={0}
                        x2={gx}
                        y2={520}
                        stroke="#0f172a"
                        strokeWidth="1"
                      />
                    ))}
                    {[80, 160, 240, 320, 400, 480].map((gy) => (
                      <line
                        key={`gy-${gy}`}
                        x1={0}
                        y1={gy}
                        x2={800}
                        y2={gy}
                        stroke="#0f172a"
                        strokeWidth="1"
                      />
                    ))}

                    <polygon
                      points="285,38 355,44 388,82 425,112 495,148 565,142 645,152 695,172 672,225 612,248 545,235 495,275 435,335 385,415 348,478 312,472 278,395 235,305 192,265 135,252 115,218 168,192 212,135 252,78"
                      fill="#0b1325"
                      stroke="#1e3a5f"
                      strokeWidth="2"
                    />

                    {TECTONIC_FAULT_LINES.map((f, idx) => {
                      const pts = f.path
                        .map((p) => {
                          const { x, y } = projectIndiaLatLng(p.lat, p.lng);
                          return `${x.toFixed(1)},${y.toFixed(1)}`;
                        })
                        .join(' ');
                      return (
                        <polyline
                          key={idx}
                          points={pts}
                          fill="none"
                          stroke={f.color}
                          strokeWidth="2.2"
                          strokeDasharray="6 4"
                          opacity="0.65"
                        />
                      );
                    })}

                    {meshEdges.map(([sA, sB]) => {
                      const cA = displayCoords[sA.id];
                      const cB = displayCoords[sB.id];
                      if (!cA || !cB) return null;
                      const pA = projectIndiaLatLng(cA.lat, cA.lng);
                      const pB = projectIndiaLatLng(cB.lat, cB.lng);
                      const r = correlationMatrix[sA.id]?.[sB.id] ?? 0.85;
                      const coupled = r >= 0.65;
                      return (
                        <line
                          key={`${sA.id}-${sB.id}`}
                          x1={pA.x}
                          y1={pA.y}
                          x2={pB.x}
                          y2={pB.y}
                          stroke={
                            isRealQuake
                              ? '#ef4444'
                              : coupled
                              ? '#06b6d4'
                              : '#f59e0b'
                          }
                          strokeWidth={coupled ? '0.9' : '1.8'}
                          strokeDasharray={coupled ? undefined : '4 3'}
                          opacity={coupled ? '0.3' : '0.85'}
                        />
                      );
                    })}

                    {filteredSensors.map((s) => {
                      const pos = displayCoords[s.id];
                      if (!pos) return null;
                      const { x, y } = projectIndiaLatLng(pos.lat, pos.lng);
                      const val = activeRow.readings[s.id];
                      const fault = activeRow.injectedLabels[s.id];
                      const isSel = selectedSensorId === s.id;
                      const isAnomaly =
                        val === null ||
                        (fault && fault !== 'NONE') ||
                        (val !== null && val >= alarmThreshold);

                      const gradId = isRealQuake
                        ? 'url(#quakePulseGrad)'
                        : isAnomaly
                        ? 'url(#faultPulseGrad)'
                        : 'url(#nominalPulseGrad)';

                      const strokeColor =
                        val === null || fault === 'DROPOUT'
                          ? '#f43f5e'
                          : isRealQuake
                          ? '#ef4444'
                          : isAnomaly
                          ? '#f59e0b'
                          : '#06b6d4';

                      return (
                        <g
                          key={s.id}
                          className="cursor-pointer"
                          onClick={() => handleMapStationClick(s.id)}
                        >
                          {(isSel || isAnomaly || isRealQuake) && (
                            <circle
                              cx={x}
                              cy={y}
                              r={isSel ? 28 : 18}
                              fill={gradId}
                            />
                          )}
                          <circle
                            cx={x}
                            cy={y}
                            r={isSel ? 6.5 : isAnomaly ? 5 : 3.6}
                            fill="#090d16"
                            stroke={strokeColor}
                            strokeWidth={isSel ? '2.5' : '1.5'}
                          />
                        </g>
                      );
                    })}
                  </svg>
                )}

                {/* Bottom Map Live ML Verdict & Confidence HUD Overlay */}
                <div className="absolute bottom-3 left-3 right-3 z-20 bg-black/90 backdrop-blur-xl px-4 py-2.5 border border-white/[0.14] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-sky-400">
                      {selectedMeta.id}
                    </span>
                    <span className="text-white font-semibold">
                      {selectedMeta.name}
                    </span>
                    <span className="text-zinc-400">
                      ({liveDiagnostic.cityClusterName} Cluster ·{' '}
                      {liveDiagnostic.citySiblings.length} Sensors)
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 font-mono">
                    <span
                      className={`px-2 py-0.5 rounded-md font-semibold ${
                        liveDiagnostic.alarmDecision === 'VERIFIED_HAZARD_ALARM'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : liveDiagnostic.alarmDecision === 'FALSE_ALARM_SUPPRESSED'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      }`}
                    >
                      {formatFaultLabel(liveDiagnostic.predictedClass)} ·{' '}
                      {liveDiagnostic.confidencePct.toFixed(1)}% ML Confidence
                    </span>
                    <span className="text-zinc-300">
                      Trust:{' '}
                      <strong
                        className={
                          liveDiagnostic.trustScorePct >= 80
                            ? 'text-emerald-400'
                            : 'text-amber-300'
                        }
                      >
                        {liveDiagnostic.trustScorePct.toFixed(1)}%
                      </strong>
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Panel B: 3D WebGL Tectonic Crust & Borehole Seismometer Studio */}
            {(stageMode === 'split-map-3d' || stageMode === 'tectonic-3d-only') && (
              <Seismic3DViewport
                sensors={sensors}
                sensorSummaries={sensorSummaries}
                activeRow={activeRow}
                correlationMatrix={correlationMatrix}
                selectedSensorId={selectedSensorId}
                alarmThreshold={alarmThreshold}
                onSelectSensor={onSelectSensor}
              />
            )}
          </div>

          {/* Side-by-Side Legacy Seismic Monitor vs. VeriSense AI Consensus Verdict */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 sm:p-5 rounded-xl bg-[#18181C] border border-white/[0.06]">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">
                  Legacy Single-Threshold Siren (≥ {alarmThreshold.toFixed(1)} gal)
                </span>
                <span
                  className={`font-mono font-medium ${
                    socialImpact.legacyVerdictAtStep.status === 'NOMINAL'
                      ? 'text-zinc-400'
                      : 'text-rose-400'
                  }`}
                >
                  {socialImpact.legacyVerdictAtStep.status === 'FALSE_ALARM_PANIC'
                    ? '✖ False Siren'
                    : socialImpact.legacyVerdictAtStep.status === 'MISSED_HAZARD'
                    ? '✖ Blind Probe'
                    : socialImpact.legacyVerdictAtStep.status === 'TRUE_ALARM'
                    ? '▲ Unfiltered Alert'
                    : '● Nominal'}
                </span>
              </div>
              <div className="text-sm font-semibold text-white mt-2">
                {socialImpact.legacyVerdictAtStep.headline}
              </div>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                {socialImpact.legacyVerdictAtStep.detail}
              </p>
            </div>

            <div className="p-4 sm:p-5 rounded-xl bg-[#18181C] border border-white/[0.08]">
              <div className="flex items-center justify-between text-xs">
                <span className="text-sky-400 font-medium">
                  VeriSense Spatial Consensus Engine
                </span>
                <span
                  className={`font-mono font-medium ${
                    socialImpact.verisenseVerdictAtStep.status === 'VERIFIED_EXCURSION'
                      ? 'text-rose-400'
                      : socialImpact.verisenseVerdictAtStep.status === 'FAULT_SUPPRESSED'
                      ? 'text-amber-300'
                      : 'text-emerald-400'
                  }`}
                >
                  {socialImpact.verisenseVerdictAtStep.status === 'VERIFIED_EXCURSION'
                    ? '✖ Verified Quake'
                    : socialImpact.verisenseVerdictAtStep.status === 'FAULT_SUPPRESSED'
                    ? '▲ Fault Suppressed'
                    : '● Verified Consensus'}
                </span>
              </div>
              <div className="text-sm font-semibold text-white mt-2">
                {socialImpact.verisenseVerdictAtStep.headline}
              </div>
              <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                {socialImpact.verisenseVerdictAtStep.detail}
              </p>
            </div>
          </div>
        </div>

        {/* Right 5 Cols: Live ML Confidence Diagnostic, Intra-City Sibling Consensus & Fault Injection Lab */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-4 bg-[#18181C] border border-white/[0.07] rounded-xl p-5">
          <div className="space-y-4">
            {/* 1. Selected Station Header & Prominent AI Confidence Verdict Card */}
            <div className="pb-4 border-b border-white/[0.07]">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-zinc-400">
                  Selected Sensor · {liveDiagnostic.cityClusterName} Cluster (
                  {liveDiagnostic.citySiblings.length} Dots)
                </span>
                <select
                  aria-label="Select Indian seismic station"
                  value={selectedSensorId}
                  onChange={(e) => onSelectSensor(e.target.value)}
                  className="bg-[#111114] border border-white/[0.12] rounded-lg px-2.5 py-1 text-xs font-mono text-zinc-100 focus:outline-none focus:border-white/30"
                >
                  {sensors.map((s) => {
                    const v = activeRow.readings[s.id];
                    const f = activeRow.injectedLabels[s.id];
                    return (
                      <option key={s.id} value={s.id}>
                        {s.id} · {s.city} —{' '}
                        {v !== null ? `${v.toFixed(2)} gal` : 'DROP'}{' '}
                        {f && f !== 'NONE' ? `[${f}]` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <h3 className="text-base font-semibold text-white mt-1.5">
                {selectedMeta.id} · {selectedMeta.name}
              </h3>

              {/* Prominent ML Classification & Confidence Banner */}
              <div
                className={`mt-3 p-3.5 rounded-xl border ${
                  liveDiagnostic.alarmDecision === 'VERIFIED_HAZARD_ALARM'
                    ? 'bg-rose-500/10 border-rose-500/30'
                    : liveDiagnostic.alarmDecision === 'FALSE_ALARM_SUPPRESSED'
                    ? 'bg-amber-500/10 border-amber-500/30'
                    : 'bg-emerald-500/10 border-emerald-500/25'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">
                      AI Classification &amp; Alarm Verdict
                    </div>
                    <div
                      className={`text-sm font-semibold mt-0.5 ${
                        liveDiagnostic.alarmDecision === 'VERIFIED_HAZARD_ALARM'
                          ? 'text-rose-300'
                          : liveDiagnostic.alarmDecision === 'FALSE_ALARM_SUPPRESSED'
                          ? 'text-amber-300'
                          : 'text-emerald-300'
                      }`}
                    >
                      {formatFaultLabel(liveDiagnostic.predictedClass)}
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <div className="text-[11px] text-zinc-400">ML Confidence</div>
                    <div className="text-xl font-bold text-white">
                      {liveDiagnostic.confidencePct.toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* 4-Metric Telemetry Strip inside Verdict Card */}
                <div className="grid grid-cols-4 gap-2 mt-3 pt-2.5 border-t border-white/[0.08] font-mono text-xs tabular-nums">
                  <div>
                    <div className="text-[10px] text-zinc-400 font-sans">Reading</div>
                    <div className="font-semibold text-white">
                      {selectedReading !== null
                        ? `${selectedReading.toFixed(2)} gal`
                        : 'NULL'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-400 font-sans">
                      City Consensus
                    </div>
                    <div className="font-semibold text-sky-400">
                      {liveDiagnostic.cityClusterConsensus.toFixed(2)} gal
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-400 font-sans">
                      Sensor Trust
                    </div>
                    <div
                      className={`font-semibold ${
                        liveDiagnostic.trustScorePct >= 80
                          ? 'text-emerald-400'
                          : 'text-amber-300'
                      }`}
                    >
                      {liveDiagnostic.trustScorePct.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-400 font-sans">Decision</div>
                    <div
                      className={`font-semibold text-[11px] ${
                        liveDiagnostic.alarmDecision === 'VERIFIED_HAZARD_ALARM'
                          ? 'text-rose-300'
                          : liveDiagnostic.alarmDecision === 'FALSE_ALARM_SUPPRESSED'
                          ? 'text-amber-300'
                          : 'text-emerald-300'
                      }`}
                    >
                      {liveDiagnostic.alarmDecision === 'VERIFIED_HAZARD_ALARM'
                        ? 'TRUE ALARM'
                        : liveDiagnostic.alarmDecision === 'FALSE_ALARM_SUPPRESSED'
                        ? 'SUPPRESSED'
                        : 'NOMINAL'}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-zinc-300 mt-2.5 leading-relaxed">
                  {liveDiagnostic.reasoningDetail}
                </p>
              </div>
            </div>

            {/* 2. Intra-City Multi-Sensor Consensus Table (Click Any Sensor in This City to Select/Inject) */}
            <div className="p-3.5 bg-[#111114] border border-white/[0.06] rounded-xl">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-semibold text-white">
                  Sensors in {liveDiagnostic.cityClusterName} Cluster (
                  {liveDiagnostic.citySiblings.length} Nodes)
                </span>
                <span className="font-mono text-sky-400 text-[11px]">
                  City Consensus: {liveDiagnostic.cityClusterConsensus.toFixed(2)} gal
                </span>
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {liveDiagnostic.citySiblings.map((sib) => {
                  const sibAnom =
                    sib.reading === null ||
                    sib.injectedFault !== 'NONE' ||
                    sib.reading >= alarmThreshold;
                  return (
                    <div
                      key={sib.id}
                      onClick={() => onSelectSensor(sib.id)}
                      className={`p-2 rounded-lg border text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                        sib.isSelected
                          ? 'bg-white/[0.09] border-sky-400/60 text-white'
                          : 'bg-[#18181C] border-white/[0.05] text-zinc-300 hover:border-white/20'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-sky-400">
                            {sib.id}
                          </span>
                          <span className="truncate font-medium text-white">
                            {sib.name.split('(')[0]}
                          </span>
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono">
                          {sib.isSelected
                            ? '● Selected Station'
                            : `${sib.distanceKm} km away in ${sib.city}`}{' '}
                          ·{' '}
                          <span
                            className={
                              sibAnom ? 'text-amber-300 font-semibold' : 'text-emerald-400'
                            }
                          >
                            {formatFaultLabel(sib.injectedFault)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0 font-mono tabular-nums">
                        <div className="text-right">
                          <div className="text-xs font-semibold text-white">
                            {sib.reading !== null
                              ? `${sib.reading.toFixed(2)} gal`
                              : 'DROP'}
                          </div>
                          <div
                            className={`text-[10px] ${
                              sib.trustScorePct >= 80
                                ? 'text-emerald-400'
                                : 'text-amber-300'
                            }`}
                          >
                            Trust {sib.trustScorePct.toFixed(0)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. Select Fault to Inject on Selected Sensor */}
            <div>
              <div className="flex items-center justify-between text-xs text-zinc-300 mb-2">
                <span className="font-semibold text-white">
                  Inject Hardware Fault on {selectedMeta.id} ({selectedMeta.city})
                </span>
                <button
                  type="button"
                  onClick={() => onChaosSabotage(selectedSensorId, 'NONE')}
                  className="text-xs text-sky-400 hover:text-sky-300 font-medium transition-colors cursor-pointer"
                >
                  Restore {selectedMeta.id} Healthy
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CHAOS_CARDS.map((card) => {
                  const isActive = activeFaultForSelected === card.fault;
                  return (
                    <button
                      key={card.fault}
                      type="button"
                      onClick={() => onChaosSabotage(selectedSensorId, card.fault)}
                      className={`p-2.5 text-left rounded-xl border transition-all cursor-pointer ${
                        isActive
                          ? 'bg-white/[0.1] border-amber-400 ring-1 ring-amber-400/30'
                          : 'bg-[#111114] border-white/[0.06] hover:border-white/[0.18]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-medium text-white truncate">
                          {card.shortTitle}
                        </span>
                        <svg
                          viewBox="0 0 80 26"
                          className="w-10 h-3.5 shrink-0"
                          aria-hidden="true"
                        >
                          <path
                            d={card.svgPath}
                            fill="none"
                            stroke={card.color}
                            strokeWidth="2"
                          />
                        </svg>
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-1">
                        {card.subtitle}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. 7-Class Neural Softmax Confidence Breakdown & 6-D Feature Attribution */}
            <div className="p-3.5 bg-[#111114] border border-white/[0.06] rounded-xl space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white">
                  7-Class Neural Softmax Confidence Breakdown
                </span>
                <span className="font-mono text-[11px] text-zinc-400">
                  Δ={liveDiagnostic.features.consensusDelta} · r=
                  {liveDiagnostic.features.neighbourCorrelation} · Z=
                  {liveDiagnostic.features.rateOfChangeZ}σ
                </span>
              </div>

              <div className="space-y-1.5">
                {ML_CLASSES.map((cls) => {
                  const probPct = Number(
                    ((liveDiagnostic.classProbabilities[cls] ?? 0) * 100).toFixed(1)
                  );
                  const isTop = cls === liveDiagnostic.predictedClass;
                  return (
                    <div
                      key={cls}
                      className="grid grid-cols-12 items-center gap-2 text-[11px]"
                    >
                      <div
                        className={`col-span-4 truncate ${
                          isTop ? 'text-white font-semibold' : 'text-zinc-400'
                        }`}
                      >
                        {formatFaultLabel(cls)}
                      </div>
                      <div className="col-span-6 h-1.5 bg-black/60 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            isTop
                              ? cls === 'GENUINE_EVENT'
                                ? 'bg-rose-400'
                                : cls === 'NONE'
                                ? 'bg-emerald-400'
                                : 'bg-amber-400'
                              : 'bg-zinc-600'
                          }`}
                          style={{ width: `${Math.max(2, probPct)}%` }}
                        />
                      </div>
                      <div
                        className={`col-span-2 text-right font-mono tabular-nums ${
                          isTop ? 'text-white font-bold' : 'text-zinc-500'
                        }`}
                      >
                        {probPct.toFixed(1)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Maintenance Routing Footer for Selected Indian Station */}
          <div className="pt-3 border-t border-white/[0.06] text-xs flex items-center justify-between">
            <span className="text-zinc-400">Automated Action</span>
            <span className="text-sky-400 font-semibold">
              {formatMaintenanceLabel(liveDiagnostic.maintenanceAction)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
