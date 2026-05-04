import mongoose from 'mongoose';

const tryOnSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  resultDescription: { type: String },
  hasGeneratedImage: { type: Boolean },
  garmentType: { type: String },
  timestamp: { type: Date, default: Date.now }
});

export const TryOn = mongoose.model('TryOn', tryOnSchema);
