import nodemailer from 'nodemailer';

function createTransporter() {
  // If EMAIL_HOST is set, use generic SMTP (Brevo, Mailgun, etc.)
  // Otherwise fall back to Gmail service shorthand
  if (process.env.EMAIL_HOST) {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

function isEmailConfigured() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('[emailService] EMAIL_USER / EMAIL_PASS not set — email skipped.');
    return false;
  }
  return true;
}

const BRAND = `
  <div style="background:#1B4332;padding:24px 32px;border-radius:8px 8px 0 0;">
    <h1 style="color:#fff;margin:0;font-size:22px;font-family:Georgia,serif;">Camellia</h1>
    <p style="color:#86efac;margin:4px 0 0;font-size:13px;font-family:Arial,sans-serif;">Tea Plantation Tourism Platform</p>
  </div>
`;

const FOOTER = `
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
  <p style="color:#9ca3af;font-size:12px;margin:0;font-family:Arial,sans-serif;">
    © ${new Date().getFullYear()} Camellia Platform · All rights reserved
  </p>
`;

function wrap(body) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      ${BRAND}
      <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        ${body}
        ${FOOTER}
      </div>
    </div>
  `;
}

export async function sendSubmissionConfirmation(to, ownerName, plantationName) {
  if (!isEmailConfigured()) return;
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"Camellia Platform" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Plantation Registration Received — Camellia',
    html: wrap(`
      <h2 style="color:#1B4332;margin-top:0;">Registration Received</h2>
      <p>Dear <strong>${ownerName}</strong>,</p>
      <p>Thank you for registering <strong>${plantationName}</strong> on the Camellia platform. We have received your application and documents.</p>
      <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px;border-radius:4px;margin:24px 0;">
        <p style="margin:0;color:#166534;font-weight:500;">
          Your plantation registration is under review. Please wait up to 24 hours for approval.
          If not contacted within 24 hours, please contact support.
        </p>
      </div>
      <p style="color:#6b7280;font-size:14px;">
        Questions? Email us at
        <a href="mailto:support@camellia.com" style="color:#1B4332;">support@camellia.com</a>
      </p>
    `),
  });
}

export async function sendApprovalCredentials(to, ownerName, plantationName, username, password) {
  if (!isEmailConfigured()) return;
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"Camellia Platform" <${process.env.EMAIL_USER}>`,
    to,
    subject: '🎉 Plantation Approved — Your Login Credentials',
    html: wrap(`
      <h2 style="color:#1B4332;margin-top:0;">Your Plantation Has Been Approved!</h2>
      <p>Dear <strong>${ownerName}</strong>,</p>
      <p>Congratulations! <strong>${plantationName}</strong> has been approved on the Camellia platform and is now live.</p>
      <p>Use the credentials below to log in to your Plantation Admin dashboard:</p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:24px 0;">
        <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;">
          <tr>
            <td style="padding:8px 0;color:#6b7280;font-size:14px;width:40%;">Login URL</td>
            <td style="padding:8px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/plantationadmin"
                 style="color:#1B4332;font-weight:500;">Plantation Admin Login</a>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;font-size:14px;">Username</td>
            <td style="padding:8px 0;font-family:monospace;font-size:16px;font-weight:700;color:#1B4332;">${username}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280;font-size:14px;">Password</td>
            <td style="padding:8px 0;font-family:monospace;font-size:16px;font-weight:700;color:#1B4332;">${password}</td>
          </tr>
        </table>
      </div>
      <div style="background:#fff7ed;border-left:4px solid #f97316;padding:16px;border-radius:4px;margin:24px 0;">
        <p style="margin:0;color:#c2410c;font-size:14px;">
          <strong>Important:</strong> Please change your password immediately after your first login for security.
        </p>
      </div>
    `),
  });
}

export async function sendBookingCancellationEmail(to, touristName, booking, reason, contactEmail) {
  if (!isEmailConfigured()) return;
  const transporter = createTransporter();
  const contact = contactEmail || process.env.CONTACT_EMAIL || 'support@camellia.com';
  const bookingDate = booking.booking_date
    ? new Date(booking.booking_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : '—';
  const amountLine = booking.total_price_lkr
    ? `Rs ${Number(booking.total_price_lkr).toLocaleString()} (LKR)`
    : booking.total_price_usd
    ? `$ ${Number(booking.total_price_usd).toLocaleString()} (USD)`
    : null;

  await transporter.sendMail({
    from: `"Camellia Platform" <${process.env.EMAIL_USER}>`,
    to,
    subject: `Booking Cancelled — Ref: ${booking.booking_reference}`,
    html: wrap(`
      <h2 style="color:#1B4332;margin-top:0;">Your Booking Has Been Cancelled</h2>
      <p>Dear <strong>${touristName}</strong>,</p>
      <p>We regret to inform you that your booking has been cancelled by the plantation. Please see the details below.</p>

      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:24px 0;">
        <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">
          <tr>
            <td style="padding:6px 0;color:#6b7280;width:40%;">Booking Reference</td>
            <td style="padding:6px 0;font-weight:700;color:#1B4332;">${booking.booking_reference}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6b7280;">Visit Date</td>
            <td style="padding:6px 0;font-weight:600;color:#111827;">${bookingDate}</td>
          </tr>
          ${amountLine ? `
          <tr>
            <td style="padding:6px 0;color:#6b7280;">Amount Paid</td>
            <td style="padding:6px 0;font-weight:600;color:#111827;">${amountLine}</td>
          </tr>` : ''}
        </table>
      </div>

      <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px;border-radius:4px;margin:24px 0;">
        <p style="margin:0 0 6px;color:#991b1b;font-size:13px;font-weight:600;">Reason for Cancellation</p>
        <p style="margin:0;color:#7f1d1d;font-size:14px;">${reason}</p>
      </div>

      ${amountLine ? `
      <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px;border-radius:4px;margin:24px 0;">
        <p style="margin:0;color:#166534;font-size:14px;">
          <strong>Refund Notice:</strong> Your payment will be refunded in full within <strong>24 hours</strong>.
          If you do not receive your refund within 24 hours, please contact us at
          <a href="mailto:${contact}" style="color:#1B4332;">${contact}</a>.
        </p>
      </div>
      ` : ''}

      <p style="color:#6b7280;font-size:14px;">
        For any questions or concerns, please contact us at
        <a href="mailto:${contact}" style="color:#1B4332;">${contact}</a>.
        We apologise for any inconvenience caused.
      </p>
    `),
  });
}

export async function sendBookingConfirmationEmail(to, touristName, booking, experiences = []) {
  if (!isEmailConfigured()) return;
  const transporter = createTransporter();
  const bookingDate = booking.booking_date
    ? new Date(booking.booking_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : '—';
  const amountLine = booking.total_price_lkr
    ? `Rs ${Number(booking.total_price_lkr).toLocaleString()} (LKR)`
    : booking.total_price_usd
    ? `$ ${Number(booking.total_price_usd).toLocaleString()} (USD)`
    : null;
  const expList = experiences.length
    ? `<ul style="margin:8px 0 0;padding-left:20px;color:#1B4332;">${experiences.map(e => `<li style="margin-bottom:4px;">${e}</li>`).join('')}</ul>`
    : '<p style="margin:4px 0 0;color:#6b7280;">No experiences selected</p>';

  await transporter.sendMail({
    from: `"Camellia Platform" <${process.env.EMAIL_USER}>`,
    to,
    subject: `Booking Confirmed — Ref: ${booking.booking_reference}`,
    html: wrap(`
      <h2 style="color:#1B4332;margin-top:0;">Booking Confirmed!</h2>
      <p>Dear <strong>${touristName}</strong>,</p>
      <p>Your plantation experience booking has been confirmed. We look forward to welcoming you!</p>

      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:24px 0;">
        <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">
          <tr>
            <td style="padding:6px 0;color:#6b7280;width:40%;">Booking Reference</td>
            <td style="padding:6px 0;font-weight:700;color:#1B4332;">${booking.booking_reference}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6b7280;">Visit Date</td>
            <td style="padding:6px 0;font-weight:600;color:#111827;">${bookingDate}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6b7280;">Guests</td>
            <td style="padding:6px 0;color:#111827;">
              ${booking.num_adults || 1} adult${(booking.num_adults || 1) !== 1 ? 's' : ''}
              ${booking.num_children > 0 ? `, ${booking.num_children} child${booking.num_children !== 1 ? 'ren' : ''}` : ''}
            </td>
          </tr>
          ${amountLine ? `
          <tr>
            <td style="padding:6px 0;color:#6b7280;">Total Paid</td>
            <td style="padding:6px 0;font-weight:700;color:#1B4332;">${amountLine}</td>
          </tr>` : ''}
        </table>
      </div>

      <div style="margin:24px 0;">
        <p style="margin:0 0 4px;font-weight:600;color:#1B4332;font-size:14px;">Experiences Booked</p>
        ${expList}
      </div>

      <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px;border-radius:4px;margin:24px 0;">
        <p style="margin:0;color:#166534;font-size:14px;">
          Please keep your booking reference handy when you visit. If you have any questions,
          contact us at <a href="mailto:${process.env.EMAIL_USER}" style="color:#1B4332;">${process.env.EMAIL_USER}</a>.
        </p>
      </div>
    `),
  });
}

export async function sendRejectionNotice(to, ownerName, plantationName, reason) {
  if (!isEmailConfigured()) return;
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"Camellia Platform" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Plantation Registration Update — Camellia',
    html: wrap(`
      <h2 style="color:#1B4332;margin-top:0;">Registration Update</h2>
      <p>Dear <strong>${ownerName}</strong>,</p>
      <p>Thank you for your interest in joining the Camellia platform. After reviewing your application for <strong>${plantationName}</strong>, we are unable to approve it at this time.</p>
      ${reason ? `
        <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px;border-radius:4px;margin:24px 0;">
          <p style="margin:0 0 4px;color:#991b1b;font-size:13px;font-weight:600;">Reason</p>
          <p style="margin:0;color:#7f1d1d;">${reason}</p>
        </div>
      ` : ''}
      <p>You are welcome to address the issues above and resubmit your application.</p>
      <p style="color:#6b7280;font-size:14px;">
        Questions? Email us at
        <a href="mailto:support@camellia.com" style="color:#1B4332;">support@camellia.com</a>
      </p>
    `),
  });
}
