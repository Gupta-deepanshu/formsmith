import type { Field, FormDefinition, FormSettings, Step } from "../schema/definition";

/**
 * Normalised form: id-keyed maps plus order arrays.
 *
 * Patch ops apply to this shape with structural sharing. An `updateField` replaces
 * exactly one object in `fields` and leaves every other reference identical, so
 * selector-based UIs (the Zustand editor) re-render only what changed.
 */
export type StepNode = Omit<Step, "fields"> & { fieldIds: string[] };

export type NormalizedForm = {
  meta: {
    schemaVersion: FormDefinition["schemaVersion"];
    title: string;
    description?: string;
    settings: FormSettings;
  };
  stepOrder: string[];
  steps: Record<string, StepNode>;
  fields: Record<string, Field>;
};

export function normalize(form: FormDefinition): NormalizedForm {
  const steps: Record<string, StepNode> = {};
  const fields: Record<string, Field> = {};
  const stepOrder: string[] = [];
  for (const step of form.steps) {
    const { fields: stepFields, ...rest } = step;
    steps[step.id] = { ...rest, fieldIds: stepFields.map((f) => f.id) };
    stepOrder.push(step.id);
    for (const f of stepFields) fields[f.id] = f;
  }
  const meta: NormalizedForm["meta"] = {
    schemaVersion: form.schemaVersion,
    title: form.title,
    settings: form.settings,
  };
  if (form.description !== undefined) meta.description = form.description;
  return { meta, stepOrder, steps, fields };
}

export function denormalize(nf: NormalizedForm): FormDefinition {
  const form: FormDefinition = {
    schemaVersion: nf.meta.schemaVersion,
    title: nf.meta.title,
    steps: nf.stepOrder.map((id) => {
      const { fieldIds, ...rest } = nf.steps[id]!;
      return { ...rest, fields: fieldIds.map((fid) => nf.fields[fid]!) };
    }),
    settings: nf.meta.settings,
  };
  if (nf.meta.description !== undefined) form.description = nf.meta.description;
  return form;
}

/** Which step holds a field, and where. O(steps). */
export function locateField(
  nf: NormalizedForm,
  fieldId: string,
): { stepId: string; index: number } | null {
  for (const stepId of nf.stepOrder) {
    const index = nf.steps[stepId]!.fieldIds.indexOf(fieldId);
    if (index !== -1) return { stepId, index };
  }
  return null;
}
