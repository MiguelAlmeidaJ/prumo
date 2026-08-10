"use client";

import { RegistryForm } from "@/registrations/registry-form";
import { instructorConfig } from "@/registrations/registry-config";

export default function NewInstructorPage() {
  return <RegistryForm config={instructorConfig} />;
}
