import type { Metadata } from "next";
import LegalPage from "@/page/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy — RedApeAI",
  description:
    "How RedApeAI collects, uses, and protects personal information.",
};

export default function Page() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      introduction="RedApeAI is an AI business operator designed to help sales teams manage conversations, opportunities, follow-ups, and deals from one inbox across the channels they already use. This policy explains how we handle information when you visit our website, join the waitlist, or contact us."
      sections={[
        {
          title: "Information we collect",
          paragraphs: [
            "When you join the waitlist, we collect your email address. When you contact us, we collect the name, email address, phone number, and message you choose to provide.",
            "Our hosting and infrastructure providers may also process basic technical information such as IP address, browser type, device information, request logs, and timestamps to operate and secure the website.",
          ],
        },
        {
          title: "How we use information",
          paragraphs: [
            "We use waitlist information to tell you when RedApeAI becomes available and to share important product updates. We use contact information to reply to questions, arrange product conversations, and provide support.",
            "We may also use limited technical data to prevent abuse, troubleshoot problems, improve reliability, and understand the general performance of the website.",
          ],
        },
        {
          title: "How RedApeAI works",
          paragraphs: [
            "The planned RedApeAI product brings critical sales channels into one inbox and uses AI to help converse with prospects, identify intent, follow up, organize customer context, schedule meetings, and move leads toward a deal on a sales team's behalf.",
            "Any future processing of connected inboxes, customer conversations, CRM records, or other product data will be covered by additional product terms, permissions, and notices presented before those services are enabled.",
          ],
        },
        {
          title: "Service providers and sharing",
          paragraphs: [
            "We use trusted infrastructure providers to host the website, store waitlist entries, and deliver contact emails. These providers process information only as needed to provide their services to us.",
            "We do not sell personal information. We may disclose information when required by law, to protect users and the service, or as part of a business transaction subject to appropriate safeguards.",
          ],
        },
        {
          title: "Retention and security",
          paragraphs: [
            "We retain waitlist details while they remain useful for launch communication and retain contact messages as needed to respond and maintain reasonable business records. You may ask us to delete your information.",
            "We use reasonable administrative and technical safeguards, but no online service can guarantee absolute security.",
          ],
        },
        {
          title: "Your choices",
          paragraphs: [
            "You may ask to access, correct, or delete the personal information you provided, or opt out of future launch messages. Depending on where you live, additional privacy rights may apply.",
            "For privacy questions or requests, email anas@redape.com.",
          ],
        },
        {
          title: "Changes to this policy",
          paragraphs: [
            "We may update this policy as RedApeAI develops. We will post the updated version here and revise the date above when material changes are made.",
          ],
        },
      ]}
    />
  );
}
