"use client";

import { useEffect, useRef, useState } from "react";
import { User, updateProfile } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import Image from "next/image";
import AppShell from "@/components/AppShell";
import common from "../common.module.css";
import { auth, db, storage } from "@/lib/firebase";
import { BiologicalSex, Profile, WeightUnit } from "@/lib/types";

function ProfileContent({ user }: { user: User }) {
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [sex, setSex] = useState<BiologicalSex>("male");
  const [age, setAge] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [defaultWeightUnit, setDefaultWeightUnit] = useState<WeightUnit>("lb");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(user.photoURL || "");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadProfile() {
      if (!db) return;
      const snap = await getDoc(doc(db, "users", user.uid, "profile", "main"));
      if (snap.exists()) {
        const data = snap.data() as Profile;
        if (data.displayName) setDisplayName(data.displayName);
        if (data.sex) setSex(data.sex);
        if (data.age) setAge(String(data.age));
        if ((data as Profile & { heightCm?: number }).heightCm) setHeightCm(String((data as Profile & { heightCm?: number }).heightCm));
        if (data.defaultWeightUnit) setDefaultWeightUnit(data.defaultWeightUnit);
        if (data.profilePhotoUrl) setProfilePhotoUrl(data.profilePhotoUrl);
      }
    }
    void loadProfile();
  }, [user.uid]);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Photo must be under 5 MB.");
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    if (!db) return;
    setError("");
    setMessage("");
    setLoading(true);
    try {
      let photoUrl = profilePhotoUrl;

      if (photoFile && storage) {
        const storageRef = ref(storage, `users/${user.uid}/profile/photo`);
        await uploadBytes(storageRef, photoFile);
        photoUrl = await getDownloadURL(storageRef);
        setProfilePhotoUrl(photoUrl);
        setPhotoPreview(null);
        setPhotoFile(null);
      }

      if (auth?.currentUser && displayName.trim()) {
        await updateProfile(auth.currentUser, { displayName: displayName.trim(), photoURL: photoUrl || null });
      }

      const payload: Profile & { heightCm?: number } = {
        displayName: displayName.trim() || undefined,
        sex,
        age: Number(age) || 0,
        heightCm: Number(heightCm) || undefined,
        defaultWeightUnit,
        profilePhotoUrl: photoUrl || undefined,
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, "users", user.uid, "profile", "main"), payload, { merge: true });
      setMessage("Profile saved.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const avatarSrc = photoPreview || profilePhotoUrl;

  return (
    <>
      <section className={common.card} style={{ maxWidth: 560 }}>
        <h2>Your Profile</h2>
        <p className={common.muted}>Update your personal details, goals, and profile photo.</p>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, margin: "16px 0" }}>
          {avatarSrc ? (
            <Image src={avatarSrc} alt="Profile photo" width={96} height={96} style={{ borderRadius: "50%", objectFit: "cover", border: "3px solid #0f766e" }} unoptimized />
          ) : (
            <div style={{ width: 96, height: 96, borderRadius: "50%", background: "#eef2f7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, color: "#9ca3af", border: "3px solid #e5e7eb" }}>
              {displayName?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || "?"}
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoChange} />
          <button type="button" className={common.secondaryBtn} onClick={() => fileInputRef.current?.click()}>
            {avatarSrc ? "Change photo" : "Upload photo"}
          </button>
        </div>

        <div className={common.formGrid}>
          <label>
            Display name
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={user.email || ""} />
          </label>
          <label>
            Age
            <input type="number" value={age} onChange={(e) => setAge(e.target.value)} min="0" max="120" />
          </label>
          <label>
            Height (cm)
            <input type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} min="0" max="300" />
          </label>
          <label>
            Biological sex
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              {(["male", "female"] as BiologicalSex[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSex(s)}
                  style={{
                    flex: 1, padding: "8px", border: "none", borderRadius: 9, cursor: "pointer",
                    background: sex === s ? "#0f766e" : "#eef2f7",
                    color: sex === s ? "white" : "#1f2937",
                    textTransform: "capitalize",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </label>
          <label>
            Default weight unit
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              {(["lb", "kg"] as WeightUnit[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setDefaultWeightUnit(u)}
                  style={{
                    flex: 1, padding: "8px", border: "none", borderRadius: 9, cursor: "pointer",
                    background: defaultWeightUnit === u ? "#0f766e" : "#eef2f7",
                    color: defaultWeightUnit === u ? "white" : "#1f2937",
                  }}
                >
                  {u}
                </button>
              ))}
            </div>
          </label>
        </div>

        <div className={common.ctaRow}>
          <button className={common.primaryBtn} onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Save profile"}
          </button>
        </div>
        {message && <p className={common.success}>{message}</p>}
        {error && <p className={common.error}>{error}</p>}
      </section>
    </>
  );
}

export default function ProfilePage() {
  return (
    <AppShell title="Profile" subtitle="Manage your personal details and appearance.">
      {(user) => <ProfileContent user={user} />}
    </AppShell>
  );
}
