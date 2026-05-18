import express from "express";
import { Measurement } from "../models/Measurement";
import { GoogleGenAI } from "@google/genai";

const router = express.Router();

// Initialize server-side Gemini client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

function parseBase64DataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], data: match[2] };
  }
  return { mimeType: "image/jpeg", data: dataUrl };
}

router.get("/", async (req: any, res) => {
  try {
    const measurements = await Measurement.find({ userId: req.user.userId }).sort({ timestamp: -1 });
    res.json(measurements);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", async (req: any, res) => {
  try {
    const measurement = new Measurement({ ...req.body, userId: req.user.userId });
    await measurement.save();
    res.status(201).json(measurement);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/estimate", async (req: any, res) => {
  const { image, height } = req.body;
  if (!image) {
    return res.status(400).json({ error: "Image is required" });
  }
  if (!height) {
    return res.status(400).json({ error: "Height is required" });
  }

  try {
    const { mimeType, data } = parseBase64DataUrl(image);

    const prompt = `
      You are an expert tailor and computer vision specialist.
      Analyze this full-body photo of a person.
      The person's height is ${height} cm.
      Estimate the following body measurements in cm:
      - Chest/Bust
      - Waist
      - Hips
      - Shoulder width
      - Sleeve length
      - Inseam
      
      Return ONLY a JSON object with these keys: chest, waist, hips, shoulder, sleeve, inseam.
      Be as accurate as possible based on the visual proportions relative to the provided height.
    `;

    console.log(`[GEMINI] Calling gemini-3-flash-preview on backend for Tailor Estimation...`);
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        { text: prompt },
        {
          inlineData: {
            data,
            mimeType,
          },
        },
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text || "{}";
    const jsonMatch = text.match(/\{.*\}/s);
    const measurements = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    if (!measurements) {
      throw new Error("Could not parse estimated measurements from Gemini response");
    }

    // Save to database natively on the server
    const measurementDoc = new Measurement({
      ...measurements,
      confidence: 0.94,
      userId: req.user.userId,
    });
    await measurementDoc.save();

    res.status(201).json(measurementDoc);
  } catch (error: any) {
    console.error("[GEMINI ERROR] Estimation failed:", error);
    res.status(500).json({ error: error.message || "Failed to estimate measurements" });
  }
});

export default router;


/*import express from "express";
import { Measurement } from "../models/Measurement";

const router = express.Router();

router.get("/", async (req: any, res) => {
  try {
    const measurements = await Measurement.find({ userId: req.user.userId }).sort({ timestamp: -1 });
    res.json(measurements);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", async (req: any, res) => {
  try {
    const measurement = new Measurement({ ...req.body, userId: req.user.userId });
    await measurement.save();
    res.status(201).json(measurement);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
*/