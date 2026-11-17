"use client";

import { loadForm, type FormDefinition } from "@/core";

/**
 * localStorage persistence for the sandbox editor (/try). Every access is wrapped:
 * storage can be blocked (private mode, disabled site data) and the page must still
 * work, just without persistence.
 */
export const SANDBOX_KEY = "formsmith:sandbox:v1";

export function readSandbox(): FormDefinition | null {
  try {
    const raw = localStorage.getItem(SANDBOX_KEY);
    if (!raw) return null;
    const r = loadForm(JSON.parse(raw));
    // Drafts may be mid-edit and carry errors; accept anything structurally parseable.
    if (r.ok) return r.form;
    const parsed = JSON.parse(raw) as FormDefinition;
    return parsed && Array.isArray(parsed.steps) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSandbox(form: FormDefinition): boolean {
  try {
    localStorage.setItem(SANDBOX_KEY, JSON.stringify(form));
    return true;
  } catch {
    return false;
  }
}

export function clearSandbox() {
  try {
    localStorage.removeItem(SANDBOX_KEY);
  } catch {
    // ignore
  }
}
