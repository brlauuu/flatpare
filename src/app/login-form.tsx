"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Image from "next/image";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ErrorDisplay } from "@/components/error-display";

type ProviderId = "google" | "github" | "credentials";

export function LoginForm({ providers }: { providers: ProviderId[] }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOAuth(provider: "google" | "github") {
    setError(null);
    setLoading(true);
    try {
      await signIn(provider, { callbackUrl: "/apartments" });
    } catch {
      setError("Couldn't reach the sign-in provider.");
      setLoading(false);
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await signIn("credentials", {
      password,
      redirect: false,
      callbackUrl: "/apartments",
    });

    if (!res || res.error) {
      setError("Wrong password");
      setLoading(false);
      return;
    }

    window.location.assign(res.url ?? "/apartments");
  }

  return (
    <div className="relative flex-1 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center space-y-3">
          <Image
            src="/flatpare_logo.svg"
            alt="Flatpare"
            width={180}
            height={56}
            className="h-12 w-auto dark:invert"
            priority
          />
          <p className="text-center text-xs text-muted-foreground">
            Compare apartments together
          </p>
          <p className="text-center text-sm text-muted-foreground pt-2">
            Sign in to continue
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Outside the credentials block on purpose: an OAuth failure sets
              this too, and while it lived inside the password form the error
              was invisible on an OAuth-only deployment. */}
          {error && <ErrorDisplay headline={error} />}
          {providers.includes("google") && (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              disabled={loading}
              onClick={() => handleOAuth("google")}
            >
              Continue with Google
            </Button>
          )}
          {providers.includes("github") && (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              disabled={loading}
              onClick={() => handleOAuth("github")}
            >
              Continue with GitHub
            </Button>
          )}
          {providers.includes("credentials") && (
            <form onSubmit={handlePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  className="h-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoFocus
                />
              </div>
              <Button type="submit" className="h-11 w-full" disabled={loading}>
                {loading ? "Checking..." : "Continue"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* E4 requires the privacy exception to be stated on the landing page,
          not only in the code. This is the one place the encryption story
          admits its limit, so it says plainly what leaves the browser in
          readable form and what does not. Kept as a <details> so the sign-in
          card stays uncluttered while the disclosure is one click away and
          present in the DOM for anyone reading the page or its source.
          E7 (#189) replaces this page with a real landing page; this copy
          moves there with it. */}
      <details className="absolute bottom-4 left-4 right-4 mx-auto max-w-md text-xs text-muted-foreground">
        <summary className="cursor-pointer text-center">
          What Flatpare can and cannot see
        </summary>
        <div className="space-y-2 pt-3">
          <p>
            Your apartments, ratings, notes and saved PDFs are encrypted in
            your browser before they are sent. The server stores ciphertext
            and never holds the key, so nobody running Flatpare can read
            them &mdash; and nobody can recover them for you if you lose both
            your password and your recovery code.
          </p>
          <p>
            Four features are the exception, because they need a third party.
            When you geocode an address, measure a travel time, check whether
            a listing is still online, or extract details from a PDF, that one
            address, URL or file is sent to the server in readable form and
            passed to Google Maps or Google Gemini. It is used for that single
            call, is never written to the database, and is never logged.
            Everything derived from it is encrypted in your browser before it
            is stored.
          </p>
        </div>
      </details>
    </div>
  );
}
