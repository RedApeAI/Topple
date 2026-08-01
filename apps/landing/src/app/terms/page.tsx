import type { Metadata } from "next";
import LegalPage from "@/page/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service — Plucia",
  description: "Terms governing use of the Plucia website and waitlist.",
};

export default function Page() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Service"
      introduction="These terms govern your use of the Plucia website, waitlist, and contact services. Plucia is being developed as an AI business operator for modern sales teams."
      sections={[
        {
          title: "About Plucia",
          paragraphs: [
            "Plucia is intended to bring the critical channels used by sales teams into one inbox. The product is designed to help understand buyer intent, converse with prospects, manage follow-ups, surface customer context, schedule meetings, and move leads and deals forward on a company's behalf.",
            "The full product is still under development. Website descriptions, demonstrations, animations, and previews describe our intended direction and are not a promise that every feature is currently available.",
          ],
        },
        {
          title: "Waitlist and communications",
          paragraphs: [
            "You may join the waitlist by providing a valid email address. By doing so, you ask us to contact you about availability and important Plucia updates. Joining the waitlist does not guarantee access, a launch date, pricing, or particular functionality.",
            "You may ask us to stop sending launch communications at any time.",
          ],
        },
        {
          title: "Acceptable use",
          paragraphs: [
            "You may not misuse the website, interfere with its operation, attempt unauthorized access, submit malicious code, impersonate another person, or use the service in violation of applicable law.",
            "You are responsible for the accuracy of information you submit through the waitlist and contact forms.",
          ],
        },
        {
          title: "AI and connected sales channels",
          paragraphs: [
            "When the Plucia product becomes available, AI-generated messages, summaries, recommendations, and actions may be incomplete or incorrect. Users remain responsible for reviewing important communications, decisions, commitments, and legal or financial consequences.",
            "Connections to email, messaging, CRM, calendar, social, and other third-party platforms will depend on user authorization and the rules and availability of those platforms.",
          ],
        },
        {
          title: "Ownership",
          paragraphs: [
            "The Plucia name, website, designs, software, content, and product concepts are owned by Plucia or its licensors and are protected by applicable intellectual property laws.",
            "You retain ownership of information you submit. You give us permission to process it only as needed to operate the website, respond to you, maintain the waitlist, and provide future services you request.",
          ],
        },
        {
          title: "Disclaimers",
          paragraphs: [
            "The website and waitlist are provided on an as-is and as-available basis. To the extent permitted by law, we disclaim implied warranties, including merchantability, fitness for a particular purpose, and non-infringement.",
            "We do not guarantee uninterrupted access, a specific launch date, sales outcomes, lead conversion, or the accuracy of product previews.",
          ],
        },
        {
          title: "Limitation of liability",
          paragraphs: [
            "To the maximum extent permitted by law, Plucia will not be liable for indirect, incidental, special, consequential, or lost-profit damages arising from use of the website or reliance on its content.",
          ],
        },
        {
          title: "Changes and contact",
          paragraphs: [
            "We may update these terms as the product develops. Continued use of the website after an update means the revised terms apply.",
            "Questions about these terms may be sent to anas@plucia.com.",
          ],
        },
      ]}
    />
  );
}
