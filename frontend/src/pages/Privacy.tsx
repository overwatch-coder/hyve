import { Link } from "react-router-dom";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const LAST_UPDATED = "April 25, 2026";

export default function Privacy() {
  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-8 py-4 animate-fade-in">
      {/* Back */}
      <div>
        <Button variant="ghost" size="sm" className="gap-2 -ml-2" asChild>
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>

      {/* Header */}
      <div className="flex flex-col items-center text-center gap-4">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
          <ShieldCheck className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-4xl font-black tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
      </div>

      <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-sm leading-relaxed text-muted-foreground">

        {/* 1 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">1. Who We Are</h2>
          <p>
            HYVE is a product-intelligence platform developed by <strong className="text-foreground">Team Spider</strong> as
            a project for the course module <em>Computer Science in Collective Intelligence</em>. Our mission is to
            help people make better purchasing decisions by turning aggregated product reviews into
            clear, visual decision maps. This Privacy Policy explains what data we collect, why we
            collect it, and how we protect it.
          </p>
          <p>
            If you have questions, contact us at{" "}
            <span className="text-primary font-medium">privacy@hyve.app</span>.
          </p>
        </section>

        {/* 2 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">2. Data We Collect</h2>
          <p>We collect only the minimum data necessary to operate the platform:</p>
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li>
              <strong className="text-foreground">Usage data</strong> — pages visited, features
              used, and general interaction patterns (no personal identifiers attached).
            </li>
            <li>
              <strong className="text-foreground">Product review data</strong> — publicly available
              reviews sourced from Amazon and other platforms via their public APIs. We do not
              collect or store private user reviews.
            </li>
            <li>
              <strong className="text-foreground">Research study responses</strong> — if you
              participate in a controlled study, your task responses (the top strengths and
              weaknesses you identify) are stored anonymously. No name, email, or device
              fingerprint is attached to your response.
            </li>
            <li>
              <strong className="text-foreground">Invite email addresses</strong> — if an
              administrator sends you a study invitation, your email address is stored solely to
              deliver the invite link. It is never shared with third parties and is masked in all
              admin views.
            </li>
            <li>
              <strong className="text-foreground">Authentication credentials</strong> — admin
              accounts require a password, stored as a cryptographic hash (bcrypt). Plain-text
              passwords are never stored.
            </li>
          </ul>
        </section>

        {/* 3 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">3. How We Use Your Data</h2>
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li>To display product analysis results to platform users.</li>
            <li>
              To conduct academic research on human decision-making — research results are
              published only in aggregated, anonymised form.
            </li>
            <li>To send you a one-time study invite if an administrator has added your address.</li>
            <li>
              To improve the platform and fix bugs, based on anonymous usage patterns.
            </li>
          </ul>
          <p>We do <strong className="text-foreground">not</strong> sell, rent, or broker any data to third parties.</p>
        </section>

        {/* 4 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">4. Cookies & Local Storage</h2>
          <p>
            HYVE does not use tracking cookies or third-party analytics cookies. We store a small
            amount of data in your browser's <code className="text-primary bg-primary/10 px-1 py-0.5 rounded text-xs">localStorage</code> solely to:
          </p>
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li>Remember your preferred colour theme (light / dark).</li>
            <li>
              Maintain your study session token during an active research session (cleared
              automatically when the session ends).
            </li>
          </ul>
          <p>No third-party scripts, tracking pixels, or advertising networks are loaded.</p>
        </section>

        {/* 5 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">5. Data Retention</h2>
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li>
              <strong className="text-foreground">Study responses</strong> — retained for the
              duration of the associated research project, then deleted or fully anonymised.
            </li>
            <li>
              <strong className="text-foreground">Invite email addresses</strong> — deleted within
              90 days of the study closing, or on request at any time.
            </li>
            <li>
              <strong className="text-foreground">Product review data</strong> — public review text
              is stored as long as the product analysis is active on the platform.
            </li>
          </ul>
        </section>

        {/* 6 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">6. Your Rights</h2>
          <p>
            Under applicable data protection laws (including GDPR where relevant), you have the
            right to:
          </p>
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li>Request access to the personal data we hold about you.</li>
            <li>Request correction or deletion of your personal data.</li>
            <li>Withdraw consent at any time for research participation.</li>
            <li>Lodge a complaint with your local data protection authority.</li>
          </ul>
          <p>
            To exercise any of these rights, contact us at{" "}
            <span className="text-primary font-medium">privacy@hyve.app</span>.
          </p>
        </section>

        {/* 7 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">7. Security</h2>
          <p>
            We take security seriously. All data is transmitted over HTTPS. Admin passwords are
            hashed with bcrypt. Study session tokens are single-use and time-limited.
            Our infrastructure is hosted in an access-controlled environment with regular
            dependency audits.
          </p>
          <p>
            No system is perfectly secure. If you discover a vulnerability, please report it
            responsibly to <span className="text-primary font-medium">security@hyve.app</span>.
          </p>
        </section>

        {/* 8 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">8. Third-Party Services</h2>
          <p>
            HYVE uses the following third-party services in a privacy-preserving way:
          </p>
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li>
              <strong className="text-foreground">Amazon Product Advertising API</strong> — to
              fetch publicly available product reviews. Requests go through our server; your
              IP address is not forwarded to Amazon.
            </li>
            <li>
              <strong className="text-foreground">OpenAI / Google Gemini</strong> — product review
              text is sent to AI model APIs for analysis. Review text is public and contains no
              personal information. We do not send user-identifiable data to AI providers.
            </li>
          </ul>
        </section>

        {/* 9 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">9. Children's Privacy</h2>
          <p>
            HYVE is not directed at children under 16. We do not knowingly collect personal
            information from children. If you believe a child has provided us with personal data,
            contact us and we will delete it promptly.
          </p>
        </section>

        {/* 10 */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">10. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. When we do, we will update
            the "Last updated" date at the top of this page. Continued use of HYVE after
            changes are posted constitutes your acceptance of the revised policy.
          </p>
        </section>
      </div>

      {/* Footer nav */}
      <div className="border-t border-border/40 pt-6 flex flex-col sm:flex-row gap-3 justify-between items-center text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} HYVE — Team Spider · CS in Collective Intelligence</p>
        <div className="flex gap-4">
          <Link to="/about" className="hover:text-foreground transition-colors font-medium">About</Link>
          <Link to="/faq" className="hover:text-foreground transition-colors font-medium">FAQ</Link>
          <Link to="/team" className="hover:text-foreground transition-colors font-medium">Team</Link>
        </div>
      </div>
    </div>
  );
}
