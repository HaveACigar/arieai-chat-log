"use client";

import { useEffect, useMemo, useState } from "react";
import { User } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import AppShell from "@/components/AppShell";
import common from "../common.module.css";
import { db } from "@/lib/firebase";
import { DailyLog, SleepLog, WorkoutLog } from "@/lib/types";
import { calculateBmi, calculateEstimatedOneRepMax, formatGoalLabel, sleepQualityScore, toKg } from "@/lib/fitness";

type LeaderboardTab = "weight" | "workouts" | "sleep";

function LeaderboardContent({ user }: { user: User }) {
  const [tab, setTab] = useState<LeaderboardTab>("weight");
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [sleepLogs, setSleepLogs] = useState<SleepLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      if (!db) return;
      setLoading(true);
      try {
        const [dailySnap, workSnap, sleepSnap] = await Promise.all([
          getDocs(collection(db, "users", user.uid, "dailyLogs")),
          getDocs(collection(db, "users", user.uid, "workoutLogs")),
          getDocs(collection(db, "users", user.uid, "sleepLogs")),
        ]);
        setDailyLogs(dailySnap.docs.map((d) => d.data() as DailyLog));
        setWorkoutLogs(workSnap.docs.map((d) => d.data() as WorkoutLog));
        setSleepLogs(sleepSnap.docs.map((d) => d.data() as SleepLog));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [user.uid]);

  const weightBoard = useMemo(() => {
    const sorted = dailyLogs.slice().sort((a, b) => a.date.localeCompare(b.date));
    const rows: Array<{ label: string; value: string }> = [];
    if (sorted.length >= 2) {
      const startKg = toKg(sorted[0].weight, sorted[0].weightUnit);
      const latestKg = toKg(sorted[sorted.length - 1].weight, sorted[sorted.length - 1].weightUnit);
      const delta = latestKg - startKg;
      rows.push({ label: "Net bodyweight change", value: `${delta > 0 ? "+" : ""}${delta.toFixed(1)} kg` });
    }
    const lowestBmi = sorted.reduce<{ bmi: number; date: string } | null>((best, log) => {
      const bmi = calculateBmi(toKg(log.weight, log.weightUnit), log.heightCm || 188);
      return !best || bmi < best.bmi ? { bmi, date: log.date } : best;
    }, null);
    if (lowestBmi) rows.push({ label: "Lowest recorded BMI", value: `${lowestBmi.bmi} on ${lowestBmi.date}` });
    const topBurn = sorted.slice().sort((a, b) => (b.totalExerciseCalories || 0) - (a.totalExerciseCalories || 0))[0];
    if (topBurn && topBurn.totalExerciseCalories) {
      rows.push({ label: "Peak exercise-burn day", value: `${topBurn.totalExerciseCalories} kcal on ${topBurn.date}` });
    }
    const goalSpread = sorted.reduce<Record<string, number>>((acc, log) => {
      const label = formatGoalLabel(log.goalType);
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});
    const topMode = Object.entries(goalSpread).sort((a, b) => b[1] - a[1])[0];
    if (topMode) rows.push({ label: "Most used diet mode", value: `${topMode[0]} — ${topMode[1]} days` });
    return rows;
  }, [dailyLogs]);

  const workoutBoard = useMemo(() => {
    const prMap = new Map<string, number>();
    workoutLogs.forEach((log) => {
      log.entries.forEach((entry) => {
        const orm = calculateEstimatedOneRepMax(entry.weight, entry.reps);
        if (!prMap.has(entry.exercise) || orm > prMap.get(entry.exercise)!) {
          prMap.set(entry.exercise, orm);
        }
      });
    });
    const topVolumeDay = workoutLogs.slice().sort((a, b) => (b.totalVolume || 0) - (a.totalVolume || 0))[0];
    const prs = Array.from(prMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([exercise, orm]) => ({ label: `PR — ${exercise}`, value: `Est. 1RM: ${orm} lb` }));
    return [
      topVolumeDay ? { label: "Highest volume session", value: `${topVolumeDay.totalVolume} lb on ${topVolumeDay.date}` } : null,
      ...prs,
    ].filter(Boolean) as Array<{ label: string; value: string }>;
  }, [workoutLogs]);

  const sleepBoard = useMemo(() => {
    const sorted = sleepLogs.slice().sort((a, b) => a.date.localeCompare(b.date));
    if (!sorted.length) return [];
    const avg = sorted.reduce((sum, l) => sum + l.hours, 0) / sorted.length;
    const bestQuality = sorted.slice().sort((a, b) => sleepQualityScore(b.quality) - sleepQualityScore(a.quality))[0];
    const longestNight = sorted.slice().sort((a, b) => b.hours - a.hours)[0];
    return [
      { label: "Average hours slept", value: `${avg.toFixed(1)} hrs` },
      { label: "Longest night", value: `${longestNight.hours} hrs on ${longestNight.date}` },
      { label: "Best quality night", value: `${bestQuality.quality} on ${bestQuality.date}` },
    ];
  }, [sleepLogs]);

  const currentBoard = tab === "weight" ? weightBoard : tab === "workouts" ? workoutBoard : sleepBoard;

  const TABS: Array<{ key: LeaderboardTab; label: string }> = [
    { key: "weight", label: "Weight / BMI" },
    { key: "workouts", label: "Workout PRs" },
    { key: "sleep", label: "Sleep" },
  ];

  return (
    <>
      <section className={common.card}>
        <h2>Personal Leaderboards</h2>
        <p className={common.muted}>Your personal bests and trends tracked across all saved logs.</p>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              style={{
                padding: "8px 14px", border: "none", borderRadius: 9, cursor: "pointer",
                background: tab === key ? "#0f766e" : "#eef2f7",
                color: tab === key ? "white" : "#1f2937",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className={common.muted}>Loading...</p>
        ) : currentBoard.length === 0 ? (
          <p className={common.muted} style={{ marginTop: 12 }}>No data yet for this category. Start logging to populate this board.</p>
        ) : (
          <div className={common.listBox} style={{ marginTop: 14 }}>
            {currentBoard.map((row) => (
              <div key={row.label} className={common.rowCard}>
                <strong>{row.label}</strong>
                <span>{row.value}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export default function LeaderboardPage() {
  return (
    <AppShell
      title="Leaderboard"
      subtitle="Your personal bests across weight, workouts, and sleep."
      description="Use this page to review your top personal stats. It summarizes best outcomes so you can spot what is improving over time."
    >
      {(user) => <LeaderboardContent user={user} />}
    </AppShell>
  );
}
