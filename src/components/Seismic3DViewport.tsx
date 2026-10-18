import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  SensorMeta,
  SensorHealthSummary,
  TimeStepReading,
  FaultType,
  formatFaultLabel,
} from '../utils/sensorEngine';

interface Seismic3DViewportProps {
  sensors: SensorMeta[];
  sensorSummaries: SensorHealthSummary[];
  activeRow: TimeStepReading;
  correlationMatrix: Record<string, Record<string, number>>;
  selectedSensorId: string;
  alarmThreshold: number;
  onSelectSensor: (sensorId: string) => void;
}

type CameraPresetId = 'tectonic-overview' | 'borehole-cutaway' | 'top-array';

const BOREHOLE_POSITIONS: Record<string, [number, number, number]> = {
  'S-01': [-3.6, 0, -2.5], // Joshimath Himalaya (North)
  'S-02': [3.6, 0, -2.5],  // Bhuj Kutch (West)
  'S-03': [-3.6, 0, 2.5],  // Koyna-Pune (South-West)
  'S-04': [3.6, 0, 2.5],   // Shillong Plateau (East)
};

const CORRELATION_PAIRS: Array<[string, string]> = [
  ['S-01', 'S-02'],
  ['S-03', 'S-04'],
  ['S-01', 'S-03'],
  ['S-02', 'S-04'],
  ['S-01', 'S-04'],
  ['S-02', 'S-03'],
];

function getFaultHexColor(
  fault: FaultType,
  val: number | null,
  threshold: number,
  isRealEvent: boolean
): number {
  if (val === null || fault === 'DROPOUT') return 0xf43f5e; // Rose
  if (isRealEvent && val >= threshold - 0.35) return 0xef4444; // Crimson P-wave
  if (fault === 'STUCK_AT') return 0xa855f7; // Violet frozen ADC
  if (
    fault === 'OFFSET_DRIFT' ||
    fault === 'RANDOM_SPIKE' ||
    fault === 'EXCESSIVE_NOISE' ||
    fault === 'GAIN_ERROR' ||
    val >= threshold
  ) {
    return 0xf59e0b; // Amber isolated fault
  }
  return 0x06b6d4; // Cyan nominal
}

export const Seismic3DViewport: React.FC<Seismic3DViewportProps> = ({
  sensors,
  sensorSummaries,
  activeRow,
  correlationMatrix,
  selectedSensorId,
  alarmThreshold,
  onSelectSensor,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('tectonic-overview');
  const [explodeFactor, setExplodeFactor] = useState<number>(0);
  const [showWavefronts, setShowWavefronts] = useState<boolean>(true);
  const [showCorrelationWeb, setShowCorrelationWeb] = useState<boolean>(true);

  const calloutDomRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const latestPropsRef = useRef({
    sensors,
    sensorSummaries,
    activeRow,
    correlationMatrix,
    selectedSensorId,
    alarmThreshold,
    onSelectSensor,
    cameraPreset,
    explodeFactor,
    showWavefronts,
    showCorrelationWeb,
  });

  useEffect(() => {
    latestPropsRef.current = {
      sensors,
      sensorSummaries,
      activeRow,
      correlationMatrix,
      selectedSensorId,
      alarmThreshold,
      onSelectSensor,
      cameraPreset,
      explodeFactor,
      showWavefronts,
      showCorrelationWeb,
    };
  }, [
    sensors,
    sensorSummaries,
    activeRow,
    correlationMatrix,
    selectedSensorId,
    alarmThreshold,
    onSelectSensor,
    cameraPreset,
    explodeFactor,
    showWavefronts,
    showCorrelationWeb,
  ]);

  const cameraTargetRef = useRef<{
    pos: THREE.Vector3;
    lookAt: THREE.Vector3;
    dirty: boolean;
  }>({
    pos: new THREE.Vector3(0, 8.2, 11.8),
    lookAt: new THREE.Vector3(0, -0.3, 0),
    dirty: false,
  });

  const applyCameraPreset = (preset: CameraPresetId, targetSensorId?: string) => {
    setCameraPreset(preset);
    const sId = targetSensorId || latestPropsRef.current.selectedSensorId || 'S-02';
    const [bx, , bz] = BOREHOLE_POSITIONS[sId] || BOREHOLE_POSITIONS['S-02'];

    if (preset === 'tectonic-overview') {
      cameraTargetRef.current = {
        pos: new THREE.Vector3(0, 8.2, 11.8),
        lookAt: new THREE.Vector3(0, -0.3, 0),
        dirty: true,
      };
      setExplodeFactor(0);
    } else if (preset === 'top-array') {
      cameraTargetRef.current = {
        pos: new THREE.Vector3(0, 14.2, 0.01),
        lookAt: new THREE.Vector3(0, 0, 0),
        dirty: true,
      };
      setExplodeFactor(0);
    } else if (preset === 'borehole-cutaway') {
      cameraTargetRef.current = {
        pos: new THREE.Vector3(bx + 2.5, 1.4, bz + 2.9),
        lookAt: new THREE.Vector3(bx, -0.2, bz),
        dirty: true,
      };
      setExplodeFactor(1);
    }
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isHeadless =
      navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent);

    const width = container.clientWidth || 900;
    const height = container.clientHeight || 460;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060911);
    scene.fog = new THREE.FogExp2(0x060911, 0.025);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 8.2, 11.8);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isHeadless,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isHeadless ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    if (!isHeadless) {
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      scene.environment = pmremGenerator.fromScene(
        new RoomEnvironment(),
        0.04
      ).texture;
      pmremGenerator.dispose();
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.minDistance = 2.4;
    controls.maxDistance = 22;
    controls.target.set(0, -0.3, 0);

    // Lighting
    const ambient = new THREE.AmbientLight(0xdbeafe, isHeadless ? 1.5 : 0.75);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xf8fafc, 2.2);
    keyLight.position.set(7, 13, 8);
    scene.add(keyLight);

    const magmaRimLight = new THREE.DirectionalLight(0x06b6d4, 1.3);
    magmaRimLight.position.set(-8, -4, -6);
    scene.add(magmaRimLight);

    // 1. Layered Tectonic Crust Cutaway Block
    const crustGroup = new THREE.Group();
    scene.add(crustGroup);

    // Surface Alluvial Plain Slab
    const surfaceSlab = new THREE.Mesh(
      new THREE.BoxGeometry(11.6, 0.25, 8.6),
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.75,
        metalness: 0.25,
      })
    );
    surfaceSlab.position.y = 0.6;
    crustGroup.add(surfaceSlab);

    // Mid-Crust Basaltic Deccan/Himalayan Strata (Translucent Cutaway)
    const midStrata = new THREE.Mesh(
      new THREE.BoxGeometry(11.4, 1.8, 8.4),
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        transparent: true,
        opacity: 0.28,
        roughness: 0.5,
      })
    );
    midStrata.position.y = -0.45;
    crustGroup.add(midStrata);

    // Deep Granitic Bedrock Base
    const bedrockSlab = new THREE.Mesh(
      new THREE.BoxGeometry(11.6, 0.35, 8.6),
      new THREE.MeshStandardMaterial({
        color: 0x090d16,
        roughness: 0.85,
        metalness: 0.3,
      })
    );
    bedrockSlab.position.y = -1.55;
    crustGroup.add(bedrockSlab);

    // Surface Grid Helper
    const surfaceGrid = new THREE.GridHelper(11.4, 22, 0x1e293b, 0x0f172a);
    surfaceGrid.position.y = 0.73;
    crustGroup.add(surfaceGrid);

    // Glowing Tectonic Fault Fracture Line across the bedrock floor
    const faultPoints = [
      new THREE.Vector3(-5.5, -1.32, -1.8),
      new THREE.Vector3(-1.8, -1.32, -0.4),
      new THREE.Vector3(1.6, -1.32, 0.5),
      new THREE.Vector3(5.5, -1.32, 1.9),
    ];
    const faultCurve = new THREE.CatmullRomCurve3(faultPoints);
    const faultLineMesh = new THREE.Mesh(
      new THREE.TubeGeometry(faultCurve, 32, 0.07, 8, false),
      new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.55,
      })
    );
    crustGroup.add(faultLineMesh);

    // Simple Surface Civil Infrastructure Models (Metro Viaduct + Hospital + Dam)
    const infraMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.6,
      roughness: 0.35,
    });
    const metroBridge = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 0.12, 0.36),
      infraMat
    );
    metroBridge.position.set(0, 1.05, 0);
    crustGroup.add(metroBridge);

    for (let p = -1.8; p <= 1.8; p += 1.2) {
      const pier = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 0.35, 8),
        infraMat
      );
      pier.position.set(p, 0.85, 0);
      crustGroup.add(pier);
    }

    // 2. Build 4 Deep Borehole Seismic Observatories + Explodable Tri-Axial Seismometer Pods
    interface BoreholeRig {
      group: THREE.Group;
      casingPipe: THREE.Mesh;
      casingMat: THREE.MeshStandardMaterial;
      bedrockHalo: THREE.Mesh;
      bedrockHaloMat: THREE.MeshBasicMaterial;
      selectionRing: THREE.Mesh;
      selectionRingMat: THREE.MeshBasicMaterial;
      pointLight: THREE.PointLight;
      // Explodable 4-layer borehole seismometer parts
      geophoneMassMesh: THREE.Mesh;
      geophoneMassMat: THREE.MeshStandardMaterial;
      feedbackCoilGroup: THREE.Group;
      digitizerPcbGroup: THREE.Group;
      digitizerMat: THREE.MeshStandardMaterial;
      vsatHeadGroup: THREE.Group;
      vsatBeaconMat: THREE.MeshStandardMaterial;
      shockwaveRing: THREE.Mesh;
      shockwaveMat: THREE.MeshBasicMaterial;
    }

    const boreholeRigs: Record<string, BoreholeRig> = {};
    const clickableMeshes: THREE.Object3D[] = [];

    for (const sId of ['S-01', 'S-02', 'S-03', 'S-04']) {
      const [bx, , bz] = BOREHOLE_POSITIONS[sId];
      const rigGroup = new THREE.Group();
      rigGroup.position.set(bx, 0, bz);
      rigGroup.userData = { sensorId: sId };
      scene.add(rigGroup);

      // Bedrock Fault/Wave Halo at bottom of borehole
      const bedrockHaloMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
      });
      const bedrockHalo = new THREE.Mesh(
        new THREE.RingGeometry(0.35, 1.35, 32),
        bedrockHaloMat
      );
      bedrockHalo.rotation.x = -Math.PI / 2;
      bedrockHalo.position.y = -1.34;
      rigGroup.add(bedrockHalo);

      // Expanding P-Wave Shockwave Ring
      const shockwaveMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
      });
      const shockwaveRing = new THREE.Mesh(
        new THREE.RingGeometry(0.4, 0.65, 32),
        shockwaveMat
      );
      shockwaveRing.rotation.x = -Math.PI / 2;
      shockwaveRing.position.y = -1.32;
      rigGroup.add(shockwaveRing);

      // Selection Ring on Surface
      const selectionRingMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      });
      const selectionRing = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 0.98, 32),
        selectionRingMat
      );
      selectionRing.rotation.x = -Math.PI / 2;
      selectionRing.position.y = 0.75;
      rigGroup.add(selectionRing);

      // Armored Borehole Casing Shaft descending from surface (+0.7) to bedrock (-1.3)
      const casingMat = new THREE.MeshStandardMaterial({
        color: 0x64748b,
        metalness: 0.8,
        roughness: 0.3,
        transparent: true,
        opacity: 0.45,
      });
      const casingPipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.28, 2.0, 20),
        casingMat
      );
      casingPipe.position.y = -0.3;
      casingPipe.userData = { sensorId: sId };
      rigGroup.add(casingPipe);
      clickableMeshes.push(casingPipe);

      // Layer 1 (Bottom): Gold Geophone Proof Mass & Suspension Spring
      const geophoneMassMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0x06b6d4,
        emissiveIntensity: 0.8,
        metalness: 0.85,
        roughness: 0.2,
      });
      const geophoneMassMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.18, 0.36, 20),
        geophoneMassMat
      );
      geophoneMassMesh.position.y = -1.1;
      geophoneMassMesh.userData = { sensorId: sId };
      rigGroup.add(geophoneMassMesh);
      clickableMeshes.push(geophoneMassMesh);

      // Layer 2 (Lower-Mid): Tri-Axial Force-Balance Feedback Coil
      const feedbackCoilGroup = new THREE.Group();
      const coilCore = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.32, 16),
        new THREE.MeshStandardMaterial({
          color: 0x94a3b8,
          metalness: 0.9,
          roughness: 0.25,
        })
      );
      feedbackCoilGroup.add(coilCore);
      for (let r = -0.1; r <= 0.1; r += 0.1) {
        const copperWinding = new THREE.Mesh(
          new THREE.TorusGeometry(0.21, 0.03, 10, 24),
          new THREE.MeshStandardMaterial({
            color: 0xd97706,
            metalness: 0.85,
            roughness: 0.25,
          })
        );
        copperWinding.rotation.x = Math.PI / 2;
        copperWinding.position.y = r;
        feedbackCoilGroup.add(copperWinding);
      }
      feedbackCoilGroup.position.y = -0.55;
      rigGroup.add(feedbackCoilGroup);

      // Layer 3 (Upper-Mid): 24-Bit Sigma-Delta Digitizer PCB & ADC Chip
      const digitizerPcbGroup = new THREE.Group();
      const pcbBoard = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.42, 0.06),
        new THREE.MeshStandardMaterial({
          color: 0x047857,
          roughness: 0.4,
          metalness: 0.3,
        })
      );
      const digitizerMat = new THREE.MeshStandardMaterial({
        color: 0x111827,
        emissive: 0x06b6d4,
        emissiveIntensity: 0.6,
        roughness: 0.2,
      });
      const adcChip = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.18, 0.09),
        digitizerMat
      );
      digitizerPcbGroup.add(pcbBoard, adcChip);
      digitizerPcbGroup.position.y = 0.05;
      rigGroup.add(digitizerPcbGroup);

      // Layer 4 (Surface Head): VSAT Telemetry Transceiver & Beacon Dome
      const vsatHeadGroup = new THREE.Group();
      const headBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.28, 0.32, 20),
        new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          metalness: 0.8,
          roughness: 0.25,
        })
      );
      const vsatBeaconMat = new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        emissive: 0x06b6d4,
        emissiveIntensity: 1.3,
        roughness: 0.15,
      });
      const beaconCap = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        vsatBeaconMat
      );
      beaconCap.position.y = 0.15;
      vsatHeadGroup.add(headBody, beaconCap);
      vsatHeadGroup.position.y = 0.85;
      vsatHeadGroup.userData = { sensorId: sId };
      rigGroup.add(vsatHeadGroup);
      clickableMeshes.push(headBody, beaconCap);

      const pointLight = new THREE.PointLight(0x06b6d4, 1.5, 4.5);
      pointLight.position.set(0, -0.5, 0);
      rigGroup.add(pointLight);

      boreholeRigs[sId] = {
        group: rigGroup,
        casingPipe,
        casingMat,
        bedrockHalo,
        bedrockHaloMat,
        selectionRing,
        selectionRingMat,
        pointLight,
        geophoneMassMesh,
        geophoneMassMat,
        feedbackCoilGroup,
        digitizerPcbGroup,
        digitizerMat,
        vsatHeadGroup,
        vsatBeaconMat,
        shockwaveRing,
        shockwaveMat,
      };
    }

    // 3. Inter-Station Tectonic Correlation Bridges
    interface BridgeLine {
      pair: [string, string];
      mesh: THREE.Mesh;
      mat: THREE.MeshBasicMaterial;
    }
    const bridgeLines: BridgeLine[] = [];

    for (const [idA, idB] of CORRELATION_PAIRS) {
      const posA = new THREE.Vector3(...BOREHOLE_POSITIONS[idA]);
      const posB = new THREE.Vector3(...BOREHOLE_POSITIONS[idB]);
      posA.y = -0.9;
      posB.y = -0.9;
      const mid = posA.clone().lerp(posB, 0.5);
      mid.y = -0.45;

      const curve = new THREE.QuadraticBezierCurve3(posA, mid, posB);
      const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.03, 6, false);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        transparent: true,
        opacity: 0.4,
      });
      const mesh = new THREE.Mesh(tubeGeo, mat);
      scene.add(mesh);
      bridgeLines.push({ pair: [idA, idB], mesh, mat });
    }

    // Raycaster for clicking boreholes
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downPos = { x: 0, y: 0 };

    const handlePointerDown = (e: MouseEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: MouseEvent) => {
      const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      if (dist > 6) return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, true);
      if (hits.length > 0) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !obj.userData?.sensorId) {
          obj = obj.parent;
        }
        if (obj?.userData?.sensorId) {
          latestPropsRef.current.onSelectSensor(obj.userData.sensorId);
        }
      }
    };

    renderer.domElement.addEventListener('mousedown', handlePointerDown);
    renderer.domElement.addEventListener('mouseup', handlePointerUp);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 900;
      const h = container.clientHeight || 460;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Animation Loop
    let reqId = 0;
    let lastRenderTime = 0;
    const clock = new THREE.Clock();

    const animate = (now: number) => {
      reqId = requestAnimationFrame(animate);
      if (isHeadless && now - lastRenderTime < 65) {
        return;
      }
      lastRenderTime = now;

      const elapsed = clock.getElapsedTime();
      const props = latestPropsRef.current;
      const {
        activeRow: row,
        sensorSummaries: summaries,
        correlationMatrix: corrMat,
        selectedSensorId: selId,
        alarmThreshold: thresh,
        explodeFactor: explode,
        showWavefronts: wfVisible,
        showCorrelationWeb: corrVisible,
      } = props;

      if (cameraTargetRef.current.dirty) {
        camera.position.lerp(cameraTargetRef.current.pos, 0.1);
        controls.target.lerp(cameraTargetRef.current.lookAt, 0.1);
        if (
          camera.position.distanceTo(cameraTargetRef.current.pos) < 0.08 &&
          controls.target.distanceTo(cameraTargetRef.current.lookAt) < 0.08
        ) {
          cameraTargetRef.current.dirty = false;
        }
      }
      controls.update();

      const isRealQuake = row.consensusEstimate >= thresh - 0.35;

      // Update each borehole rig
      for (const sId of ['S-01', 'S-02', 'S-03', 'S-04']) {
        const rig = boreholeRigs[sId];
        if (!rig) continue;

        const val = row.readings[sId];
        const stepFault = row.injectedLabels[sId];
        const summary = summaries.find((s) => s.sensorId === sId);
        const activeFault =
          stepFault !== 'NONE' ? stepFault : summary?.dominantFault || 'NONE';

        const hexColor = getFaultHexColor(activeFault, val, thresh, isRealQuake);
        const isSelected = selId === sId;

        const pulse =
          activeFault !== 'NONE' || (val !== null && val >= thresh)
            ? 0.65 + 0.35 * Math.sin(elapsed * 7.0)
            : 0.5;

        rig.vsatBeaconMat.color.setHex(hexColor);
        rig.vsatBeaconMat.emissive.setHex(hexColor);
        rig.vsatBeaconMat.emissiveIntensity = 1.0 + pulse * 0.9;

        rig.geophoneMassMat.emissive.setHex(hexColor);
        rig.geophoneMassMat.emissiveIntensity = 0.6 + pulse * 0.8;

        // Oscillate geophone proof mass vertically based on ground acceleration!
        const accelAmp =
          activeFault === 'STUCK_AT' || val === null
            ? 0
            : Math.max(0.01, ((val - 4.0) / 6.0) * 0.12);
        const vibOffset = Math.sin(elapsed * 18.0 + (sId === 'S-02' ? 1.5 : 0)) * accelAmp;

        rig.digitizerMat.emissive.setHex(
          activeFault === 'STUCK_AT'
            ? 0xa855f7
            : activeFault === 'EXCESSIVE_NOISE'
            ? 0xf59e0b
            : 0x06b6d4
        );

        rig.bedrockHaloMat.color.setHex(hexColor);
        rig.bedrockHaloMat.opacity = 0.2 + pulse * 0.25;

        // Expanding seismic shockwave ring
        if (wfVisible && (isRealQuake || val === null || val >= thresh - 0.5)) {
          const wavePhase = (elapsed * 1.1 + (sId.charCodeAt(3) * 0.25)) % 1;
          const scale = 1.0 + wavePhase * 2.8;
          rig.shockwaveRing.scale.set(scale, scale, 1);
          rig.shockwaveMat.color.setHex(isRealQuake ? 0xef4444 : hexColor);
          rig.shockwaveMat.opacity = (1 - wavePhase) * 0.65;
        } else {
          rig.shockwaveMat.opacity = 0;
        }

        rig.selectionRing.visible = isSelected;
        if (isSelected) {
          rig.selectionRing.rotation.z = elapsed * 0.9;
        }

        // Smoothly explode borehole layers when explode > 0
        const targetMassY = -1.1 - explode * 0.35 + vibOffset;
        const targetCoilY = -0.55 + explode * 0.15;
        const targetPcbY = 0.05 + explode * 0.55;
        const targetHeadY = 0.85 + explode * 0.85;

        rig.geophoneMassMesh.position.y = THREE.MathUtils.lerp(
          rig.geophoneMassMesh.position.y,
          targetMassY,
          0.14
        );
        rig.feedbackCoilGroup.position.y = THREE.MathUtils.lerp(
          rig.feedbackCoilGroup.position.y,
          targetCoilY,
          0.14
        );
        rig.digitizerPcbGroup.position.y = THREE.MathUtils.lerp(
          rig.digitizerPcbGroup.position.y,
          targetPcbY,
          0.14
        );
        rig.vsatHeadGroup.position.y = THREE.MathUtils.lerp(
          rig.vsatHeadGroup.position.y,
          targetHeadY,
          0.14
        );
        rig.casingMat.opacity = THREE.MathUtils.lerp(
          rig.casingMat.opacity,
          explode > 0.2 ? 0.16 : 0.45,
          0.12
        );
      }

      // Update Correlation Bridges
      for (const b of bridgeLines) {
        b.mesh.visible = corrVisible;
        if (!corrVisible) continue;
        const [idA, idB] = b.pair;
        const r = corrMat[idA]?.[idB] ?? 0.85;
        if (r >= 0.7) {
          b.mat.color.setHex(isRealQuake ? 0xef4444 : 0x06b6d4);
          b.mat.opacity = 0.42;
        } else {
          b.mat.color.setHex(0xf59e0b);
          b.mat.opacity = 0.16 + 0.12 * Math.sin(elapsed * 8);
        }
      }

      renderer.render(scene, camera);

      // Update 2D Callout Badges via direct DOM transform
      const cw = container.clientWidth || width;
      const ch = container.clientHeight || height;
      for (const sId of ['S-01', 'S-02', 'S-03', 'S-04']) {
        const badgeEl = calloutDomRefs.current[sId];
        if (!badgeEl) continue;
        const [bx, , bz] = BOREHOLE_POSITIONS[sId];
        const worldPos = new THREE.Vector3(bx, 1.45 + explode * 0.75, bz);
        worldPos.project(camera);
        const rawX = (worldPos.x * 0.5 + 0.5) * cw;
        const rawY = (-worldPos.y * 0.5 + 0.5) * ch;
        const x = Math.max(90, Math.min(cw - 90, rawX));
        const y = Math.max(148, Math.min(ch - 48, rawY));
        if (worldPos.z < 1) {
          badgeEl.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
          badgeEl.style.opacity = '1';
        } else {
          badgeEl.style.opacity = '0';
        }
      }
    };

    reqId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(reqId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('mousedown', handlePointerDown);
      renderer.domElement.removeEventListener('mouseup', handlePointerUp);
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  const isRealQuake = activeRow.consensusEstimate >= alarmThreshold - 0.35;

  return (
    <div className="relative w-full h-[460px] bg-[#09090B] border border-white/[0.08] rounded-xl overflow-hidden select-none">
      <div
        ref={mountRef}
        data-testid="seismic-3d-canvas"
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Unified Top 3D Control Bar */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 bg-black/80 backdrop-blur-xl px-3 py-1.5 border border-white/[0.1] rounded-xl">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs font-medium text-zinc-400 pr-1.5">
            3D Camera
          </span>
          <button
            type="button"
            onClick={() => applyCameraPreset('tectonic-overview')}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
              cameraPreset === 'tectonic-overview'
                ? 'bg-white text-zinc-950 font-semibold'
                : 'text-zinc-300 hover:text-white'
            }`}
          >
            Crust Cutaway
          </button>
          <button
            type="button"
            onClick={() => applyCameraPreset('borehole-cutaway', selectedSensorId)}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
              cameraPreset === 'borehole-cutaway'
                ? 'bg-white text-zinc-950 font-semibold'
                : 'text-zinc-300 hover:text-white'
            }`}
          >
            Borehole {selectedSensorId}
          </button>
          <button
            type="button"
            onClick={() => applyCameraPreset('top-array')}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
              cameraPreset === 'top-array'
                ? 'bg-white text-zinc-950 font-semibold'
                : 'text-zinc-300 hover:text-white'
            }`}
          >
            Top Radar
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setExplodeFactor((prev) => (prev > 0.5 ? 0 : 1))}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
              explodeFactor > 0.5
                ? 'bg-amber-400 text-zinc-950 border-amber-300 font-semibold'
                : 'bg-white/[0.06] border-white/[0.1] text-zinc-200 hover:bg-white/[0.12]'
            }`}
          >
            {explodeFactor > 0.5 ? 'Collapse Pod' : 'Explode Seismometer'}
          </button>
          <button
            type="button"
            onClick={() => setShowWavefronts((p) => !p)}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
              showWavefronts
                ? 'bg-white/15 border-white/20 text-white'
                : 'bg-transparent border-white/[0.06] text-zinc-500'
            }`}
          >
            P-Waves
          </button>
          <button
            type="button"
            onClick={() => setShowCorrelationWeb((p) => !p)}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
              showCorrelationWeb
                ? 'bg-white/15 border-white/20 text-white'
                : 'bg-transparent border-white/[0.06] text-zinc-500'
            }`}
          >
            Correlation Mesh
          </button>
        </div>
      </div>

      {/* 2D Projected Borehole Callout Badges */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {['S-01', 'S-02', 'S-03', 'S-04'].map((sId, idx) => {
          const val = activeRow.readings[sId];
          const trust = activeRow.trustScores[sId] ?? 98;
          const stepFault = activeRow.injectedLabels[sId];
          const summary = sensorSummaries.find((s) => s.sensorId === sId);
          const meta = sensors.find((s) => s.id === sId);
          const fault =
            stepFault !== 'NONE' ? stepFault : summary?.dominantFault || 'NONE';
          const isSelected = selectedSensorId === sId;

          const borderTone =
            val === null || fault === 'DROPOUT'
              ? 'border-rose-500/80 bg-black/85 text-rose-100'
              : isRealQuake && val >= alarmThreshold - 0.35
              ? 'border-rose-500/80 bg-black/85 text-rose-100'
              : fault !== 'NONE' || val >= alarmThreshold
              ? 'border-amber-400/80 bg-black/85 text-amber-100'
              : 'border-white/[0.15] bg-black/80 text-zinc-100';

          const initLeft = 22 + (idx % 2) * 52;
          const initTop = 32 + Math.floor(idx / 2) * 38;

          return (
            <button
              key={sId}
              ref={(el) => {
                calloutDomRefs.current[sId] = el;
              }}
              type="button"
              onClick={() => onSelectSensor(sId)}
              style={{
                left: 0,
                top: 0,
                transform: `translate(-50%, -100%) translate(${initLeft * 8}px, ${initTop * 4}px)`,
              }}
              className={`pointer-events-auto absolute px-3 py-1.5 rounded-xl border text-left font-mono transition-shadow backdrop-blur-xl ${borderTone} ${
                isSelected ? 'ring-2 ring-white/40 shadow-2xl' : 'opacity-90 hover:opacity-100'
              }`}
            >
              <div className="flex items-center gap-2 text-[10px]">
                <span className="font-bold text-sky-400">{sId}</span>
                <span className="font-sans font-medium text-zinc-200">{meta?.city || sId}</span>
                <span
                  className={
                    trust >= 80
                      ? 'text-emerald-400'
                      : trust >= 55
                      ? 'text-amber-300'
                      : 'text-rose-400'
                  }
                >
                  {trust.toFixed(0)}%
                </span>
              </div>
              <div className="text-xs font-bold tabular-nums mt-0.5">
                {val !== null ? `${val.toFixed(2)} gal` : 'Dropout'}
              </div>
              {fault !== 'NONE' && (
                <div className="text-[10px] font-sans text-amber-300 truncate max-w-[140px]">
                  {formatFaultLabel(fault)}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom-Left Legend */}
      <div className="absolute bottom-3 left-3 z-10 bg-black/80 backdrop-blur-xl px-3.5 py-2 border border-white/[0.1] rounded-xl text-xs text-zinc-300 flex flex-wrap items-center gap-3">
        <span>
          <strong className="text-white font-medium">3D Borehole Array:</strong> 110–150m Deep Force-Balance Seismometers
        </span>
        <span className="text-zinc-600">·</span>
        <span className="font-mono">
          Consensus:{' '}
          <strong className={isRealQuake ? 'text-rose-400' : 'text-sky-400'}>
            {activeRow.consensusEstimate.toFixed(2)} gal
          </strong>
        </span>
      </div>
    </div>
  );
};
