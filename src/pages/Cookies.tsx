import LegalPageLayout from "@/components/layout/LegalPageLayout";

const Cookies = () => {
  return (
    <LegalPageLayout title="Cookie Policy">
      <section>
        <h2>1. About this policy</h2>
        <p>
          This Cookie Policy explains how NomadNest Global LLC ("NomadNest",
          "we", "us") uses cookies and similar technologies on{" "}
          <a href="https://www.nomadnest.global">www.nomadnest.global</a> and
          our related applications (the "Platform"). It should be read alongside
          our <a href="/privacy">Privacy Policy</a>.
        </p>
      </section>

      <section>
        <h2>2. What cookies are</h2>
        <p>
          Cookies are small text files stored on your device when you visit a
          website. They allow the site to recognise your device and remember
          information about your visit. We also use related technologies such as
          local storage, session storage, and pixels, all referred to as
          "cookies" in this policy.
        </p>
      </section>

      <section>
        <h2>3. Categories of cookies we use</h2>
        <h3>Strictly necessary</h3>
        <p>
          Required for the Platform to function: login session, security,
          authentication tokens, language and theme preferences, load balancing.
          These cookies cannot be switched off.
        </p>
        <h3>Functional</h3>
        <p>
          Remember choices you make (saved listings, recent searches, onboarding
          progress) to give you a more personalised experience.
        </p>
        <h3>Analytics</h3>
        <p>
          Help us understand how members use the Platform so we can improve it
          (pages visited, features used, errors encountered). These are
          aggregated and do not identify you personally.
        </p>
        <h3>Third-party</h3>
        <p>
          Set by service providers we use, including Stripe (payments), Google
          Maps (location features), Supabase (auth and data), and push
          notification providers. These providers may set their own cookies in
          line with their own privacy policies.
        </p>
      </section>

      <section>
        <h2>4. Managing cookies</h2>
        <p>
          You can manage non-essential cookies at any time through your browser
          settings. Most browsers let you block or delete cookies; some let you
          accept only first-party cookies. Disabling strictly necessary cookies
          will prevent the Platform from working correctly (for example, you
          will not be able to stay logged in).
        </p>
        <p>
          You can also opt out of marketing communications from your account
          notification settings.
        </p>
      </section>

      <section>
        <h2>5. Changes to this policy</h2>
        <p>
          We may update this Cookie Policy from time to time to reflect changes
          in technology, regulation, or our practices. Material changes will be
          notified through the Platform.
        </p>
      </section>

      <section>
        <h2>6. Contact</h2>
        <p>
          NomadNest Global LLC, Sharjah Media City, Sharjah, UAE. Questions
          about cookies? Email{" "}
          <a href="mailto:privacy@nomadnest.global">privacy@nomadnest.global</a>.
        </p>
      </section>
    </LegalPageLayout>
  );
};

export default Cookies;
