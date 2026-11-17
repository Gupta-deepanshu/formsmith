import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, Skeleton } from "@/components/ui";
import { SignInWithGoogle } from "@/features/auth/SignInWithGoogle";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Static shell + a Suspense'd part that reads searchParams. With Cache Components the
 * shell prerenders; only the search-param-dependent bit waits for the request.
 */
export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <Card className="flex flex-col gap-6 p-6 sm:p-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold">Sign in to Formsmith</h1>
            <p className="text-sm text-fg-muted">Create forms with AI, publish them, and see responses.</p>
          </div>
          <Suspense fallback={<Skeleton className="h-12 w-full" />}>
            <SignInActions searchParams={searchParams} />
          </Suspense>
          <div className="border-t border-line pt-4 text-sm text-fg-muted">
            Just looking?{" "}
            <Link href="/try" className="font-medium text-accent underline-offset-4 hover:underline">
              Try the editor
            </Link>{" "}
            or{" "}
            <Link href="/f/demo" className="font-medium text-accent underline-offset-4 hover:underline">
              fill in the demo form
            </Link>
            , no account needed.
          </div>
        </Card>
      </main>
    </>
  );
}

async function SignInActions({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <>
      {sp.error === "callback" ? (
        <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
          Sign-in didn&apos;t complete. Please try again.
        </p>
      ) : null}
      <SignInWithGoogle next={next} />
    </>
  );
}
