import OpenAI from 'openai';
import type { Permit, AIScore, OpportunityRating, ProjectType } from '../types/index.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SCORING_PROMPT = `You are an AI assistant that scores construction permit opportunities for a sales development team.

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

1. PROJECT_SIZE_SCORE: Based on estimated value and square footage. Larger commercial projects score higher.
2. TIMING_SCORE: Based on permit status. Active/recent permits score higher than old or completed ones.
3. LOCATION_SCORE: Based on the desirability of the location for business development.
4. COMPETITION_SCORE: Estimate how competitive this opportunity might be (inverse - less competition = higher score).

Also provide:
- OVERALL_SCORE: Weighted average (0-100)
- OPPORTUNITY_RATING: One of "hot", "warm", "cold", or "not_relevant"
- REASONING: Brief explanation of the scores
- KEYWORDS: Key terms that influenced scoring
- RECOMMENDED_ACTIONS: Suggested next steps for sales team

Respond in JSON format:
{
  "overall_score": number,
  "opportunity_rating": "hot" | "warm" | "cold" | "not_relevant",
  "project_size_score": number,
  "timing_score": number,
  "location_score": number,
  "competition_score": number,
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
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are a construction industry sales intelligence assistant. Respond only with valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(response);

    return {
      permit_id: permit.id,
      overall_score: Math.min(100, Math.max(0, parsed.overall_score)),
      opportunity_rating: validateRating(parsed.opportunity_rating),
      project_size_score: Math.min(100, Math.max(0, parsed.project_size_score)),
      timing_score: Math.min(100, Math.max(0, parsed.timing_score)),
      location_score: Math.min(100, Math.max(0, parsed.location_score)),
      competition_score: Math.min(100, Math.max(0, parsed.competition_score)),
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
      reasoning: 'Error during AI scoring',
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

export function classifyProjectType(description: string, permitType: string): ProjectType {
  const text = `${description} ${permitType}`.toLowerCase();

  // Commercial indicators
  const commercialKeywords = ['commercial', 'office', 'retail', 'store', 'restaurant', 'hotel', 'warehouse', 'business'];
  const isCommercial = commercialKeywords.some(kw => text.includes(kw));

  // Residential indicators
  const residentialKeywords = ['residential', 'single family', 'multi-family', 'apartment', 'condo', 'townhouse', 'dwelling', 'home'];
  const isResidential = residentialKeywords.some(kw => text.includes(kw));

  // New construction indicators
  const newConstructionKeywords = ['new construction', 'new building', 'new structure', 'construct new'];
  const isNew = newConstructionKeywords.some(kw => text.includes(kw));

  // Renovation indicators
  const renovationKeywords = ['renovation', 'remodel', 'alteration', 'addition', 'interior fit', 'tenant improvement'];
  const isRenovation = renovationKeywords.some(kw => text.includes(kw));

  // Specific trade indicators
  if (text.includes('electrical') || text.includes('electric')) return 'electrical';
  if (text.includes('plumbing') || text.includes('water heater')) return 'plumbing';
  if (text.includes('hvac') || text.includes('mechanical') || text.includes('heating') || text.includes('cooling')) return 'hvac';
  if (text.includes('roof') || text.includes('shingle')) return 'roofing';
  if (text.includes('demolition') || text.includes('demo') || text.includes('raze')) return 'demolition';
  if (text.includes('industrial') || text.includes('manufacturing') || text.includes('factory')) return 'industrial';
  if (text.includes('mixed use') || text.includes('mixed-use')) return 'mixed_use';

  // Combined classifications
  if (isCommercial && isNew) return 'commercial_new';
  if (isCommercial && isRenovation) return 'commercial_renovation';
  if (isCommercial) return 'commercial_renovation'; // Default commercial to renovation

  if (isResidential && isNew) return 'residential_new';
  if (isResidential && isRenovation) return 'residential_renovation';
  if (isResidential) return 'residential_renovation'; // Default residential to renovation

  if (isNew) return 'commercial_new';
  if (isRenovation) return 'commercial_renovation';

  return 'other';
}
