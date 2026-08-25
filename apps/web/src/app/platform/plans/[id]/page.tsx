import { PlanEditor } from "@/platform/plan-commercial-console";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PlanEditor planId={id} />;
}
