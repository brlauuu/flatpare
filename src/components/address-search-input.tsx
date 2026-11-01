"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  resolveAddress,
  suggestAddresses,
  type Place,
  type PlaceSuggestion,
} from "@/components/household-data/process-client";
import { newRowId } from "@/lib/household-data/ids";
import { languageOf } from "@/locales/locales";

// #480: an address field that suggests addresses while typing, like a maps
// site. Typing changes the text as before; picking a suggestion hands its
// address and coordinates to `onPick`. One session token per search, renewed
// after a pick, so Google bills the suggestions and the pick as one search.
const MIN_LENGTH = 3;

type Status = "idle" | "loading" | "ready" | "none" | "failed" | "resolving" | "unresolved";

// The search itself: what has been typed, the suggestions for it, and the
// pick. Only typing searches; a pick sets the text without searching again.
function useAddressSuggestions(
  near: { lat: number; lng: number } | null,
  delayMs: number,
  onPick: (place: Place) => void
) {
  const language = languageOf(useLocale());
  const [query, setQuery] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const session = useRef<string>(newRowId());
  const seq = useRef(0);

  // Compared by value: the household store hands a new object on every
  // refresh, which must not search again.
  const nearLat = near?.lat ?? null;
  const nearLng = near?.lng ?? null;

  useEffect(() => {
    const typed = query?.trim() ?? "";
    const ticket = ++seq.current;
    if (typed.length < MIN_LENGTH) return;
    const timer = setTimeout(() => {
      setStatus("loading");
      const bias = nearLat !== null && nearLng !== null ? { lat: nearLat, lng: nearLng } : null;
      suggestAddresses(typed, { sessionToken: session.current, language }, bias).then(
        (found) => {
          if (ticket !== seq.current) return;
          setSuggestions(found);
          setStatus(found.length > 0 ? "ready" : "none");
        },
        () => {
          if (ticket !== seq.current) return;
          setSuggestions([]);
          setStatus("failed");
        }
      );
    }, delayMs);
    return () => clearTimeout(timer);
  }, [query, language, nearLat, nearLng, delayMs]);

  function type(value: string) {
    setQuery(value);
    if (value.trim().length < MIN_LENGTH) {
      setSuggestions([]);
      setStatus("idle");
    }
  }

  function close(next: Status) {
    seq.current++;
    setQuery(null);
    setSuggestions([]);
    setStatus(next);
  }

  async function pick(suggestion: PlaceSuggestion) {
    close("resolving");
    let place = suggestion.place;
    if (!place && suggestion.placeId) {
      place = await resolveAddress(suggestion.placeId, { sessionToken: session.current, language }).catch(() => null);
    }
    session.current = newRowId();
    close(place ? "idle" : "unresolved");
    if (place) onPick(place);
  }

  return { suggestions, status, setStatus, type, close, pick };
}

export function AddressSearchInput({
  id,
  value,
  near,
  placeholder,
  describedBy,
  onChange,
  onPick,
  delayMs = 300,
}: {
  id: string;
  value: string;
  near: { lat: number; lng: number } | null;
  placeholder?: string;
  describedBy?: string;
  onChange: (value: string) => void;
  onPick: (place: Place) => void;
  delayMs?: number;
}) {
  const t = useTranslations("household.locations");
  const listId = useId();
  const { suggestions, status, setStatus, type, close, pick } = useAddressSuggestions(near, delayMs, onPick);
  const [active, setActive] = useState(-1);
  const open = status === "ready" && suggestions.length > 0;

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      setActive(-1);
      void pick(suggestions[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setActive(-1);
      close("idle");
    }
  }

  const optionId = (i: number) => `${listId}-${i}`;

  return (
    <div className="relative space-y-2">
      <Input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(-1);
          type(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (status === "ready") setStatus("idle");
        }}
      />
      {open && (
        <SuggestionList
          id={listId}
          label={t("suggestions")}
          suggestions={suggestions}
          active={active}
          optionId={optionId}
          onPick={(s) => {
            setActive(-1);
            void pick(s);
          }}
        />
      )}
      <SearchStatus status={status} />
    </div>
  );
}

function SuggestionList({
  id,
  label,
  suggestions,
  active,
  optionId,
  onPick,
}: {
  id: string;
  label: string;
  suggestions: PlaceSuggestion[];
  active: number;
  optionId: (i: number) => string;
  onPick: (s: PlaceSuggestion) => void;
}) {
  return (
    <ul id={id} role="listbox" aria-label={label} className="divide-y rounded-md border bg-background">
      {suggestions.map((s, i) => (
        <li
          key={`${s.placeId ?? s.label}:${i}`}
          id={optionId(i)}
          role="option"
          aria-selected={i === active}
          // Keeps the field focused, so its blur does not close the list
          // before the click lands.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(s)}
          className={`flex cursor-pointer items-start gap-2 px-3 py-3 text-sm hover:bg-muted ${
            i === active ? "bg-muted" : ""
          }`}
        >
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block">{s.label}</span>
            {s.detail && <span className="block text-xs text-muted-foreground">{s.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

const STATUS_LINE: Partial<Record<Status, { key: "searching" | "resolving" | "searchNone" | "searchFailed" | "resolveFailed"; role?: "status" | "alert" }>> = {
  loading: { key: "searching" },
  resolving: { key: "resolving" },
  none: { key: "searchNone", role: "status" },
  failed: { key: "searchFailed", role: "alert" },
  unresolved: { key: "resolveFailed", role: "alert" },
};

function SearchStatus({ status }: { status: Status }) {
  const t = useTranslations("household.locations");
  const line = STATUS_LINE[status];
  if (!line) return null;
  const tone = line.role === "alert" ? "text-sm text-destructive" : line.role ? "text-sm text-muted-foreground" : "text-xs text-muted-foreground";
  return (
    <p role={line.role} className={tone}>
      {t(line.key)}
    </p>
  );
}
