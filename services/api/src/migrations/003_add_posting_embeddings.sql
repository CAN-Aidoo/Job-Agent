-- Add embedding column to job_postings
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS embedding vector(1536);
