"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "@/components/star-rating";

const RATING_CATEGORIES = [
  { key: "kitchen", label: "Kitchen" },
  { key: "balconies", label: "Balconies" },
  { key: "location", label: "Location" },
  { key: "floorplan", label: "Floorplan" },
  { key: "overallFeeling", label: "Overall feeling" },
] as const;

export type RatingCategoryKey = (typeof RATING_CATEGORIES)[number]["key"];

export type RatingState = Record<RatingCategoryKey, number> & {
  comment: string;
};

export function MyRatingPanel({
  userName,
  rating,
  saving,
  dirty,
  onChange,
  onSave,
  onCancel,
}: {
  userName: string;
  rating: RatingState;
  saving: boolean;
  dirty: boolean;
  onChange: (next: RatingState) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Your Rating ({userName})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {RATING_CATEGORIES.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between">
            <Label className="text-sm">{label}</Label>
            <StarRating
              value={rating[key]}
              onChange={(v) => onChange({ ...rating, [key]: v })}
            />
          </div>
        ))}
        <div className="space-y-2">
          <Label htmlFor="rating-comment">Comment</Label>
          <Textarea
            id="rating-comment"
            value={rating.comment}
            onChange={(e) => onChange({ ...rating, comment: e.target.value })}
            placeholder="Notes about this apartment..."
            rows={3}
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={onSave} disabled={saving || !dirty}>
            {saving ? "Saving..." : "Save Rating"}
          </Button>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={saving || !dirty}
          >
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function OtherRatingPanel({
  rating,
}: {
  rating: { id: number; userName: string; comment: string } & Record<
    RatingCategoryKey,
    number
  >;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{rating.userName}&apos;s Rating</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {RATING_CATEGORIES.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{label}</span>
            <StarRating value={rating[key]} readonly size="sm" />
          </div>
        ))}
        {rating.comment && (
          <div className="rounded-md bg-muted p-3 text-sm">{rating.comment}</div>
        )}
      </CardContent>
    </Card>
  );
}
