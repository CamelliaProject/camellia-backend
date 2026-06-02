const FALLBACK_RATE = 330;
const CACHE_TTL_MS  = 60 * 60 * 1000; // 1 hour

let cachedRate = null;
let cacheTime  = 0;

export async function getUsdToLkrRate() {
  const now = Date.now();
  if (cachedRate !== null && now - cacheTime < CACHE_TTL_MS) {
    return cachedRate;
  }

  try {
    const apiKey = process.env.EXCHANGE_RATE_API_KEY;
    let rate;

    if (apiKey) {
      const res  = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/pair/USD/LKR`);
      const data = await res.json();
      rate = data.conversion_rate;
    } else {
      const res  = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const data = await res.json();
      rate = data.rates?.LKR;
    }

    if (typeof rate !== 'number' || rate <= 0) throw new Error('Invalid rate');

    cachedRate = rate;
    cacheTime  = now;
    return rate;
  } catch (err) {
    console.warn('Exchange rate fetch failed:', err.message);
    return cachedRate ?? FALLBACK_RATE;
  }
}
