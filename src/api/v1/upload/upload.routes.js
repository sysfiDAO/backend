import express from 'express';
import crypto from 'crypto';
import logger from '../../../utils/logger.js';

const router = express.Router();

router.post('/upload/sign', (req, res) => {
  const { CLOUDINARY_API_SECRET: apiSecret, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_CLOUD_NAME: cloudName } = process.env;
  if (!apiSecret || !apiKey || !cloudName) {
    logger.error('[upload/sign] Missing CLOUDINARY_* env vars');
    return res.status(500).json({ success: false, error: 'Upload service not configured' });
  }

  const { folder = 'dao-images', publicId } = req.body;
  const timestamp = Math.round(Date.now() / 1000);
  const params    = { folder, timestamp };
  if (publicId) params.public_id = publicId;

  const sortedString = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  const signature    = crypto.createHash('sha256').update(sortedString + apiSecret).digest('hex');

  res.json({ success: true, data: { signature, timestamp, apiKey, cloudName, folder, publicId } });
});

router.delete('/upload/delete', async (req, res) => {
  const { CLOUDINARY_API_SECRET: apiSecret, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_CLOUD_NAME: cloudName } = process.env;
  if (!apiSecret || !apiKey || !cloudName) {
    return res.status(500).json({ success: false, error: 'Upload service not configured' });
  }

  const { publicId } = req.body;
  if (!publicId) return res.status(400).json({ success: false, error: 'publicId is required' });

  const timestamp    = Math.round(Date.now() / 1000);
  const sortedString = `public_id=${publicId}&timestamp=${timestamp}`;
  const signature    = crypto.createHash('sha256').update(sortedString + apiSecret).digest('hex');

  const formData = new URLSearchParams({ public_id: publicId, signature, api_key: apiKey, timestamp });

  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: formData.toString() },
    );
    const data = await response.json();
    if (data.result !== 'ok') {
      return res.status(400).json({ success: false, error: data.result ?? 'Deletion failed' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
