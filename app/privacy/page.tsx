export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function PrivacyPage() {
  return (
    <div className="space-y-4 rounded-xl bg-[var(--card)] p-4 shadow-sm">
      <h1 className="text-2xl font-bold text-[var(--brand)]">Privacy Policy</h1>
      <p className="text-sm text-gray-700">
        <strong>Effective Date:</strong> February 20, 2026
      </p>
      <p className="text-sm">
        This policy applies to the online ordering services of Hong Far Cafe (Richmond Hill, ON).
        By using our service, you agree to the terms outlined below.
      </p>

      <section className="space-y-2 text-sm">
        <h2 className="text-lg font-semibold">1. Information We Collect</h2>
        <ul className="list-disc pl-5">
          <li>Identity &amp; Contact: Name, phone number, and email address.</li>
          <li>Transaction Data: Order details, special instructions, and pickup timestamps.</li>
          <li>Technical Data: Cookies used solely for session management and login verification.</li>
        </ul>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="text-lg font-semibold">2. How We Use Your Information</h2>
        <ul className="list-disc pl-5">
          <li>To fulfill and manage your pickup orders.</li>
          <li>To verify your identity via SMS (Twilio) for secure account access.</li>
          <li>To analyze sales trends and improve our menu.</li>
        </ul>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="text-lg font-semibold">3. Third-Party Sharing &amp; Data Transfers</h2>
        <p>
          We do not sell your data. We share limited information with service providers (like
          Twilio for SMS) only as necessary to operate. Please note that data may be processed on
          servers located outside of Canada and will be subject to the laws of those regions.
        </p>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="text-lg font-semibold">4. Data Retention &amp; Security</h2>
        <p>
          We retain your information for as long as necessary for business operations or to meet
          legal requirements. We employ industry-standard safeguards to protect your data from
          unauthorized access.
        </p>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="text-lg font-semibold">5. Your Rights &amp; PIPEDA Compliance</h2>
        <p>
          Under Canadian law, you have the right to access, correct, or request the deletion of
          your personal data. To exercise these rights, please contact us at the details below.
        </p>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="text-lg font-semibold">Contact Us</h2>
        <p>
          Hong Far Cafe
          <br />
          9425 Leslie St, Richmond Hill, ON L4B 3N7
          <br />
          (905) 770-9236
        </p>
      </section>
    </div>
  );
}
