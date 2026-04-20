"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
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
  children: (user: User) => ReactNode;
}

export default function AppShell({ title, subtitle, children }: AppShellProps) {
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
      </section>
      <section className={styles.topBar}>
        <div>
          <strong>{user.displayName || user.email}</strong>
          <p>{user.email}</p>
        </div>
        <button className={styles.linkBtn} onClick={() => { if (auth) void signOut(auth); }}>Sign out</button>
      </section>
      <section className={styles.pageContent}>{children(user)}</section>
      <AppFooterNav />
    </main>
  );
}
