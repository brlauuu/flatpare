"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"password" | "name">("password");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [existingUsers, setExistingUsers] = useState<string[]>([]);
  const [showNewUserInput, setShowNewUserInput] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (step === "name") {
      fetch("/api/auth/users")
        .then((res) => res.json())
        .then((users: string[]) => {
          setExistingUsers(users);
          if (users.length === 0) setShowNewUserInput(true);
        })
        .catch(() => setShowNewUserInput(true));
    }
  }, [step]);

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      setError("Wrong password");
      setLoading(false);
      return;
    }

    setLoading(false);
    setStep("name");
  }

  async function selectUser(name: string) {
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: name }),
    });

    if (!res.ok) {
      setError("Failed to set name");
      setLoading(false);
      return;
    }

    router.push("/apartments");
  }

  async function handleNewName(e: React.FormEvent) {
    e.preventDefault();
    await selectUser(displayName.trim());
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
            {step === "password"
              ? "Enter the password to continue"
              : "Who are you?"}
          </p>
        </CardHeader>
        <CardContent>
          {step === "password" ? (
            <form onSubmit={handlePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoFocus
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Checking..." : "Continue"}
              </Button>
            </form>
          ) : (
            <div className="space-y-3">
              {existingUsers.length > 0 && !showNewUserInput && (
                <>
                  <div className="space-y-2">
                    {existingUsers.map((name) => (
                      <Button
                        key={name}
                        variant="outline"
                        className="w-full justify-start"
                        disabled={loading}
                        onClick={() => selectUser(name)}
                      >
                        {name}
                      </Button>
                    ))}
                  </div>
                  <div className="relative my-3">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">or</span>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => setShowNewUserInput(true)}
                  >
                    Add new user
                  </Button>
                </>
              )}
              {showNewUserInput && (
                <form onSubmit={handleNewName} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Display name</Label>
                    <Input
                      id="name"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Lara"
                      autoFocus
                    />
                  </div>
                  {error && (
                    <p className="text-sm text-destructive">{error}</p>
                  )}
                  <div className="flex gap-2">
                    {existingUsers.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setShowNewUserInput(false);
                          setDisplayName("");
                        }}
                      >
                        Back
                      </Button>
                    )}
                    <Button
                      type="submit"
                      className="flex-1"
                      disabled={loading || !displayName.trim()}
                    >
                      {loading ? "Saving..." : "Enter"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
