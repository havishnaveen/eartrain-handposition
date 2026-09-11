import nodemailer from 'nodemailer';

const REPORT_RECIPIENT = 'havish.naveen@gmail.com';

export default async function handler(req: any, res: any) {
  // Handle CORS — same policy as api/send-email.ts.
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { description, diagnostic } = req.body ?? {};

  if (typeof diagnostic !== 'string' || !diagnostic.trim()) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const trimmedDescription = typeof description === 'string' ? description.trim() : '';
  const safeDescription = trimmedDescription || 'No description supplied.';

  try {
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;

    if (!gmailUser || !gmailPass) {
      throw new Error('Gmail credentials are not configured in environment variables.');
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    });

    const escapeHtml = (value: string) =>
      value.replace(/[&<>"']/g, (char) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char
      ));

    await transporter.sendMail({
      from: `"EarTrain" <${gmailUser}>`,
      to: REPORT_RECIPIENT,
      replyTo: gmailUser,
      subject: 'EarTrain — Problem report',
      text: `${safeDescription}\n\n---\n${diagnostic}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0;">
          <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 32px 24px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 24px; letter-spacing: -0.5px;">🐛 EarTrain problem report</h1>
          </div>
          <div style="background: #ffffff; padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none;">
            <h2 style="color: #1f2937; margin: 0 0 8px; font-size: 16px;">What the learner saw</h2>
            <p style="color: #1f2937; font-size: 15px; line-height: 1.6; white-space: pre-wrap; margin: 0 0 24px; background: #f9fafb; border: 1px solid #f3f4f6; border-radius: 8px; padding: 12px 16px;">${escapeHtml(safeDescription)}</p>
            <h2 style="color: #1f2937; margin: 0 0 8px; font-size: 16px;">Diagnostics</h2>
            <pre style="color: #6b7280; font-size: 13px; line-height: 1.6; white-space: pre-wrap; margin: 0; background: #f9fafb; border: 1px solid #f3f4f6; border-radius: 8px; padding: 12px 16px; font-family: 'SFMono-Regular', Consolas, monospace;">${escapeHtml(diagnostic)}</pre>
          </div>
        </div>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Report-problem email send error:', error);
    return res.status(500).json({ error: error.message });
  }
}
