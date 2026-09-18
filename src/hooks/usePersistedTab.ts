import { useEffect, useMemo, useState } from 'react';

function readStoredTab<T extends string>(
  storageKey: string,
  defaultValue: T,
  validValues?: readonly T[],
): T {
  if (typeof window === 'undefined') return defaultValue;

  try {
    const storedValue = window.localStorage.getItem(storageKey);
    if (!storedValue) return defaultValue;
    if (validValues && !validValues.includes(storedValue as T)) return defaultValue;
    return storedValue as T;
  } catch {
    return defaultValue;
  }
}

export function usePersistedTab<T extends string>(
  storageKey: string,
  defaultValue: T,
  validValues?: readonly T[],
) {
  const validValuesKey = useMemo(() => validValues?.join('|') ?? '', [validValues]);
  const [value, setValue] = useState<T>(() => readStoredTab(storageKey, defaultValue, validValues));

  useEffect(() => {
    setValue(readStoredTab(storageKey, defaultValue, validValues));
  }, [defaultValue, storageKey, validValuesKey]);

  useEffect(() => {
    if (validValues && !validValues.includes(value)) {
      setValue(defaultValue);
      return;
    }

    if (typeof window === 'undefined') return;

    try {
      window.localStorage.setItem(storageKey, value);
    } catch {
      // Ignore storage errors in private mode or restricted environments
    }
  }, [defaultValue, storageKey, validValues, validValuesKey, value]);

  const setValueAsString = (v: T | ((prev: T) => T) | string) => {
    setValue(v as T);
  };

  return [value, setValueAsString] as const;
}
