"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./AppShell.module.css";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/workouts", label: "Workouts" },
  { href: "/nutrition", label: "Nutrition" },
  { href: "/sleep", label: "Sleep" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/profile", label: "Profile" },
];

export default function AppFooterNav() {
  const pathname = usePathname();

  return (
    <footer className={styles.footerNav}>
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={pathname === link.href ? styles.navLinkActive : styles.navLink}
        >
          {link.label}
        </Link>
      ))}
    </footer>
  );
}
