const STORAGE_KEY = "nairashield.waitlist.v1";

export type WaitlistEntry = {
  email: string;
  joinedAt: string;
};

function readAll(): WaitlistEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WaitlistEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: WaitlistEntry[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function getWaitlistEntry(email?: string): WaitlistEntry | null {
  const list = readAll();
  if (email) {
    return list.find((e) => e.email.toLowerCase() === email.trim().toLowerCase()) ?? null;
  }
  // most recent
  return list[list.length - 1] ?? null;
}

export function hasJoinedWaitlist(): boolean {
  return readAll().length > 0;
}

/** Persist email locally. Returns "new" | "exists". */
export function joinWaitlist(email: string): "new" | "exists" {
  const cleaned = email.trim().toLowerCase();
  const list = readAll();
  if (list.some((e) => e.email === cleaned)) return "exists";
  list.push({ email: cleaned, joinedAt: new Date().toISOString() });
  writeAll(list);
  return "new";
}

/**
 * Optional: POST to an external form endpoint when PUBLIC_WAITLIST_URL is set
 * (Formspree, Basin, Getform, etc.). Failures are silent - local save still counts.
 */
export async function submitWaitlistRemote(email: string): Promise<void> {
  const url = (import.meta.env.PUBLIC_WAITLIST_URL as string | undefined)?.trim();
  if (!url) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), source: "nairashield-web" }),
    });
  } catch {
    // offline / CORS - local list is source of truth for the demo
  }
}
