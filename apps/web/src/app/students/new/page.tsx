"use client";

import { RegistryForm } from "@/registrations/registry-form";
import { studentConfig } from "@/registrations/registry-config";

export default function NewStudentPage() {
  return <RegistryForm config={studentConfig} />;
}
