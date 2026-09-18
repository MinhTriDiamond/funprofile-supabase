import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Award, Lock, Eye, EyeOff, BadgeCheck, Snowflake, XCircle } from 'lucide-react';
import { DisputeDialog } from './DisputeDialog';
import { SBTEvidenceDialog } from './SBTEvidenceDialog';
import { Button } from '@/components/ui/button';
import { FileSearch } from 'lucide-react';

const CAT_COLOR: Record<string, string> = {
  identity: 'from-emerald-400 to-teal-500',
  trust: 'from-sky-400 to-blue-500',
  contribution: 'from-violet-400 to-purple-500',
  credential: 'from-amber-400 to-orange-500',
  milestone: 'from-rose-400 to-pink-500',
  legacy: 'from-yellow-400 to-amber-600',
};

const STATUS_ICON: Record<string, any> = {
  active: BadgeCheck, frozen: Snowflake, revoked: XCircle, archived: Lock,
};

export function SBTCard({ sbt }: { sbt: any }) {
  const grad = CAT_COLOR[sbt.sbt_category] ?? 'from-slate-400 to-slate-500';
  const StatusIcon = STATUS_ICON[sbt.status] ?? BadgeCheck;
  const PrivacyIcon = sbt.privacy_level === 'private' ? EyeOff : sbt.privacy_level === 'permissioned' ? Lock : Eye;

  return (
    <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow">
      <div className={`h-16 bg-gradient-to-br ${grad} flex items-center justify-center relative`}>
        <Award className="w-8 h-8 text-white drop-shadow" />
        <Badge className="absolute top-2 right-2 bg-white/20 text-white border-0 text-[10px] gap-1">
          <PrivacyIcon className="w-2.5 h-2.5" />
          {sbt.privacy_level}
        </Badge>
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{sbt.sbt_type.replace(/_/g, ' ')}</p>
            <p className="text-[10px] text-muted-foreground capitalize">{sbt.sbt_category}</p>
          </div>
          <StatusIcon className={`w-4 h-4 ${sbt.status === 'active' ? 'text-emerald-500' : 'text-muted-foreground'}`} />
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>w {Number(sbt.trust_weight).toFixed(2)}</span>
          <span>{new Date(sbt.issued_at).toLocaleDateString()}</span>
        </div>
        <div className="flex gap-1">
          <SBTEvidenceDialog sbt={sbt}>
            <Button size="sm" variant="ghost" className="text-[10px] h-6 px-2 gap-1 flex-1">
              <FileSearch className="w-3 h-3" />Evidence
            </Button>
          </SBTEvidenceDialog>
          {(sbt.status === 'revoked' || sbt.status === 'frozen') && (
            <DisputeDialog
              dispute_type={sbt.status === 'revoked' ? 'sbt_revoke' : 'sbt_freeze'}
              target_ref={sbt.token_id}
            />
          )}
        </div>
      </div>
    </Card>
  );
}
