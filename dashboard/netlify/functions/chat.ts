import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
}

const supabase = createClient(supabaseUrl!, supabaseKey!);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `You are an AI assistant for Clipper Construction's permit tracking system. You help users find and analyze commercial construction permit opportunities in the Maryland/DC area.

You have access to a database of construction permits with the following fields:
- permit_number: Unique identifier
- description: Description of the work
- address, city, county, state, zip_code: Location information
- project_type: Type of project (commercial_new, commercial_renovation, residential_new, residential_renovation, industrial, mixed_use, electrical, plumbing, hvac, roofing, demolition, other)
- permit_type: The permit category
- status: Current permit status
- applicant_name: The applicant/owner
- contractor_name: The contractor (if assigned)
- estimated_value: Estimated project value in dollars
- square_footage: Project square footage
- overall_score: AI-generated opportunity score (0-100)
- opportunity_rating: hot, warm, cold, or not_relevant
- source_jurisdiction: howard_county_md, baltimore_city_md, anne_arundel_county_md, carroll_county_md, frederick_county_md

When users ask questions, I will provide you with relevant data from the database. Your job is to:
1. Understand what the user is asking
2. Analyze the data provided
3. Give helpful, concise answers
4. Suggest follow-up actions when appropriate

Be conversational but professional. Focus on actionable insights for a commercial general contractor looking for new business opportunities.`;

async function queryPermits(intent: string, filters: Record<string, unknown>): Promise<unknown[]> {
  let query = supabase.from('permits_with_scores').select('*');

  // Apply filters based on intent
  if (filters.jurisdiction) {
    query = query.eq('source_jurisdiction', filters.jurisdiction);
  }
  if (filters.rating) {
    query = query.eq('opportunity_rating', filters.rating);
  }
  if (filters.projectType) {
    query = query.eq('project_type', filters.projectType);
  }
  if (filters.minScore) {
    query = query.gte('overall_score', filters.minScore);
  }
  if (filters.minValue) {
    query = query.gte('estimated_value', filters.minValue);
  }
  if (filters.search) {
    query = query.or(
      `description.ilike.%${filters.search}%,address.ilike.%${filters.search}%,applicant_name.ilike.%${filters.search}%`
    );
  }

  // Default ordering and limit
  query = query.order('overall_score', { ascending: false, nullsFirst: false }).limit(filters.limit as number || 10);

  const { data, error } = await query;
  if (error) {
    console.error('Query error:', error);
    return [];
  }
  return data || [];
}

async function getStats(): Promise<Record<string, unknown>> {
  const { data: stats } = await supabase.from('dashboard_stats').select('*').single();

  const { data: byJurisdiction } = await supabase
    .from('permits')
    .select('source_jurisdiction');

  const jurisdictionCounts: Record<string, number> = {};
  for (const p of byJurisdiction || []) {
    jurisdictionCounts[p.source_jurisdiction] = (jurisdictionCounts[p.source_jurisdiction] || 0) + 1;
  }

  const { data: topApplicants } = await supabase
    .from('permits')
    .select('applicant_name, estimated_value');

  const applicantMap = new Map<string, { count: number; value: number }>();
  for (const p of topApplicants || []) {
    if (!p.applicant_name) continue;
    const existing = applicantMap.get(p.applicant_name) || { count: 0, value: 0 };
    existing.count++;
    existing.value += p.estimated_value || 0;
    applicantMap.set(p.applicant_name, existing);
  }

  const topApplicantsList = Array.from(applicantMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    ...stats,
    byJurisdiction: jurisdictionCounts,
    topApplicants: topApplicantsList,
  };
}

async function processUserMessage(userMessage: string, conversationHistory: ChatMessage[]): Promise<string> {
  // First, use Claude to understand the user's intent and extract any filters
  const intentPrompt = `Given this user message about construction permits, extract the intent and any filters.

User message: "${userMessage}"

Respond with JSON only:
{
  "intent": "search" | "stats" | "details" | "general",
  "filters": {
    "jurisdiction": "howard_county_md" | "baltimore_city_md" | "anne_arundel_county_md" | "carroll_county_md" | "frederick_county_md" | null,
    "rating": "hot" | "warm" | "cold" | "not_relevant" | null,
    "projectType": "commercial_new" | "commercial_renovation" | "residential_new" | "residential_renovation" | "industrial" | "mixed_use" | "electrical" | "plumbing" | "hvac" | "roofing" | "demolition" | "other" | null,
    "minScore": number | null,
    "minValue": number | null,
    "search": "search term" | null,
    "limit": number (default 10, max 20)
  },
  "summary": "brief description of what user wants"
}`;

  const intentResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{ role: 'user', content: intentPrompt }],
  });

  let intent = 'general';
  let filters: Record<string, unknown> = {};
  let summary = '';

  try {
    const intentText = intentResponse.content[0];
    if (intentText.type === 'text') {
      let jsonStr = intentText.text.trim();
      if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
      if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
      if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
      const parsed = JSON.parse(jsonStr.trim());
      intent = parsed.intent;
      filters = parsed.filters || {};
      summary = parsed.summary;
    }
  } catch (e) {
    console.error('Failed to parse intent:', e);
  }

  // Gather relevant data based on intent
  let contextData = '';

  if (intent === 'stats' || userMessage.toLowerCase().includes('overview') || userMessage.toLowerCase().includes('summary')) {
    const stats = await getStats();
    contextData = `\n\nDatabase Statistics:\n${JSON.stringify(stats, null, 2)}`;
  }

  if (intent === 'search' || intent === 'details') {
    // Clean up filters - remove null values
    const cleanFilters: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(filters)) {
      if (value !== null && value !== undefined) {
        cleanFilters[key] = value;
      }
    }

    const permits = await queryPermits(intent, cleanFilters);
    if (permits.length > 0) {
      // Simplify permit data for context
      const simplified = permits.map((p: Record<string, unknown>) => ({
        permit_number: p.permit_number,
        address: `${p.address}, ${p.city}`,
        description: (p.description as string)?.substring(0, 200),
        project_type: p.project_type,
        estimated_value: p.estimated_value,
        overall_score: p.overall_score,
        opportunity_rating: p.opportunity_rating,
        applicant_name: p.applicant_name,
        contractor_name: p.contractor_name,
        source_jurisdiction: p.source_jurisdiction,
      }));
      contextData += `\n\nRelevant Permits Found (${permits.length}):\n${JSON.stringify(simplified, null, 2)}`;
    } else {
      contextData += '\n\nNo permits found matching the criteria.';
    }
  }

  // Generate final response with context
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...conversationHistory.slice(-6), // Keep last 6 messages for context
    {
      role: 'user',
      content: `${userMessage}${contextData}`,
    },
  ];

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages,
  });

  const responseText = response.content[0];
  if (responseText.type === 'text') {
    return responseText.text;
  }

  return 'I apologize, but I was unable to process your request. Please try again.';
}

export const handler: Handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { message, history = [] } = body;

    if (!message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Message is required' }),
      };
    }

    const response = await processUserMessage(message, history);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ response }),
    };
  } catch (error) {
    console.error('Chat error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to process message',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
