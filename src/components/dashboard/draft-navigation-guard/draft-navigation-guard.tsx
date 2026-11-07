"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
type GuardContext = {
  register: (check: () => boolean) => () => void;
  leave: () => boolean;
};
const Context = createContext<GuardContext | null>(null);
const allow = () => true;
export function DraftNavigationProvider({ children }: { children: ReactNode }) {
  const check = useRef<(() => boolean) | null>(null);
  const register = useCallback((next: () => boolean) => {
    check.current = next;
    return () => {
      if (check.current === next) check.current = null;
    };
  }, []);
  const leave = useCallback(
    () =>
      !check.current?.() ||
      window.confirm(
        "You have unsaved or unconfirmed changes. Leave this page? Input kept only in this tab may be lost.",
      ),
    [],
  );
  const value = useMemo(() => ({ register, leave }), [register, leave]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useDraftLeaveCheck() {
  return useContext(Context)?.leave ?? allow;
}
export function useDraftNavigationGuard(shouldWarn: boolean) {
  const context = useContext(Context);
  useEffect(() => {
    if (!shouldWarn) return;
    const cleanup = context?.register(() => true);
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      cleanup?.();
      window.removeEventListener("beforeunload", warn);
    };
  }, [context, shouldWarn]);
}
