import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { useConfirm } from "./use-confirm";

function Harness({ onAnswer }: { onAnswer: (answer: boolean) => void }) {
  const { confirm, confirmDialog } = useConfirm();
  return (
    <>
      <button
        type="button"
        onClick={async () =>
          onAnswer(
            await confirm({
              title: "Delete it?",
              message: "This cannot be undone.",
              confirmLabel: "Delete",
              danger: true,
            }),
          )
        }
      >
        Ask
      </button>
      {confirmDialog}
    </>
  );
}

it("answers yes, no, Escape and backdrop, and returns focus", async () => {
  const answers: boolean[] = [];
  render(<Harness onAnswer={(answer) => answers.push(answer)} />);
  const ask = screen.getByRole("button", { name: "Ask" });
  await userEvent.click(ask);
  expect(screen.getByRole("alertdialog", { name: "Delete it?" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Keep editing" })).toHaveFocus();
  await userEvent.click(screen.getByRole("button", { name: "Delete" }));
  await userEvent.click(ask);
  await userEvent.keyboard("{Escape}");
  expect(ask).toHaveFocus();
  await userEvent.click(ask);
  await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(answers).toEqual([true, false, false]);
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});
