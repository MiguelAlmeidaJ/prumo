"use client";

import { useParams } from "next/navigation";

import { RegistryForm } from "@/registrations/registry-form";
import { vehicleConfig } from "@/registrations/registry-config";

export default function EditVehiclePage() {
  const { id } = useParams<{ id: string }>();
  return <RegistryForm config={vehicleConfig} id={id} />;
}
