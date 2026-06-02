import crypto from 'crypto';

export function generateBookingReference() {
  return `BK-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex')}`;
}

export function generatePassword() {
  const upper   = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const lower   = 'abcdefghjkmnpqrstuvwxyz';
  const digits  = '23456789';
  const special = '@#$!';
  const all = upper + lower + digits + special;
  const required = [upper, lower, digits, special].map(s => s[Math.floor(Math.random() * s.length)]);
  const rest = Array.from({ length: 8 }, () => all[Math.floor(Math.random() * all.length)]);
  return [...required, ...rest].sort(() => Math.random() - 0.5).join('');
}
