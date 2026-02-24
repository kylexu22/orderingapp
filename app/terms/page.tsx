export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function TermsPage() {
  return (
    <div className="space-y-4 rounded-xl bg-[var(--card)] p-4 shadow-sm">
      <h1 className="text-2xl font-bold text-[var(--brand)]">Terms of Service for Hong Far Cafe</h1>
      <p className="text-sm text-gray-700">
        <strong>Last Updated:</strong> February 24, 2026
      </p>
      <p className="text-sm">
        Welcome to the Hong Far Cafe online ordering website. By accessing our site and placing an
        order, you agree to the following terms and conditions.
      </p>

      <section className="space-y-2 text-sm">
        <h2 className="text-lg font-semibold">1. Account Access &amp; SMS Login</h2>
        <ul className="list-disc pl-5">
          <li>To place an order, you must provide a valid mobile phone number.</li>
          <li>
            Verification: You will receive a one-time code via SMS to verify your identity.
            Standard message and data rates may apply.
          </li>
          <li>Responsibility: You are responsible for all orders placed through your phone number.</li>
        </ul>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="text-lg font-semibold">2. Ordering &amp; Payment Policy</h2>
        <ul className="list-disc pl-5">
          <li>
            Cash-Only: We operate as a cash-only establishment for all pickups. By placing an order
            through this site, you agree to pay the full balance in CAD upon arrival at the
            restaurant.
          </li>
          <li>
            Acceptance: An order is considered &quot;Accepted&quot; once the website displays a
            confirmation message or you receive a confirmation SMS.
          </li>
          <li>
            Pickup Time Estimates: We do our best to prepare orders by the selected/estimated pickup
            time, but we cannot guarantee completion by that time. During peak periods, kitchen
            volume may cause delays.
          </li>
          <li>Taxes: All prices are subject to applicable Ontario Harmonized Sales Tax (HST).</li>
        </ul>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="text-lg font-semibold">3. Cancellations &amp; No-Shows</h2>
        <p>Because our food is prepared fresh to order, we have a strict policy regarding uncollected orders:</p>
        <ul className="list-disc pl-5">
          <li>
            Cancellations: If you need to cancel, please call the restaurant directly at (905)
            770-9236 at least 25 minutes prior to your pickup time.
          </li>
          <li>
            No-Show Consequence: We understand plans change, but repeated &quot;No-Shows&quot;
            (orders placed but not picked up) will result in that phone number being blocked from
            using our online ordering system in the future.
          </li>
        </ul>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="text-lg font-semibold">4. Accuracy &amp; Allergies</h2>
        <ul className="list-disc pl-5">
          <li>
            Menu Content: While we strive for accuracy, we reserve the right to correct any pricing
            or description errors on the website at the time of pickup.
          </li>
          <li>
            Allergy Warning: If you have specific food allergies, please use the &quot;Special
            Instructions&quot; box or call us before placing your order to ensure we can accommodate
            your needs safely.
          </li>
        </ul>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="text-lg font-semibold">5. Website Availability</h2>
        <p>
          Hong Far Cafe is not liable for technical issues, server downtime, or SMS delays that may
          prevent an order from being processed. If you do not receive a confirmation, please call
          the restaurant to verify.
        </p>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="text-lg font-semibold">6. Governing Law</h2>
        <p>
          These terms are governed by the laws of the Province of Ontario and the federal laws of
          Canada.
        </p>
      </section>
    </div>
  );
}
