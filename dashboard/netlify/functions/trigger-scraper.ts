import type { Handler } from '@netlify/functions';

const GITHUB_REPO = 'evan61189/PermitSDRv3';
const WORKFLOW_FILE = 'scrape.yml';

export const handler: Handler = async (event) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const githubToken = process.env.GITHUB_TOKEN;

  if (!githubToken) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'GitHub token not configured',
        message: 'Please add GITHUB_TOKEN to Netlify environment variables'
      }),
    };
  }

  // Parse request body for optional parameters
  let jurisdiction = '';
  let runScoring = true;

  try {
    if (event.body) {
      const body = JSON.parse(event.body);
      jurisdiction = body.jurisdiction || '';
      runScoring = body.runScoring !== false;
    }
  } catch {
    // Ignore parse errors, use defaults
  }

  try {
    // Trigger the GitHub Actions workflow
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${githubToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: 'main', // or the default branch
          inputs: {
            jurisdiction: jurisdiction,
            run_scoring: String(runScoring),
          },
        }),
      }
    );

    if (response.status === 204) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: 'Scraper workflow triggered successfully',
        }),
      };
    }

    const errorData = await response.text();
    return {
      statusCode: response.status,
      body: JSON.stringify({
        error: 'Failed to trigger workflow',
        details: errorData,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to trigger scraper',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
