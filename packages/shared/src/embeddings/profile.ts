import { Profile } from '../interfaces/profile';
import { getRedis } from '../redis/client';

const EMBEDDING_TTL = 86400; // 24 hours

/**
 * Generate a text representation of the profile for embedding.
 */
export function profileToText(profile: Profile): string {
  const parts = [
    `Target roles: ${profile.target_roles.join(', ')}`,
    `Stack: ${profile.stack.join(', ')}`,
    `Seniority: ${profile.seniority}`,
    `Location: ${profile.location.city}, ${profile.location.country}`,
    `Remote preference: ${profile.location_prefs.remote}`,
  ];
  return parts.join('. ');
}

/**
 * Generate a text representation of a posting for embedding.
 */
export function postingToText(roleTitle: string, description: string): string {
  return `${roleTitle}. ${description.slice(0, 1000)}`;
}

/**
 * Generate embedding via external API (OpenAI or Anthropic-compatible).
 * Returns a 1536-dimension vector.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    // Fallback: generate a pseudo-embedding for development
    console.warn('[embeddings] No API key configured, using pseudo-embedding');
    return generatePseudoEmbedding(text);
  }

  // Use OpenAI's embedding API
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: text,
      model: 'text-embedding-3-small',
    }),
  });

  if (!response.ok) {
    console.warn('[embeddings] API call failed, using pseudo-embedding');
    return generatePseudoEmbedding(text);
  }

  const data = await response.json() as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

/**
 * Get or generate a cached profile embedding.
 */
export async function getProfileEmbedding(userId: string, profile: Profile): Promise<number[]> {
  const redis = getRedis();
  const cacheKey = `profile:${userId}:embedding`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const text = profileToText(profile);
  const embedding = await generateEmbedding(text);

  await redis.setex(cacheKey, EMBEDDING_TTL, JSON.stringify(embedding));
  return embedding;
}

/**
 * Simple pseudo-embedding for development without API keys.
 * Uses character frequency as a deterministic hash-like vector.
 */
function generatePseudoEmbedding(text: string): number[] {
  const vec = new Array(1536).fill(0);
  for (let i = 0; i < text.length; i++) {
    const idx = (text.charCodeAt(i) * (i + 1)) % 1536;
    vec[idx] += 1;
  }
  // Normalize
  const mag = Math.sqrt(vec.reduce((sum: number, v: number) => sum + v * v, 0)) || 1;
  return vec.map((v: number) => v / mag);
}
