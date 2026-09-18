import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, ArrowRight, ArrowLeft, CheckCircle2, XCircle, Clock, Sparkles, Send, Link as LinkIcon, FileText, History } from 'lucide-react';
import { usePPLPv2, type PPLPv2ValidationResult } from '@/hooks/usePPLPv2';
import { toast } from 'sonner';

const ACTION_TYPES = [
  { code: 'INNER_WORK', icon: '🧘', name: 'Thiền / Sám hối', desc: 'Tu tập nội tâm, thiền định, tĩnh lặng' },
  { code: 'CHANNELING', icon: '📡', name: 'Dẫn kênh / Chia sẻ', desc: 'Chia sẻ kiến thức, truyền cảm hứng' },
  { code: 'GIVING', icon: '🎁', name: 'Cho đi', desc: 'Tặng quà, quyên góp, chia sẻ tài nguyên' },
  { code: 'SOCIAL_IMPACT', icon: '🌍', name: 'Tác động xã hội', desc: 'Thiện nguyện, dự án cộng đồng' },
  { code: 'SERVICE', icon: '🙏', name: 'Phụng sự sự sống', desc: 'Giúp đỡ người khác, chăm sóc môi trường' },
];

const PILLAR_INFO = [
  { key: 'serving_life', icon: '☀️', name: 'Phụng sự sự sống' },
  { key: 'transparent_truth', icon: '🔍', name: 'Chân thật minh bạch' },
  { key: 'healing_love', icon: '💚', name: 'Chữa lành & yêu thương' },
  { key: 'long_term_value', icon: '🌱', name: 'Giá trị bền vững' },
  { key: 'unity_over_separation', icon: '🤝', name: 'Hợp Nhất' },
];

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  proof_pending: { label: 'Chờ bằng chứng', color: 'bg-yellow-500/10 text-yellow-600', icon: <Clock className="w-3 h-3" /> },
  under_review: { label: 'Đang đánh giá', color: 'bg-blue-500/10 text-blue-600', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  validated: { label: 'Đã xác thực', color: 'bg-green-500/10 text-green-600', icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected: { label: 'Từ chối', color: 'bg-red-500/10 text-red-600', icon: <XCircle className="w-3 h-3" /> },
  minted: { label: 'Đã mint', color: 'bg-amber-500/10 text-amber-600', icon: <Sparkles className="w-3 h-3" /> },
  flagged: { label: 'Cần xem xét', color: 'bg-orange-500/10 text-orange-600', icon: <Clock className="w-3 h-3" /> },
};

export default function PPLPv2SubmitWizard() {
  const [step, setStep] = useState(1);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedType, setSelectedType] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [proofText, setProofText] = useState('');
  const [actionId, setActionId] = useState('');

  const { submitAction, attachProof, fetchMyActions, isSubmitting, isAttaching, validationResult, setValidationResult } = usePPLPv2();

  const { data: myActions, refetch: refetchActions, isLoading: loadingActions } = useQuery({
    queryKey: ['pplp-v2-actions'],
    queryFn: fetchMyActions,
    enabled: showHistory,
  });

  const handleSubmitAction = async () => {
    if (!selectedType || !title.trim()) {
      toast.error('Vui lòng chọn loại hành động và nhập tiêu đề');
      return;
    }
    try {
      const result = await submitAction({
        action_type_code: selectedType,
        title: title.trim(),
        description: description.trim() || undefined,
      });
      setActionId(result.action_id);
      setStep(3);
      toast.success('Hành động đã được ghi nhận!');
    } catch {
      // error handled in hook
    }
  };

  const handleAttachProof = async () => {
    if (!proofUrl.trim() && !proofText.trim()) {
      toast.error('Vui lòng nhập link hoặc mô tả bằng chứng');
      return;
    }
    try {
      await attachProof({
        action_id: actionId,
        proof_type: proofUrl ? 'link' : 'manual_attestation',
        proof_url: proofUrl.trim() || undefined,
        extracted_text: proofText.trim() || undefined,
      });
      setStep(4);
      toast.success('Đánh giá hoàn tất!');
    } catch {
      // error handled in hook
    }
  };

  const resetWizard = () => {
    setStep(1);
    setSelectedType('');
    setTitle('');
    setDescription('');
    setProofUrl('');
    setProofText('');
    setActionId('');
    setValidationResult(null);
  };

  if (showHistory) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <History className="w-5 h-5" /> Lịch sử hành động PPLP v2
          </h3>
          <Button variant="outline" size="sm" onClick={() => setShowHistory(false)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Quay lại
          </Button>
        </div>

        {loadingActions ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : !myActions?.length ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">Chưa có hành động nào</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {myActions.map((action: any) => {
              const typeInfo = ACTION_TYPES.find(t => t.code === action.action_type_code);
              const statusInfo = STATUS_MAP[action.status] || STATUS_MAP.proof_pending;
              return (
                <Card key={action.id} className="border">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{typeInfo?.icon || '📋'}</span>
                          <span className="font-medium text-sm truncate">{action.title}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{typeInfo?.name || action.action_type_code}</span>
                          <span>•</span>
                          <span>{new Date(action.created_at).toLocaleDateString('vi-VN')}</span>
                        </div>
                      </div>
                      <Badge className={`${statusInfo.color} flex items-center gap-1 text-xs shrink-0`}>
                        {statusInfo.icon} {statusInfo.label}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            PPLP v2 — Truth Validation
          </h3>
          <p className="text-xs text-muted-foreground">Proof of Pure Love Protocol</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setShowHistory(true); refetchActions(); }}>
          <History className="w-4 h-4 mr-1" /> Lịch sử
        </Button>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className="flex items-center gap-1 flex-1">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              step >= s ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground'
            }`}>{s}</div>
            {s < 4 && <div className={`flex-1 h-0.5 ${step > s ? 'bg-amber-500' : 'bg-muted'}`} />}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground px-1">
        <span>Chọn hành động</span><span>Mô tả</span><span>Bằng chứng</span><span>Kết quả</span>
      </div>

      {/* Step 1: Choose Action Type */}
      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">🌿 Chọn loại hành động:</p>
          <div className="grid gap-2">
            {ACTION_TYPES.map(type => (
              <button
                key={type.code}
                onClick={() => { setSelectedType(type.code); setStep(2); }}
                className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20 ${
                  selectedType === type.code ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20' : 'border-border'
                }`}
              >
                <span className="text-2xl">{type.icon}</span>
                <div>
                  <p className="font-medium text-sm">{type.name}</p>
                  <p className="text-xs text-muted-foreground">{type.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Describe */}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm font-medium">🌿 Mô tả hành động:</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tiêu đề *</label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ví dụ: Thiền buổi sáng 30 phút"
                maxLength={200}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Mô tả chi tiết</label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Mô tả chi tiết hành động của bạn..."
                rows={3}
                maxLength={2000}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
              <ArrowLeft className="w-4 h-4 mr-1" /> Quay lại
            </Button>
            <Button onClick={handleSubmitAction} disabled={isSubmitting || !title.trim()} className="flex-1 bg-amber-500 hover:bg-amber-600">
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ArrowRight className="w-4 h-4 mr-1" />}
              Tiếp tục
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Attach Proof */}
      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm font-medium">🌿 Đính kèm bằng chứng:</p>
          <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10">
            <CardContent className="py-3 px-4 text-xs text-amber-800 dark:text-amber-200">
              <strong>Quy tắc bất biến:</strong> No Proof → No Score. Hãy cung cấp bằng chứng xác thực.
            </CardContent>
          </Card>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                <LinkIcon className="w-3 h-3" /> Link bằng chứng
              </label>
              <Input
                value={proofUrl}
                onChange={e => setProofUrl(e.target.value)}
                placeholder="https://... (link video, bài viết, giao dịch...)"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Hoặc mô tả bằng chứng
              </label>
              <Textarea
                value={proofText}
                onChange={e => setProofText(e.target.value)}
                placeholder="Mô tả bằng chứng nếu không có link..."
                rows={3}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
              <ArrowLeft className="w-4 h-4 mr-1" /> Quay lại
            </Button>
            <Button
              onClick={handleAttachProof}
              disabled={isAttaching || (!proofUrl.trim() && !proofText.trim())}
              className="flex-1 bg-amber-500 hover:bg-amber-600"
            >
              {isAttaching ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
              Gửi & Đánh giá
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Results */}
      {step === 4 && (
        <div className="space-y-4">
          {validationResult ? (
            <ValidationResultCard result={validationResult} />
          ) : (
            <Card>
              <CardContent className="py-6 text-center">
                <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
                <p className="font-medium">Hành động đã được gửi đánh giá!</p>
                <p className="text-sm text-muted-foreground">Kết quả sẽ hiển thị trong lịch sử.</p>
              </CardContent>
            </Card>
          )}
          <Button onClick={resetWizard} className="w-full bg-amber-500 hover:bg-amber-600">
            <Sparkles className="w-4 h-4 mr-1" /> Gửi hành động mới
          </Button>
        </div>
      )}
    </div>
  );
}

function ValidationResultCard({ result }: { result: PPLPv2ValidationResult }) {
  const isPass = result.validation_status === 'validated' || result.validation_status === 'minted';

  return (
    <div className="space-y-3">
      {/* Status */}
      <Card className={`border-0 ${isPass ? 'bg-green-50 dark:bg-green-950/20' : 'bg-red-50 dark:bg-red-950/20'}`}>
        <CardContent className="py-4 text-center">
          {isPass ? (
            <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
          ) : (
            <XCircle className="w-10 h-10 text-red-500 mx-auto mb-2" />
          )}
          <p className="font-bold text-lg">
            {isPass ? 'Xác thực thành công! ✨' : 'Chưa đạt yêu cầu'}
          </p>
        </CardContent>
      </Card>

      {/* Light Score */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" /> Light Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-center bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
            {result.final_light_score.toFixed(2)}
          </p>
        </CardContent>
      </Card>

      {/* 5 Pillars */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">5 Trụ cột Ánh sáng</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {PILLAR_INFO.map(p => {
            const score = (result.pillars as any)[p.key] || 0;
            return (
              <div key={p.key} className="flex items-center gap-2">
                <span className="text-sm w-5">{p.icon}</span>
                <span className="text-xs flex-1 min-w-0 truncate">{p.name}</span>
                <Progress value={score * 10} className="w-20 h-2" />
                <span className="text-xs font-mono w-8 text-right">{score.toFixed(1)}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Mint Info */}
      {result.mint && (
        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10">
          <CardContent className="py-3 px-4">
            <p className="text-sm font-medium mb-1">💰 FUN Money earned:</p>
            <div className="flex justify-between text-xs">
              <span>Bạn nhận (99%):</span>
              <span className="font-bold text-amber-600">{result.mint.mint_amount_user.toFixed(2)} FUN</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Platform (1%):</span>
              <span>{result.mint.mint_amount_platform.toFixed(2)} FUN</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reasoning */}
      {result.reasoning && (
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs font-medium mb-1">🤖 AI nhận xét:</p>
            <p className="text-xs text-muted-foreground">{result.reasoning}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
