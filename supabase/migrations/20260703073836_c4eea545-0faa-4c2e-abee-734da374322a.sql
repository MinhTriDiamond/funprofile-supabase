-- G4.1 validation fix: broaden btc_tx_semantic.flow_type to accept 2-tier category:subtype
-- Plan G4 §3 requires flow_type = `${category}:${subtype}` (e.g. donation:external_in, change:return_to_sender).
-- Old G3 enum was 1-tier; replace with regex allowing lowercase snake segments joined by ':'.

ALTER TABLE public.btc_tx_semantic DROP CONSTRAINT IF EXISTS btc_tx_semantic_flow_type_check;

ALTER TABLE public.btc_tx_semantic
  ADD CONSTRAINT btc_tx_semantic_flow_type_check
  CHECK (flow_type ~ '^[a-z][a-z0-9_]*(:[a-z][a-z0-9_]*)?$');