import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

const UPDATED = "2 October 2026";
const REPO = "https://github.com/brandontaylor156/baseline-today";

export default function PrivacyPage() {
  return (
    <article className="max-w-2xl space-y-6 leading-relaxed">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Privacy</h1>
        <p className="text-sm text-muted">Last updated {UPDATED}</p>
      </header>

      <p>
        Baseline Today is a personal portfolio project. You can browse rankings, players and search without an
        account. An account is only needed to save favorite players.
      </p>

      <Section title="What we store when you sign in">
        <p>Sign-in uses Google through our authentication provider, Supabase. We receive and store:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>your Google account’s name, email address and profile picture link, used only to identify your account;</li>
          <li>the players you favorite;</li>
          <li>
            if you turn on result notifications, your browser’s push address for this site (issued by your browser’s push
            service, such as Google or Apple), used only to send those notifications.
          </li>
        </ul>
        <p>We never see or store your Google password, and we don’t send you email.</p>
      </Section>

      <Section title="What others can see">
        <p>
          Nobody else can see your favorites or your account details. Player pages show only an anonymous total of how
          many people favorited that player.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          When you sign in, we set cookies that keep your session active. They are required for signing in and are not
          used for tracking. There are no analytics, advertising or third-party tracking cookies.
        </p>
      </Section>

      <Section title="Where data lives">
        <p>
          Account data and favorites are stored with Supabase (United States). The site is hosted on Vercel, which keeps
          short-lived request logs (such as IP addresses) for operating the service. Player photos load directly from
          Wikimedia Commons. Notifications are delivered through your browser’s push service; their content is
          encrypted so only your browser can read it.
        </p>
      </Section>

      <Section title="Deleting your data">
        <p>
          Removing a favorite, or turning notifications off, deletes it immediately. To delete your account and everything linked to it, contact the
          site owner through the{" "}
          <a href={REPO} className="underline underline-offset-2">
            project’s GitHub page
          </a>
          . You can also revoke this site’s access in your Google account settings at any time.
        </p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
