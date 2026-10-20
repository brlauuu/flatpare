import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, parseBody } from "@/lib/api-route";
import { requireHousehold } from "@/lib/session";
import { saveAccountLocale } from "@/i18n/account-locale";
import { LOCALES } from "@/locales/locales";

// Saves the caller's interface language on their account (#288), so it
// follows them to another device and picks the language of emails sent to
// them. Only ever the caller's row: the user id comes from the session.
// The page itself already changed with the cookie the selector set.
const Body = z.object({ locale: z.enum(LOCALES) });

export async function PUT(req: Request) {
  try {
    const { userId } = await requireHousehold();
    const { locale } = await parseBody(req, Body);
    await saveAccountLocale(userId, locale);
    return NextResponse.json({ locale });
  } catch (e) {
    return apiErrorResponse(e, "account:locale");
  }
}
