# VeriSense — Interactive Cold-Vault Digital Twin & UST Track 4 Jury Showcase (VIT Code_Apex 3.0)

Transform VeriSense into a national-finale-grade **Interactive Hospital Vaccine Biobank Digital Twin, Chaos Monkey Hardware Sabotage Lab, and UST Track 4 Jury Evaluation Suite** tailored specifically for **VIT Code_Apex 3.0** (*Organised by AISF, Vishwakarma Institute of Technology, Pune · Track 4 Powered by UST*).

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Aligned with VIT Code_Apex 3.0 (Unstop) & UST Track 4 Evaluation Rubric**:
> - **Hackathon & Sponsor Alignment**: Built specifically for **Track 4: Technology for Social Impact Powered by UST** at **VIT Code_Apex 3.0** (competing among 3,853 registrants for the ₹2,00,000 prize pool, track rewards, and Pre-Placement Interviews).
> - **Visual Centerpiece (Confirmed)**: An **Interactive 2D Hospital Vaccine Biobank & Cold-Vault Digital Twin** with live spatial thermal heatmaps, inter-sensor Pearson correlation links ($r_{ij}$), airflow streamlines, and clickable sensor probes (`S-01` to `S-04`).
> - **Interactive "Chaos Monkey" Sabotage + Social Impact Counter (Confirmed)**: Judges can click any sensor on the floorplan to inject physical faults (*Offset Drift*, *EMI Spike*, *Stuck-At Freeze*, *Thermal Noise*, *Bus Dropout*) or trigger a *Real Compressor Failure*, watching a **Legacy Threshold Alarm** panic while **VeriSense** isolates the fault and tracks **Vaccine Vials Protected** and **Spoilage & False-Dispatch Costs Avoided (₹ INR)**.
> - **UST Page 12 "6 Scoring Dimensions" Coverage**: Adds a dedicated **Hidden Test CSV Dropzone**, an **Edge/API Deployment & Common Schema Inspector**, and an explicit **Assumptions, Limitations & Validation Methodology** panel so every single row of UST's scoring rubric is visibly answered.

---

## 1. Overview & First-Principles Strategy to Win VIT Code_Apex 3.0

### What the UST & VIT Pune Jury Panel Is Looking For
From inspecting the official **VIT Code_Apex 3.0 Unstop portal** and **UST's Track 4 PDF (Pages 2, 9–12)**, the jury evaluates teams on two levels:
1. **Unstop Round 2 & Grand Finale Jury Pillars**:
   - *Conceptual Clarity & Problem Understanding*
   - *Innovation Potential & Structured Problem-Solving Approach*
   - *Technical Feasibility & Scalability*
   - *Tangible Real-World Social Impact*
2. **UST's 6 Official Scoring Dimensions (PDF Page 12)**:
   - **Dimension 1**: Model performance on unseen/hidden test datasets using a common input schema.
   - **Dimension 2**: Robustness to noise, missing data (dropouts), and compound unseen fault combinations.
   - **Dimension 3**: Explainability (XAI) of predictions—why an event was classified as genuine or faulty.
   - **Dimension 4**: Practicality of deployment as an **API, application, or edge-compatible inference component**.
   - **Dimension 5**: Quality of visualization and live interactive demonstration.
   - **Dimension 6**: Clarity of **assumptions, limitations, and validation methodology**.

### Why This Visual Architecture Stands Out Among 3,853 Competitors
Most teams only show static matplotlib/SVG line graphs. By anchoring the application in a **living physical Digital Twin of a Public-Health Vaccine Biobank (Pune Regional Cold-Chain Hub)** where judges can actively sabotage sensors and see the **Conventional System vs. VeriSense AI** side by side, the jury experiences the social impact in under 30 seconds—before diving into the mathematical XAI proofs, edge deployment footprint, and hidden-dataset CSV evaluator.

---

## 2. User Experience & Visual Design

### Key User Flows (Structured for Live Jury Pitch & Interactive Q&A)

1. **Flow 1 — Interactive Cold-Vault Digital Twin & "Chaos Monkey" Sabotage (Visual Demo)**:
   - The main stage displays the **Regional Vaccine Biobank Floorplan** (`4` cryo-bays housing `12,400` pediatric & maternal vaccine vials, cooling intake/exhaust louvers, and `4` physical sensor nodes connected by live correlation vectors).
   - **Click-to-Sabotage**: Clicking any sensor node (`S-01` to `S-04`) opens quick hardware fault triggers:
     - *Inject Calibration Drift (+4.8 °C)*
     - *Fire Relay EMI Spike (+5.6 °C)*
     - *Freeze ADC Register (Stuck-At 4.62 °C)*
     - *Degrade Thermistor Junction (Noise σ = 1.85 °C)*
     - *Cut RS-485 Telemetry Wire (Packet Dropout)*
     - *Trigger Real Vault Compressor Breach (All Sensors)*
   - **Live Play / Pause / Step Simulation**: An interactive playback bar animates the thermal field across 72 time steps (`6 hours` of operating time) so judges watch drift accumulate and see the exact moment VeriSense flags `Schedule Recalibration` while blocking false alarms.

2. **Flow 2 — Side-by-Side "Legacy Threshold System vs. VeriSense AI" Comparator**:
   - Directly above the Digital Twin, a split comparison banner contrasts:
     - **Legacy Threshold Monitor**: Triggers `13` false alarms during S-02 drift and S-03 spikes (causing alarm fatigue or unnecessary ₹14.8 Lakh vaccine quarantine), and completely misses the real excursion on frozen sensor `S-03`.
     - **VeriSense Trust & Fusion Engine**: Suppresses `100%` of single-sensor fault alarms via closest-pair cluster consensus, maintains `100%` sensitivity to genuine multi-sensor thermal excursions, and isolates the exact hardware failure mode.

3. **Flow 3 — Hidden Test Dataset CSV Uploader & Common Schema Evaluator (UST Dimension 1 & 2)**:
   - Judges can either switch between the 4 built-in benchmark scenarios (including the **Compound Multi-Fault Hidden Evaluation Split**) OR **upload/paste a custom CSV dataset** following the common input schema (`timestamp, S-01, S-02, S-03, S-04`) to score VeriSense live during Q&A.

4. **Flow 4 — Edge-Compatible Inference, API Payload & Methodology Inspector (UST Dimension 4 & 6)**:
   - Displays the live **REST API / Edge JSON Telemetry Contract** (showing the exact input vector and output trust/XAI payload), computational complexity (`O(N²)` pairwise correlation with $N=4$, `< 0.4 ms` latency per frame, zero GPU dependency, ready for STM32/ESP32/Modbus edge gateways), and a transparent **Assumptions, Limitations & Validation Methodology** breakdown.

### Visual Identity & Theme
- **Aesthetic Direction**: High-precision industrial & biomedical telemetry console (`#07090E` Deep Obsidian canvas, `#0B0E17` structural instrumentation panels, `1px solid #1E293B` hairline borders).
- **Semantic Color & State Encoding (Non-Hue-Only)**:
  - **Nominal Cryo-Envelope (`2.0–8.0 °C`, Trust `≥ 80%`)**: Calibrated Cyan (`#06B6D4`) & Emerald (`#10B981`) paired with `● NOMINAL` glyph.
  - **Suppressed Hardware Fault (`Trust < 80%`, Drift/Spike/Freeze/Noise)**: Telemetry Amber (`#F59E0B`) paired with `▲ FAULT ISOLATED` glyph.
  - **Trusted Environmental Excursion (`Consensus ≥ 8.0 °C`)**: Alert Crimson (`#EF4444`) paired with `✖ TRUSTED ALARM` glyph.
- **Typography & Tabular Discipline**:
  - Display & Section Headers: `Plus Jakarta Sans` (SemiBold 600 / Bold 700).
  - Telemetry Readouts, Equations, API JSON & Impact Counters: `JetBrains Mono` with `font-variant-numeric: tabular-nums`.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Closest-Pair Cluster Consensus + Sliding-Window Residual Physics**
  - *Chosen Approach*: Anchor the instantaneous consensus estimate on the tightest agreeing pair of sensors weighted by historical trust, combined with an 8-step sliding window extracting 6 orthogonal physical features (Consensus $\Delta$, Neighbour Pearson $r$, Instantaneous $dT/dt$ Z-score, High-Frequency Step-Diff Noise $\sigma$, Linear Residual Slope, and Zero-$\Delta$ Run Length).
  - *Why*: Guarantees deterministic, zero-latency execution in the browser AND on resource-constrained IoT edge microcontrollers, while pairing seamlessly with server-side **Gemini 4 Argon (`ThinkingLevel.HIGH`)** for deep natural-language forensic synthesis.
- **Decision 2: Grounding Social Impact in Public-Health Cold-Chain Economics (₹ INR & Vaccine Doses)**
  - *Chosen Approach*: Frame the default digital twin around a **Regional Public-Health Vaccine Biobank** storing temperature-sensitive biologics (`2.0 °C – 8.0 °C`), quantifying impact in **Vaccine Doses Protected (`12,400 Vials`)**, **Prevented False Emergency Dispatches**, and **Spoilage Avoided (`₹18.6 Lakhs`)**.
  - *Why*: Directly connects Track 4's theme (*Technology for Social Cause Powered by UST*) to a visceral, high-stakes social problem where both false alarms and missed excursions cost lives.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          TOP BAR CONTRACT (VeriSense Header)                        │
│  [VeriSense]      [Digital Twin · Trust Matrix · XAI Lab · Jury Rubric]   [CSV Out] │
└──────────────────────────────────────────┬──────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│         VIT CODE_APEX 3.0 × UST TRACK 4 BANNER & SOCIAL IMPACT SCOREBOARD           │
│  [12,400 Vials Protected] [₹18.6L Spoilage Avoided] [100% False Alarm ↓] [F1 1.000] │
└─────────────────────┬───────────────────────────────────────────┬───────────────────┘
                      │                                           │
                      ▼                                           ▼
┌───────────────────────────────────────────┐ ┌───────────────────────────────────────┐
│   INTERACTIVE COLD-VAULT DIGITAL TWIN     │ │   CHAOS MONKEY HARDWARE SABOTAGE LAB  │
│  • 2D Spatial Thermal Heatmap (4 Bays)    │ │  • Live Play / Pause / Step Scrubber  │
│  • Clickable Sensor Probes (S-01 to S-04) │ │  • One-Click Hardware Sabotage Deck   │
│  • Inter-Sensor Correlation Vectors (r)   │ │    (Drift, Spike, Freeze, Noise, Cut) │
│  • Legacy Monitor vs. VeriSense AI Bar    │ │  • Custom CSV / JSON Dataset Ingest   │
└─────────────────────┬─────────────────────┘ └───────────────────┬───────────────────┘
                      │                                           │
                      └─────────────────────┬─────────────────────┘
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│           MULTIVARIATE TELEMETRY CURVES, TRUST MATRIX & CORRELATION HEATMAP         │
│  • Interactive SVG Time-Series (Temperature °C / Sensor Trust % / True Env)         │
│  • Per-Sensor Prognostics Table & 4x4 Pairwise Pearson Correlation Matrix           │
└──────────────────────────────────────────┬──────────────────────────────────────────┘
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│       EXPLAINABLE AI (XAI) ATTRIBUTION & GEMINI 4 ARGON HIGH-THINKING FORENSICS     │
│  • Deterministic 6-Feature Mathematical Attribution + Maintenance Routing           │
│  • Server-Side POST /api/sensor-forensics (gemini-4-argon, ThinkingLevel.HIGH)      │
└──────────────────────────────────────────┬──────────────────────────────────────────┘
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│          UST TRACK 4 JURY RUBRIC: EDGE/API SCHEMA & VALIDATION METHODOLOGY          │
│  • Live Edge JSON API Payload Inspector (<0.4ms latency, Common Input Schema)       │
│  • Explicit Engineering Assumptions, Limitations (≥50% Healthy Quorum) & Validation │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Interactive Component & State Mapping
- **Interactive Cold-Vault Digital Twin (`ColdVaultDigitalTwin.tsx`)**:
  - Renders the 4 cryo-storage bays (`Bay 1 North Intake` through `Bay 4 Airlock Vestibule`) with dynamic thermal color interpolation based on each zone's physical temperature and sensor reading.
  - Draws live **inter-sensor correlation lines** connecting `S-01`–`S-04` whose opacity and stroke style reflect the real-time Pearson correlation $r_{ij}$ (solid cyan for coupled $r \ge 0.75$, dashed amber/rose when a sensor decouples due to a fault).
  - Clicking any sensor node selects it for inspection and reveals one-click **Chaos Monkey Sabotage** actions (*Inject Drift*, *Fire Spike*, *Freeze ADC*, *Inject Noise*, *Sever Wire*, *Restore Healthy*) that immediately mutate the active scenario and recompute the stream.
- **Live Simulation Playback & Custom CSV Ingestion**:
  - Includes a `Play / Pause` simulation loop that advances `selectedStep` smoothly so judges can watch the vault operate in real time, plus a **Custom CSV Dataset Parser** that accepts standard comma-separated multi-sensor time-series rows (`timestamp,S-01,S-02,S-03,S-04`) to evaluate unseen test splits on the fly.
- **UST Jury Evaluation & Edge/API Readiness Section (`UstJuryEvaluationDeck.tsx`)**:
  - Displays the live **REST API / Edge Inference JSON Inspector** updating with the currently selected step's input readings and output XAI classification, alongside the **Assumptions, Boundary Conditions (e.g., $N \ge 3$ quorum requirement), and Validation Methodology** cards aligned with Page 12 of the UST problem statement PDF.
