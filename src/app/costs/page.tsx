"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface CostsData {
  gemini: {
    allTime: { calls: number; inputTokens: number; outputTokens: number };
    last30Days: {
      calls: number;
      inputTokens: number;
      outputTokens: number;
      estimatedCostUsd: number;
    };
  };
  googleMaps: {
    allTime: { calls: number };
    last30Days: { calls: number; estimatedCostUsd: number };
  };
  totalEstimatedCost30d: number;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatUsd(n: number): string {
  if (n < 0.01 && n > 0) return "< $0.01";
  return `$${n.toFixed(2)}`;
}

export default function CostsPage() {
  const [data, setData] = useState<CostsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/costs")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading cost data...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Failed to load cost data</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Infrastructure Costs</h1>
        <p className="text-sm text-muted-foreground">
          Estimated costs based on tracked API usage
        </p>
      </div>

      {/* Total summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Last 30 Days Total</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">
            {formatUsd(data.totalEstimatedCost30d)}
          </p>
          <p className="text-sm text-muted-foreground">
            estimated across tracked API services
          </p>
        </CardContent>
      </Card>

      {/* Gemini */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Google Gemini (PDF Parsing)</CardTitle>
          <p className="text-xs text-muted-foreground">
            Model: gemini-2.5-flash &middot; Pricing: $0.15/1M input, $0.60/1M
            output tokens
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              Last 30 days
            </h4>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat
                label="API calls"
                value={String(data.gemini.last30Days.calls)}
              />
              <Stat
                label="Input tokens"
                value={formatTokens(data.gemini.last30Days.inputTokens)}
              />
              <Stat
                label="Output tokens"
                value={formatTokens(data.gemini.last30Days.outputTokens)}
              />
              <Stat
                label="Est. cost"
                value={formatUsd(data.gemini.last30Days.estimatedCostUsd)}
              />
            </div>
          </div>
          <Separator />
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              All time
            </h4>
            <div className="grid grid-cols-3 gap-4">
              <Stat
                label="API calls"
                value={String(data.gemini.allTime.calls)}
              />
              <Stat
                label="Input tokens"
                value={formatTokens(data.gemini.allTime.inputTokens)}
              />
              <Stat
                label="Output tokens"
                value={formatTokens(data.gemini.allTime.outputTokens)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Google Maps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Google Maps (Distance Calculation)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Distance Matrix API &middot; $5/1,000 elements &middot; 2 elements
            per call (bike + transit)
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              Last 30 days
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <Stat
                label="API calls"
                value={String(data.googleMaps.last30Days.calls)}
              />
              <Stat
                label="Est. cost"
                value={formatUsd(data.googleMaps.last30Days.estimatedCostUsd)}
              />
            </div>
          </div>
          <Separator />
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              All time
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <Stat
                label="API calls"
                value={String(data.googleMaps.allTime.calls)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* External dashboards */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">External Dashboards</CardTitle>
          <p className="text-xs text-muted-foreground">
            Usage for Vercel and Turso is tracked in their own dashboards
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <DashboardLink
              name="Vercel"
              description="Function invocations, bandwidth, build minutes, Blob storage"
              url="https://vercel.com/dashboard"
              freeNote="Hobby plan: 100K function invocations, 100 GB bandwidth/mo"
            />
            <Separator />
            <DashboardLink
              name="Turso"
              description="Database size, row reads/writes"
              url="https://turso.tech/app"
              freeNote="Free plan: 9 GB storage, 1B row reads/mo"
            />
            <Separator />
            <DashboardLink
              name="Google Cloud Console"
              description="Gemini API and Maps API billing"
              url="https://console.cloud.google.com/billing"
              freeNote="Maps: $200/mo free credit"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function DashboardLink({
  name,
  description,
  url,
  freeNote,
}: {
  name: string;
  description: string;
  url: string;
  freeNote: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="font-medium">{name}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
        <p className="text-xs text-muted-foreground italic">{freeNote}</p>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-sm text-primary underline-offset-4 hover:underline"
      >
        Open dashboard
      </a>
    </div>
  );
}
