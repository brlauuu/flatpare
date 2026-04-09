import { FormEvent, useEffect, useMemo, useState } from "react";
import { STORAGE_KEYS, USERS } from "./constants";
import {
  appendApartmentAndEmptyScores,
  createApartmentFromInput,
  emptyScoreRecord,
  loadLegacyScoresFromLocalStorage,
  migrateLegacyScores,
  normalizeScoresByApartmentCount
} from "./lib/domain";
import { storage } from "./lib/storage";
import type {
  Apartment,
  PartialApartment,
  ScoreRecord,
  ScoreValue,
  ScoresByUser,
  UserId
} from "./types";

type View = "entry" | "compare" | "add";

type ParseResult = {
  apartment: PartialApartment;
  warnings: string[];
};

type ParseErrorResponse = {
  error?: string;
  stage?: string;
  details?: string;
};

const STAR_FIELDS: Array<keyof Omit<ScoreRecord, "note">> = [
  "kitchen",
  "balcony",
  "floorplan",
  "light",
  "feel"
];

const emptyScoresByUser = (): ScoresByUser => ({
  djordje: [],
  lara: []
});

const APP_PASSWORD_ERROR = "Invalid password";

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = "";
  const bytes = new Uint8Array(buffer);

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
};

function App() {
  const [view, setView] = useState<View>("entry");
  const [activeUser, setActiveUser] = useState<UserId>("djordje");
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [scoresByUser, setScoresByUser] = useState<ScoresByUser>(emptyScoresByUser);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState<PartialApartment>({ addr: "" });
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseDiagnostics, setParseDiagnostics] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  const currentApartment = apartments[currentIndex];
  const currentScore = scoresByUser[activeUser]?.[currentIndex] ?? emptyScoreRecord();

  useEffect(() => {
    const load = async () => {
      const unlocked = localStorage.getItem(STORAGE_KEYS.appUnlocked) === "true";
      setIsUnlocked(unlocked);

      const loadedApts = (await storage.get<Apartment[]>(STORAGE_KEYS.apartments)) ?? [];
      const loadedDjordje =
        (await storage.get<ScoreRecord[]>(STORAGE_KEYS.scoresDjordje)) ?? [];
      const loadedLara = (await storage.get<ScoreRecord[]>(STORAGE_KEYS.scoresLara)) ?? [];

      let nextDjordje = loadedDjordje;
      if (nextDjordje.length === 0) {
        const legacy = loadLegacyScoresFromLocalStorage();
        if (legacy.length > 0) {
          nextDjordje = migrateLegacyScores(legacy);
          await storage.set(STORAGE_KEYS.scoresDjordje, nextDjordje);
        }
      }

      const normalized = normalizeScoresByApartmentCount(loadedApts, {
        djordje: nextDjordje,
        lara: loadedLara
      });

      setApartments(loadedApts);
      setScoresByUser(normalized);
      setCurrentIndex(loadedApts.length > 0 ? 0 : 0);
      setIsLoading(false);
    };

    void load();
  }, []);

  const minRent = useMemo(() => {
    const rentValues = apartments
      .map((apt) => (typeof apt.rent === "number" ? apt.rent : Number(apt.rent)))
      .filter((rent) => Number.isFinite(rent) && rent > 0);

    if (rentValues.length === 0) {
      return null;
    }

    return Math.min(...rentValues);
  }, [apartments]);

  const updateCurrentScore = async (
    field: keyof ScoreRecord,
    value: ScoreValue | string
  ) => {
    if (!currentApartment) {
      return;
    }

    const nextScores: ScoresByUser = {
      ...scoresByUser,
      [activeUser]: scoresByUser[activeUser].map((entry, idx) => {
        if (idx !== currentIndex) {
          return entry;
        }

        return {
          ...entry,
          [field]: value
        } as ScoreRecord;
      })
    };

    setScoresByUser(nextScores);

    await storage.set(
      activeUser === "djordje" ? STORAGE_KEYS.scoresDjordje : STORAGE_KEYS.scoresLara,
      nextScores[activeUser]
    );
  };

  const unlockApp = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordError(null);

    try {
      const response = await fetch("/api/verify-password", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ password })
      });

      const payload = (await response.json()) as { ok: boolean };
      if (!response.ok || !payload.ok) {
        setPasswordError(APP_PASSWORD_ERROR);
        return;
      }

      localStorage.setItem(STORAGE_KEYS.appUnlocked, "true");
      setIsUnlocked(true);
      setPassword("");
    } catch {
      setPasswordError("Unable to verify password. Try again.");
    }
  };

  const lockApp = () => {
    localStorage.removeItem(STORAGE_KEYS.appUnlocked);
    setIsUnlocked(false);
  };

  const addApartment = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.addr || form.addr.trim().length === 0) {
      return;
    }

    setIsSaving(true);

    const apartment = createApartmentFromInput(form);
    const appended = appendApartmentAndEmptyScores(apartments, scoresByUser, apartment);

    setApartments(appended.apartments);
    setScoresByUser(appended.scoresByUser);
    setCurrentIndex(appended.newIndex);
    setView("entry");
    setForm({ addr: "" });
    setParseWarnings([]);
    setParseDiagnostics(null);

    await Promise.all([
      storage.set(STORAGE_KEYS.apartments, appended.apartments),
      storage.set(STORAGE_KEYS.scoresDjordje, appended.scoresByUser.djordje),
      storage.set(STORAGE_KEYS.scoresLara, appended.scoresByUser.lara)
    ]);

    setIsSaving(false);
  };

  const parsePdfFile = async (file: File) => {
    setIsParsing(true);
    setParseError(null);
    setParseDiagnostics(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const fileBase64 = arrayBufferToBase64(arrayBuffer);

      const response = await fetch("/api/parse-pdf", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ fileBase64, fileName: file.name })
      });

      const payload = (await response.json()) as ParseResult & ParseErrorResponse;
      if (!response.ok) {
        const errorMessage = payload.error ?? "Parser request failed";
        setParseError(errorMessage);
        setParseDiagnostics(
          JSON.stringify(
            {
              status: response.status,
              stage: payload.stage ?? "unknown",
              details: payload.details ?? "No additional details",
              fileName: file.name
            },
            null,
            2
          )
        );
        return;
      }

      setForm((current) => ({ ...current, ...payload.apartment }));
      setParseWarnings(payload.warnings);
    } catch {
      setParseError("Parsing failed. You can still fill the apartment form manually.");
      setParseDiagnostics(
        JSON.stringify(
          {
            stage: "client",
            details:
              "Could not reach parse endpoint. In local dev, ensure `npm run dev` is running both web and api processes.",
            fileName: file.name
          },
          null,
          2
        )
      );
    } finally {
      setIsParsing(false);
    }
  };

  if (isLoading) {
    return <div className="shell">Loading...</div>;
  }

  if (!isUnlocked) {
    return (
      <div className="shell centered">
        <form className="card lock-card" onSubmit={unlockApp}>
          <h1>Apartment Tracker</h1>
          <p>Enter shared password to continue.</p>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {passwordError ? <p className="error">{passwordError}</p> : null}
          <button type="submit">Unlock</button>
        </form>
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="tabs" role="tablist" aria-label="Views">
          <button
            type="button"
            className={view === "entry" ? "active" : ""}
            onClick={() => setView("entry")}
          >
            Entry
          </button>
          <button
            type="button"
            className={view === "compare" ? "active" : ""}
            onClick={() => setView("compare")}
          >
            Compare
          </button>
          <button
            type="button"
            className={view === "add" ? "active" : ""}
            onClick={() => setView("add")}
          >
            Add
          </button>
        </div>
        <div className="user-toggle">
          {USERS.map((user) => (
            <button
              key={user.id}
              type="button"
              className={activeUser === user.id ? "active" : ""}
              onClick={() => setActiveUser(user.id)}
              style={activeUser === user.id ? { borderColor: user.color } : undefined}
            >
              {user.label}
            </button>
          ))}
          <button type="button" onClick={lockApp}>
            Lock
          </button>
        </div>
      </header>

      {view === "entry" ? (
        <section className="card">
          {currentApartment ? (
            <>
              <div className="entry-nav">
                <button
                  type="button"
                  onClick={() => setCurrentIndex((idx) => Math.max(0, idx - 1))}
                  disabled={currentIndex === 0}
                >
                  Prev
                </button>
                <span>
                  {currentIndex + 1} / {apartments.length}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentIndex((idx) => Math.min(apartments.length - 1, idx + 1))
                  }
                  disabled={currentIndex >= apartments.length - 1}
                >
                  Next
                </button>
              </div>

              <h2>{currentApartment.name}</h2>
              <p>{currentApartment.addr}</p>
              <p>{currentApartment.info || "-"}</p>
              <p>
                Rent: {currentApartment.rent} | Rooms: {currentApartment.rooms} | Baths: {" "}
                {currentApartment.baths}
              </p>
              <p>
                Balcony: {currentApartment.bal} | Wash: {currentApartment.wash} | SBB: {" "}
                {currentApartment.dist}
              </p>
              {currentApartment.url ? (
                <p>
                  <a href={currentApartment.url} target="_blank" rel="noreferrer">
                    Open listing
                  </a>
                </p>
              ) : null}

              <h3>{USERS.find((user) => user.id === activeUser)?.label} scores</h3>
              <div className="score-grid">
                {STAR_FIELDS.map((field) => (
                  <label key={field} className="score-row">
                    <span>{field}</span>
                    <select
                      value={currentScore[field]}
                      onChange={(event) =>
                        void updateCurrentScore(
                          field,
                          Number(event.target.value) as ScoreValue
                        )
                      }
                    >
                      <option value={0}>0</option>
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                      <option value={4}>4</option>
                      <option value={5}>5</option>
                    </select>
                  </label>
                ))}
              </div>

              <label>
                Notes
                <textarea
                  value={currentScore.note}
                  onChange={(event) => void updateCurrentScore("note", event.target.value)}
                />
              </label>
            </>
          ) : (
            <p>No apartments yet. Add your first listing.</p>
          )}
        </section>
      ) : null}

      {view === "compare" ? (
        <section className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Address</th>
                <th>Link</th>
                <th>Rent</th>
                <th>Rooms</th>
                <th>SBB</th>
                <th>Wash</th>
                <th>D-Kit</th>
                <th>D-Bal</th>
                <th>D-Floor</th>
                <th>D-Light</th>
                <th>D-Feel</th>
                <th>D-Note</th>
                <th>L-Kit</th>
                <th>L-Bal</th>
                <th>L-Floor</th>
                <th>L-Light</th>
                <th>L-Feel</th>
                <th>L-Note</th>
              </tr>
            </thead>
            <tbody>
              {apartments.map((apt, idx) => {
                const d = scoresByUser.djordje[idx] ?? emptyScoreRecord();
                const l = scoresByUser.lara[idx] ?? emptyScoreRecord();
                const aptRent = typeof apt.rent === "number" ? apt.rent : Number(apt.rent);

                return (
                  <tr key={`${apt.addr}-${idx}`}>
                    <td>{apt.addr}</td>
                    <td>
                      {apt.url ? (
                        <a href={apt.url} target="_blank" rel="noreferrer">
                          Link
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className={minRent !== null && aptRent === minRent ? "best-rent" : ""}>
                      {apt.rent}
                    </td>
                    <td>{apt.rooms}</td>
                    <td>{apt.dist}</td>
                    <td>{apt.wash}</td>
                    <td>{d.kitchen}</td>
                    <td>{d.balcony}</td>
                    <td>{d.floorplan}</td>
                    <td>{d.light}</td>
                    <td>{d.feel}</td>
                    <td>{d.note || "-"}</td>
                    <td>{l.kitchen}</td>
                    <td>{l.balcony}</td>
                    <td>{l.floorplan}</td>
                    <td>{l.light}</td>
                    <td>{l.feel}</td>
                    <td>{l.note || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      {view === "add" ? (
        <section className="card">
          <h2>Add apartment</h2>
          <label className="file-input">
            Import PDF
            <input
              type="file"
              accept="application/pdf"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void parsePdfFile(file);
                }
              }}
            />
          </label>
          {isParsing ? <p>Parsing PDF...</p> : null}
          {parseError ? <p className="error">{parseError}</p> : null}
          {parseDiagnostics ? (
            <details className="diagnostics">
              <summary>Parser diagnostics</summary>
              <pre>{parseDiagnostics}</pre>
            </details>
          ) : null}
          {parseWarnings.map((warning) => (
            <p className="warning" key={warning}>
              {warning}
            </p>
          ))}

          <form onSubmit={addApartment} className="add-form">
            <label>
              Address *
              <input
                value={form.addr ?? ""}
                onChange={(event) => setForm((s) => ({ ...s, addr: event.target.value }))}
                required
              />
            </label>
            <label>
              Name
              <input
                value={form.name ?? ""}
                onChange={(event) => setForm((s) => ({ ...s, name: event.target.value }))}
              />
            </label>
            <label>
              URL
              <input
                value={form.url ?? ""}
                onChange={(event) => setForm((s) => ({ ...s, url: event.target.value }))}
              />
            </label>
            <label>
              Rent
              <input
                value={String(form.rent ?? "")}
                onChange={(event) => setForm((s) => ({ ...s, rent: event.target.value }))}
              />
            </label>
            <label>
              Rooms
              <input
                value={String(form.rooms ?? "")}
                onChange={(event) => setForm((s) => ({ ...s, rooms: event.target.value }))}
              />
            </label>
            <label>
              Baths
              <input
                value={String(form.baths ?? "")}
                onChange={(event) => setForm((s) => ({ ...s, baths: event.target.value }))}
              />
            </label>
            <label>
              Balcony
              <input
                value={String(form.bal ?? "")}
                onChange={(event) => setForm((s) => ({ ...s, bal: event.target.value }))}
              />
            </label>
            <label>
              Distance to Basel SBB
              <input
                value={form.dist ?? ""}
                onChange={(event) => setForm((s) => ({ ...s, dist: event.target.value }))}
              />
            </label>
            <label>
              Washing machine
              <select
                value={form.wash ?? "?"}
                onChange={(event) =>
                  setForm((s) => ({ ...s, wash: event.target.value as Apartment["wash"] }))
                }
              >
                <option value="?">?</option>
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select>
            </label>
            <label>
              Info
              <input
                value={form.info ?? ""}
                onChange={(event) => setForm((s) => ({ ...s, info: event.target.value }))}
              />
            </label>
            <button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save apartment"}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}

export default App;
