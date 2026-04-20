import { cookies } from "next/headers";

const AUTH_COOKIE = "flatpare-auth";
const NAME_COOKIE = "flatpare-name";

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_COOKIE)?.value === "true";
}

export async function setAuthenticated(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, "true", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && !process.env.DISABLE_SECURE_COOKIES,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export async function getDisplayName(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(NAME_COOKIE)?.value ?? null;
}

export async function setDisplayName(name: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(NAME_COOKIE, name, {
    httpOnly: false, // readable by client JS
    secure: process.env.NODE_ENV === "production" && !process.env.DISABLE_SECURE_COOKIES,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function verifyPassword(input: string): boolean {
  return input === process.env.APP_PASSWORD;
}
