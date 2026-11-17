import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClasses, Icon, Skeleton } from "@/components/ui";
import { FormsList } from "@/features/forms-list/FormsList";
import { listMyForms } from "@/features/forms/queries";

export const metadata: Metadata = { title: "My forms" };

export default function FormsPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">My forms</h1>
        <Link href="/forms/new" className={buttonClasses({ variant: "primary" })}>
          <Icon name="plus" />
          New form
        </Link>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <FormsData />
      </Suspense>
    </main>
  );
}

async function FormsData() {
  const forms = await listMyForms();
  return <FormsList initialForms={forms} />;
}

function ListSkeleton() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading forms">
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-card" />
      ))}
    </div>
  );
}
