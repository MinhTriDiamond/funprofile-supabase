import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, Gift, Tag, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";
import { usePersistedTab } from "@/hooks/usePersistedTab";
import FinancialTab from "./FinancialTab";
import { DonationHistoryAdminTab } from "./DonationHistoryAdminTab";
import ExternalWalletLabelsTab from "./ExternalWalletLabelsTab";
import { RecoverDonationsTab } from "./RecoverDonationsTab";

const FinanceDonationsTab = () => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = usePersistedTab('admin-finance-tab', 'financial', ['financial', 'donations', 'wallet-labels', 'recover'] as const);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
      <TabsList className="grid w-full grid-cols-4 h-auto">
        <TabsTrigger value="financial" className="gap-2 py-2">
          <DollarSign className="w-4 h-4" />
          <span className="hidden sm:inline">{t('adminFinancial')}</span>
        </TabsTrigger>
        <TabsTrigger value="donations" className="gap-2 py-2">
          <Gift className="w-4 h-4" />
          <span className="hidden sm:inline">{t('adminDonations')}</span>
        </TabsTrigger>
        <TabsTrigger value="wallet-labels" className="gap-2 py-2">
          <Tag className="w-4 h-4" />
          <span className="hidden sm:inline">{t('adminWalletLabels')}</span>
        </TabsTrigger>
        <TabsTrigger value="recover" className="gap-2 py-2">
          <ShieldCheck className="w-4 h-4" />
          <span className="hidden sm:inline">Khôi phục</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="financial">
        <FinancialTab />
      </TabsContent>
      <TabsContent value="donations">
        <DonationHistoryAdminTab />
      </TabsContent>
      <TabsContent value="wallet-labels">
        <ExternalWalletLabelsTab />
      </TabsContent>
      <TabsContent value="recover">
        <RecoverDonationsTab />
      </TabsContent>
    </Tabs>
  );
};

export default FinanceDonationsTab;
