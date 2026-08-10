"use client";

import { RegistryList } from "@/registrations/registry-list";
import { vehicleConfig } from "@/registrations/registry-config";

export default function VehiclesPage() {
  return <RegistryList config={vehicleConfig} />;
}
