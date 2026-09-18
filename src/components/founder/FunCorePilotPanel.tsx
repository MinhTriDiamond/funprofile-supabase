import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link2 } from "lucide-react";
import { useFunCorePilotFlag } from "@/hooks/useFunCorePilotFlag";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import FunCoreComparePanel from "@/components/admin/FunCoreComparePanel";

export default function FunCorePilotPanel() {
  const { data: flag, isLoading } = useFunCorePilotFlag();
  const { userId: currentUserId } = useCurrentUser();
  const defaultId = currentUserId ?? "";
  const [userId, setUserId] = useState(defaultId);
  const [activeId, setActiveId] = useState(defaultId);

  // Đồng bộ khi userId thật được nạp sau lần render đầu
  useEffect(() => {
    if (currentUserId && !activeId) {
      setUserId(currentUserId);
      setActiveId(currentUserId);
    }
  }, [currentUserId, activeId]);

  // Ẩn hoàn toàn khi flag chưa load hoặc OFF
  if (isLoading) return null;
  if (!flag?.enabled) return null;

  return (
    <Card className="lg:col-span-2 border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          <span>FUN Core Pilot · Đối soát read-only</span>
          <Badge variant="outline" className="ml-2 text-[10px]">Phase 2.9</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col md:flex-row gap-2">
          <Input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="userId (UUID)"
            className="font-mono text-sm"
          />
          <Button size="sm" variant="secondary" onClick={() => setActiveId(userId.trim())} disabled={!userId.trim()}>
            So sánh
          </Button>
          {currentUserId && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setUserId(currentUserId); setActiveId(currentUserId); }}
            >
              Dùng ID của tôi
            </Button>
          )}
        </div>
        {activeId ? (
          <FunCoreComparePanel userId={activeId} />
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">Nhập userId rồi bấm "So sánh".</p>
        )}
      </CardContent>
    </Card>
  );
}
