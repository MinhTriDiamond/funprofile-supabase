import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trophy, Users, Activity } from 'lucide-react';
import { useAdminQuestDefinitions } from '@/hooks/useAdminQuests';
import QuestDefinitionsTable from './quests/QuestDefinitionsTable';
import QuestTopUsersTable from './quests/QuestTopUsersTable';
import QuestActivityTable from './quests/QuestActivityTable';

export default function QuestAdminTab() {
  const { data = [] } = useAdminQuestDefinitions();
  const total = data.length;
  const active = data.filter(q => q.is_active).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Tổng quest</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{total}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Đang active</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold text-emerald-500">{active}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Tắt</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold text-muted-foreground">{total - active}</CardContent>
        </Card>
      </div>

      <Tabs defaultValue="definitions">
        <TabsList>
          <TabsTrigger value="definitions" className="gap-2"><Trophy className="w-4 h-4" /> Định nghĩa</TabsTrigger>
          <TabsTrigger value="top" className="gap-2"><Users className="w-4 h-4" /> Top users</TabsTrigger>
          <TabsTrigger value="activity" className="gap-2"><Activity className="w-4 h-4" /> Hoạt động</TabsTrigger>
        </TabsList>
        <TabsContent value="definitions" className="mt-4"><QuestDefinitionsTable /></TabsContent>
        <TabsContent value="top" className="mt-4"><QuestTopUsersTable /></TabsContent>
        <TabsContent value="activity" className="mt-4"><QuestActivityTable /></TabsContent>
      </Tabs>
    </div>
  );
}
