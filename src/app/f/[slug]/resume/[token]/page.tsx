import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { PublicShell } from "@/features/public-form/PublicShell";
import { ClaimResume } from "@/features/public-form/ClaimResume";

export const metadata: Metadata = {
  title: "Resume your response",
  robots: { index: false },
  referrer: "no-referrer",
};

export default function ResumePage({ params }: PageProps<"/f/[slug]/resume/[token]">) {
  return (
    <PublicShell>
      <Suspense fallback={<Spinner label="Loading" />}>
        <Claim params={params} />
      </Suspense>
    </PublicShell>
  );
}

async function Claim({ params }: { params: PageProps<"/f/[slug]/resume/[token]">["params"] }) {
  const { slug, token } = await params;
  return <ClaimResume slug={slug} token={token} />;
}
