import { Profile } from '../interfaces/profile';
import { getRedis } from '../redis/client';

// Simple mock for embedding generation
// In production, this would call Anthropic or OpenAI API
export async function generateProfileEmbedding(profile: Profile): Promise<number[]> {
  const redis = getRedis();
  const cacheKey = `profile:${profile.user_id}:embedding`;

  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // MOCK: Generate a random 1536-dimension vector
  const embedding = Array.from({ length: 1536 }, () => Math.random());

  await redis.set(cacheKey, JSON.stringify(embedding), 'EX', 86400); // 24h TTL
  return embedding;
}

export async function generatePostingEmbedding(_title: string, _description: string): Promise<number[]> {
  // MOCK: Generate a random 1536-dimension vector
  return Array.from({ length: 1536 }, () => Math.random());
}
