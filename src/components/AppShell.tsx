"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import styles from "./AppShell.module.css";
import AppFooterNav from "./AppFooterNav";

interface AppShellProps {
  title: string;
  subtitle: string;
  description?: string;
  children: (user: User) => ReactNode;
}

export default function AppShell({ title, subtitle, description, children }: AppShellProps) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      setError("Firebase auth is not configured.");
      return;
    }
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  async function handleEmailAuth(event: FormEvent) {
    event.preventDefault();
    if (!auth) return;
    setError("");
    try {
      if (mode === "signup") {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError((err as Error).message || "Unable to authenticate.");
    }
  }

  async function handleGoogleAuth() {
    if (!auth) return;
    setError("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      setError((err as Error).message || "Google sign-in failed.");
    }
  }

  if (authLoading) {
    return <main className={styles.loading}>Loading app...</main>;
  }

  if (!user) {
    return (
      <main className={styles.wrapper}>
        <section className={styles.hero}>
          <h1>{title}</h1>
          <p>{subtitle}</p>
          {description && <p className={styles.description}>{description}</p>}
        </section>

        <section className={styles.authCard}>
          <h2>Sign in</h2>
          <button className={styles.primaryBtn} onClick={handleGoogleAuth}>Continue with Google</button>
          <form onSubmit={handleEmailAuth} className={styles.authForm}>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Password
              <input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <button type="submit" className={styles.secondaryBtn}>
              {mode === "signup" ? "Create account" : "Login with email"}
            </button>
          </form>
          <button className={styles.linkBtn} onClick={() => setMode((m) => (m === "login" ? "signup" : "login"))}>
            {mode === "login" ? "Need an account? Sign up" : "Already have an account? Login"}
          </button>
          {error && <p className={styles.error}>{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className={styles.wrapper}>
      <section className={styles.hero}>
        <h1>{title}</h1>
        <p>{subtitle}</p>
        {description && <p className={styles.description}>{description}</p>}
      </section>
      <section className={styles.topBar}>
        <div>
          <strong>{user.displayName || user.email}</strong>
          <p>{user.email}</p>
        </div>
        <div className={styles.rightActions}>
          <Link href="/profile" className={styles.profileIconLink} aria-label="Open profile">
            {user.photoURL ? (
              <Image
                src={user.photoURL}
                alt="Profile"
                width={36}
                height={36}
                className={styles.avatarImage}
                unoptimized
              />
            ) : (
              <span className={styles.avatarFallback} aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" />
                </svg>
              </span>
            )}
          </Link>
          <button className={styles.linkBtn} onClick={() => { if (auth) void signOut(auth); }}>Sign out</button>
        </div>
      </section>
      <section className={styles.pageContent}>{children(user)}</section>
      <AppFooterNav />
    </main>
  );
}
