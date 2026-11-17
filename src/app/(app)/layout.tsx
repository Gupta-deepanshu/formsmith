import Link from "next/link";
import { Suspense } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Skeleton } from "@/components/ui";
import { UserMenu } from "@/features/auth/UserMenu";
import { getOwner } from "@/lib/supabase/server";

/** Owner area shell. The proxy already redirects signed-out visitors to /sign-in. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader>
        <nav aria-label="Main" className="mr-2">
          <Link
            href="/forms"
            className="rounded-control px-2 py-1 text-sm font-medium text-fg-muted hover:text-fg"
          >
            My forms
          </Link>
        </nav>
        {/* Session read streams in behind Suspense, so the shell stays static (Cache Components). */}
        <Suspense fallback={<Skeleton className="size-8 rounded-full" />}>
          <AccountSlot />
        </Suspense>
      </SiteHeader>
      <div id="main" className="flex flex-1 flex-col">
        {children}
      </div>
    </>
  );
}

async function AccountSlot() {
  const owner = await getOwner();
  if (!owner) return null;
  return <UserMenu name={owner.name} email={owner.email} />;
}
