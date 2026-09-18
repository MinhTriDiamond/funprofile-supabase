import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OrgList } from './OrgList';
import { ValidatorList } from './ValidatorList';
import { AIAgentList } from './AIAgentList';

export function EntityRegistryHub() {
  return (
    <Tabs defaultValue="orgs" className="w-full">
      <TabsList className="grid grid-cols-3 w-full">
        <TabsTrigger value="orgs" className="text-xs">Tổ chức</TabsTrigger>
        <TabsTrigger value="validators" className="text-xs">Validators</TabsTrigger>
        <TabsTrigger value="ai-agents" className="text-xs">AI Agents</TabsTrigger>
      </TabsList>
      <TabsContent value="orgs" className="mt-4"><OrgList /></TabsContent>
      <TabsContent value="validators" className="mt-4"><ValidatorList /></TabsContent>
      <TabsContent value="ai-agents" className="mt-4"><AIAgentList /></TabsContent>
    </Tabs>
  );
}
