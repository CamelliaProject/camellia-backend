import crypto from 'crypto';

const SANDBOX_URL     = 'https://sandbox.payhere.lk/pay/checkout';
const LIVE_URL        = 'https://www.payhere.lk/pay/checkout';
const SANDBOX_API     = 'https://sandbox.payhere.lk/merchant/v1';
const LIVE_API        = 'https://www.payhere.lk/merchant/v1';

function apiBase() {
  return process.env.PAYHERE_SANDBOX === 'true' ? SANDBOX_API : LIVE_API;
}

export function getCheckoutUrl() {
  return process.env.PAYHERE_SANDBOX === 'true' ? SANDBOX_URL : LIVE_URL;
}

/**
 * Hash for the payment form (sent to PayHere on checkout).
 * Formula: strtoupper(md5(merchant_id + order_id + formatted_amount + currency + strtoupper(md5(merchant_secret))))
 */
export function generateHash(merchantId, orderId, amount, currency, merchantSecret) {
  const secretHash = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
  const amountStr  = Number(amount).toFixed(2);
  const raw        = `${merchantId}${orderId}${amountStr}${currency}${secretHash}`;
  return crypto.createHash('md5').update(raw).digest('hex').toUpperCase();
}

/**
 * Verify PayHere server notification signature.
 * Formula: strtoupper(md5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + strtoupper(md5(merchant_secret))))
 */
export function verifyNotify(params, merchantSecret) {
  const { merchant_id, order_id, payhere_amount, payhere_currency, status_code, md5sig } = params;
  if (!md5sig) return false;
  const secretHash = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
  const raw        = `${merchant_id}${order_id}${payhere_amount}${payhere_currency}${status_code}${secretHash}`;
  const localSig   = crypto.createHash('md5').update(raw).digest('hex').toUpperCase();
  return localSig === md5sig.toUpperCase();
}

/**
 * Get a short-lived OAuth2 access token using the App ID + App Secret
 * (PayHere sandbox Settings → API Keys → Create API Key).
 */
async function getAccessToken() {
  const appId     = process.env.PAYHERE_APP_ID;
  const appSecret = process.env.PAYHERE_APP_SECRET;
  if (!appId || !appSecret) throw new Error('PAYHERE_APP_ID / PAYHERE_APP_SECRET not configured.');

  const credentials = Buffer.from(`${appId}:${appSecret}`).toString('base64');
  const res = await fetch(`${apiBase()}/oauth/token`, {
    method:  'POST',
    headers: {
      Authorization:  `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`PayHere OAuth failed: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

/**
 * Issue a full refund for a completed PayHere payment.
 * Returns the PayHere API response object.
 */
export async function processRefund(paymentId, description = 'Booking cancelled by plantation') {
  const token = await getAccessToken();
  const res   = await fetch(`${apiBase()}/refund`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ payment_id: paymentId, description }),
  });

  const data = await res.json();
  if (!res.ok || data.status !== 1) {
    throw new Error(`PayHere refund failed: ${JSON.stringify(data)}`);
  }
  return data;
}
