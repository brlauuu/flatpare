"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "@/components/star-rating";

// Labels are common.ratingCategory.<key> (#288), shared with the compare
// table.
const RATING_CATEGORIES = ["kitchen", "balconies", "location", "floorplan", "overallFeeling"] as const;

export type RatingCategoryKey = (typeof RATING_CATEGORIES)[number];

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
  const t = useTranslations("apartments.rating");
  const tc = useTranslations("common");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("yours", { name: userName })}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {RATING_CATEGORIES.map((key) => (
          <div key={key} className="flex items-center justify-between">
            <Label className="text-sm">{tc(`ratingCategory.${key}`)}</Label>
            <StarRating
              value={rating[key]}
              onChange={(v) => onChange({ ...rating, [key]: v })}
            />
          </div>
        ))}
        <div className="space-y-2">
          <Label htmlFor="rating-comment">{t("comment")}</Label>
          <Textarea
            id="rating-comment"
            value={rating.comment}
            onChange={(e) => onChange({ ...rating, comment: e.target.value })}
            placeholder={t("commentPlaceholder")}
            rows={3}
          />
        </div>
        <div className="flex gap-2">
          <Button
            onClick={onSave}
            disabled={saving || !dirty}
            className="h-11 sm:h-8"
          >
            {saving ? t("saving") : t("save")}
          </Button>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={saving || !dirty}
            className="h-11 sm:h-8"
          >
            {tc("cancel")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function OtherRatingPanel({
  rating,
}: {
  // userId identifies the rater; userName is a display label only — the
  // name they set, or their email until they do (displayName, #327). Not
  // unique across accounts, so it must never be used to key anything.
  rating: {
    userId: string;
    userName: string;
    comment: string;
  } & Record<RatingCategoryKey, number>;
}) {
  const t = useTranslations("apartments.rating");
  const tc = useTranslations("common");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("other", { name: rating.userName })}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {RATING_CATEGORIES.map((key) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{tc(`ratingCategory.${key}`)}</span>
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
