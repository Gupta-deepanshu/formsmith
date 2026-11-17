"use client";

import { useMemo } from "react";
import type { FormDefinition } from "@/core";
import { Editor } from "./EditorShell";
import { supabasePersistence } from "./persistence";

export function OwnerEditor(props: {
  formId: string;
  slug: string;
  draft: FormDefinition;
  savedAt: string;
  publishedVersion: number | null;
  publishedForm: FormDefinition | null;
}) {
  const persistence = useMemo(() => supabasePersistence(props.formId), [props.formId]);
  return (
    <Editor
      init={{ form: props.draft, savedAt: props.savedAt, publishedForm: props.publishedForm }}
      persistence={persistence}
      mode={{
        kind: "owner",
        formId: props.formId,
        slug: props.slug,
        publishedVersion: props.publishedVersion,
      }}
    />
  );
}
