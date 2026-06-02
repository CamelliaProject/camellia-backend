import { Router } from 'express';
import { getUsdToLkrRate } from '../utils/exchangeRate.js';

const router = Router();

// Public — no auth required; exchange rate is not sensitive.
router.get('/exchange-rate', async (req, res) => {
  try {
    const rate = await getUsdToLkrRate();
    return res.json({ usd_to_lkr: rate });
  } catch {
    return res.status(500).json({ error: 'Failed to get exchange rate.' });
  }
});

export default router;
