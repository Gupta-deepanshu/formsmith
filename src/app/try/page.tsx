import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { AccountStatus } from "@/features/auth/AccountStatus";
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
        <AccountStatus />
      </SiteHeader>
      <main id="main" className="flex flex-1 flex-col">
        <SandboxEditor />
      </main>
    </>
  );
}
