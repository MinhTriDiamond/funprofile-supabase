/**
 * EcosystemTab — tab "Ecosystem" trong Identity Dashboard.
 * Compose: EcosystemDashboardCard (Phase 6D) + EcosystemIdentityCard + LinkedPlatformsList + FederationSyncStatus.
 */
import { useEcosystemIdentity } from '@/hooks/useEcosystemIdentity';
import { EcosystemDashboardCard } from './EcosystemDashboardCard';
import { EcosystemIdentityCard } from './EcosystemIdentityCard';
import { LinkedPlatformsList } from './LinkedPlatformsList';
import { FederationSyncStatus } from './FederationSyncStatus';

export function EcosystemTab() {
  const result = useEcosystemIdentity();

  return (
    <div className="space-y-4">
      <EcosystemDashboardCard />

      <EcosystemIdentityCard
        data={result.data}
        isLoading={result.isLoading}
        notReady={result.notReady}
        notFound={result.notFound}
        isError={result.isError}
        errorMessage={result.errorMessage}
      />

      {result.data && (
        <div className="grid gap-4 md:grid-cols-2">
          <FederationSyncStatus data={result.data} />
          <LinkedPlatformsList platforms={result.data.linked_platforms ?? []} />
        </div>
      )}
      <p className="text-[11px] text-muted-foreground text-center">
        Mọi chỉ số được tính tại FUN Core. FUN Profile chỉ hiển thị, không tự tính điểm.
      </p>
    </div>
  );
}

