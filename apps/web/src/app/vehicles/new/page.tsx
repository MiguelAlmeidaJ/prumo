"use client";

import { RegistryForm } from "@/registrations/registry-form";
import { vehicleConfig } from "@/registrations/registry-config";

export default function NewVehiclePage() {
  return <RegistryForm config={vehicleConfig} />;
}
