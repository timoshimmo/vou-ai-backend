import express from "express";
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
