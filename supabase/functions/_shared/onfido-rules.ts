// Which Onfido applicant a check may be started for. Pure TypeScript (no Deno
// APIs), so the front-end tests can import it.
//
// Always the caller's own applicant (profiles.onfido_applicant_id). A body
// that names a different applicant is refused: otherwise any signed-in member
// could start a check on someone else's applicant.

export type SubmitApplicant =
  | { ok: true; applicantId: string }
  | { ok: false; reason: "not_allowed" | "bad_input" };

export const submitApplicant = (bodyApplicantId: unknown, ownApplicantId: string | null | undefined): SubmitApplicant => {
  const own = typeof ownApplicantId === "string" && ownApplicantId.trim() ? ownApplicantId.trim() : null;
  const sent = typeof bodyApplicantId === "string" && bodyApplicantId.trim() ? bodyApplicantId.trim() : null;
  if (bodyApplicantId !== undefined && bodyApplicantId !== null && typeof bodyApplicantId !== "string") {
    return { ok: false, reason: "bad_input" };
  }
  if (sent && sent !== own) return { ok: false, reason: "not_allowed" };
  if (!own) return { ok: false, reason: "bad_input" };
  return { ok: true, applicantId: own };
};
