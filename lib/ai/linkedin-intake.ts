export const linkedInService = "LinkedIn Profile Optimization";
export const linkedInFields = [
  { key: "goal", label: "Main LinkedIn goal", limit: 120 },
  { key: "target", label: "Target role or industry", limit: 200 },
  { key: "market", label: "Target market", limit: 120 },
  { key: "profile", label: "Current headline, About, or experience", limit: 6000 },
  { key: "achievements", label: "Achievements you can substantiate", limit: 2500 },
  { key: "tone", label: "Preferred tone", limit: 120 },
] as const;

type Field = typeof linkedInFields[number]["key"];
export type LinkedInIntake = Partial<Record<Field, string>>;
const marker = "\n\n[CareerDev LinkedIn intake]\n";

export function formatLinkedInRequest(request: string, intake: LinkedInIntake) {
  const values = Object.fromEntries(linkedInFields.flatMap(({ key, label, limit }) => {
    const value = intake[key]?.trim().slice(0, limit);
    return value ? [[label, value]] : [];
  }));
  return request.trim() + (Object.keys(values).length ? marker + JSON.stringify(values) : "");
}

export function restoreLinkedInRequest(saved: string): { request: string; intake: LinkedInIntake } {
  const start = saved.lastIndexOf(marker);
  if (start >= 0) {
    try {
      const values: unknown = JSON.parse(saved.slice(start + marker.length));
      if (values && typeof values === "object" && !Array.isArray(values)) {
        const intake: LinkedInIntake = {};
        for (const { key, label, limit } of linkedInFields) {
          const value = (values as Record<string, unknown>)[label];
          if (typeof value === "string") intake[key] = value.slice(0, limit);
        }
        if (Object.keys(intake).length) return { request: saved.slice(0, start), intake };
      }
    } catch {
      // The request text can contain a literal marker supplied by the user.
    }
  }
  return { request: saved, intake: {} };
}
