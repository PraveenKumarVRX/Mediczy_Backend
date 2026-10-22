export function corporateDisplayName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*/g, ", ")
    .replace(/[,\s]+$/g, "");
}
export const corporateNameKey = (value) =>
  corporateDisplayName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
