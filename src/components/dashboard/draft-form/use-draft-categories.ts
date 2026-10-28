import { useEffect, useRef, useState } from "react";
import { getDraftCategoriesAction } from "@/lib/articles/draft-category-action/draft-category-action";
import type { DraftOptions } from "@/lib/articles/draft-options/draft-options";
export function useDraftCategories(
  sectionId: string,
  initialSectionId: string,
  initial: DraftOptions["categories"],
) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({
    sectionId,
    attempt: 0,
    categories: initial,
    error: false,
    loaded: true,
  });
  const changed = useRef(false);
  if (state.sectionId !== sectionId || state.attempt !== attempt) {
    setState({
      sectionId,
      attempt,
      categories: [],
      error: false,
      loaded: !sectionId,
    });
  }
  useEffect(() => {
    if (sectionId === initialSectionId && attempt === 0 && !changed.current)
      return;
    changed.current = true;
    if (!sectionId) return;
    let cancelled = false;
    getDraftCategoriesAction(sectionId)
      .then((result) => {
        if (!cancelled)
          setState({
            sectionId,
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
            attempt,
            categories: [],
            error: true,
            loaded: true,
          });
      });
    return () => {
      cancelled = true;
    };
  }, [sectionId, initialSectionId, attempt]);
  return {
    categories: state.categories,
    loading: !state.loaded,
    error: state.error,
    retry: () => setAttempt((n) => n + 1),
  };
}
