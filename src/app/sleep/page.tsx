"use client";

import { useEffect, useMemo, useState } from "react";
import { User } from "firebase/auth";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AppShell from "@/components/AppShell";
import common from "../common.module.css";
import { db } from "@/lib/firebase";
import { SleepLog, SleepQuality } from "@/lib/types";
import { SLEEP_QUALITY_OPTIONS, formatDate, sleepQualityScore } from "@/lib/fitness";

function SleepContent({ user }: { user: User }) {
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [hours, setHours] = useState("7.5");
  const [quality, setQuality] = useState<SleepQuality>("good");
  const [notes, setNotes] = useState("");
  const [logs, setLogs] = useState<SleepLog[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadLogs() {
    if (!db) return;
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "users", user.uid, "sleepLogs"));
      const rows = snap.docs.map((d) => d.data() as SleepLog);
      setLogs(rows);
      const existing = rows.find((r) => r.date === selectedDate);
      if (existing) {
        setHours(String(existing.hours));
        setQuality(existing.quality);
        setNotes(existing.notes || "");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadLogs(); }, [user.uid, selectedDate]);

  const chartData = useMemo(() => {
    return logs
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30)
      .map((log) => ({
        date: log.date.slice(5),
        hours: log.hours,
        quality: sleepQualityScore(log.quality),
      }));
  }, [logs]);

  async function handleSave() {
    if (!db) return;
    setError("");
    setMessage("");
    const hoursValue = Number(hours);
    if (!Number.isFinite(hoursValue) || hoursValue <= 0 || hoursValue > 24) {
      setError("Hours must be between 0 and 24.");
      return;
    }
    const payload: SleepLog = {
      date: selectedDate,
      hours: hoursValue,
      quality,
      notes: notes.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, "users", user.uid, "sleepLogs", selectedDate), payload, { merge: true });
    setMessage("Sleep log saved.");
    void loadLogs();
  }

  return (
    <>
      <section className={common.card}>
        <h2>Sleep Tracker</h2>
        <p className={common.muted}>Log your nightly sleep hours and quality. Ideal for spotting recovery patterns.</p>
        <div className={common.formGrid}>
          <label>
            Date
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          </label>
          <label>
            Hours slept
            <input type="number" step="0.5" min="0" max="24" value={hours} onChange={(e) => setHours(e.target.value)} />
          </label>
          <label>
            Sleep quality
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              {SLEEP_QUALITY_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setQuality(option)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 9,
                    border: "none",
                    cursor: "pointer",
                    background: quality === option ? "#0f766e" : "#eef2f7",
                    color: quality === option ? "white" : "#1f2937",
                    textTransform: "capitalize",
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          </label>
          <label>
            Notes (optional)
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        <div className={common.ctaRow}>
          <button className={common.primaryBtn} onClick={handleSave} disabled={loading}>Save sleep log</button>
        </div>
        {message && <p className={common.success}>{message}</p>}
        {error && <p className={common.error}>{error}</p>}
      </section>

      <section className={common.card}>
        <h3>Sleep history (last 30 nights)</h3>
        {chartData.length === 0 ? (
          <p className={common.muted}>No sleep logs yet. Start logging above.</p>
        ) : (
          <div className={common.chartWrap}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <XAxis dataKey="date" />
                <YAxis yAxisId="left" label={{ value: "hrs", angle: -90, position: "insideLeft" }} />
                <YAxis yAxisId="right" orientation="right" label={{ value: "quality", angle: 90, position: "insideRight" }} />
                <Tooltip />
                <Bar yAxisId="left" dataKey="hours" fill="#0f766e" name="Hours slept" />
                <Bar yAxisId="right" dataKey="quality" fill="#b45309" name="Quality (1-4)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className={common.card}>
        <h3>Recent sleep logs</h3>
        <div className={common.listBox}>
          {logs.length === 0 && <p className={common.muted}>No entries yet.</p>}
          {logs
            .slice()
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 14)
            .map((log) => (
              <div key={log.date} className={common.rowCard}>
                <strong>{log.date}</strong>
                <span>{log.hours} hrs — {log.quality}</span>
                {log.notes && <span className={common.muted}>{log.notes}</span>}
              </div>
            ))}
        </div>
      </section>
    </>
  );
}

export default function SleepPage() {
  return (
    <AppShell title="Sleep" subtitle="Track nightly hours and quality to understand your recovery.">
      {(user) => <SleepContent user={user} />}
    </AppShell>
  );
}
