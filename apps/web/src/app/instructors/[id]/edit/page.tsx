"use client";

import { useParams } from "next/navigation";

import { RegistryForm } from "@/registrations/registry-form";
import { instructorConfig } from "@/registrations/registry-config";

export default function EditInstructorPage() {
  const { id } = useParams<{ id: string }>();
  return <RegistryForm config={instructorConfig} id={id} />;
}
