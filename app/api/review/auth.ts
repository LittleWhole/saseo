import type { NextRequest } from "next/server";

export function isReviewAuthorized(request: NextRequest) {
  const expected = process.env.SASEO_REVIEW_TOKEN;
  if (!expected) return false;

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  return token.length > 0 && token === expected;
}
