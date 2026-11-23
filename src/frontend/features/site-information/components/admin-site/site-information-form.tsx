"use client";
import { Button } from "@/frontend/components/ui/button/button";
import { useFieldErrors } from "@/frontend/components/ui/field-errors/use-field-errors";
import { useConfirm } from "@/frontend/components/ui/confirm-dialog/use-confirm";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDraftNavigationGuard } from "@/frontend/components/dashboard/draft-navigation-guard/draft-navigation-guard";
import { saveSiteInformationAction } from "@/backend/site-information/site-information/site-information-actions";
import {
  siteInformationCommandSchema,
  type SiteInformationCommand,
  type SiteInformationResult,
} from "@/shared/site-information/site-information/site-information-command";
import type { SiteInformation } from "@/backend/site-information/site-information/site-information";
const fieldMessages: Record<string, string> = {
  mission:
    "Enter plain text for the mission, up to 5,000 characters. Remove invisible format characters.",
  contactEmail: "Enter a valid contact email address.",
  instagramUrl: "Enter an HTTPS Instagram profile URL.",
  spotifyUrl: "Enter an HTTPS Spotify URL.",
  linkedinUrl: "Enter an HTTPS LinkedIn profile or organization URL.",
  facebookUrl: "Enter an HTTPS Facebook page URL.",
  submissionInstructions:
    "Enter plain text for submission instructions, up to 5,000 characters. Remove invisible format characters.",
};
const messages = {
  invalid_input:
    "Check the field lengths, email and social links. Plain text only.",
  forbidden: "Your administrator access no longer permits this change.",
  conflict:
    "Site information changed elsewhere. Reload to review the latest version.",
  request_conflict: "This request cannot be reused. Reload site information.",
  unavailable:
    "The result is uncertain. Retry the original request to confirm it.",
};
export function SiteInformationForm({
  information,
}: {
  information: SiteInformation;
}) {
  const router = useRouter();
  const fields = useFieldErrors();
  const { confirm, confirmDialog } = useConfirm();
  const [mission, setMission] = useState(information.mission ?? "");
  const [contactEmail, setContactEmail] = useState(
    information.contactEmail ?? "",
  );
  const [instagramUrl, setInstagramUrl] = useState(
    information.instagramUrl ?? "",
  );
  const [spotifyUrl, setSpotifyUrl] = useState(information.spotifyUrl ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(information.linkedinUrl ?? "");
  const [facebookUrl, setFacebookUrl] = useState(information.facebookUrl ?? "");
  const [submissionInstructions, setSubmissionInstructions] = useState(
    information.submissionInstructions ?? "",
  );
  const [version, setVersion] = useState(information.version);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SiteInformationResult | null>(null);
  const [retry, setRetry] = useState<SiteInformationCommand | null>(null);
  const values = JSON.stringify([
    mission,
    contactEmail,
    instagramUrl,
    spotifyUrl,
    linkedinUrl,
    facebookUrl,
    submissionInstructions,
  ]);
  const [acknowledged, setAcknowledged] = useState(values);
  const busy = useRef(false);
  const blocked = pending || Boolean(retry);
  useDraftNavigationGuard(values !== acknowledged || blocked);
  async function run(command: SiteInformationCommand) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setResult(null);
    let next: SiteInformationResult;
    try {
      next = await saveSiteInformationAction(command);
    } catch {
      next = { ok: false, code: "unavailable" };
    }
    setRetry(
      !next.ok && (next.code === "unavailable" || retry !== null)
        ? command
        : null,
    );
    setResult(next);
    setPending(false);
    busy.current = false;
    if (next.ok) {
      setVersion(next.version);
      setAcknowledged(
        JSON.stringify([
          command.mission ?? "",
          command.contactEmail ?? "",
          command.instagramUrl ?? "",
          command.spotifyUrl ?? "",
          command.linkedinUrl ?? "",
          command.facebookUrl ?? "",
          command.submissionInstructions ?? "",
        ]),
      );
      router.refresh();
    }
  }
  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked) return;
    const command = {
      requestId: crypto.randomUUID(),
      expectedVersion: version,
      mission: mission || null,
      contactEmail: contactEmail || null,
      instagramUrl: instagramUrl || null,
      spotifyUrl: spotifyUrl || null,
      linkedinUrl: linkedinUrl || null,
      facebookUrl: facebookUrl || null,
      submissionInstructions: submissionInstructions || null,
    };
    const parsed = siteInformationCommandSchema.safeParse(command);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0]);
        if (Object.hasOwn(fieldMessages, field))
          errors[field] = fieldMessages[field];
      }
      fields.show(event.currentTarget, errors);
      setResult(
        Object.keys(errors).length
          ? null
          : { ok: false, code: "invalid_input" },
      );
      return;
    }
    void run(parsed.data);
  }
  return (
    <form onSubmit={save} noValidate>
      <p>
        Leave a field empty if it is not yet known. Text is plain and may
        include paragraphs.
      </p>
      <label>
        Mission
        <textarea
          {...fields.input("mission")}
          value={mission}
          maxLength={5000}
          rows={5}
          disabled={blocked}
          onChange={(e) => {
            setMission(e.target.value);
            fields.clear("mission");
          }}
        />
      </label>
      <label>
        Contact email
        <input
          type="email"
          {...fields.input("contactEmail")}
          value={contactEmail}
          maxLength={254}
          disabled={blocked}
          onChange={(e) => {
            setContactEmail(e.target.value);
            fields.clear("contactEmail");
          }}
        />
      </label>
      <label>
        Instagram URL
        <input
          type="url"
          {...fields.input("instagramUrl")}
          value={instagramUrl}
          maxLength={255}
          placeholder="https://www.instagram.com/your-account/"
          disabled={blocked}
          onChange={(e) => {
            setInstagramUrl(e.target.value);
            fields.clear("instagramUrl");
          }}
        />
      </label>
      <label>
        Spotify URL
        <input
          type="url"
          {...fields.input("spotifyUrl")}
          value={spotifyUrl}
          maxLength={255}
          placeholder="https://open.spotify.com/show/your-show"
          disabled={blocked}
          onChange={(e) => {
            setSpotifyUrl(e.target.value);
            fields.clear("spotifyUrl");
          }}
        />
      </label>
      <label>
        LinkedIn URL
        <input
          type="url"
          {...fields.input("linkedinUrl")}
          value={linkedinUrl}
          maxLength={255}
          placeholder="https://www.linkedin.com/company/your-page/"
          disabled={blocked}
          onChange={(e) => {
            setLinkedinUrl(e.target.value);
            fields.clear("linkedinUrl");
          }}
        />
      </label>
      <label>
        Facebook URL
        <input
          type="url"
          {...fields.input("facebookUrl")}
          value={facebookUrl}
          maxLength={255}
          placeholder="https://www.facebook.com/your-page"
          disabled={blocked}
          onChange={(e) => {
            setFacebookUrl(e.target.value);
            fields.clear("facebookUrl");
          }}
        />
      </label>
      <label>
        Submission instructions
        <textarea
          {...fields.input("submissionInstructions")}
          value={submissionInstructions}
          maxLength={5000}
          rows={5}
          disabled={blocked}
          onChange={(e) => {
            setSubmissionInstructions(e.target.value);
            fields.clear("submissionInstructions");
          }}
        />
      </label>
      {fields.messages}
      <Button type="submit" disabled={blocked}>
        Save site information
      </Button>
      {pending && <p role="status">Saving site information…</p>}
      {result?.ok && <p role="status">Site information saved.</p>}
      {result && !result.ok && (
        <div role="alert">
          <p>{messages[result.code]}</p>
          {retry && (
            <Button
              variant="secondary"
              type="button"
              disabled={pending}
              onClick={() => void run(retry)}
            >
              Retry original request
            </Button>
          )}
          {["conflict", "request_conflict"].includes(result.code) && (
            <Button
              variant="secondary"
              type="button"
              onClick={async () => {
                if (
                  await confirm({
                    title: "Reload site information?",
                    message: "Unsaved changes will be lost.",
                    confirmLabel: "Reload",
                    cancelLabel: "Keep editing",
                    danger: true,
                  })
                )
                  window.location.reload();
              }}
            >
              Reload site information
            </Button>
          )}
        </div>
      )}
      <noscript>Enable JavaScript to save site information.</noscript>
      {confirmDialog}
    </form>
  );
}
