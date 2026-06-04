import express from 'express';
import { getPrice, getQuote, getTokens } from '../../../controllers/swapController.js';

const router = express.Router();

router.get('/tokens', getTokens);
router.get('/price',  getPrice);
router.get('/quote',  getQuote);

export default router;
