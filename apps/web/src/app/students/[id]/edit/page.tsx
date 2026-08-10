"use client";

import { useParams } from "next/navigation";

import { RegistryForm } from "@/registrations/registry-form";
import { studentConfig } from "@/registrations/registry-config";

export default function EditStudentPage() {
  const { id } = useParams<{ id: string }>();
  return <RegistryForm config={studentConfig} id={id} />;
}
