import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Loader2, ThumbsUp, Flag, MessageSquare, Star, CheckCircle2 } from 'lucide-react';
import { usePPLPv2CommunityReview } from '@/hooks/usePPLPv2CommunityReview';

const REVIEW_TYPES = [
  { code: 'endorse', icon: <ThumbsUp className="w-4 h-4" />, label: 'Xác nhận', desc: 'Tôi xác nhận hành động này là thật' },
  { code: 'confirm_attended', icon: <CheckCircle2 className="w-4 h-4" />, label: 'Xác nhận tham gia', desc: 'Tôi đã chứng kiến/tham gia' },
  { code: 'attest_authenticity', icon: <Star className="w-4 h-4" />, label: 'Chứng thực', desc: 'Tôi chứng thực bằng chứng là xác thực' },
  { code: 'flag_suspicious', icon: <Flag className="w-4 h-4" />, label: 'Báo cáo', desc: 'Hành động này có dấu hiệu đáng ngờ' },
];

const PILLAR_INFO = [
  { key: 'serving_life', icon: '☀️', name: 'Phụng sự sự sống' },
  { key: 'transparent_truth', icon: '🔍', name: 'Chân thật minh bạch' },
  { key: 'healing_love', icon: '💚', name: 'Chữa lành & yêu thương' },
  { key: 'long_term_value', icon: '🌱', name: 'Giá trị bền vững' },
  { key: 'unity_over_separation', icon: '🤝', name: 'Hợp Nhất' },
];

interface CommunityReviewPanelProps {
  actionId: string;
  actionTitle?: string;
  onReviewSubmitted?: () => void;
}

export default function CommunityReviewPanel({ actionId, actionTitle, onReviewSubmitted }: CommunityReviewPanelProps) {
  const { submitReview, getReviews, isLoading } = usePPLPv2CommunityReview();
  const [selectedType, setSelectedType] = useState('');
  const [comment, setComment] = useState('');
  const [pillarScores, setPillarScores] = useState<Record<string, number>>({
    serving_life: 5, transparent_truth: 5, healing_love: 5,
    long_term_value: 5, unity_over_separation: 5,
  });
  const [showForm, setShowForm] = useState(false);

  const { data: reviews, refetch, isLoading: loadingReviews } = useQuery({
    queryKey: ['pplp-v2-reviews', actionId],
    queryFn: () => getReviews(actionId),
  });

  const handleSubmit = async () => {
    if (!selectedType) return;
    try {
      await submitReview({
        action_id: actionId,
        review_type: selectedType,
        comment: comment.trim() || undefined,
        pillar_serving_life: pillarScores.serving_life,
        pillar_transparent_truth: pillarScores.transparent_truth,
        pillar_healing_love: pillarScores.healing_love,
        pillar_long_term_value: pillarScores.long_term_value,
        pillar_unity_over_separation: pillarScores.unity_over_separation,
      });
      setShowForm(false);
      setSelectedType('');
      setComment('');
      refetch();
      onReviewSubmitted?.();
    } catch (error) {
      console.error("Failed to submit review:", error);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <MessageSquare className="w-4 h-4" /> Community Review
        </h4>
        <Badge variant="outline" className="text-xs">
          {reviews?.length || 0} reviews
        </Badge>
      </div>

      {actionTitle && (
        <p className="text-xs text-muted-foreground truncate">Hành động: {actionTitle}</p>
      )}

      {loadingReviews ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin" /></div>
      ) : reviews?.length > 0 ? (
        <div className="space-y-2">
          {reviews.map((r: any) => (
            <Card key={r.id} className="border">
              <CardContent className="py-2 px-3">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px]">
                    {REVIEW_TYPES.find(t => t.code === r.review_type)?.label || r.review_type}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString('vi-VN')}
                  </span>
                </div>
                {r.comment && <p className="text-xs text-muted-foreground mt-1">{r.comment}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-2">Chưa có review nào</p>
      )}

      {!showForm ? (
        <Button size="sm" variant="outline" onClick={() => setShowForm(true)} className="w-full text-xs">
          <ThumbsUp className="w-3 h-3 mr-1" /> Gửi review
        </Button>
      ) : (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <p className="text-xs font-medium">Chọn loại review:</p>
            <div className="grid grid-cols-2 gap-2">
              {REVIEW_TYPES.map(type => (
                <button
                  key={type.code}
                  onClick={() => setSelectedType(type.code)}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-left text-xs transition-all ${
                    selectedType === type.code
                      ? type.code === 'flag_suspicious'
                        ? 'border-red-400 bg-red-50 dark:bg-red-950/20'
                        : 'border-green-400 bg-green-50 dark:bg-green-950/20'
                      : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  {type.icon}
                  <div>
                    <p className="font-medium">{type.label}</p>
                    <p className="text-[10px] text-muted-foreground">{type.desc}</p>
                  </div>
                </button>
              ))}
            </div>

            {selectedType && selectedType !== 'flag_suspicious' && (
              <>
                <p className="text-xs font-medium mt-2">Đánh giá theo 5 trụ cột (PRD §7):</p>
                <div className="space-y-2">
                  {PILLAR_INFO.map(p => (
                    <div key={p.key} className="flex items-center gap-2">
                      <span className="text-sm w-5">{p.icon}</span>
                      <span className="text-xs flex-1 min-w-0">{p.name}</span>
                      <Slider
                        value={[pillarScores[p.key]]}
                        onValueChange={([v]) => setPillarScores(prev => ({ ...prev, [p.key]: v }))}
                        min={0} max={10} step={1}
                        className="w-24"
                      />
                      <span className="text-xs font-mono w-6 text-right">{pillarScores[p.key]}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <Textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Nhận xét (tùy chọn)..."
              rows={2}
              className="text-xs"
            />

            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)} className="flex-1 text-xs">
                Hủy
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={isLoading || !selectedType}
                className="flex-1 text-xs bg-amber-500 hover:bg-amber-600"
              >
                {isLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Gửi review
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
