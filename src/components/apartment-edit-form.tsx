"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ApartmentFormFields,
  type ApartmentForm,
} from "@/components/apartment-form-fields";

export function ApartmentEditForm({
  form,
  saving,
  onChange,
  onWashingMachineChange,
  onSave,
  onCancel,
}: {
  form: ApartmentForm;
  saving: boolean;
  onChange: (field: keyof ApartmentForm, value: string) => void;
  onWashingMachineChange: (v: boolean | null) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("apartments.edit");
  const tc = useTranslations("common");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ApartmentFormFields
          form={form}
          onChange={onChange}
          onWashingMachineChange={onWashingMachineChange}
        />
        <div className="flex gap-2">
          <Button onClick={onSave} disabled={saving}>
            {saving ? t("saving") : tc("save")}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            {tc("cancel")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
