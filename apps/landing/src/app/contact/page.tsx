import type { Metadata } from "next";
import ContactPage from "@/page/ContactPage";

export const metadata: Metadata = {
  title: "Contact Us — Plucia",
  description: "Get in touch with the Plucia team.",
};

export default function Page() {
  return <ContactPage />;
}
