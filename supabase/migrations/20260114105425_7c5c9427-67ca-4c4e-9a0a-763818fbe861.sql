-- Update content_length constraint from 5000 to 20000 characters
ALTER TABLE posts DROP CONSTRAINT IF EXISTS content_length;
ALTER TABLE posts ADD CONSTRAINT content_length CHECK (length(content) <= 20000);