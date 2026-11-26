import type { Metadata } from "next";
import { PublicRequestPage } from "./components/public-request-page";

export const metadata: Metadata = {
  title: "Form Request Pekerjaan",
  robots: { index: false, follow: false },
};

export default async function RequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicRequestPage token={token} />;
}
