import Nav from '../components/Nav'
import Footer from '../components/Footer'

export default function Privacy() {
  return (
    <div>
      <Nav />
      <main className="bg-cream py-16 md:py-20">
        <div className="max-w-3xl mx-auto px-6">
          <p className="font-mono-custom text-xs text-rust tracking-widest uppercase mb-4">Legal</p>
          <h1 className="font-display font-bold text-ink leading-tight tracking-tight mb-3 text-[clamp(28px,4.5vw,42px)]">
            Privacy Policy
          </h1>
          <p className="text-ink-mid text-sm opacity-70 mb-12">Last updated: {LAST_UPDATED}</p>

          <div className="flex flex-col gap-10 text-ink-mid text-[15px] leading-relaxed">
            <Section title="1. Who We Are">
              <p>
                AKWABA 001 (operated by Nigerian Passport Travels, "we", "us", "our") organizes a group road-trip
                convoy from Nigeria to Ghana. This policy explains what personal data we collect through this
                registration portal, why we collect it, and the rights you have over it under the Nigeria Data
                Protection Act 2023 and the NDPR.
              </p>
            </Section>

            <Section title="2. Data We Collect">
              <p className="mb-3">When you register, log in, or make a payment, we collect:</p>
              <ul className="list-disc pl-5 flex flex-col gap-1.5">
                <li><strong>Identity data:</strong> surname, first name, email address, WhatsApp number.</li>
                <li>
                  <strong>Account security data:</strong> your 4-digit PIN, stored only as a one-way bcrypt hash — we
                  cannot see or recover your actual PIN.
                </li>
                <li>
                  <strong>Travel logistics data:</strong> travel document type (International Passport, ECOWAS
                  Passport, or NIN), room preference, roommate's name (if applicable), and an emergency contact.
                </li>
                <li>
                  <strong>Payment data:</strong> your chosen payment plan, amounts paid, and Paystack transaction
                  references and status. We never receive or store your card, bank, or full payment details — those
                  are handled entirely by Paystack (see Section 4).
                </li>
                <li>
                  <strong>Technical data:</strong> IP address and request logs, collected automatically for security
                  purposes (e.g. detecting abuse, rate-limiting, debugging) and kept only as long as needed for that
                  purpose.
                </li>
              </ul>
            </Section>

            <Section title="3. Why We Collect It">
              <ul className="list-disc pl-5 flex flex-col gap-1.5">
                <li>To create and secure your account, and let you log in to your dashboard.</li>
                <li>To organize trip logistics — accommodation, rooming, and emergency contact in case of an incident during travel.</li>
                <li>To process and reconcile your trip payments.</li>
                <li>To contact you about your registration, payment status, or the trip itself.</li>
                <li>To protect the service against fraud, abuse, and unauthorized access.</li>
              </ul>
              <p className="mt-3">
                Our legal basis for this processing is your consent (given by registering) and the necessity of
                processing to perform our contract with you (organizing the trip you're paying for).
              </p>
            </Section>

            <Section title="4. Who We Share It With">
              <ul className="list-disc pl-5 flex flex-col gap-1.5">
                <li>
                  <strong>Paystack</strong> — processes all payments. Your payment details are submitted directly to
                  Paystack and are subject to{' '}
                  <a
                    href="https://paystack.com/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-rust underline"
                  >
                    Paystack's own privacy policy
                  </a>
                  . We only receive confirmation of success/failure, the amount, and a transaction reference.
                </li>
                <li>
                  <strong>Google (Gmail SMTP)</strong> — used solely to deliver "forgot PIN" reset emails to the
                  address you registered with.
                </li>
                <li>
                  <strong>MongoDB Atlas</strong> — our database host, where your account data is stored at rest.
                </li>
              </ul>
              <p className="mt-3">We do not sell your data, and we do not share it with advertisers or data brokers.</p>
            </Section>

            <Section title="5. How Long We Keep It">
              <p>
                We retain your registration and payment data for as long as your account is active and for a
                reasonable period afterward for trip record-keeping and legal/accounting obligations. You can request
                deletion at any time (Section 7) — we'll remove what we're not legally required to retain.
              </p>
            </Section>

            <Section title="6. Security">
              <p>
                PINs are hashed with bcrypt, never stored or logged in plain text. Sessions are authenticated with
                httpOnly cookies over HTTPS. Access to the organizer admin panel is restricted and every payment
                change is logged against the admin who made it. No system is perfectly secure, but we design for
                least-privilege access and defense in depth throughout this app.
              </p>
            </Section>

            <Section title="7. Your Rights">
              <p className="mb-3">Under Nigerian data protection law, you have the right to:</p>
              <ul className="list-disc pl-5 flex flex-col gap-1.5">
                <li>Access the personal data we hold about you.</li>
                <li>Correct inaccurate or incomplete data.</li>
                <li>Request deletion of your data, subject to legal/accounting retention requirements.</li>
                <li>Object to or restrict certain processing.</li>
                <li>Withdraw consent at any time (this may mean we can no longer keep you registered for the trip).</li>
                <li>
                  Lodge a complaint with the{' '}
                  <a
                    href="https://ndpc.gov.ng"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-rust underline"
                  >
                    Nigeria Data Protection Commission (NDPC)
                  </a>
                  .
                </li>
              </ul>
              <p className="mt-3">To exercise any of these rights, contact us using the details in Section 9.</p>
            </Section>

            <Section title="8. Cookies">
              <p>
                We use a small number of strictly necessary cookies: one to keep you signed in, and one (readable by
                our own frontend only) to protect your account against cross-site request forgery. We do not use
                advertising, tracking, or analytics cookies.
              </p>
            </Section>

            <Section title="9. Contact Us">
              <p>
                Questions about this policy or your data? Reach us on WhatsApp at{' '}
                <a href="https://wa.me/2348064749255" target="_blank" rel="noopener noreferrer" className="text-rust underline">
                  +234 806 474 9255
                </a>
                .
              </p>
            </Section>

            <Section title="10. Changes to This Policy">
              <p>
                We may update this policy as the service evolves. Material changes will be reflected by the "Last
                updated" date above.
              </p>
            </Section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

const LAST_UPDATED = 'August 2026'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-lg font-semibold text-ink mb-3">{title}</h2>
      {children}
    </section>
  )
}
