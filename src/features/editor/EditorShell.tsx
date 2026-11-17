"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  buttonClasses,
  Dialog,
  Icon,
  IconButton,
  Input,
  Kbd,
  useToast,
} from "@/components/ui";
import { FormRunner } from "@/components/form-renderer/FormRunner";
import { AskAi } from "@/features/ai-edit/AskAi";
import { publishForm, unpublishForm } from "@/features/forms/mutations";
import { cn } from "@/lib/cn";
import { useAutosave, type DraftPersistence } from "./persistence";
import { PreviewPanel } from "./PreviewPanel";
import { SettingsPanel } from "./SettingsPanel";
import { StructurePanel } from "./StructurePanel";
import {
  createEditorStore,
  EditorStoreContext,
  selectFormDefinition,
  useEditor,
  useEditorActions,
  useEditorStore,
  type EditorInit,
} from "./store";

export type EditorMode =
  | { kind: "owner"; formId: string; slug: string; publishedVersion: number | null }
  | { kind: "sandbox"; onReset: () => void; extraActions?: ReactNode };

export function Editor({
  init,
  persistence,
  mode,
}: {
  init: EditorInit;
  persistence: DraftPersistence;
  mode: EditorMode;
}) {
  // One store per editor instance (App Router guidance: no module-level stores).
  const [store] = useState(() => createEditorStore(init));
  return (
    <EditorStoreContext value={store}>
      <EditorShell persistence={persistence} mode={mode} />
    </EditorStoreContext>
  );
}

type Panel = "structure" | "preview" | "settings";

function EditorShell({ persistence, mode }: { persistence: DraftPersistence; mode: EditorMode }) {
  useAutosave(persistence);
  const [panel, setPanel] = useState<Panel>("structure");
  const [dialog, setDialog] = useState<null | "issues" | "shortcuts" | "respondent" | "share">(
    null,
  );
  useEditorShortcuts(() => setDialog("shortcuts"));

  return (
    <div className="flex flex-1 flex-col">
      <Toolbar mode={mode} openDialog={setDialog} />

      {/* Small screens: one panel at a time. Large screens: all three side by side. */}
      <div
        role="tablist"
        aria-label="Editor panels"
        className="sticky top-0 z-10 flex border-b border-line bg-surface lg:hidden"
      >
        {(["structure", "preview", "settings"] as const).map((p) => (
          <button
            key={p}
            role="tab"
            type="button"
            aria-selected={panel === p}
            aria-controls={`panel-${p}`}
            onClick={() => setPanel(p)}
            className={cn(
              "flex-1 border-b-2 py-2.5 text-sm font-medium capitalize",
              panel === p ? "border-accent text-fg" : "border-transparent text-fg-muted",
            )}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="mx-auto grid w-full max-w-[1600px] flex-1 gap-4 p-4 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)_minmax(280px,360px)] lg:gap-6">
        <div
          id="panel-structure"
          className={cn("min-w-0 lg:block", panel !== "structure" && "hidden")}
        >
          <div className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:pr-1">
            <StructurePanel />
          </div>
        </div>
        <div
          id="panel-preview"
          className={cn("flex min-w-0 flex-col gap-4 lg:flex", panel !== "preview" && "hidden")}
        >
          <PreviewPanel />
          <AskAi sandbox={mode.kind === "sandbox"} />
        </div>
        <div
          id="panel-settings"
          className={cn("min-w-0 lg:block", panel !== "settings" && "hidden")}
        >
          <div className="rounded-card border border-line bg-surface p-4 shadow-card lg:sticky lg:top-4 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto">
            <SettingsPanel />
          </div>
        </div>
      </div>

      <IssuesDialog open={dialog === "issues"} onClose={() => setDialog(null)} />
      <ShortcutsDialog open={dialog === "shortcuts"} onClose={() => setDialog(null)} />
      <RespondentPreviewDialog
        open={dialog === "respondent"}
        onClose={() => setDialog(null)}
        sandbox={mode.kind === "sandbox"}
      />
      {mode.kind === "owner" ? (
        <ShareDialog
          open={dialog === "share"}
          onClose={() => setDialog(null)}
          formId={mode.formId}
          slug={mode.slug}
        />
      ) : null}
    </div>
  );
}

function Toolbar({
  mode,
  openDialog,
}: {
  mode: EditorMode;
  openDialog: (d: "issues" | "shortcuts" | "respondent" | "share") => void;
}) {
  const canUndo = useEditor((s) => s.history.past.length > 0);
  const canRedo = useEditor((s) => s.history.future.length > 0);
  const undoLabel = useEditor((s) => s.history.past.at(-1)?.label);
  const redoLabel = useEditor((s) => s.history.future[0]?.label);
  const errorCount = useEditor((s) => s.issues.filter((i) => i.severity === "error").length);
  const warningCount = useEditor((s) => s.issues.filter((i) => i.severity === "warning").length);
  const { undo, redo } = useEditorActions();

  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-2 px-4 py-2">
        {mode.kind === "owner" ? (
          <Link href="/forms" className={buttonClasses({ variant: "ghost", size: "sm" })}>
            <Icon name="chevronLeft" />
            My forms
          </Link>
        ) : (
          <Badge tone="accent">Sandbox · saved in this browser only</Badge>
        )}
        <SaveIndicator />
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <IconButton
            size="sm"
            variant="ghost"
            label={canUndo ? `Undo ${undoLabel} (Ctrl+Z)` : "Undo"}
            icon={<Icon name="undo" />}
            onClick={undo}
            disabled={!canUndo}
          />
          <IconButton
            size="sm"
            variant="ghost"
            label={canRedo ? `Redo ${redoLabel} (Ctrl+Shift+Z)` : "Redo"}
            icon={<Icon name="redo" />}
            onClick={redo}
            disabled={!canRedo}
          />
          <IconButton
            size="sm"
            variant="ghost"
            label="Keyboard shortcuts (?)"
            icon={<Icon name="keyboard" />}
            onClick={() => openDialog("shortcuts")}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => openDialog("issues")}
            aria-label={`${errorCount} errors, ${warningCount} warnings`}
            className={errorCount ? "text-danger" : undefined}
          >
            <Icon name={errorCount ? "alert" : "check"} />
            {errorCount ? `${errorCount} to fix` : "No errors"}
          </Button>
          <Button
            size="sm"
            onClick={() => openDialog("respondent")}
            leadingIcon={<Icon name="eye" />}
          >
            Preview
          </Button>
          {mode.kind === "owner" ? (
            <PublishButton
              formId={mode.formId}
              initialVersion={mode.publishedVersion}
              onPublished={() => openDialog("share")}
              onBlocked={() => openDialog("issues")}
            />
          ) : null}
          {mode.kind === "sandbox" ? (
            <>
              {mode.extraActions}
              <Button size="sm" variant="ghost" onClick={mode.onReset}>
                Reset sample
              </Button>
              <Link
                href="/sign-in?next=/forms"
                className={buttonClasses({ size: "sm", variant: "primary" })}
              >
                Sign in to publish
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SaveIndicator() {
  const save = useEditor((s) => s.save);
  const dirty = useEditor((s) => s.revision !== s.savedRevision);
  const text =
    save.status === "saving"
      ? "Saving…"
      : save.status === "offline"
        ? "Offline · will save when reconnected"
        : save.status === "error"
          ? "Couldn't save"
          : dirty
            ? "Unsaved changes"
            : save.status === "saved"
              ? "All changes saved"
              : "";
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-1.5 text-sm",
        save.status === "error" || save.status === "offline" ? "text-danger" : "text-fg-muted",
      )}
      title={save.message}
    >
      {save.status === "offline" ? (
        <Icon name="wifiOff" />
      ) : save.status === "saved" && !dirty ? (
        <Icon name="check" />
      ) : null}
      {text}
    </span>
  );
}

function PublishButton({
  formId,
  initialVersion,
  onPublished,
  onBlocked,
}: {
  formId: string;
  initialVersion: number | null;
  onPublished: () => void;
  onBlocked: () => void;
}) {
  const store = useEditorStore();
  const hasErrors = useEditor((s) => s.issues.some((i) => i.severity === "error"));
  const unpublished = useEditor(
    (s) => s.publishedJson !== null && s.publishedJson !== JSON.stringify(selectFormDefinition(s)),
  );
  const isPublished = useEditor((s) => s.publishedJson !== null);
  const [version, setVersion] = useState(initialVersion);
  const [pending, setPending] = useState(false);
  const toast = useToast();

  const publish = async () => {
    if (hasErrors) return onBlocked();
    setPending(true);
    try {
      const r = await publishForm(formId, selectFormDefinition(store.getState()));
      store.getState().actions.markPublished();
      setVersion(r.version);
      onPublished();
    } catch (e) {
      toast.show({ message: (e as Error).message, tone: "danger" });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {isPublished ? (
        unpublished ? (
          <Badge tone="warning">Unpublished changes</Badge>
        ) : (
          <Badge tone="success">Live · v{version}</Badge>
        )
      ) : (
        <Badge>Draft</Badge>
      )}
      <Button
        size="sm"
        variant="primary"
        onClick={publish}
        loading={pending}
        disabled={isPublished && !unpublished}
      >
        {isPublished ? (unpublished ? `Publish v${(version ?? 0) + 1}` : "Published") : "Publish"}
      </Button>
    </div>
  );
}

function ShareDialog({
  open,
  onClose,
  formId,
  slug,
}: {
  open: boolean;
  onClose: () => void;
  formId: string;
  slug: string;
}) {
  const [origin, setOrigin] = useState("");
  const toast = useToast();
  // window is unavailable during SSR; read the origin once mounted.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only value
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}/f/${slug}`;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Your form is live"
      description="Anyone with the link can respond. Existing responses keep the version they started on."
      footer={
        <>
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                await unpublishForm(formId);
                toast.show({ message: "Form unpublished. The link no longer works." });
                onClose();
                window.location.reload();
              } catch (e) {
                toast.show({ message: (e as Error).message, tone: "danger" });
              }
            }}
          >
            Unpublish
          </Button>
          <a href={url} target="_blank" rel="noreferrer" className={buttonClasses({})}>
            Open form
          </a>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="flex gap-2">
        <Input
          readOnly
          value={url}
          aria-label="Public link"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              toast.show({ message: "Link copied.", tone: "success" });
            } catch {
              toast.show({
                message: "Couldn't copy. Select the link and copy it manually.",
                tone: "danger",
              });
            }
          }}
          leadingIcon={<Icon name="copy" />}
        >
          Copy
        </Button>
      </div>
    </Dialog>
  );
}

function IssuesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const issues = useEditor((s) => s.issues);
  const stepsAndFields = useEditor((s) => s.form);
  const { select } = useEditorActions();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Problems"
      description={
        issues.length
          ? "Errors must be fixed before publishing. Warnings won't block you."
          : undefined
      }
    >
      {issues.length === 0 ? (
        <p className="text-sm text-fg-muted">Everything looks good.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {issues.map((i, k) => (
            <li key={k}>
              <button
                type="button"
                className="flex w-full items-start gap-2 rounded-control border border-line p-3 text-left text-sm hover:bg-subtle"
                onClick={() => {
                  if (i.targetId && stepsAndFields.fields[i.targetId])
                    select({ kind: "field", id: i.targetId });
                  else if (i.targetId && stepsAndFields.steps[i.targetId])
                    select({ kind: "step", id: i.targetId });
                  else select({ kind: "form" });
                  onClose();
                }}
              >
                <Icon
                  name="alert"
                  className={i.severity === "error" ? "mt-0.5 text-danger" : "mt-0.5 text-warning"}
                />
                <span>
                  <span className="sr-only">{i.severity}: </span>
                  {i.message}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function RespondentPreviewDialog({
  open,
  onClose,
  sandbox,
}: {
  open: boolean;
  onClose: () => void;
  sandbox: boolean;
}) {
  const form = useEditor(selectFormDefinition);
  const [key, setKey] = useState(0);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={sandbox ? "Publish preview" : "Respondent preview"}
      description={
        sandbox
          ? "This is exactly what respondents would see. Sandbox: nothing is saved or published."
          : "What respondents will see. Answers here aren't saved."
      }
    >
      {open ? (
        <div className="mx-auto max-w-xl">
          <h3 className="text-xl font-semibold">{form.title}</h3>
          {form.description ? (
            <p className="mt-1 mb-6 text-fg-muted">{form.description}</p>
          ) : (
            <div className="mb-6" />
          )}
          <FormRunner
            key={key}
            form={form}
            mode="preview"
            onSubmit={async () => ({ ok: true })}
            onRestart={() => setKey((k) => k + 1)}
          />
        </div>
      ) : null}
    </Dialog>
  );
}

const SHORTCUTS: [string, string][] = [
  ["Ctrl / ⌘ + Z", "Undo (manual and AI edits)"],
  ["Ctrl / ⌘ + Shift + Z, Ctrl + Y", "Redo"],
  ["↑ / ↓", "Move between items in the structure list"],
  ["Alt + ↑ / ↓", "Move the focused question or step"],
  ["Ctrl / ⌘ + D", "Duplicate the focused question"],
  ["Delete", "Delete the focused question or step (undo available)"],
  ["Ctrl / ⌘ + Enter", "Send the Ask AI instruction"],
  ["?", "Show this list"],
];

function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" size="md">
      <dl className="divide-y divide-line text-sm">
        {SHORTCUTS.map(([keys, what]) => (
          <div key={keys} className="flex items-center justify-between gap-4 py-2">
            <dt className="flex flex-wrap gap-1">
              {keys.split(", ").map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </dt>
            <dd className="text-right text-fg-muted">{what}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}

/** Global undo/redo and "?" help. Our history also covers typing (coalesced), so it owns Ctrl+Z inside settings inputs too. */
function useEditorShortcuts(openHelp: () => void) {
  const { undo, redo } = useEditorActions();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("dialog[open]") || target?.closest("[data-native-undo]")) return;
      const typing = !!target?.closest("input, textarea, select, [contenteditable]");
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && ((key === "z" && e.shiftKey) || key === "y")) {
        e.preventDefault();
        redo();
      } else if (!typing && !mod && e.key === "?") {
        e.preventDefault();
        openHelp();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, openHelp]);
}
