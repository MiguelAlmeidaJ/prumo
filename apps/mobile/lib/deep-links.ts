import type { MembershipRole } from "@prumo/contracts";
import type { Href } from "expo-router";

const uuid = "[0-9a-f-]+";

export function safeActionRoute(
  actionUrl: string | null | undefined,
  role?: MembershipRole,
): Href | null {
  if (!actionUrl) return null;
  let path = actionUrl;
  try {
    if (actionUrl.includes("://")) {
      const parsed = new URL(actionUrl);
      path = `/${parsed.host}${parsed.pathname}`;
    }
  } catch {
    return null;
  }
  const studentDirect = [
    new RegExp(
      `^/\\(student\\)/(lessons|exams|documents|processes)/${uuid}$`,
      "i",
    ),
    new RegExp(
      `^/\\(student\\)/financial/(contracts|installments|payments)/${uuid}$`,
      "i",
    ),
    /^\/\(student\)\/notifications$/,
  ];
  if (
    role === "STUDENT" &&
    studentDirect.some((pattern) => pattern.test(path))
  ) {
    return path as Href;
  }
  const instructorDirect = [
    new RegExp(
      `^/\\(instructor\\)/(lessons|students|vehicles)/${uuid}$`,
      "i",
    ),
    new RegExp(
      `^/\\(instructor\\)/theoretical-classes/${uuid}$`,
      "i",
    ),
    /^\/\(instructor\)\/notifications$/,
  ];
  if (
    role === "INSTRUCTOR" &&
    instructorDirect.some((pattern) => pattern.test(path))
  ) {
    return path as Href;
  }

  const practical = path.match(new RegExp(`^/practical-lessons/(${uuid})$`, "i"));
  if (practical && (role === "STUDENT" || role === "INSTRUCTOR")) {
    return `/${role === "STUDENT" ? "(student)" : "(instructor)"}/lessons/${practical[1]}` as Href;
  }
  const process = path.match(new RegExp(`^/processes/(${uuid})$`, "i"));
  if (process && role === "STUDENT") return `/(student)/processes/${process[1]}` as Href;
  const exam = path.match(new RegExp(`^/exams/(${uuid})$`, "i"));
  if (exam && role === "STUDENT") return `/(student)/exams/${exam[1]}` as Href;
  const contract = path.match(new RegExp(`^/contracts/(${uuid})$`, "i"));
  if (contract && role === "STUDENT") return `/(student)/financial/contracts/${contract[1]}` as Href;
  const theoretical = path.match(new RegExp(`^/theoretical-classes/(${uuid})$`, "i"));
  if (theoretical && role === "INSTRUCTOR") {
    return `/(instructor)/theoretical-classes/${theoretical[1]}` as Href;
  }
  if (path === "/notifications") {
    return `/${role === "INSTRUCTOR" ? "(instructor)" : "(student)"}/notifications` as Href;
  }
  if (path.startsWith("/financial") && role === "STUDENT") {
    return "/(student)/financial" as Href;
  }
  return null;
}
