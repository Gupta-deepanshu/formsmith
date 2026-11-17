"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, buttonClasses, Card, Dialog, EmptyState, Icon, IconButton, useToast } from "@/components/ui";
import type { FormSummary } from "@/features/forms/queries";
import { deleteForm, duplicateForm } from "@/features/forms/mutations";
import { plural, timeAgo } from "@/lib/format";
import { SandboxImport } from "./SandboxImport";

/**
 * Owner's form list. Delete and duplicate are optimistic: the list updates immediately
 * and rolls back with a toast if the request fails.
 */
export function FormsList({ initialForms }: { initialForms: FormSummary[] }) {
  const [forms, setForms] = useState(initialForms);
  const [confirming, setConfirming] = useState<FormSummary | null>(null);
  const toast = useToast();
  const router = useRouter();

  const remove = async (form: FormSummary) => {
    setConfirming(null);
    const before = forms;
    setForms((xs) => xs.filter((f) => f.id !== form.id)); // optimistic
    try {
      await deleteForm(form.id);
      toast.show({ message: `Deleted "${form.title}".`, tone: "success" });
    } catch (e) {
      setForms(before); // rollback
      toast.show({ message: (e as Error).message, tone: "danger" });
    }
  };

  const duplicate = async (form: FormSummary) => {
    const tempId = `temp-${form.id}`;
    const placeholder: FormSummary = { ...form, id: tempId, title: `${form.title} (copy)`, status: "draft", hasUnpublishedChanges: false, publishedVersion: null, responseCount: 0, updatedAt: new Date().toISOString() };
    setForms((xs) => [placeholder, ...xs]); // optimistic
    try {
      const created = await duplicateForm(form.id);
      setForms((xs) => xs.map((f) => (f.id === tempId ? { ...placeholder, id: created.id, slug: created.slug } : f)));
      toast.show({ message: "Form duplicated.", tone: "success" });
    } catch (e) {
      setForms((xs) => xs.filter((f) => f.id !== tempId)); // rollback
      toast.show({ message: (e as Error).message, tone: "danger" });
    }
  };

  return (
    <>
      <SandboxImport onImported={(id) => router.push(`/forms/${id}/edit`)} />
      {forms.length === 0 ? (
        <EmptyState
          icon={<Icon name="form" className="size-8" />}
          title="No forms yet"
          description="Describe the form you need and the AI will draft it, or start from a template."
          action={
            <Link href="/forms/new" className={buttonClasses({ variant: "primary" })}>
              Create your first form
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3" aria-label="Forms">
          {forms.map((f) => (
            <li key={f.id}>
              <FormRow form={f} pending={f.id.startsWith("temp-")} onDelete={() => setConfirming(f)} onDuplicate={() => duplicate(f)} />
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={!!confirming}
        onClose={() => setConfirming(null)}
        title="Delete this form?"
        description={confirming ? `"${confirming.title}" and all ${plural(confirming.responseCount, "response")} will be permanently deleted.` : undefined}
        size="sm"
        initialFocus="[data-autofocus]"
        footer={
          <>
            <Button onClick={() => setConfirming(null)} data-autofocus>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => confirming && remove(confirming)}>
              Delete form
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">This can&apos;t be undone.</p>
      </Dialog>
    </>
  );
}

function FormRow({ form, pending, onDelete, onDuplicate }: { form: FormSummary; pending: boolean; onDelete: () => void; onDuplicate: () => void }) {
  return (
    <Card padded={false} className={pending ? "opacity-60" : undefined} aria-busy={pending || undefined}>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/forms/${form.id}/edit`} className="truncate font-medium text-fg hover:underline" aria-disabled={pending}>
              {form.title}
            </Link>
            {form.status === "published" ? <Badge tone="success">Published v{form.publishedVersion}</Badge> : <Badge>Draft</Badge>}
            {form.hasUnpublishedChanges ? <Badge tone="warning">Unpublished changes</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            {plural(form.responseCount, "response")} · Edited {timeAgo(form.updatedAt)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link href={`/forms/${form.id}/edit`} className={buttonClasses({ size: "sm" })}>
            Edit
          </Link>
          <Link href={`/forms/${form.id}/responses`} className={buttonClasses({ size: "sm", variant: "ghost" })}>
            Responses
          </Link>
          {form.status === "published" ? (
            <a href={`/f/${form.slug}`} target="_blank" rel="noreferrer" className={buttonClasses({ size: "sm", variant: "ghost" })}>
              Open
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
          <IconButton size="sm" variant="ghost" label={`Duplicate "${form.title}"`} icon={<Icon name="copy" />} onClick={onDuplicate} disabled={pending} />
          <IconButton size="sm" variant="ghost" label={`Delete "${form.title}"`} icon={<Icon name="trash" />} onClick={onDelete} disabled={pending} />
        </div>
      </div>
    </Card>
  );
}
