import Anthropic from '@anthropic-ai/sdk';
import type { Permit, AIScore, OpportunityRating } from '../types/index.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SCORING_PROMPT = `You are an AI assistant that scores construction permit opportunities for Clipper Construction, a commercial general contractor in the Maryland/DC area.

Clipper Construction specializes in:
- Commercial tenant improvements and fit-outs
- Office renovations and buildouts
- Retail construction and renovations
- Medical/dental office buildouts
- Restaurant and hospitality construction
- Multi-family residential construction
- Ground-up commercial construction

They are NOT interested in:
- Single-family residential projects
- Single trade work (electrical only, plumbing only, HVAC only)
- Fire alarm/sprinkler-only permits
- Roofing-only projects
- Minor repairs and maintenance

Analyze the following permit and provide a scoring assessment:

Permit Details:
- Permit Number: {permit_number}
- Description: {description}
- Address: {address}
- City: {city}, {state}
- Project Type: {project_type}
- Permit Type: {permit_type}
- Status: {status}
- Applicant: {applicant_name}
- Contractor: {contractor_name}
- Estimated Value: {estimated_value}
- Square Footage: {square_footage}

Score this opportunity on the following criteria (0-100 for each):

1. PROJECT_SIZE_SCORE: Based on estimated value, square footage, and scope. Larger commercial projects (tenant buildouts, renovations, new construction) score higher. Small projects under $50K score low.

2. TIMING_SCORE: Based on permit status. "Submitted", "In Review", "Approved" permits that haven't started are ideal (80-100). "Issued" permits may still have opportunities. "Complete" or "Expired" score low.

3. LOCATION_SCORE: Based on the location within the DC/MD market. Urban commercial areas, business districts, and established commercial corridors score higher.

4. FIT_SCORE: How well this project fits Clipper Construction's expertise. Commercial buildouts, tenant improvements, and renovations score highest. Single-trade or residential score lowest.

Also provide:
- OVERALL_SCORE: Weighted average favoring FIT_SCORE and PROJECT_SIZE_SCORE (0-100)
- OPPORTUNITY_RATING:
  - "hot" = Overall 75+, good fit, actionable timing
  - "warm" = Overall 50-74, decent fit or timing not ideal
  - "cold" = Overall 25-49, marginal opportunity
  - "not_relevant" = Overall <25, not a fit for Clipper
- REASONING: 2-3 sentence explanation of why this is or isn't a good opportunity for Clipper Construction
- KEYWORDS: Key terms from the permit that influenced scoring
- RECOMMENDED_ACTIONS: Specific next steps (e.g., "Contact applicant", "Monitor for GC selection", "Request bid documents")

Respond ONLY with valid JSON in this exact format:
{
  "overall_score": number,
  "opportunity_rating": "hot" | "warm" | "cold" | "not_relevant",
  "project_size_score": number,
  "timing_score": number,
  "location_score": number,
  "fit_score": number,
  "reasoning": "string",
  "keywords_detected": ["string"],
  "recommended_actions": ["string"]
}`;

export async function scorePermit(permit: Permit): Promise<Omit<AIScore, 'id'>> {
  const prompt = SCORING_PROMPT
    .replace('{permit_number}', permit.permit_number)
    .replace('{description}', permit.description || 'N/A')
    .replace('{address}', permit.address)
    .replace('{city}', permit.city)
    .replace('{state}', permit.state)
    .replace('{project_type}', permit.project_type)
    .replace('{permit_type}', permit.permit_type || 'N/A')
    .replace('{status}', permit.status)
    .replace('{applicant_name}', permit.applicant_name || 'N/A')
    .replace('{contractor_name}', permit.contractor_name || 'N/A')
    .replace('{estimated_value}', permit.estimated_value?.toString() || 'N/A')
    .replace('{square_footage}', permit.square_footage?.toString() || 'N/A');

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const responseText = message.content[0];
    if (responseText.type !== 'text') {
      throw new Error('Unexpected response type from Anthropic');
    }

    // Extract JSON from response (handle potential markdown code blocks)
    let jsonStr = responseText.text.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    const parsed = JSON.parse(jsonStr);

    // Map fit_score to competition_score for backward compatibility with DB schema
    return {
      permit_id: permit.id,
      overall_score: Math.min(100, Math.max(0, parsed.overall_score)),
      opportunity_rating: validateRating(parsed.opportunity_rating),
      project_size_score: Math.min(100, Math.max(0, parsed.project_size_score)),
      timing_score: Math.min(100, Math.max(0, parsed.timing_score)),
      location_score: Math.min(100, Math.max(0, parsed.location_score)),
      competition_score: Math.min(100, Math.max(0, parsed.fit_score || parsed.competition_score || 0)),
      reasoning: parsed.reasoning || '',
      keywords_detected: parsed.keywords_detected || [],
      recommended_actions: parsed.recommended_actions || [],
      scored_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error scoring permit:', error);
    // Return a default low score on error
    return {
      permit_id: permit.id,
      overall_score: 0,
      opportunity_rating: 'not_relevant',
      project_size_score: 0,
      timing_score: 0,
      location_score: 0,
      competition_score: 0,
      reasoning: 'Error during AI scoring: ' + (error instanceof Error ? error.message : 'Unknown error'),
      keywords_detected: [],
      recommended_actions: [],
      scored_at: new Date().toISOString(),
    };
  }
}

function validateRating(rating: string): OpportunityRating {
  const validRatings: OpportunityRating[] = ['hot', 'warm', 'cold', 'not_relevant'];
  return validRatings.includes(rating as OpportunityRating)
    ? (rating as OpportunityRating)
    : 'not_relevant';
}

// Re-export from permit-filter for backward compatibility
export { classifyProjectType } from './permit-filter.js';
