import pool from '../config/db.js';
import { sendSubscriptionRenewalReminderEmail } from './emailService.js';
import { SUBSCRIPTION_LABELS } from '../constants/index.js';

const DISABLE_GRACE_PERIOD_DAYS = 14;

async function runSubscriptionReminderCheck() {
  console.log('[cron] Running subscription reminder check…');
  try {
    const { rows } = await pool.query(`
      SELECT ps.*, p.name AS plantation_name, p.email AS plantation_email, p.is_disabled,
             u.name AS owner_name
      FROM plantation_subscriptions ps
      JOIN plantations p ON p.id = ps.plantation_id
      LEFT JOIN users u ON u.plantation_id = ps.plantation_id AND u.role = 'plantationadmin'
      WHERE ps.status IN ('active', 'expired')
    `);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const sub of rows) {
      const endDate = new Date(sub.end_date);
      endDate.setHours(0, 0, 0, 0);
      const daysLeft = Math.round((endDate - today) / (1000 * 60 * 60 * 24));

      const renewalUrl = `${frontendUrl}/subscription-renew?sub=${sub.id}`;
      const to         = sub.plantation_email;
      const ownerName  = sub.owner_name || 'Plantation Admin';
      const planLabel  = SUBSCRIPTION_LABELS[sub.subscription_type] || sub.subscription_type;
      const endLabel   = endDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      // Mark expired
      if (daysLeft < 0 && sub.status === 'active') {
        await pool.query(
          `UPDATE plantation_subscriptions SET status = 'expired', updated_at = now() WHERE id = $1`,
          [sub.id]
        );
      }

      
      if (daysLeft >= 0 && sub.is_disabled) {
        await pool.query(
          `UPDATE plantations SET is_disabled = false, updated_at = now() WHERE id = $1`,
          [sub.plantation_id]
        );
        console.log(`[cron] Auto-enabled plantation (subscription paid through ${sub.end_date}) → ${sub.plantation_name}`);
      } else if (daysLeft <= -DISABLE_GRACE_PERIOD_DAYS && !sub.is_disabled) {
        await pool.query(
          `UPDATE plantations SET is_disabled = true, updated_at = now() WHERE id = $1`,
          [sub.plantation_id]
        );
        console.log(`[cron] Auto-disabled plantation (unpaid past grace period) → ${sub.plantation_name}`);
      }

      if (sub.status !== 'active') continue;

      // 30-day reminder
      if (daysLeft === 30 && !sub.reminder_1month_sent) {
        await sendSubscriptionRenewalReminderEmail(to, ownerName, sub.plantation_name, planLabel, sub.amount, endLabel, daysLeft, renewalUrl)
          .catch(e => console.error('[cron] 30d email failed:', e.message));
        await pool.query(`UPDATE plantation_subscriptions SET reminder_1month_sent = true, updated_at = now() WHERE id = $1`, [sub.id]);
        console.log(`[cron] 30d reminder sent → ${sub.plantation_name}`);
      }

      // 7-day reminder
      if (daysLeft === 7 && !sub.reminder_1week_sent) {
        await sendSubscriptionRenewalReminderEmail(to, ownerName, sub.plantation_name, planLabel, sub.amount, endLabel, daysLeft, renewalUrl)
          .catch(e => console.error('[cron] 7d email failed:', e.message));
        await pool.query(`UPDATE plantation_subscriptions SET reminder_1week_sent = true, updated_at = now() WHERE id = $1`, [sub.id]);
        console.log(`[cron] 7d reminder sent → ${sub.plantation_name}`);
      }

      // 1-day reminder
      if (daysLeft === 1 && !sub.reminder_1day_sent) {
        await sendSubscriptionRenewalReminderEmail(to, ownerName, sub.plantation_name, planLabel, sub.amount, endLabel, daysLeft, renewalUrl)
          .catch(e => console.error('[cron] 1d email failed:', e.message));
        await pool.query(`UPDATE plantation_subscriptions SET reminder_1day_sent = true, updated_at = now() WHERE id = $1`, [sub.id]);
        console.log(`[cron] 1d reminder sent → ${sub.plantation_name}`);
      }
    }
  } catch (err) {
    console.error('[cron] Subscription reminder check failed:', err.message);
  }
}

export function startCronJobs() {

  runSubscriptionReminderCheck();
  setInterval(runSubscriptionReminderCheck, 24 * 60 * 60 * 1000);
  console.log('[cron] Subscription reminder scheduler started (daily)');
}
