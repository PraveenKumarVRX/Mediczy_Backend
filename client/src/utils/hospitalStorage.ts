type HospitalStoreValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

const resolveHospitalScope = () => {
  if (typeof window === "undefined") return "default";
  const raw = window.localStorage.getItem("hospitalData");
  if (!raw) return "default";
  try {
    const parsed = JSON.parse(raw);
    return String(
      parsed?.id ||
        parsed?.hospitalId ||
        parsed?.hospital_id ||
        parsed?.name ||
        "default"
    );
  } catch {
    return "default";
  }
};

const buildKey = (key: string) => `hospital:${resolveHospitalScope()}:${key}`;

export const loadHospitalStore = <T extends HospitalStoreValue>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(buildKey(key));
  if (!stored) return fallback;
  try {
    return JSON.parse(stored) as T;
  } catch {
    return fallback;
  }
};

export const saveHospitalStore = (key: string, value: HospitalStoreValue) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(buildKey(key), JSON.stringify(value));
};
