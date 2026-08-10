"use client";

import { RegistryList } from "@/registrations/registry-list";
import { instructorConfig } from "@/registrations/registry-config";

export default function InstructorsPage() {
  return <RegistryList config={instructorConfig} />;
}
