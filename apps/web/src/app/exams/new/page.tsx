import { Suspense } from "react";
import { ExamForm } from "@/processes/process-ui";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ExamForm />
    </Suspense>
  );
}
