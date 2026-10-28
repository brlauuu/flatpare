"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApartmentFormFields,
  type ApartmentForm,
} from "@/components/apartment-form-fields";

export function ApartmentEditForm({
  form,
  saving,
  letters,
  lettersError,
  onChange,
  onLettersChange,
  onWashingMachineChange,
  onSave,
  onCancel,
}: {
  form: ApartmentForm;
  saving: boolean;
  letters: string;
  // Said under the field; Save stays off while there is one (#410).
  lettersError: string | null;
  onChange: (field: keyof ApartmentForm, value: string) => void;
  onLettersChange: (letters: string) => void;
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
        <div className="space-y-2">
          <Label htmlFor="apt-code-letters">{t("codeLabel")}</Label>
          <Input
            id="apt-code-letters"
            value={letters}
            onChange={(e) => onLettersChange(e.target.value.toUpperCase().slice(0, 3))}
            maxLength={3}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={lettersError !== null}
            aria-describedby="apt-code-letters-hint"
            className="w-24 font-mono uppercase"
          />
          <p id="apt-code-letters-hint" className={lettersError ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {lettersError ?? t("codeHint")}
          </p>
        </div>
        <ApartmentFormFields
          form={form}
          onChange={onChange}
          onWashingMachineChange={onWashingMachineChange}
        />
        <div className="flex gap-2">
          <Button onClick={onSave} disabled={saving || lettersError !== null}>
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
