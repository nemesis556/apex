import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  TimeStepReading,
  SensorMeta,
  SensorHealthSummary,
  FaultType,
  formatFaultLabel,
} from '../utils/sensorEngine';

export type CameraPresetId = 'isometric' | 'top-thermal' | 'probe-macro' | 'chiller-flow';

interface ColdVault3DViewportProps {
  row: TimeStepReading;
  sensors: SensorMeta[];
  sensorSummaries: SensorHealthSummary[];
  correlationMatrix: Record<string, Record<string, number>>;
  selectedSensorId: string;
  alarmThreshold: number;
  onSelectSensor: (sensorId: string) => void;
}

interface ProbePartsRef {
  group: THREE.Group;
  hitProxy: THREE.Mesh;
  basePedestal: THREE.Mesh;
  thermowellStem: THREE.Mesh;
  rtdTip: THREE.Mesh;
  internalPcb: THREE.Group;
  ferriteRing: THREE.Mesh;
  glassCollar: THREE.Mesh;
  transmitterHead: THREE.Mesh;
  ledHalo: THREE.Mesh;
  conduitStub: THREE.Mesh;
  selectionRing: THREE.Mesh;
  thermalPad: THREE.Mesh;
  worldAnchor: THREE.Vector3;
}

interface BridgeRef {
  idA: string;
  idB: string;
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
}

interface ScreenCallout {
  id: string;
  x: number;
  y: number;
  visible: boolean;
}

const BAY_COORDS: Record<string, [number, number, number]> = {
  'S-01': [-3.1, 0, -2.1],
  'S-02': [3.1, 0, -2.1],
  'S-03': [-3.1, 0, 2.1],
  'S-04': [3.1, 0, 2.1],
};

// Pre-allocated math helpers at module scope (zero GC in render loop)
const _targetCamPos = new THREE.Vector3();
const _targetLookAt = new THREE.Vector3();
const _projVec = new THREE.Vector3();
const _tempColor = new THREE.Color();

function createFloorGridTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#070B12';
    ctx.fillRect(0, 0, 1024, 1024);

    // Subtle sub-grid
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.55)';
    ctx.lineWidth = 1;
    const step = 32;
    for (let i = 0; i <= 1024; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 1024);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(1024, i);
      ctx.stroke();
    }

    // Major architectural bay dividers
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.28)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 1024; i += 128) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 1024);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(1024, i);
      ctx.stroke();
    }

    // Perimeter hazard border
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 6;
    ctx.strokeRect(24, 24, 976, 976);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createRadialThermalTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 124);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(0.45, 'rgba(255, 255, 255, 0.45)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const ColdVault3DViewport: React.FC<ColdVault3DViewportProps> = ({
  row,
  sensors,
  sensorSummaries,
  correlationMatrix,
  selectedSensorId,
  alarmThreshold,
  onSelectSensor,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('isometric');
  const [explodeFactor, setExplodeFactor] = useState<number>(0);
  const [showAirflow, setShowAirflow] = useState<boolean>(true);
  const [showCorrelationWeb, setShowCorrelationWeb] = useState<boolean>(true);
  const [showThermalFloor, setShowThermalFloor] = useState<boolean>(true);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [webglReady, setWebglReady] = useState<boolean>(true);
  const calloutButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Store latest props & UI state in refs so WebGL animation loop reads live values without re-mounting
  const stateRef = useRef({
    row,
    sensors,
    sensorSummaries,
    correlationMatrix,
    selectedSensorId,
    alarmThreshold,
    cameraPreset,
    explodeFactor,
    showAirflow,
    showCorrelationWeb,
    showThermalFloor,
    onSelectSensor,
  });

  useEffect(() => {
    stateRef.current = {
      row,
      sensors,
      sensorSummaries,
      correlationMatrix,
      selectedSensorId,
      alarmThreshold,
      cameraPreset,
      explodeFactor,
      showAirflow,
      showCorrelationWeb,
      showThermalFloor,
      onSelectSensor,
    };
  }, [
    row,
    sensors,
    sensorSummaries,
    correlationMatrix,
    selectedSensorId,
    alarmThreshold,
    cameraPreset,
    explodeFactor,
    showAirflow,
    showCorrelationWeb,
    showThermalFloor,
    onSelectSensor,
  ]);

  const handlePresetClick = (preset: CameraPresetId) => {
    setCameraPreset(preset);
    if (preset === 'probe-macro' && explodeFactor < 0.55) {
      setExplodeFactor(0.75);
    } else if (preset !== 'probe-macro' && explodeFactor > 0) {
      setExplodeFactor(0);
    }
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
      });
    } catch {
      setWebglReady(false);
      return;
    }

    const gl = renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
      : '';
    const isSoftwareWebGL =
      navigator.webdriver ||
      /HeadlessChrome|SwiftShader|llvmpipe|Software/i.test(
        navigator.userAgent + ' ' + rendererStr
      );

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(
      isSoftwareWebGL ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    renderer.shadowMap.enabled = !isSoftwareWebGL;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 520;
    renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060911);
    scene.fog = new THREE.FogExp2(0x060911, 0.032);

    // Studio environment reflections (mandatory for high-metalness PBR & glass)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 120);
    camera.position.set(0, 9.2, 11.4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 2.4;
    controls.maxDistance = 24;
    controls.target.set(0, 1.1, 0);

    // 3-Point Warm/Cool Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x0f172a, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 2.1);
    keyLight.position.set(7.5, 12.0, 8.5);
    keyLight.castShadow = !isSoftwareWebGL;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 30;
    const d = 8.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x06b6d4, 1.35);
    rimLight.position.set(-8.0, 6.5, -7.5);
    scene.add(rimLight);

    // Floor Platform & Grid
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const floorTex = createFloorGridTexture(maxAniso);
    const radialTex = createRadialThermalTexture();

    const floorGeo = new THREE.PlaneGeometry(14.5, 11.5);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.65,
      metalness: 0.25,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Subtle Cutaway Glass Perimeter Walls for the Cold-Storage Biobank Envelope
    const wallMat = new THREE.MeshPhysicalMaterial({
      color: 0x1e293b,
      metalness: 0.1,
      roughness: 0.15,
      clearcoat: 1.0,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(14.5, 3.6, 0.12),
      wallMat
    );
    backWall.position.set(0, 1.8, -5.75);
    scene.add(backWall);

    const leftWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 3.6, 11.5),
      wallMat
    );
    leftWall.position.set(-7.25, 1.8, 0);
    scene.add(leftWall);

    // North Glycol Chiller Manifold Assembly (Composite 6-part Group on North Wall)
    const chillerGroup = new THREE.Group();
    chillerGroup.position.set(0, 2.35, -5.35);

    const chillerHousing = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 1.45, 0.75),
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.85,
        roughness: 0.3,
      })
    );
    chillerGroup.add(chillerHousing);

    const copperCoilMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.92,
      roughness: 0.22,
    });
    for (let i = -2; i <= 2; i++) {
      const coilTube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 4.8, 12),
        copperCoilMat
      );
      coilTube.rotation.z = Math.PI / 2;
      coilTube.position.set(0, i * 0.18, 0.39);
      chillerGroup.add(coilTube);
    }

    const fanImpellers: THREE.Group[] = [];
    const shroudMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.7,
      roughness: 0.4,
    });
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.4,
      metalness: 0.8,
      roughness: 0.25,
    });

    [-1.45, 1.45].forEach((xOff) => {
      const shroud = new THREE.Mesh(
        new THREE.TorusGeometry(0.48, 0.06, 14, 32),
        shroudMat
      );
      shroud.position.set(xOff, 0, 0.42);
      chillerGroup.add(shroud);

      const impeller = new THREE.Group();
      impeller.position.set(xOff, 0, 0.41);
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.1, 16),
        shroudMat
      );
      hub.rotation.x = Math.PI / 2;
      impeller.add(hub);

      for (let b = 0; b < 6; b++) {
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(0.38, 0.09, 0.02),
          bladeMat
        );
        const angle = (b * Math.PI) / 3;
        blade.position.set(Math.cos(angle) * 0.22, Math.sin(angle) * 0.22, 0);
        blade.rotation.z = angle;
        blade.rotation.y = 0.35;
        impeller.add(blade);
      }
      fanImpellers.push(impeller);
      chillerGroup.add(impeller);
    });
    scene.add(chillerGroup);

    // Shared materials for Cryo Racks & Sensor Probes
    const steelPostMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.9,
      roughness: 0.22,
    });
    const trayMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.78,
      roughness: 0.38,
    });
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.65,
      roughness: 0.55,
    });

    // InstancedMesh for 320 Borosilicate Vaccine Vials & Anodized Caps across the 4 Bays
    const totalVials = 4 * 80; // 4 bays * (2 shelves * 8 cols * 5 rows) = 320 vials
    const vialBodyGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.22, 10);
    const vialBodyMat = new THREE.MeshPhysicalMaterial({
      color: 0xbae6fd,
      metalness: 0.1,
      roughness: 0.12,
      clearcoat: 1.0,
      transparent: true,
      opacity: 0.72,
    });
    const vialCapGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10);
    const vialCapMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.65,
      roughness: 0.25,
    });

    const vialBodyInstanced = new THREE.InstancedMesh(
      vialBodyGeo,
      vialBodyMat,
      totalVials
    );
    const vialCapInstanced = new THREE.InstancedMesh(
      vialCapGeo,
      vialCapMat,
      totalVials
    );
    const dummy = new THREE.Object3D();
    const bayCapColors = [
      new THREE.Color(0x06b6d4),
      new THREE.Color(0x10b981),
      new THREE.Color(0x3b82f6),
      new THREE.Color(0x8b5cf6),
    ];

    let vialIdx = 0;

    // Build 4 Cryo-Storage Racks + 4 Composite 9-Part Sensor Probes
    const probeMap = new Map<string, ProbePartsRef>();
    const clickableProxies: THREE.Object3D[] = [];

    const sensorIds = ['S-01', 'S-02', 'S-03', 'S-04'];
    sensorIds.forEach((sId, bayIndex) => {
      const [bx, , bz] = BAY_COORDS[sId];
      const bayGroup = new THREE.Group();
      bayGroup.position.set(bx, 0, bz);

      // Plinth base sitting flush on y = 0
      const plinth = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 0.14, 2.1),
        plinthMat
      );
      plinth.position.y = 0.07;
      plinth.receiveShadow = true;
      bayGroup.add(plinth);

      // 4 Stainless Steel Corner Uprights
      const postOffsets = [
        [-1.55, -0.9],
        [1.55, -0.9],
        [-1.55, 0.9],
        [1.55, 0.9],
      ];
      postOffsets.forEach(([px, pz]) => {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, 2.0, 12),
          steelPostMat
        );
        post.position.set(px, 1.05, pz);
        post.castShadow = !isSoftwareWebGL;
        bayGroup.add(post);
      });

      // 3 Cryo Shelves
      const shelfHeights = [0.45, 1.05, 1.65];
      shelfHeights.forEach((sy, sIdx) => {
        const shelf = new THREE.Mesh(
          new THREE.BoxGeometry(3.2, 0.05, 1.9),
          trayMat
        );
        shelf.position.y = sy;
        shelf.receiveShadow = true;
        bayGroup.add(shelf);

        // Populate vials on the lower 2 shelves
        if (sIdx < 2) {
          for (let r = 0; r < 5; r++) {
            for (let c = 0; c < 8; c++) {
              const vx = bx - 1.15 + c * 0.32;
              const vz = bz - 0.62 + r * 0.31;
              const vy = sy + 0.135;

              dummy.position.set(vx, vy, vz);
              dummy.rotation.set(0, 0, 0);
              dummy.scale.set(1, 1, 1);
              dummy.updateMatrix();
              vialBodyInstanced.setMatrixAt(vialIdx, dummy.matrix);

              dummy.position.set(vx, vy + 0.13, vz);
              dummy.updateMatrix();
              vialCapInstanced.setMatrixAt(vialIdx, dummy.matrix);
              vialCapInstanced.setColorAt(vialIdx, bayCapColors[bayIndex]);

              vialIdx++;
            }
          }
        }
      });

      // Thermal Floor Glow Pad under the bay (polygonOffset to prevent Z-fighting)
      const padMat = new THREE.MeshBasicMaterial({
        map: radialTex,
        color: 0x06b6d4,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const thermalPad = new THREE.Mesh(
        new THREE.PlaneGeometry(4.6, 3.6),
        padMat
      );
      thermalPad.rotation.x = -Math.PI / 2;
      thermalPad.position.set(0, 0.02, 0);
      bayGroup.add(thermalPad);

      // Composite 9-Part Industrial PT100 Smart Sensor Probe Tower mounted on the inner corner of the bay
      const probeGroup = new THREE.Group();
      const probeOffsetX = bx < 0 ? 1.25 : -1.25;
      const probeOffsetZ = bz < 0 ? 0.65 : -0.65;
      probeGroup.position.set(probeOffsetX, 1.68, probeOffsetZ);

      // 1. Mounting Base Pedestal
      const basePedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.26, 0.12, 20),
        new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          metalness: 0.85,
          roughness: 0.35,
        })
      );
      basePedestal.position.y = 0.06;
      probeGroup.add(basePedestal);

      // 2. Stainless Steel Thermowell Stem plunging down into the vaccine rack
      const thermowellStem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.045, 0.95, 16),
        new THREE.MeshStandardMaterial({
          color: 0xe2e8f0,
          metalness: 0.95,
          roughness: 0.15,
        })
      );
      thermowellStem.position.y = -0.38;
      probeGroup.add(thermowellStem);

      // 3. Platinum RTD Sensing Tip at bottom of stem
      const rtdTip = new THREE.Mesh(
        new THREE.ConeGeometry(0.055, 0.18, 16),
        new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x0284c7,
          emissiveIntensity: 0.5,
          metalness: 0.9,
          roughness: 0.15,
        })
      );
      rtdTip.rotation.x = Math.PI;
      rtdTip.position.y = -0.94;
      probeGroup.add(rtdTip);

      // 4. Internal Gold PCB + 16-bit Sigma-Delta ADC Microchip (revealed in glass / exploded mode)
      const internalPcb = new THREE.Group();
      internalPcb.position.y = 0.36;
      const pcbBoard = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.36, 0.03),
        new THREE.MeshStandardMaterial({
          color: 0x065f46,
          metalness: 0.4,
          roughness: 0.5,
        })
      );
      internalPcb.add(pcbBoard);
      const adcChip = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.11, 0.045),
        new THREE.MeshStandardMaterial({
          color: 0x090d16,
          metalness: 0.8,
          roughness: 0.2,
        })
      );
      internalPcb.add(adcChip);
      const goldTrace = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.04, 0.036),
        new THREE.MeshStandardMaterial({
          color: 0xfbbf24,
          metalness: 0.95,
          roughness: 0.18,
        })
      );
      goldTrace.position.y = -0.11;
      internalPcb.add(goldTrace);
      probeGroup.add(internalPcb);

      // 5. Ferrite EMI Shield Ring
      const ferriteRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.16, 0.035, 12, 24),
        new THREE.MeshStandardMaterial({
          color: 0x334155,
          metalness: 0.55,
          roughness: 0.6,
        })
      );
      ferriteRing.rotation.x = Math.PI / 2;
      ferriteRing.position.y = 0.2;
      probeGroup.add(ferriteRing);

      // 6. Optical Glass Inspection Collar (fast single-pass transparent clearcoat)
      const glassCollar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.19, 0.42, 20),
        new THREE.MeshPhysicalMaterial({
          color: 0xe0f2fe,
          roughness: 0.08,
          metalness: 0.1,
          clearcoat: 1.0,
          transparent: true,
          opacity: 0.38,
          depthWrite: false,
        })
      );
      glassCollar.position.y = 0.38;
      glassCollar.renderOrder = 2;
      probeGroup.add(glassCollar);

      // 7. Anodized Titanium Transmitter Head Cap
      const transmitterHead = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.21, 0.26, 20),
        new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          metalness: 0.88,
          roughness: 0.24,
        })
      );
      transmitterHead.position.y = 0.72;
      probeGroup.add(transmitterHead);

      // 8. Emissive Diagnostic Telemetry Halo Ring
      const ledHalo = new THREE.Mesh(
        new THREE.TorusGeometry(0.245, 0.032, 14, 28),
        new THREE.MeshStandardMaterial({
          color: 0x10b981,
          emissive: 0x10b981,
          emissiveIntensity: 1.6,
          roughness: 0.2,
        })
      );
      ledHalo.rotation.x = Math.PI / 2;
      ledHalo.position.y = 0.72;
      probeGroup.add(ledHalo);

      // 9. Armored RS-485 Bus Conduit Stub
      const conduitStub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.28, 12),
        steelPostMat
      );
      conduitStub.rotation.z = Math.PI / 2;
      conduitStub.position.set(bx < 0 ? 0.28 : -0.28, 0.72, 0);
      probeGroup.add(conduitStub);

      // Selection indicator ring around base of probe
      const selectionRing = new THREE.Mesh(
        new THREE.RingGeometry(0.32, 0.42, 28),
        new THREE.MeshBasicMaterial({
          color: 0x22d3ee,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9,
        })
      );
      selectionRing.rotation.x = -Math.PI / 2;
      selectionRing.position.y = 0.03;
      probeGroup.add(selectionRing);

      // Simplified invisible collision box for fast raycasting
      const hitProxy = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 2.2, 0.95),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitProxy.position.y = 0.1;
      hitProxy.userData = { sensorId: sId };
      probeGroup.add(hitProxy);
      clickableProxies.push(hitProxy);

      bayGroup.add(probeGroup);
      scene.add(bayGroup);

      const worldAnchor = new THREE.Vector3(
        bx + probeOffsetX,
        1.68 + 0.72,
        bz + probeOffsetZ
      );

      probeMap.set(sId, {
        group: probeGroup,
        hitProxy,
        basePedestal,
        thermowellStem,
        rtdTip,
        internalPcb,
        ferriteRing,
        glassCollar,
        transmitterHead,
        ledHalo,
        conduitStub,
        selectionRing,
        thermalPad,
        worldAnchor,
      });
    });

    vialBodyInstanced.computeBoundingSphere();
    vialCapInstanced.computeBoundingSphere();
    scene.add(vialBodyInstanced);
    scene.add(vialCapInstanced);

    // 3D Inter-Sensor Consensus Laser Bridges (6 pairwise links between the 4 probes)
    const bridgesGroup = new THREE.Group();
    const bridges: BridgeRef[] = [];
    for (let i = 0; i < sensorIds.length; i++) {
      for (let j = i + 1; j < sensorIds.length; j++) {
        const idA = sensorIds[i];
        const idB = sensorIds[j];
        const pA = probeMap.get(idA)!.worldAnchor;
        const pB = probeMap.get(idB)!.worldAnchor;

        const dist = pA.distanceTo(pB);
        const cylGeo = new THREE.CylinderGeometry(0.018, 0.018, dist, 8);
        cylGeo.rotateX(Math.PI / 2);
        const cylMat = new THREE.MeshStandardMaterial({
          color: 0x06b6d4,
          emissive: 0x06b6d4,
          emissiveIntensity: 0.9,
          transparent: true,
          opacity: 0.65,
          roughness: 0.2,
        });
        const bridgeMesh = new THREE.Mesh(cylGeo, cylMat);
        bridgeMesh.position.copy(pA).add(pB).multiplyScalar(0.5);
        bridgeMesh.lookAt(pB);
        bridgesGroup.add(bridgeMesh);
        bridges.push({ idA, idB, mesh: bridgeMesh, mat: cylMat });
      }
    }
    scene.add(bridgesGroup);

    // Animated Laminar Cryo-Airflow Streamlines (180 particles flowing North -> South)
    const particleCount = 180;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const speeds = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 10.5;
      positions[i * 3 + 1] = 0.5 + Math.random() * 2.3;
      positions[i * 3 + 2] = -5.0 + Math.random() * 10.0;
      speeds[i] = 1.6 + Math.random() * 1.4;
    }
    particleGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );
    const particleMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.09,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const airflowPoints = new THREE.Points(particleGeo, particleMat);
    scene.add(airflowPoints);

    // Pre-compile shaders
    renderer.compile(scene, camera);

    // Raycasting for clicking 3D sensor probes directly
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    const handlePointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: PointerEvent) => {
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      if (Math.hypot(dx, dy) > 6) return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableProxies, false);
      if (hits.length > 0) {
        const hitSensorId = hits[0].object.userData?.sensorId;
        if (hitSensorId) {
          stateRef.current.onSelectSensor(hitSensorId);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    // Resize handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 520;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Animation loop with exponential damping (THREE.MathUtils.damp)
    const clock = new THREE.Clock();
    let animFrameId = 0;
    let activePresetTracker: CameraPresetId | null = null;
    let activeSelectedTracker: string | null = null;
    let cameraTransitionTimer = 0;

    const animate = () => {
      animFrameId = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();
      const st = stateRef.current;

      // Trigger smooth camera choreography when preset or selected sensor changes
      if (
        st.cameraPreset !== activePresetTracker ||
        (st.cameraPreset === 'probe-macro' &&
          st.selectedSensorId !== activeSelectedTracker)
      ) {
        activePresetTracker = st.cameraPreset;
        activeSelectedTracker = st.selectedSensorId;
        cameraTransitionTimer = 1.6;
      }

      if (cameraTransitionTimer > 0) {
        cameraTransitionTimer = Math.max(0, cameraTransitionTimer - delta);
        const selProbe =
          probeMap.get(st.selectedSensorId) || probeMap.get('S-02')!;

        if (st.cameraPreset === 'isometric') {
          _targetCamPos.set(0, 8.8, 11.2);
          _targetLookAt.set(0, 1.0, 0);
        } else if (st.cameraPreset === 'top-thermal') {
          _targetCamPos.set(0, 14.2, 0.8);
          _targetLookAt.set(0, 0.2, 0);
        } else if (st.cameraPreset === 'chiller-flow') {
          _targetCamPos.set(3.2, 3.8, -1.2);
          _targetLookAt.set(0, 2.1, -5.2);
        } else if (st.cameraPreset === 'probe-macro') {
          const anchor = selProbe.worldAnchor;
          const offsetX = anchor.x < 0 ? 1.85 : -1.85;
          _targetCamPos.set(
            anchor.x + offsetX,
            anchor.y + 0.55,
            anchor.z + 2.05
          );
          _targetLookAt.set(anchor.x, anchor.y - 0.15, anchor.z);
        }

        camera.position.x = THREE.MathUtils.damp(
          camera.position.x,
          _targetCamPos.x,
          5.5,
          delta
        );
        camera.position.y = THREE.MathUtils.damp(
          camera.position.y,
          _targetCamPos.y,
          5.5,
          delta
        );
        camera.position.z = THREE.MathUtils.damp(
          camera.position.z,
          _targetCamPos.z,
          5.5,
          delta
        );

        controls.target.x = THREE.MathUtils.damp(
          controls.target.x,
          _targetLookAt.x,
          6.0,
          delta
        );
        controls.target.y = THREE.MathUtils.damp(
          controls.target.y,
          _targetLookAt.y,
          6.0,
          delta
        );
        controls.target.z = THREE.MathUtils.damp(
          controls.target.z,
          _targetLookAt.z,
          6.0,
          delta
        );
      }

      controls.update();

      // Rotate Glycol Chiller Axial Fans
      const isGenuineExcursion =
        st.row.consensusEstimate >= st.alarmThreshold - 0.35;
      const fanSpeed = isGenuineExcursion ? 2.2 : 9.5;
      fanImpellers.forEach((imp) => {
        imp.rotation.z += delta * fanSpeed;
      });

      // Update Laminar Airflow Streamlines
      airflowPoints.visible = st.showAirflow;
      if (st.showAirflow) {
        const posAttr = particleGeo.getAttribute(
          'position'
        ) as THREE.BufferAttribute;
        for (let i = 0; i < particleCount; i++) {
          let z = posAttr.getZ(i) + speeds[i] * delta;
          let y =
            posAttr.getY(i) +
            Math.sin(elapsed * 2.0 + i) * 0.004 * (isGenuineExcursion ? 4 : 1);
          if (z > 5.2) {
            z = -5.0;
            y = 0.5 + ((i * 17) % 23) * 0.1;
          }
          posAttr.setZ(i, z);
          posAttr.setY(i, y);
        }
        posAttr.needsUpdate = true;
        _tempColor.setHex(isGenuineExcursion ? 0xf43f5e : 0x38bdf8);
        particleMat.color.lerp(_tempColor, 0.1);
      }

      // Update each Sensor Probe's Exploded Kinematics, Emissive Fault Status & Floor Thermal Pad
      probeMap.forEach((parts, sId) => {
        const reading = st.row.readings[sId];
        const trust = st.row.trustScores[sId] ?? 100;
        const fault: FaultType = st.row.injectedLabels[sId] ?? 'NONE';
        const isSelected = st.selectedSensorId === sId;

        const targetExplode = isSelected
          ? st.explodeFactor
          : st.explodeFactor * 0.35;

        parts.transmitterHead.position.y = THREE.MathUtils.damp(
          parts.transmitterHead.position.y,
          0.72 + targetExplode * 0.68,
          6.0,
          delta
        );
        parts.ledHalo.position.y = parts.transmitterHead.position.y;
        parts.conduitStub.position.y = parts.transmitterHead.position.y;

        parts.glassCollar.position.y = THREE.MathUtils.damp(
          parts.glassCollar.position.y,
          0.38 + targetExplode * 0.28,
          6.0,
          delta
        );
        parts.internalPcb.position.y = THREE.MathUtils.damp(
          parts.internalPcb.position.y,
          0.36 + targetExplode * 0.18,
          6.0,
          delta
        );
        parts.ferriteRing.position.y = THREE.MathUtils.damp(
          parts.ferriteRing.position.y,
          0.2 - targetExplode * 0.12,
          6.0,
          delta
        );
        parts.thermowellStem.position.y = THREE.MathUtils.damp(
          parts.thermowellStem.position.y,
          -0.38 - targetExplode * 0.32,
          6.0,
          delta
        );
        parts.rtdTip.position.y = THREE.MathUtils.damp(
          parts.rtdTip.position.y,
          -0.94 - targetExplode * 0.56,
          6.0,
          delta
        );

        let statusHex = 0x10b981;
        if (fault === 'GENUINE_EVENT' || isGenuineExcursion) {
          statusHex = 0xf43f5e;
        } else if (reading === null || fault === 'DROPOUT') {
          statusHex = 0xe11d48;
        } else if (fault === 'STUCK_AT') {
          statusHex = 0xa855f7;
        } else if (fault !== 'NONE' || trust < 75) {
          statusHex = 0xf59e0b;
        }

        const haloMat = parts.ledHalo.material as THREE.MeshStandardMaterial;
        _tempColor.setHex(statusHex);
        haloMat.color.lerp(_tempColor, 0.15);
        haloMat.emissive.lerp(_tempColor, 0.15);

        const tipMat = parts.rtdTip.material as THREE.MeshStandardMaterial;
        tipMat.color.lerp(_tempColor, 0.15);
        tipMat.emissive.lerp(_tempColor, 0.15);

        parts.selectionRing.visible = isSelected;
        parts.selectionRing.rotation.z = elapsed * 0.6;

        parts.thermalPad.visible = st.showThermalFloor;
        const padMat = parts.thermalPad.material as THREE.MeshBasicMaterial;
        const padHex = isGenuineExcursion
          ? 0xf43f5e
          : fault !== 'NONE' || trust < 75
          ? 0xf59e0b
          : 0x06b6d4;
        _tempColor.setHex(padHex);
        padMat.color.lerp(_tempColor, 0.12);
      });

      // Update 3D Inter-Sensor Consensus Laser Bridges
      bridgesGroup.visible = st.showCorrelationWeb;
      if (st.showCorrelationWeb) {
        bridges.forEach((b) => {
          const r = st.correlationMatrix[b.idA]?.[b.idB] ?? 1.0;
          const trustA = st.row.trustScores[b.idA] ?? 100;
          const trustB = st.row.trustScores[b.idB] ?? 100;
          const isCoupled = r >= 0.72 && trustA >= 65 && trustB >= 65;

          _tempColor.setHex(isCoupled ? 0x06b6d4 : 0xf59e0b);
          b.mat.color.lerp(_tempColor, 0.15);
          b.mat.emissive.lerp(_tempColor, 0.15);
          b.mat.opacity = isCoupled ? 0.62 : 0.25;
          const scaleRad = isCoupled ? 1.0 : 0.45;
          b.mesh.scale.set(scaleRad, scaleRad, 1.0);
        });
      }

      renderer.render(scene, camera);

      // Update 2D callout badge transforms directly via DOM refs (zero React re-renders!)
      const w = renderer.domElement.clientWidth || width;
      const h = renderer.domElement.clientHeight || height;
      probeMap.forEach((parts, sId) => {
        const btn = calloutButtonRefs.current[sId];
        if (!btn) return;
        _projVec.copy(parts.worldAnchor);
        _projVec.y += 0.48 + st.explodeFactor * 0.45;
        _projVec.project(camera);

        const x = ((_projVec.x + 1) * 0.5) * w;
        const y = ((-_projVec.y + 1) * 0.5) * h;
        const visible =
          _projVec.z < 1.0 && x > 30 && x < w - 30 && y > 30 && y < h - 60;
        btn.style.display = visible ? 'block' : 'none';
        if (visible) {
          btn.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(
            y
          )}px, 0) translate(-50%, -100%)`;
        }
      });
    };

    animate();

    return () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      controls.dispose();
      floorTex.dispose();
      radialTex.dispose();
      renderer.dispose();
    };
  }, []);

  const isGenuineExcursion = row.consensusEstimate >= alarmThreshold - 0.35;

  return (
    <div className="relative w-full h-[520px] bg-[#060911] border border-slate-800 overflow-hidden select-none">
      {/* Dedicated Empty WebGL Canvas Mount Ref */}
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Top-Left Minimal Spec & Telemetry Badge (No Side-Panel Clutter) */}
      <div className="absolute top-3 left-3 z-10 pointer-events-none bg-[#070B12]/90 border border-slate-800 px-3.5 py-2.5 max-w-md">
        <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-400">
          3D WEBGL DIGITAL TWIN · 320 VACCINE VIALS · 4 PT100 SMART PROBES
        </div>
        <div className="text-xs font-semibold text-slate-100 mt-0.5 font-mono tabular-nums">
          TRUE VAULT: {row.groundTruthEnv.toFixed(2)} °C · AI CONSENSUS:{' '}
          <span
            className={
              isGenuineExcursion
                ? 'text-rose-400 font-bold'
                : 'text-emerald-400'
            }
          >
            {row.consensusEstimate.toFixed(2)} °C
          </span>
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">
          Drag to orbit 360° · Scroll to zoom · Click any 3D probe tower to inspect or inject faults
        </div>
      </div>

      {/* Projected 3D-to-2D Sensor Probe Callout Badges (Updated via direct DOM ref) */}
      <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
        {sensors.map((s) => {
          const reading = row.readings[s.id];
          const trust = row.trustScores[s.id] ?? 100;
          const fault = row.injectedLabels[s.id] ?? 'NONE';
          const isSelected = selectedSensorId === s.id;

          const borderClass =
            fault === 'GENUINE_EVENT' || isGenuineExcursion
              ? 'border-rose-500 bg-[#19080E]/95'
              : fault !== 'NONE' || trust < 75
              ? 'border-amber-400 bg-[#181106]/95'
              : isSelected
              ? 'border-cyan-400 bg-[#07131D]/95'
              : 'border-slate-700 bg-[#0B0F19]/90';

          return (
            <button
              key={s.id}
              ref={(el) => {
                calloutButtonRefs.current[s.id] = el;
              }}
              type="button"
              onClick={() => onSelectSensor(s.id)}
              className={`pointer-events-auto absolute top-0 left-0 px-2.5 py-1.5 border text-left font-mono transition-colors ${borderClass} ${
                isSelected ? 'ring-1 ring-cyan-400' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2.5 text-[11px]">
                <span className="font-bold text-slate-100">{s.id}</span>
                <span
                  className={
                    trust >= 80
                      ? 'text-emerald-400'
                      : trust >= 55
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }
                >
                  {trust.toFixed(0)}% TRUST
                </span>
              </div>
              <div className="text-xs font-bold text-slate-100 tabular-nums mt-0.5">
                {reading !== null ? `${reading.toFixed(2)} °C` : 'BUS CUT'}
              </div>
              {fault !== 'NONE' && (
                <div className="text-[10px] text-amber-300 truncate max-w-[130px]">
                  {formatFaultLabel(fault)}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Fallback Banner if WebGL context is unavailable */}
      {!webglReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#07090E] p-6 text-center">
          <div className="max-w-md space-y-2">
            <div className="text-sm font-semibold text-slate-200">
              3D Hardware Telemetry Viewport
            </div>
            <p className="text-xs text-slate-400">
              Interactive sensor probes S-01 through S-04 are active in the schematic controls below.
            </p>
          </div>
        </div>
      )}

      {/* Unified Collapsible Bottom Control Dock (Per Three.js Skill Section 5) */}
      <div
        style={{
          bottom: '14px',
          left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: 'min(920px, 95%)',
        }}
        className="absolute z-20 w-full flex flex-col items-center pointer-events-none"
      >
        <button
          type="button"
          onClick={() => setDockCollapsed((p) => !p)}
          className="pointer-events-auto px-3 py-1 text-[11px] font-mono text-slate-300 hover:text-white bg-[#0B0E17] border border-b-0 border-slate-700 rounded-t"
        >
          {dockCollapsed ? '▴ Show 3D Studio Controls' : '▾ Hide Controls'}
        </button>

        {!dockCollapsed && (
          <div className="pointer-events-auto w-full bg-[#0B0E17]/95 border border-slate-700 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Camera View Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-mono text-slate-400 mr-1">
                CAMERA:
              </span>
              {(
                [
                  ['isometric', 'Vault Isometric'],
                  ['top-thermal', 'Top Thermal Map'],
                  ['probe-macro', `Probe ${selectedSensorId} Cutaway`],
                  ['chiller-flow', 'Chiller Manifold'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handlePresetClick(id)}
                  className={`px-2.5 py-1 text-[11px] font-mono rounded transition-colors whitespace-nowrap ${
                    cameraPreset === id
                      ? 'bg-cyan-500 text-slate-950 font-semibold'
                      : 'bg-[#111827] text-slate-300 hover:text-white border border-slate-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Exploded Hardware Probe Slider */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="explode-probe-slider"
                className="text-[10px] font-mono text-slate-400 whitespace-nowrap"
              >
                EXPLODE PROBE: {(explodeFactor * 100).toFixed(0)}%
              </label>
              <input
                id="explode-probe-slider"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={explodeFactor}
                onChange={(e) => setExplodeFactor(Number(e.target.value))}
                className="w-24 accent-cyan-400 cursor-pointer"
              />
            </div>

            {/* 3D Visual Layer Toggles */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowAirflow((v) => !v)}
                className={`px-2 py-1 text-[11px] font-mono border rounded ${
                  showAirflow
                    ? 'bg-cyan-950/60 border-cyan-500/70 text-cyan-200'
                    : 'bg-[#111827] border-slate-800 text-slate-400'
                }`}
              >
                Airflow
              </button>
              <button
                type="button"
                onClick={() => setShowCorrelationWeb((v) => !v)}
                className={`px-2 py-1 text-[11px] font-mono border rounded ${
                  showCorrelationWeb
                    ? 'bg-cyan-950/60 border-cyan-500/70 text-cyan-200'
                    : 'bg-[#111827] border-slate-800 text-slate-400'
                }`}
              >
                r-Bridges
              </button>
              <button
                type="button"
                onClick={() => setShowThermalFloor((v) => !v)}
                className={`px-2 py-1 text-[11px] font-mono border rounded ${
                  showThermalFloor
                    ? 'bg-cyan-950/60 border-cyan-500/70 text-cyan-200'
                    : 'bg-[#111827] border-slate-800 text-slate-400'
                }`}
              >
                Heatmap
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
