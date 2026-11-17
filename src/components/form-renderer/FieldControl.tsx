"use client";

import { memo } from "react";
import { useController, type Control } from "react-hook-form";
import {
  Checkbox,
  Field as FieldShell,
  Fieldset,
  Input,
  RadioGroup,
  Select,
  Textarea,
} from "@/components/ui";
import type { Answers, Field } from "@/core";
import { cn } from "@/lib/cn";

/**
 * One question. Uses useController, so typing here re-renders this field only, not the
 * whole form. Native attributes (required, maxLength, min/max, inputMode, autocomplete)
 * are set for mobile keyboards and assistive tech; the <form> is noValidate so our shared
 * Zod validator owns the messages.
 */
export type FieldControlProps = {
  field: Field;
  control: Control<Answers>;
  highlighted?: boolean;
  disabled?: boolean;
};

export const fieldDomId = (fieldId: string) => `q-${fieldId}`;

const AUTOCOMPLETE: Partial<Record<Field["type"], string>> = {
  email: "email",
  phone: "tel",
  url: "url",
};

export const FieldControl = memo(function FieldControl({
  field,
  control,
  highlighted,
  disabled,
}: FieldControlProps) {
  const { field: rhf, fieldState } = useController({ name: field.id, control });
  const error = fieldState.error?.message ?? null;
  const id = fieldDomId(field.id);
  const wrap = cn(
    "scroll-mt-24 rounded-card transition-shadow duration-200",
    highlighted && "animate-highlight",
  );
  const common = { name: rhf.name, onBlur: rhf.onBlur, ref: rhf.ref, disabled };
  const str =
    typeof rhf.value === "string" || typeof rhf.value === "number" ? String(rhf.value) : "";

  switch (field.type) {
    case "shortText":
    case "email":
    case "phone":
    case "url":
    case "number": {
      const type =
        field.type === "email"
          ? "email"
          : field.type === "phone"
            ? "tel"
            : field.type === "url"
              ? "url"
              : "text";
      const inputMode =
        field.type === "number"
          ? field.integer
            ? "numeric"
            : "decimal"
          : field.type === "email"
            ? "email"
            : field.type === "phone"
              ? "tel"
              : field.type === "url"
                ? "url"
                : undefined;
      const lengthAttrs =
        field.type === "shortText"
          ? { minLength: field.minLength, maxLength: field.maxLength }
          : {};
      return (
        <div className={wrap} data-field-id={field.id}>
          <FieldShell
            id={id}
            label={field.label}
            help={field.helpText}
            error={error}
            required={field.required}
          >
            <Input
              {...common}
              type={type}
              inputMode={inputMode}
              autoComplete={
                AUTOCOMPLETE[field.type] ?? (field.id.includes("name") ? "name" : "off")
              }
              placeholder={field.placeholder}
              value={str}
              onChange={(e) => rhf.onChange(e.target.value)}
              {...lengthAttrs}
            />
          </FieldShell>
        </div>
      );
    }
    case "longText":
      return (
        <div className={wrap} data-field-id={field.id}>
          <FieldShell
            id={id}
            label={field.label}
            help={field.helpText}
            error={error}
            required={field.required}
          >
            <Textarea
              {...common}
              placeholder={field.placeholder}
              value={str}
              onChange={(e) => rhf.onChange(e.target.value)}
              minLength={field.minLength}
              maxLength={field.maxLength}
            />
          </FieldShell>
          {field.maxLength ? (
            <p className="mt-1 text-right text-xs text-fg-muted" aria-live="off">
              {str.length} / {field.maxLength}
            </p>
          ) : null}
        </div>
      );
    case "date":
      return (
        <div className={wrap} data-field-id={field.id}>
          <FieldShell
            id={id}
            label={field.label}
            help={field.helpText}
            error={error}
            required={field.required}
          >
            <Input
              {...common}
              type="date"
              min={field.minDate}
              max={field.maxDate}
              value={str}
              onChange={(e) => rhf.onChange(e.target.value)}
              className="max-w-56"
            />
          </FieldShell>
        </div>
      );
    case "dropdown":
      return (
        <div className={wrap} data-field-id={field.id}>
          <FieldShell
            id={id}
            label={field.label}
            help={field.helpText}
            error={error}
            required={field.required}
          >
            <Select
              {...common}
              value={str}
              onChange={(e) => rhf.onChange(e.target.value)}
              placeholder={field.placeholder ?? "Choose…"}
              options={field.options.map((o) => ({ value: o.id, label: o.label }))}
            />
          </FieldShell>
        </div>
      );
    case "singleChoice":
      return (
        <div className={wrap} data-field-id={field.id}>
          <Fieldset
            id={id}
            legend={field.label}
            help={field.helpText}
            error={error}
            required={field.required}
          >
            <RadioGroup
              name={field.id}
              ref={rhf.ref}
              options={field.options.map((o) => ({ value: o.id, label: o.label }))}
              value={str}
              onChange={rhf.onChange}
              onBlur={rhf.onBlur}
              disabled={disabled}
              invalid={!!error}
            />
          </Fieldset>
        </div>
      );
    case "multipleChoice": {
      const selected = Array.isArray(rhf.value) ? rhf.value : [];
      const hint = field.maxSelected
        ? `Choose up to ${field.maxSelected}.`
        : field.minSelected
          ? `Choose at least ${field.minSelected}.`
          : "Choose all that apply.";
      return (
        <div className={wrap} data-field-id={field.id}>
          <Fieldset
            id={id}
            legend={field.label}
            help={field.helpText ? `${field.helpText} ${hint}` : hint}
            error={error}
            required={field.required}
          >
            <div className="flex flex-col gap-2">
              {field.options.map((o, i) => (
                <Checkbox
                  key={o.id}
                  id={`${id}-${o.id}`}
                  ref={i === 0 ? rhf.ref : undefined}
                  label={o.label}
                  checked={selected.includes(o.id)}
                  disabled={disabled}
                  onBlur={rhf.onBlur}
                  onChange={(e) =>
                    rhf.onChange(
                      e.target.checked ? [...selected, o.id] : selected.filter((x) => x !== o.id),
                    )
                  }
                />
              ))}
            </div>
          </Fieldset>
        </div>
      );
    }
    case "rating": {
      const options = Array.from({ length: field.max }, (_, i) => ({
        value: String(i + 1),
        label: String(i + 1),
      }));
      return (
        <div className={wrap} data-field-id={field.id}>
          <Fieldset
            id={id}
            legend={field.label}
            help={field.helpText}
            error={error}
            required={field.required}
          >
            <RadioGroup
              name={field.id}
              ref={rhf.ref}
              layout="inline"
              options={options}
              value={str}
              onChange={(v) => rhf.onChange(Number(v))}
              onBlur={rhf.onBlur}
              disabled={disabled}
              invalid={!!error}
            />
            {field.lowLabel || field.highLabel ? (
              <div className="flex justify-between text-xs text-fg-muted" aria-hidden="true">
                <span>{field.lowLabel ? `1 = ${field.lowLabel}` : ""}</span>
                <span>{field.highLabel ? `${field.max} = ${field.highLabel}` : ""}</span>
              </div>
            ) : null}
          </Fieldset>
        </div>
      );
    }
    case "yesNo": {
      const v = rhf.value === true ? "true" : rhf.value === false ? "false" : "";
      return (
        <div className={wrap} data-field-id={field.id}>
          <Fieldset
            id={id}
            legend={field.label}
            help={field.helpText}
            error={error}
            required={field.required}
          >
            <RadioGroup
              name={field.id}
              ref={rhf.ref}
              layout="inline"
              options={[
                { value: "true", label: "Yes" },
                { value: "false", label: "No" },
              ]}
              value={v}
              onChange={(x) => rhf.onChange(x === "true")}
              onBlur={rhf.onBlur}
              disabled={disabled}
              invalid={!!error}
            />
          </Fieldset>
        </div>
      );
    }
  }
});
