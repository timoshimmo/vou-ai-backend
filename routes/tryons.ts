import express from "express";
import { TryOn } from "../models/TryOn";
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
    const tryons = await TryOn.find({ userId: req.user.userId }).sort({ timestamp: -1 });
    res.json(tryons);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", async (req: any, res) => {
  try {
    const tryon = new TryOn({ ...req.body, userId: req.user.userId });
    await tryon.save();
    res.status(201).json(tryon);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/simulate", async (req: any, res) => {
  const { bodyImage, garmentImage, garmentType } = req.body;
  
  if (!garmentImage) {
    return res.status(400).json({ error: "Garment image is required" });
  }

  try {
    const parsedBody = parseBase64DataUrl(bodyImage || garmentImage);
    const parsedGarment = parseBase64DataUrl(garmentImage);

    const type = garmentType || 'full';

    const prompt = `
      You are a high-end fashion AI and image synthesis expert.
      
      INPUTS:
      - Image 1: A person's body profile.
      - Image 2: A garment (${type}).
      
      TASK:
      Generate a new version of Image 1 where the person is realistically wearing the garment from Image 2.
      
      REQUIREMENTS:
      1. SEAMLESS INTEGRATION: The garment must be perfectly fitted to the person's body shape, pose, and silhouette.
      2. REALISTIC PHYSICS & TEXTURE: The fabric should drape naturally over the body, showing realistic folds, shadows, and high-fidelity material textures (e.g., silk, cotton, leather).
      3. LIGHTING CONSISTENCY: The lighting and color of the garment must be adjusted to match the environment and ambient light in Image 1 perfectly.
      4. IDENTITY PRESERVATION: The person's face, hair, and original features must remain identical to Image 1.
      5. BACKGROUND PRESERVATION: The background from Image 1 should remain unchanged.
      
      OUTPUT:
      - A single high-fidelity image of the person wearing the garment.
      - A brief JSON-formatted description of the fit and style.
      
      JSON FORMAT:
      {
        "description": "...",
        "placement": { "top": 20, "left": 15, "width": 70, "height": 60, "rotation": 0 }
      }
    `;

    console.log(`[GEMINI] Calling gemini-3-flash-preview on backend for Tailor Try-On Simulation...`);
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          inlineData: {
            data: parsedBody.data,
            mimeType: parsedBody.mimeType,
          },
        },
        {
          inlineData: {
            data: parsedGarment.data,
            mimeType: parsedGarment.mimeType,
          },
        },
        { text: prompt },
      ],
    });

    let generatedImageUrl = null;
    let description = "Digital drape complete.";
    let placement = { top: 15, left: 10, width: 80, height: 70, rotation: 0 };

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          generatedImageUrl = `data:image/png;base64,${part.inlineData.data}`;
        } else if (part.text) {
          try {
            const jsonMatch = part.text.match(/\{.*\}/s);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              description = parsed.description || description;
              if (parsed.placement) placement = parsed.placement;
            } else {
              description = part.text;
            }
          } catch (e) {
            description = part.text;
          }
        }
      }
    }

    const result = {
      description,
      generatedImage: generatedImageUrl,
      placement,
      garmentType: type
    };

    // Save to TryOn MongoDB collection natively on the server
    const tryOnDoc = new TryOn({
      resultDescription: result.description,
      hasGeneratedImage: !!generatedImageUrl,
      garmentType: result.garmentType,
      userId: req.user.userId,
    });
    await tryOnDoc.save();

    res.status(201).json(result);
  } catch (error: any) {
    console.error("[GEMINI ERROR] Simulation failed:", error);
    res.status(500).json({ error: error.message || "Failed to simulate virtual try-on" });
  }
});

export default router;

/*
import express from "express";
import { TryOn } from "../models/TryOn";

const router = express.Router();

router.get("/", async (req: any, res) => {
  try {
    const tryons = await TryOn.find({ userId: req.user.userId }).sort({ timestamp: -1 });
    res.json(tryons);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", async (req: any, res) => {
  try {
    const tryon = new TryOn({ ...req.body, userId: req.user.userId });
    await tryon.save();
    res.status(201).json(tryon);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
*/