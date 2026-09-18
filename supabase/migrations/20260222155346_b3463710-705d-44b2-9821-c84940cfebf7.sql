-- Allow recipient_id to be null for unmapped treasury transactions
ALTER TABLE public.donations ALTER COLUMN recipient_id DROP NOT NULL;

-- Drop the existing foreign key constraint so null values are allowed
-- (FK already allows nulls naturally, just need the NOT NULL removed)