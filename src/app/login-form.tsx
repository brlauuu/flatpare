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
    <div className="flex-1 flex items-center justify-center p-4">
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
    </div>
  );
}
