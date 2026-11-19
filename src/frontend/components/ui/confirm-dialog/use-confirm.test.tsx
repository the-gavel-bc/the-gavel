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

function NoteHarness() {
  const { ask, confirmDialog } = useConfirm();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          void ask({
            title: "Return draft?",
            message: "Explain what needs changing.",
            noteLabel: "Note to the author",
            noteMax: 20,
            cancelLabel: "Cancel",
          })
        }
      >
        Return
      </button>
      {confirmDialog}
    </>
  );
}

it("keeps a typed note on backdrop clicks and allows explicit cancel", async () => {
  render(<NoteHarness />);
  const opener = screen.getByRole("button", { name: "Return" });
  await userEvent.click(opener);
  const note = screen.getByRole("textbox", { name: "Note to the author" });
  await userEvent.type(note, "Revise the lede");
  const dialog = screen.getByRole("alertdialog");
  await userEvent.click(dialog.parentElement!);
  expect(note).toHaveValue("Revise the lede");
  expect(note).toHaveAccessibleDescription("15 of 20 characters");
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
});
