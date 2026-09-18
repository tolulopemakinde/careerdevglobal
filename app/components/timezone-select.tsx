'use client';

import { useMemo } from "react";

const FALLBACK_TIMEZONES = [
  "UTC","Africa/Abidjan","Africa/Cairo","Africa/Johannesburg","Africa/Lagos","Africa/Nairobi",
  "America/Chicago","America/Denver","America/Los_Angeles","America/New_York","America/Toronto",
  "Asia/Dubai","Asia/Hong_Kong","Asia/Kolkata","Asia/Singapore","Asia/Tokyo",
  "Australia/Sydney","Europe/Amsterdam","Europe/Berlin","Europe/London","Europe/Paris",
  "Pacific/Auckland","Pacific/Honolulu"
];

export default function TimezoneSelect({
  value,
  onChange,
  label = "Timezone",
  required = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
}) {
  const timezones = useMemo(() => {
    const supported = typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : FALLBACK_TIMEZONES;
    return Array.from(new Set(["UTC", ...supported, ...FALLBACK_TIMEZONES])).sort((a, b) => a.localeCompare(b));
  }, []);

  return (
    <label className="timezone-select-field">
      {label}{required ? " *" : ""}
      <select value={value} onChange={e => onChange(e.target.value)} required={required}>
        <option value="">Select timezone</option>
        {value && !timezones.includes(value) && <option value={value}>{value}</option>}
        {timezones.map(timezone => <option value={timezone} key={timezone}>{timezone}</option>)}
      </select>
    </label>
  );
}
