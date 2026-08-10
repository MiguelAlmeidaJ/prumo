"use client";

import { RegistryList } from "@/registrations/registry-list";
import { studentConfig } from "@/registrations/registry-config";

export default function StudentsPage() {
  return <RegistryList config={studentConfig} />;
}
