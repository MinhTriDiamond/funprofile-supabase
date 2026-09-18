
ALTER TABLE public.identity_verifications
  ADD COLUMN IF NOT EXISTS actual_document_type text,
  ADD COLUMN IF NOT EXISTS actual_issuing_country text,
  ADD COLUMN IF NOT EXISTS selected_document_type text,
  ADD COLUMN IF NOT EXISTS selected_country text,
  ADD COLUMN IF NOT EXISTS doc_mismatch boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kyc_risk_flag text;

CREATE INDEX IF NOT EXISTS idx_identity_verifications_doc_mismatch
  ON public.identity_verifications(doc_mismatch) WHERE doc_mismatch = true;

CREATE INDEX IF NOT EXISTS idx_identity_verifications_risk_flag
  ON public.identity_verifications(kyc_risk_flag) WHERE kyc_risk_flag IS NOT NULL;
