import mongoose from 'mongoose';

const measurementSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  chest: { type: Number },
  waist: { type: Number },
  hips: { type: Number },
  shoulder: { type: Number },
  sleeve: { type: Number },
  inseam: { type: Number },
  confidence: { type: Number },
  timestamp: { type: Date, default: Date.now }
});

export const Measurement = mongoose.model('Measurement', measurementSchema);
