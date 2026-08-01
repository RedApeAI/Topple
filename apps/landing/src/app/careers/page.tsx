import type { Metadata } from "next";
import CareersPage from "@/page/CareersPage";

export const metadata: Metadata = {
  title: "Careers — Plucia",
  description: "Join the team building the AI operator for modern sales teams.",
};

export default function Page() {
  return <CareersPage />;
}
