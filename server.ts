import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '2mb' }));

function getGenAIClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

app.post('/api/sensor-forensics', async (req, res) => {
  const {
    query,
    scenarioTitle,
    selectedEvent,
    sensorSummaries,
    benchmark,
  } = req.body ?? {};

  if (!query || typeof query !== 'string' || !query.trim()) {
    res.status(400).json({
      error: 'A diagnostic query or forensic prompt is required.',
    });
    return;
  }

  const systemPrompt = `You are a Principal Sensor Fusion & Explainable AI Forensics Engineer for Track 4 Problem Statement 3 (AI-Based Sensor Trust, Drift and False-Alarm Detection).
Analyze the multi-sensor telemetry context, cross-sensor Pearson correlations, residual drift rates, and anomaly attributions.
Distinguish genuine multi-sensor environmental excursions from single-sensor faults (offset drift, gain error, stuck-at freeze, random EMI spikes, excessive noise, and signal dropout).
Provide rigorous, quantitative, explainable engineering reasoning.`;

  const promptContent = `Scenario: ${scenarioTitle || 'Custom Multi-Sensor Telemetry Stream'}
Benchmark Summary: ${JSON.stringify(benchmark || {})}
Sensor Health Summaries: ${JSON.stringify(sensorSummaries || [])}
Selected Event Under Investigation: ${JSON.stringify(selectedEvent || {})}

User / Engineer Query:
${query.trim()}`;

  try {
    const ai = getGenAIClient();
    const response = await ai.models.generateContent({
      model: 'gemini-4-argon',
      contents: promptContent,
      config: {
        systemInstruction: systemPrompt,
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.HIGH,
        },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            verdictHeadline: {
              type: Type.STRING,
              description: 'Concise engineering verdict on alarm trustworthiness and sensor state.',
            },
            rootCauseAnalysis: {
              type: Type.STRING,
              description: 'Detailed mathematical and physical explanation referencing correlation, drift slope, and consensus delta.',
            },
            trustAssessment: {
              type: Type.STRING,
              description: 'Why the alarm should be trusted or suppressed as a false alarm.',
            },
            recommendedActions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Concrete calibration, hardware inspection, or cold-chain intervention steps.',
            },
            riskLevel: {
              type: Type.STRING,
              description: 'CRITICAL_ENVIRONMENTAL_RISK, SENSOR_FAULT_SUPPRESSED, or NOMINAL_MONITORING',
            },
          },
          required: [
            'verdictHeadline',
            'rootCauseAnalysis',
            'trustAssessment',
            'recommendedActions',
            'riskLevel',
          ],
        },
      },
    });

    const rawText = response.text || '{}';
    const parsed = JSON.parse(rawText);
    res.json({
      model: 'gemini-4-argon',
      thinkingLevel: 'HIGH',
      analysis: parsed,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to execute Gemini high-thinking analysis.';
    res.status(502).json({
      error: message,
    });
  }
});

async function startServer() {
  const PORT = 3000;
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sensor Intelligence Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
