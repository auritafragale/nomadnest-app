import LegalPageLayout from "@/components/layout/LegalPageLayout";

const Privacy = () => {
  return (
    <LegalPageLayout title="Privacy Policy">
      <section>
        <h2>1. Who we are</h2>
        <p>
          NomadNest Global LLC, Sharjah Media City, Sharjah, UAE ("NomadNest",
          "we", "our", "us") is the data controller for personal data processed
          through the NomadNest platform at{" "}
          <a href="https://www.nomadnest.global">www.nomadnest.global</a> and
          related apps. For privacy questions, contact{" "}
          <a href="mailto:privacy@nomadnest.global">privacy@nomadnest.global</a>.
        </p>
      </section>

      <section>
        <h2>2. Scope</h2>
        <p>
          This Privacy Policy explains what personal data we collect from members
          (Nomads and Pet Parents) and visitors, how we use it, who we share it
          with, and the rights you have. It applies to the United Arab Emirates
          Federal Decree Law No. 45 of 2021 on the Protection of Personal Data
          and the EU/UK General Data Protection Regulation (GDPR), among other
          applicable laws.
        </p>
      </section>

      <section>
        <h2>3. Data we collect</h2>
        <h3>Account &amp; profile</h3>
        <ul>
          <li>Name, email, password (hashed), date of birth, profile photo.</li>
          <li>Bio, languages, travel preferences, sitting experience.</li>
          <li>Identity verification data (processed by our verification partner).</li>
          <li>Your phone number is never shown on your profile or shared automatically. You decide whether to give it to another member.</li>
          <li>Sharing your phone number in a chat happens only when you choose, only with the member you have a confirmed sit with, and you can stop any time. Only that member can see it, and it stops showing if you stop sharing or the sit is cancelled. The number is never put in messages, notifications or emails.</li>
          <li>AI suggestions are only saved if you choose to save them.</li>
        </ul>
        <h3>Listings &amp; pets</h3>
        <ul>
          <li>Home location (city and approximate map pin until a sit is confirmed; exact address only after confirmation).</li>
          <li>Photos, amenities, available dates, pet details and care instructions.</li>
        </ul>
        <h3>Communications</h3>
        <ul>
          <li>Messages exchanged on the Platform, applications, reviews, and reports.</li>
          <li>Voice input ("Tell me out loud" in the listing form) uses your device's or browser's own speech recognition (for example from Apple or Google), which turns your words into text. NomadNest never receives or stores the recording, only the text you choose to keep.</li>
        </ul>
        <h3>Payments</h3>
        <ul>
          <li>Membership payment data is processed by Stripe; we do not store card details.</li>
        </ul>
        <h3>Technical</h3>
        <ul>
          <li>IP address, device, browser, language, log data, approximate location, cookies and similar technologies.</li>
        </ul>
      </section>

      <section>
        <h2>4. How we use your data</h2>
        <ul>
          <li>To operate the Platform, create your profile, and match Nomads and Pet Parents.</li>
          <li>To verify identity, prevent fraud, and keep the community safe.</li>
          <li>To process membership payments and provide customer support.</li>
          <li>To send transactional emails and, with your consent, marketing updates.</li>
          <li>To improve the Platform through analytics and product research.</li>
          <li>To comply with legal obligations.</li>
        </ul>
      </section>

      <section>
        <h2>5. Legal bases (GDPR)</h2>
        <ul>
          <li><strong>Contract:</strong> to provide the Platform you signed up for.</li>
          <li><strong>Legitimate interests:</strong> to keep the Platform safe, prevent abuse, and improve our service.</li>
          <li><strong>Consent:</strong> for marketing emails, non-essential cookies, and push notifications.</li>
          <li><strong>Legal obligation:</strong> to meet tax, accounting, and regulatory requirements.</li>
        </ul>
      </section>

      <section>
        <h2>6. Who we share data with</h2>
        <ul>
          <li>Other members, where you choose to share (profile, listing, messages, reviews).</li>
          <li>Service providers: hosting and database (Supabase), payments (Stripe), email (Resend), maps (Google Maps), identity verification, text messages for phone verification (Twilio), push notifications, and analytics.</li>
          <li>AI features (Anthropic). Nothing sent to Anthropic is used to train AI models.
            <ul>
              <li>AI buttons (for example Polish with AI): when you press one, only the text needed for that feature is sent, with contact details removed.</li>
              <li>Chat translation: when it is switched on and the member reading your message has chosen a language, the text of your chat message is sent to Anthropic so it can be translated for them. It is sent as written, so it may include anything you typed.</li>
              <li>Catch me up (City Chats): only the recent message text of that room is sent, with names replaced by "a Nomad" and contact details removed.</li>
            </ul>
          </li>
          <li>Authorities where required by law or to protect the rights and safety of members.</li>
        </ul>
        <p>
          We do not sell your personal data.
        </p>
      </section>

      <section>
        <h2>7. International transfers</h2>
        <p>
          Personal data may be transferred to and processed in countries outside
          your own, including the European Economic Area, the United Kingdom,
          the United States, and the UAE. Where required, we rely on Standard
          Contractual Clauses or equivalent safeguards.
        </p>
      </section>

      <section>
        <h2>8. Retention</h2>
        <p>
          We keep personal data only for as long as needed for the purposes
          described above, then delete or anonymise it. If you close your
          account, we retain limited data needed for legal, accounting, fraud
          prevention, and dispute resolution purposes.
        </p>
      </section>

      <section>
        <h2>9. Your rights</h2>
        <p>
          Subject to applicable law, you can request access, correction,
          deletion, restriction, portability, and objection regarding your
          personal data. You can withdraw consent at any time. To exercise these
          rights, email{" "}
          <a href="mailto:privacy@nomadnest.global">privacy@nomadnest.global</a>.
          You also have the right to lodge a complaint with your local data
          protection authority.
        </p>
      </section>

      <section>
        <h2>10. Security</h2>
        <p>
          We use industry-standard measures including encryption in transit,
          access controls, and continuous monitoring. No system is completely
          secure; please use a strong unique password and report any suspicious
          activity to us immediately.
        </p>
      </section>

      <section>
        <h2>11. Children</h2>
        <p>
          The Platform is for adults aged 18 and over. We do not knowingly
          collect personal data from children.
        </p>
      </section>

      <section>
        <h2>12. Cookies</h2>
        <p>
          We use cookies and similar technologies as described in our{" "}
          <a href="/cookies">Cookie Policy</a>.
        </p>
      </section>

      <section>
        <h2>13. Changes to this Policy</h2>
        <p>
          We will update this Privacy Policy when our practices change. Material
          changes will be notified in-app or by email.
        </p>
      </section>

      <section>
        <h2>14. Contact &amp; governing law</h2>
        <p>
          Data controller: NomadNest Global LLC, Sharjah Media City, Sharjah,
          UAE. Privacy contact:{" "}
          <a href="mailto:privacy@nomadnest.global">privacy@nomadnest.global</a>.
          This Policy is governed by UAE Federal Decree Law No. 45 of 2021 and,
          where applicable, the EU/UK GDPR.
        </p>
      </section>
    </LegalPageLayout>
  );
};

export default Privacy;
