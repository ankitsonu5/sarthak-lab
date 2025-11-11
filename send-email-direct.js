require('dotenv').config();
const { sendEmail } = require('./back-end/utils/mailer');

(async () => {
  try {
    console.log('📬 Attempting to send direct test email using .env SMTP...');
    console.log('FROM:', process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.EMAIL_USER || process.env.SMTP_USER);
    const ok = await sendEmail({
      to: 'pgpinka3003@gmail.com',
      subject: 'HMS Test Email',
      text: 'This is a test email from RAMCAH HMS. If you received this, SMTP is working.',
      html: '<p>This is a <b>test email</b> from RAMCAH HMS. ✅</p>'
    });
    console.log(ok ? '✅ Email sent (or queued by SMTP server).' : '❌ Email not sent (SMTP missing or misconfigured).');
    process.exit(ok ? 0 : 2);
  } catch (e) {
    console.error('❌ Error sending email:', e && (e.response?.data || e.message || e));
    process.exit(1);
  }
})();

