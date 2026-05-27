import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transporter: nodemailer.Transporter | null = null;

async function getTransporter(): Promise<nodemailer.Transporter> {
  if (transporter) return transporter;

  if (config.SMTP_USER && config.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
    });
  } else {
    const account = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.user, pass: account.pass },
    });
    console.log(`📧 Ethereal account: ${account.user} / ${account.pass}`);
  }
  return transporter;
}

export async function sendMagicLink(to: string, link: string): Promise<void> {
  const t = await getTransporter();
  const info = await t.sendMail({
    from: config.EMAIL_FROM,
    to,
    subject: 'Jouw inloglink',
    text: `Klik hier om in te loggen:\n${link}\n\nDeze link is 15 minuten geldig.`,
    html: `<p>Klik <a href="${link}">hier</a> om in te loggen.</p><p>Deze link is 15 minuten geldig.</p>`,
  });
  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) console.log(`📧 Preview: ${preview}`);
}
