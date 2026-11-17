import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SandboxEditor } from "@/features/editor/SandboxEditor";

export const metadata: Metadata = {
  title: "Try the editor",
  description:
    "The full Formsmith editor with a sample form. No sign-in; everything stays in your browser.",
};

/** Static page: the sandbox loads its state from localStorage on the client. */
export default function TryPage() {
  return (
    <>
      <SiteHeader>
        <Link
          href="/sign-in"
          className="rounded-control px-2 py-1 text-sm font-medium text-fg-muted hover:text-fg"
        >
          Sign in
        </Link>
      </SiteHeader>
      <main id="main" className="flex flex-1 flex-col">
        <SandboxEditor />
      </main>
    </>
  );
}
