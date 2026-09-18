import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, ExternalLink, Activity } from 'lucide-react';
import { useMyAIAgents } from '@/hooks/useEntityProfiles';
import { Skeleton } from '@/components/ui/skeleton';
import { AIAgentRegisterDialog } from './AIAgentRegisterDialog';

const AUTONOMY_COLOR: Record<string, string> = {
  supervised: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  semi_autonomous: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  autonomous: 'bg-rose-500/10 text-rose-600 border-rose-500/30',
};

export function AIAgentList() {
  const { data: agents = [], isLoading } = useMyAIAgents();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2"><Bot className="w-4 h-4 text-primary" />AI Agents</h3>
          <p className="text-xs text-muted-foreground">Agents bạn đang vận hành (operator)</p>
        </div>
        <AIAgentRegisterDialog />
      </div>
      {isLoading ? <Skeleton className="h-24" /> : agents.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          Chưa có AI agent nào. Yêu cầu DID L2+ để đăng ký.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {agents.map((a: any) => (
            <Card key={a.did_id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{a.display_name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">{a.did_id}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{a.status}</Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {a.model_name && <Badge variant="secondary" className="text-[10px]">{a.model_name}</Badge>}
                  <Badge className={`text-[10px] ${AUTONOMY_COLOR[a.autonomy_level] ?? ''}`} variant="outline">{a.autonomy_level}</Badge>
                  <Badge variant="outline" className="text-[10px] gap-1"><Activity className="w-2.5 h-2.5" />{a.total_actions} actions</Badge>
                </div>
                {a.audit_log_url && (
                  <a href={a.audit_log_url} target="_blank" rel="noopener" className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                    <ExternalLink className="w-3 h-3" />Audit log
                  </a>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
