# Flatpare User Guide

Flatpare helps a household compare apartments together. Upload PDF listings, rate them, and see everything side-by-side — with your data encrypted in your browser before it is stored.

---

## Getting Started

### 1. Sign in

Sign in with Google or GitHub, or with your household's shared password if that is how your Flatpare is set up. Your name appears on ratings so everyone knows who said what.

### 2. Choose a passphrase

The first time you sign in, Flatpare asks you to **choose a passphrase** (at least 12 characters). This is not a second login — it is the key that encrypts your household's apartments, ratings and notes in your browser.

**Flatpare never sees this passphrase and cannot reset it for you.** That is the point: it is what stops anyone running the server, including us, from reading your search.

You will be asked for it again on each new device or browser you use, and after you lock Flatpare.

### 3. Save your recovery kit

Right after you choose a passphrase, you are shown a **25-character recovery code, once**. Write it down or print it, and keep it somewhere safe.

> **This is the single most important screen in Flatpare.** The recovery code is the only way back in if you forget your passphrase. If you lose both, your household's data is gone permanently — nobody can recover it, because nobody else ever had the key.

Treat it like a house key, not like a password hint. A printout in a drawer is fine. A note in the same password manager as everything else is less useful if you lose access to that.

### 4. Joining a household someone else set up

If you were invited to an existing household, you choose your own passphrase in the same way, then see **"Almost there"**.

Flatpare is waiting for someone already in the household to open the app — at which point their browser hands your browser a copy of the household key, automatically. **They do not need to do anything**, but they do need to open Flatpare at least once. The screen checks again every few seconds and moves on by itself.

### 5. Add an apartment

Go to **Upload** in the nav bar and drag in (or select) a PDF listing. If AI extraction is configured, Flatpare pulls out:

- Apartment name/title
- Address
- Size (m²), rooms, bathrooms, balconies
- Monthly rent (CHF)

If no AI is configured, fill the fields in manually. Either way you land on the apartment's page to review and correct anything that came out wrong — the extraction is a starting point, not an oracle.

### 6. Rate apartments

On each apartment's page, rate it across five categories:

| Category | What to consider |
|----------|-----------------|
| **Kitchen** | Size, appliances, layout, natural light |
| **Balconies** | Size, view, privacy, sun exposure |
| **Location** | Neighborhood, noise, shops, parks |
| **Floorplan** | Room layout, flow, storage, practicality |
| **Overall Feeling** | Your gut feeling after visiting |

Click a star to set a rating (1-5); click the same star again to clear it. You rate on your own — everyone in the household rates separately, and the comparison shows the scores side by side rather than averaging a disagreement away.

### 7. Compare

Go to **Compare** for all apartments in one table. It highlights the best value in each row (lowest rent, highest rating, shortest commute). Scroll horizontally if there are more apartments than fit.

---

## Features

### Locations of interest

Under **Settings**, save up to **five** places you actually go — work, the gym, your sister. Every apartment then shows how long it takes to reach each of them by bike and by public transport.

These are yours to choose; Flatpare does not assume where you commute to.

### Distances

Travel times are measured from each apartment to each of your saved locations:

- **Bike** — via Google Maps or OpenRouteService
- **Transit** — via Google Maps (not available with OpenRouteService)

If no distance API is configured, you can enter times manually.

### PDF handling

- Single or bulk upload
- **PDFs are encrypted in your browser before they are uploaded.** What gets stored is ciphertext; opening one decrypts it again on your device
- Extraction uses Google Gemini

### What the server can see

Almost nothing. Your apartments, ratings, notes and PDFs are encrypted before they leave your browser.

There is one deliberate exception, and it is worth knowing about: **geocoding an address, measuring a travel time, checking whether a listing is still online, and reading a PDF** cannot be done in your browser. For those, that single address, URL or file is sent in readable form and passed to Google. It is used for that one call, never written to the database, and never logged.

### Managing your key

Under **Settings**, you can:

- **Lock this device** — clears the key from this browser without signing out. Useful on a shared or borrowed computer; you will need your passphrase again to unlock.
- **Change passphrase** — keeps your data, re-protects the key with a new passphrase.
- **Regenerate recovery kit** (household owner only) — issues a fresh recovery code and invalidates the old one. Do this if you think the printed copy has been seen by someone else.

---

## If you are on the hosted version

Flatpare is **CHF 5, once** — not a subscription. That covers up to 10 people and 40 apartments in one household.

The 40 counts apartments you **add**, not apartments you keep: deleting one frees room in your comparison but does not give the credit back. When you have used your 40, another CHF 5 adds another 40.

Running out of credits only stops you adding new apartments. It never locks you out of the ones you already have.

Running Flatpare yourself is free and has no limits at all.

---

## Tips

- **Forgot your passphrase?** The unlock screen offers **"Use my recovery kit"** — enter the 25-character code and set a new passphrase. If you have neither the passphrase nor the code, the data cannot be recovered by anyone.
- **"Reset my keys"** is also offered there, and it is *not* a password reset: it abandons the old key and waits for someone else in the household to hand you a fresh copy. Only useful if somebody else still has access.
- **New device:** just sign in and enter your passphrase; nothing needs to be transferred by hand.
- **Bulk upload:** you can select several PDFs at once on the Upload page.
- **Re-rate anytime:** ratings are per person and can be changed whenever you like.
- **Mobile-friendly:** use the bottom navigation bar on your phone.
