import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { loadForm, type FormDefinition } from "@/core";
import { OwnerEditor } from "@/features/editor/OwnerEditor";
import { getFormForEdit } from "@/features/forms/queries";

export const metadata: Metadata = { title: "Edit form" };

export default function EditPage({ params }: PageProps<"/forms/[id]/edit">) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <EditorData params={params} />
    </Suspense>
  );
}

async function EditorData({ params }: { params: PageProps<"/forms/[id]/edit">["params"] }) {
  const { id } = await params;
  const row = await getFormForEdit(id);
  if (!row) notFound();

  // Drafts may contain in-progress errors (they only block publish), so fall back to the
  // raw stored shape when full validation fails but the structure is usable.
  const loaded = loadForm(row.draftSchema);
  const draft = loaded.ok ? loaded.form : (row.draftSchema as unknown as FormDefinition);
  const published = row.publishedSchema ? loadForm(row.publishedSchema) : null;

  return (
    <OwnerEditor
      formId={row.id}
      slug={row.slug}
      draft={draft}
      savedAt={row.updatedAt}
      publishedVersion={row.publishedVersion}
      publishedForm={published?.ok ? published.form : null}
    />
  );
}

function EditorSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-[1600px] gap-6 p-4 lg:grid-cols-[300px_1fr_340px]" aria-busy="true" aria-label="Loading editor">
      <Skeleton className="h-96" />
      <Skeleton className="h-[32rem]" />
      <Skeleton className="h-96" />
    </div>
  );
}
