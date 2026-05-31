import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--report') args.report = value;
    if (key === '--to') args.to = value;
    if (key === '--subject') args.subject = value;
  }
  return args;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

async function main() {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });

  const { report, to, subject } = parseArgs(process.argv);
  if (!report || !to) {
    throw new Error('Usage: node send-vapt-report-email.mjs --report <path> --to <email> [--subject <subject>]');
  }

  const smtpHost = requireEnv('SMTP_HOST');
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpUser = requireEnv('SMTP_USER');
  const smtpPassword = requireEnv('SMTP_PASSWORD');
  const smtpFrom = process.env.SMTP_FROM || smtpUser;

  const secure = smtpPort === 465;
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure,
    auth: {
      user: smtpUser,
      pass: smtpPassword,
    },
  });

  const reportPath = path.resolve(report);
  const reportText = await fs.readFile(reportPath, 'utf8');

  const mailSubject = subject || `Mediczy Daily VAPT Report - ${new Date().toISOString()}`;

  await transporter.sendMail({
    from: smtpFrom,
    to,
    subject: mailSubject,
    text: reportText,
    attachments: [
      {
        filename: path.basename(reportPath),
        path: reportPath,
      },
    ],
  });

  console.log(`VAPT report email sent to ${to}`);
}

main().catch((err) => {
  console.error(`Failed to send VAPT report email: ${err.message}`);
  process.exit(1);
});
