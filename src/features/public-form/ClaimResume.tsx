"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { buttonClasses, Card, Spinner } from "@/components/ui";
import { createClient, ensureSession } from "@/lib/supabase/client";

/**
 * Claims a resume token in the browser: ensures an (anonymous) session here, then
 * claim_response moves the draft to this session and burns the token. Runs client-side
 * because the session cookie must belong to this browser.
 */
export function ClaimResume({ slug, token }: { slug: string; token: string }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // StrictMode runs effects twice in dev; a token works once
    ran.current = true;
    (async () => {
      try {
        await ensureSession();
        const { data, error } = await createClient().rpc("claim_response", { p_token: token });
        const claimed = data as { slug: string } | null;
        if (error || !claimed) return setFailed(true);
        // Strip the token from history so it isn't left in the address bar.
        router.replace(`/f/${claimed.slug}`);
        router.refresh();
      } catch {
        setFailed(true);
      }
    })();
  }, [router, token]);

  if (!failed) return <Spinner label="Restoring your answers" className="mx-auto mt-12" />;
  return (
    <Card className="flex flex-col items-center gap-3 py-10 text-center">
      <h1 className="text-lg font-semibold">This link can&apos;t be used</h1>
      <p className="max-w-sm text-sm text-fg-muted">
        Resume links work once and expire after 30 days. If you already opened it on another device,
        continue there.
      </p>
      <Link href={`/f/${slug}`} className={buttonClasses({ variant: "primary" })}>
        Start the form
      </Link>
    </Card>
  );
}
