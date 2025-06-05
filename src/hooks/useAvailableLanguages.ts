import { useEffect, useState } from "react";

/**
 * Custom hook to fetch available languages for a given word.
 * @param word The word to fetch languages for.
 * @returns An object with languages, loading, and error state.
 */
export function useAvailableLanguages(word: string) {
  const [languages, setLanguages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!word) {
      setLanguages([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`http://localhost:8000/available-languages?word=${encodeURIComponent(word)}`)
      .then(res => res.json())
      .then(data => setLanguages(data.languages || []))
      .catch(() => setError("Failed to fetch languages."))
      .finally(() => setLoading(false));
  }, [word]);

  return { languages, loading, error };
}
