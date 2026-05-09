import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorDisplay } from "@/components/error-display";
import {
  ApartmentFormFields,
  type ApartmentForm,
} from "@/components/apartment-form-fields";
import type { ErrorDetails } from "@/lib/fetch-error";

interface SingleEntryStepProps {
  form: ApartmentForm;
  saving: boolean;
  error: { headline: string; details?: ErrorDetails } | null;
  onSubmit: (e: React.FormEvent) => void;
  onChange: (field: keyof ApartmentForm, value: string) => void;
  onWashingMachineChange: (v: boolean | null) => void;
  onCancel: () => void;
}

export function SingleEntryStep({
  form,
  saving,
  error,
  onSubmit,
  onChange,
  onWashingMachineChange,
  onCancel,
}: SingleEntryStepProps) {
  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>Add Apartment Manually</CardTitle>
          <p className="text-sm text-muted-foreground">
            Fill in the apartment details
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <ApartmentFormFields
              form={form}
              onChange={onChange}
              onWashingMachineChange={onWashingMachineChange}
            />

            {error && (
              <ErrorDisplay headline={error.headline} details={error.details} />
            )}

            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? "Saving..." : "Save Apartment"}
              </Button>
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
