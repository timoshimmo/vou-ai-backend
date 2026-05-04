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
