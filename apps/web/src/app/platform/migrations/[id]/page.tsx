import { MigrationDetail } from "@/platform/migration-console";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <MigrationDetail id={(await params).id} />;
}
