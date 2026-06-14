import Link from "next/link";
import { UserMenu } from "@/components/UserMenu";
import { LogoMark } from "@/components/LogoMark";

type HeaderLink = { href: string; label: string };

type Props = {
  /** Shows a "← {label}" back link on the left instead of the brand mark. */
  back?: HeaderLink;
  /** Display name shown on the menu trigger (e.g. email local-part). */
  username?: string;
};

export function AppHeader({ back, username }: Props) {
  return (
    <header className="flex items-center justify-between gap-3 text-sm">
      {back ? (
        <Link
          href={back.href}
          className="inline-flex items-center gap-2 text-solar-sage transition hover:text-solar-green"
        >
          <span aria-hidden="true">←</span>
          {back.label}
        </Link>
      ) : (
        <Link href="/" className="inline-flex items-center gap-2 text-solar-sage">
          <LogoMark className="h-11 w-11" />
          <span className="font-bold">Green Quest</span>
        </Link>
      )}

      <UserMenu username={username} />
    </header>
  );
}
