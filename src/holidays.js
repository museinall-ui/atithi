// Major Indian holidays + tourism-relevant long weekends.
// Used in Rates & inventory to flag dates with likely demand spikes.
//
// Format: ISO date string (YYYY-MM-DD) → { label, intensity, kind }
//   label: short display name
//   intensity: 'high' (Diwali/NY) / 'mid' (regional/religious) / 'low' (govt holiday)
//   kind: 'festival' | 'national' | 'long-weekend' — for filter chips later
//
// Dates for 2026 and 2027 follow the published Government of India holiday
// calendar plus widely-tracked Hindu festival lunar conversions. Update at
// year-end when the next year's calendar is released; can also be made
// hotelier-editable later (Settings → Local holidays) if a property has
// region-specific dates (e.g. Onam in Kerala, Pongal in TN, Bihu in Assam).

export const INDIAN_HOLIDAYS = {
  // ---------- 2026 ----------
  '2026-01-01': { label: "New Year's Day",    intensity: 'high', kind: 'national' },
  '2026-01-14': { label: 'Makar Sankranti',    intensity: 'mid',  kind: 'festival' },
  '2026-01-26': { label: 'Republic Day',       intensity: 'high', kind: 'national' },
  '2026-03-03': { label: 'Holi',               intensity: 'high', kind: 'festival' },
  '2026-03-04': { label: 'Holi (Dhulandi)',    intensity: 'high', kind: 'festival' },
  '2026-03-21': { label: 'Eid-ul-Fitr',        intensity: 'mid',  kind: 'festival' },
  '2026-03-27': { label: 'Ram Navami',         intensity: 'mid',  kind: 'festival' },
  '2026-04-10': { label: 'Good Friday',        intensity: 'mid',  kind: 'national' },
  '2026-05-01': { label: 'May Day',            intensity: 'low',  kind: 'national' },
  '2026-05-28': { label: 'Eid-al-Adha',        intensity: 'mid',  kind: 'festival' },
  '2026-08-15': { label: 'Independence Day',   intensity: 'high', kind: 'national' },
  '2026-08-30': { label: 'Janmashtami',        intensity: 'mid',  kind: 'festival' },
  '2026-09-04': { label: 'Ganesh Chaturthi',   intensity: 'mid',  kind: 'festival' },
  '2026-10-02': { label: 'Gandhi Jayanti',     intensity: 'mid',  kind: 'national' },
  '2026-10-20': { label: 'Dussehra',           intensity: 'high', kind: 'festival' },
  '2026-11-08': { label: 'Diwali',             intensity: 'high', kind: 'festival' },
  '2026-11-09': { label: 'Govardhan Puja',     intensity: 'mid',  kind: 'festival' },
  '2026-11-10': { label: 'Bhai Dooj',          intensity: 'mid',  kind: 'festival' },
  '2026-11-24': { label: 'Guru Nanak Jayanti', intensity: 'mid',  kind: 'festival' },
  '2026-12-25': { label: 'Christmas',          intensity: 'high', kind: 'national' },
  '2026-12-31': { label: "New Year's Eve",     intensity: 'high', kind: 'national' },

  // ---------- 2027 ----------
  '2027-01-01': { label: "New Year's Day",    intensity: 'high', kind: 'national' },
  '2027-01-14': { label: 'Makar Sankranti',    intensity: 'mid',  kind: 'festival' },
  '2027-01-26': { label: 'Republic Day',       intensity: 'high', kind: 'national' },
  '2027-02-22': { label: 'Maha Shivaratri',    intensity: 'mid',  kind: 'festival' },
  '2027-03-22': { label: 'Holi',               intensity: 'high', kind: 'festival' },
  '2027-04-14': { label: 'Ambedkar Jayanti',   intensity: 'low',  kind: 'national' },
  '2027-08-15': { label: 'Independence Day',   intensity: 'high', kind: 'national' },
  '2027-10-02': { label: 'Gandhi Jayanti',     intensity: 'mid',  kind: 'national' },
  '2027-10-09': { label: 'Dussehra',           intensity: 'high', kind: 'festival' },
  '2027-10-28': { label: 'Diwali',             intensity: 'high', kind: 'festival' },
  '2027-12-25': { label: 'Christmas',          intensity: 'high', kind: 'national' },
  '2027-12-31': { label: "New Year's Eve",     intensity: 'high', kind: 'national' },
};

export function holidayFor(iso) {
  return INDIAN_HOLIDAYS[iso] || null;
}
