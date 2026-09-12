const GITHUB_REPO = 'havishnaveen/eartrain-handposition';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

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
    const singleLineDesc = safeDescription.replace(/[\r\n]+/g, ' ').slice(0, 60);
    const issueTitle = `[Problem Report] ${singleLineDesc}`;
    const issueBody = `### What the learner saw\n${safeDescription}\n\n### Diagnostics\n\`\`\`\n${diagnostic.trim()}\n\`\`\``;

    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'EarTrain-Problem-Reporter',
      },
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody,
        labels: ['problem-report'],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GitHub issue creation failed:', response.status, errorText);
      return res.status(response.status).json({ error: `Failed to create report: ${response.statusText}` });
    }

    const issueData = await response.json();
    return res.status(200).json({
      success: true,
      issueNumber: issueData.number,
      url: issueData.html_url,
    });
  } catch (error: any) {
    console.error('Report-problem handler error:', error);
    return res.status(500).json({ error: error.message });
  }
}

