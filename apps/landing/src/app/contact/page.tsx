import type { Metadata } from "next";
import ContactPage from "@/page/ContactPage";

export const metadata: Metadata = {
  title: "Contact Us — RedApeAI",
  description: "Get in touch with the RedApeAI team.",
};

export default function Page() {
  return <ContactPage />;
}
