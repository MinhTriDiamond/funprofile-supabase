import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, Users, CheckCircle2, Globe } from 'lucide-react';
import { useMyOrgs } from '@/hooks/useEntityProfiles';
import { Skeleton } from '@/components/ui/skeleton';
import { OrgCreateDialog } from './OrgCreateDialog';

const TYPE_LABEL: Record<string, string> = {
  general: 'Chung', dao: 'DAO', company: 'Doanh nghiệp',
  nonprofit: 'Phi lợi nhuận', validator_pool: 'Validator Pool', partner: 'Đối tác',
};

export function OrgList() {
  const { data: orgs = [], isLoading } = useMyOrgs();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" />Tổ chức của tôi</h3>
          <p className="text-xs text-muted-foreground">Org bạn đang làm member</p>
        </div>
        <OrgCreateDialog />
      </div>
      {isLoading ? (
        <Skeleton className="h-24" />
      ) : orgs.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          Chưa thuộc tổ chức nào. Tạo tổ chức mới để bắt đầu.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {orgs.map((m: any) => {
            const o = m.org?.org_profile;
            if (!o) return null;
            return (
              <Card key={m.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{o.display_name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono truncate">{m.org.did_id}</p>
                    </div>
                    {o.domain_verified && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">{TYPE_LABEL[o.org_type] ?? o.org_type}</Badge>
                    <Badge variant="outline" className="text-[10px] gap-1"><Users className="w-2.5 h-2.5" />{o.member_count}</Badge>
                    <Badge variant="outline" className="text-[10px]">{m.role}</Badge>
                  </div>
                  {o.website && (
                    <a href={o.website} target="_blank" rel="noopener" className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                      <Globe className="w-3 h-3" />{o.website.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
