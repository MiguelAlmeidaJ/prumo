import { useAuth } from "@/auth/auth-context";
import { AppButton, AppCard, AppHeader, AppListItem, AppScreen, AppToast } from "@/design/components";

export default function SelectTenant() {
  const { session, selectTenant, cancelTenantSelection, error, isSubmitting } = useAuth();
  return (
    <AppScreen>
      <AppHeader title="Escolha a autoescola" subtitle="O acesso será validado pela sua associação." />
      {error ? <AppToast message={error} tone="danger" /> : null}
      {session?.memberships.map((membership) => (
        <AppCard key={membership.id}>
          <AppListItem title={membership.tenant.name} subtitle={membership.role} onPress={() => void selectTenant(membership.tenant.id)} />
        </AppCard>
      ))}
      <AppButton title="Cancelar" variant="secondary" disabled={isSubmitting} onPress={cancelTenantSelection} />
    </AppScreen>
  );
}
