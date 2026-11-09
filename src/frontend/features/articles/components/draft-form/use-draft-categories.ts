import { useEffect, useRef, useState } from "react";
import { getDraftCategoriesAction } from "@/backend/articles/draft-category-action/draft-category-action";
import type { DraftOptions } from "@/backend/articles/draft-options/draft-options";
export function useDraftCategories(
  sectionId: string,
  initialSectionId: string,
  initial: DraftOptions["categories"],
  seedKey = 0,
) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({
    sectionId,
    seedKey,
    attempt: 0,
    categories: initial,
    error: false,
    loaded: true,
  });
  const changed = useRef(false);
  const seed = useRef(seedKey);
  // Conflict recovery supplies a fresh catalog seed; otherwise clear old section
  // choices before rendering so they cannot appear under the new section.
  if (state.seedKey !== seedKey) {
    setState({
      sectionId,
      attempt,
      seedKey,
      categories: initial,
      error: false,
      loaded: true,
    });
  } else if (state.sectionId !== sectionId || state.attempt !== attempt) {
    setState({
      sectionId,
      seedKey,
      attempt,
      categories: [],
      error: false,
      loaded: !sectionId,
    });
  }
  useEffect(() => {
    if (seed.current !== seedKey) {
      seed.current = seedKey;
      changed.current = false;
      if (sectionId === initialSectionId) return;
    }
    if (sectionId === initialSectionId && attempt === 0 && !changed.current)
      return;
    changed.current = true;
    if (!sectionId) return;
    // Section changes, retries and recovery seeds can outlive an earlier request.
    // Ignore its response without changing the draft's selected category IDs.
    let cancelled = false;
    getDraftCategoriesAction(sectionId)
      .then((result) => {
        if (!cancelled)
          setState({
            sectionId,
            seedKey,
            attempt,
            categories: result.ok ? result.categories : [],
            error: !result.ok,
            loaded: true,
          });
      })
      .catch(() => {
        if (!cancelled)
          setState({
            sectionId,
            seedKey,
            attempt,
            categories: [],
            error: true,
            loaded: true,
          });
      });
    return () => {
      cancelled = true;
    };
  }, [sectionId, initialSectionId, attempt, seedKey]);
  return {
    categories: state.categories,
    loading: !state.loaded,
    error: state.error,
    retry: () => setAttempt((n) => n + 1),
  };
}
