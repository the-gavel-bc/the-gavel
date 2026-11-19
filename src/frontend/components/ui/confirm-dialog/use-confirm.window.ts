// Test double for components whose tests stub the browser's confirm(): the
// same API as useConfirm, answered by a stubbed window.confirm when a test
// installed one and by "yes" otherwise. The real dialog is covered by
// use-confirm.test.tsx.
import type { ConfirmOptions } from "./use-confirm";

export function useConfirm() {
  return {
    confirm: async (options: ConfirmOptions) => {
      const stub = window.confirm as unknown as { mock?: unknown };
      return stub.mock
        ? window.confirm(`${options.title} ${options.message}`)
        : true;
    },
    // Tests answer a note prompt with a fixed note unless confirm is declined.
    ask: async (options: ConfirmOptions) => {
      const stub = window.confirm as unknown as { mock?: unknown };
      return !stub.mock || window.confirm(`${options.title} ${options.message}`)
        ? "Please revise."
        : null;
    },
    confirmDialog: null,
  };
}
