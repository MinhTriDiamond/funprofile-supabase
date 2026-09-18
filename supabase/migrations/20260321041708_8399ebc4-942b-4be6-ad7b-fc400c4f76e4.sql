
-- Bảng lưu tên/nhãn cho các địa chỉ ví bên ngoài (admin quản lý)
CREATE TABLE public.external_wallet_labels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  label TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(wallet_address)
);

-- Chuẩn hoá lowercase
CREATE OR REPLACE FUNCTION public.normalize_external_wallet_label()
RETURNS TRIGGER AS $$
BEGIN
  NEW.wallet_address := lower(NEW.wallet_address);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_normalize_external_wallet_label
  BEFORE INSERT OR UPDATE ON public.external_wallet_labels
  FOR EACH ROW EXECUTE FUNCTION public.normalize_external_wallet_label();

-- Enable RLS
ALTER TABLE public.external_wallet_labels ENABLE ROW LEVEL SECURITY;

-- Ai cũng xem được nhãn
CREATE POLICY "Anyone can view external wallet labels"
  ON public.external_wallet_labels FOR SELECT USING (true);

-- Chỉ admin mới thêm/sửa/xoá
CREATE POLICY "Admins can insert external wallet labels"
  ON public.external_wallet_labels FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update external wallet labels"
  ON public.external_wallet_labels FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete external wallet labels"
  ON public.external_wallet_labels FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
