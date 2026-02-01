import type { Handler } from '@netlify/functions';

const GITHUB_REPO = 'evan61189/PermitSDRv3';

// Map jurisdictions to their workflow files
const ORIGINAL_COUNTIES = ['howard_county_md', 'baltimore_city_md', 'anne_arundel_county_md', 'baltimore_county_md', 'dc'];
const NEW_COUNTIES = ['carroll_county_md', 'frederick_county_md'];

function getWorkflowFile(jurisdiction: string): string {
  if (!jurisdiction) {
    // No jurisdiction specified - default to original scraper
    return 'scrape.yml';
  }
  if (NEW_COUNTIES.includes(jurisdiction)) {
    return 'scrape-new-counties.yml';
  }
  return 'scrape.yml';
}

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
  let startDate = '';
  let endDate = '';

  try {
    if (event.body) {
      const body = JSON.parse(event.body);
      jurisdiction = body.jurisdiction || '';
      runScoring = body.runScoring !== false;
      startDate = body.startDate || '';
      endDate = body.endDate || '';
    }
  } catch {
    // Ignore parse errors, use defaults
  }

  // Determine which workflow to trigger based on jurisdiction
  const workflowFile = getWorkflowFile(jurisdiction);

  try {
    // Trigger the GitHub Actions workflow
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${workflowFile}/dispatches`,
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
            start_date: startDate,
            end_date: endDate,
          },
        }),
      }
    );

    if (response.status === 204) {
      const workflowName = workflowFile === 'scrape-new-counties.yml'
        ? 'New Counties (Carroll & Frederick)'
        : 'Original Counties';
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: `Scraper workflow triggered successfully (${workflowName})`,
          workflow: workflowFile,
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
