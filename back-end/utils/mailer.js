// Mail helper that supports global SMTP (.env) and per-user SMTP overrides
// Usage: await sendEmail({ to, subject, text, html, fromUser }) => returns true/false
// - fromUser is a User doc (or object with smtpSettings) whose SMTP should be used as sender

const { decrypt } = require('./secure');

async function sendEmail({ to, subject, text = '', html = '', fromUser = null }) {
  // 1) Try to require nodemailer at runtime so app doesn't crash if not installed
  let nodemailer;
  try {
    // eslint-disable-next-line global-require
    nodemailer = require('nodemailer');
  } catch (err) {
    console.warn('📭 Email skipped: "nodemailer" is not installed. Set it up to enable emails.');
    return false;
  }

  // 2) Prepare SMTP either from per-user settings or environment
  let host, port, secure, user, pass, from;
  if (fromUser && fromUser.smtpSettings && fromUser.smtpSettings.user && fromUser.smtpSettings.passEnc) {
    host = fromUser.smtpSettings.host || process.env.SMTP_HOST || process.env.EMAIL_HOST;
    port = fromUser.smtpSettings.port || Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 587);
    secure = typeof fromUser.smtpSettings.secure === 'boolean' ? fromUser.smtpSettings.secure : String(process.env.SMTP_SECURE || process.env.EMAIL_SECURE || '').toLowerCase() === 'true';
    user = fromUser.smtpSettings.user;
    try { pass = decrypt(fromUser.smtpSettings.passEnc); } catch (_) { pass = null; }
    from = fromUser.smtpSettings.from || `${fromUser.firstName || 'HMS'} ${fromUser.lastName || ''} <${user}>`;
  }

  if (!user || !pass) {
    const env = process.env;
    host = host || env.SMTP_HOST || env.EMAIL_HOST;
    port = port || Number(env.SMTP_PORT || env.EMAIL_PORT || 587);
    secure = typeof secure === 'boolean' ? secure : String(env.SMTP_SECURE || env.EMAIL_SECURE || '').toLowerCase() === 'true';
    user = user || env.SMTP_USER || env.EMAIL_USER;
    pass = pass || env.SMTP_PASS || env.EMAIL_PASS;
    from = from || env.SMTP_FROM || env.EMAIL_FROM || (user ? `HMS System <${user}>` : undefined);
  }

  if (!host || !port || !user || !pass) {
    console.warn('📭 Email skipped: SMTP configuration not available (neither user nor env).');
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: !!secure,
      auth: { user, pass }
    });

    const info = await transporter.sendMail({ from, to, subject, text, html: html || undefined });
    console.log(`📧 Email sent to ${to}. MessageId:`, info?.messageId);
    return true;
  } catch (err) {
    console.error('❌ Email send failed:', err?.message || err);
    return false;
  }
}

module.exports = { sendEmail };
