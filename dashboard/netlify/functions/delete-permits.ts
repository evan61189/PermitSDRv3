import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

export const handler: Handler = async (event) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Supabase configuration missing',
        message: 'Please add SUPABASE_URL and SUPABASE_SERVICE_KEY to Netlify environment variables'
      }),
    };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // First delete all AI scores (CASCADE should handle this, but let's be explicit)
    const { error: scoresError } = await supabase
      .from('ai_scores')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (scoresError) {
      console.error('Error deleting AI scores:', scoresError);
    }

    // Delete all permits
    const { data, error } = await supabase
      .from('permits')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
      .select('id');

    if (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to delete permits',
          message: error.message,
        }),
      };
    }

    const deletedCount = data?.length || 0;

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: `Successfully deleted ${deletedCount} permits`,
        deleted: deletedCount,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to delete permits',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
