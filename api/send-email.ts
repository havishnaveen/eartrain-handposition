import nodemailer from 'nodemailer';

export default async function handler(req: any, res: any) {
  // Handle CORS
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

  const { email, token } = req.body;

  if (!email || !token) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const host = req.headers.host
    ? `https://${req.headers.host}`
    : 'http://localhost:5173';

  const verifyLink = `${host}/verify?token=${token}`;

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

    await transporter.sendMail({
      from: `"EarTrain" <${gmailUser}>`,
      to: email,
      subject: 'Verify your EarTrain Account',
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0;">
          <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 32px 24px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 28px; letter-spacing: -0.5px;">🎵 EarTrain</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Master your musical ear</p>
          </div>
          <div style="background: #ffffff; padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none;">
            <h2 style="color: #1f2937; margin: 0 0 12px; font-size: 22px;">Verify your email address</h2>
            <p style="color: #6b7280; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
              Thanks for joining EarTrain! Please click the button below to verify your email and fully secure your account.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${verifyLink}" style="display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: #fff; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 14px rgba(245,158,11,0.4);">
                ✅ Verify Email Address
              </a>
            </div>
            <p style="color: #9ca3af; font-size: 13px; line-height: 1.5; margin: 24px 0 0; border-top: 1px solid #f3f4f6; padding-top: 16px;">
              If the button doesn't work, copy and paste this link into your browser:<br/>
              <a href="${verifyLink}" style="color: #f59e0b; word-break: break-all;">${verifyLink}</a>
            </p>
          </div>
          <div style="background: #f9fafb; padding: 16px 24px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none; text-align: center;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} EarTrain. Happy practicing! 🎶</p>
          </div>
        </div>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Email send error:', error);
    return res.status(500).json({ error: error.message });
  }
}
