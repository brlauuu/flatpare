# Flatpare User Guide

Flatpare helps a household compare apartments together. Upload PDF listings, rate them, and see everything side-by-side — with your data encrypted in your browser before it is stored.

---

## Getting Started

### 1. Sign in

Sign in with Google or with a link sent to your email, or with your household's shared password if that is how your Flatpare is set up. Set your name on the Settings page so everyone knows who said what; until you do, your household sees your email address on your ratings.

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
- Monthly rent, in the currency the listing gives

If no AI is configured, fill the fields in manually. Either way you land on the apartment's page to review and correct anything that came out wrong — the extraction is a starting point, not an oracle.

You can also add an apartment by hand, without a PDF or an address. Until it has one of them it is **not processed**: rate it and fill in what you know, and as soon as it gets an address or a PDF, Flatpare places it on the map and measures its distances.

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

Go to **Compare** for all apartments in one table. It highlights the best value in each row (lowest rent, highest rating, shortest commute). Scroll horizontally if there are more apartments than fit. Rents in different currencies are not converted: the lowest is highlighted within each currency, and sorting by price lists francs first, then each other currency.

---

## Features

### Locations of interest

On the **Household** page, save up to **five** places you actually go — work, the gym, your sister. Every apartment then shows how long it takes to reach each of them by bike and by public transport.

These are yours to choose; Flatpare does not assume where you commute to.

### Distances

Travel times are measured from each apartment to each of your saved locations:

- **Bike** — via Google Maps or OpenRouteService
- **Transit** — via Google Maps (not available with OpenRouteService)

If no distance API is configured, you can enter times manually.

Changing an apartment's address later does not measure again by itself: its distances are hidden until you press **Reprocess** on its page. On the hosted version a reprocess uses one apartment credit, and so does **Recompute all** on the Household page, once for the whole run. Adding or changing a location of interest is free.

### PDF handling

- Single or bulk upload
- **PDFs are encrypted in your browser before they are uploaded.** What gets stored is ciphertext; opening one decrypts it again on your device
- Extraction uses Gemini 2.5 Flash. On flatpare.com it runs only through model providers that guarantee zero data retention: the request is not kept once it is answered

### What the server can see

Almost nothing. Your apartments, ratings, notes and PDFs are encrypted before they leave your browser.

There is one deliberate exception, and it is worth knowing about: **geocoding an address, measuring a travel time, checking whether a listing is still online, and reading a PDF** cannot be done in your browser. For those, that single item is sent in readable form: an address to Google Maps (or OpenRouteService on some self-hosted setups) for its location and travel times, a listing's URL fetched by our server from the listing site itself, and a PDF to the AI model that reads it. Our server uses it for that one call, never writes it to the database, and never logs it. When a PDF has no working link to its listing, the AI model also searches the web for it with the listing's title, address, website and language; on flatpare.com that search keeps nothing of the request. The link it finds is marked as found by a search, so you can check it before saving.

### Managing your key

Under **Settings**, you can:

- **Lock this device** — clears the key from this browser without signing out. Useful on a shared or borrowed computer; you will need your passphrase again to unlock.
- **Change passphrase** — keeps your data, re-protects the key with a new passphrase.
- **Regenerate recovery kit** (household owners only) — issues a fresh recovery code and invalidates the old one. Do this if you think the printed copy has been seen by someone else. Any other owners are told on the Household page, since their copy stops working too.

### Backing up your data

Because your data is encrypted, nobody can restore it for you, not even us. On the **Household** page, under **Your data**, any member can **Export** the whole household as a ZIP file: apartments, ratings, locations and the original PDFs, plus a spreadsheet file. **The file is not encrypted**, so keep it somewhere private.

To bring an export back, open the Household page of a household that has no apartments and no locations yet, and use **Import**. Other people's ratings are added to your own comments, with their names. An import calls no outside service and uses no apartment credits.

---

## On your phone

Flatpare works in your phone's browser. You can also install it, so it opens from its own icon like an app.

### Install Flatpare

- **Android:** open the menu under your name and choose **Install app**, or tap **Install** on the tip at the top of the Apartments page.
- **iPhone and iPad:** tap the Share button, choose **Add to Home Screen**, then **Add**. **Install app** in the menu under your name shows the same steps.

### Share listings into Flatpare (Android)

Once Flatpare is installed on Android, it appears in your phone's share menu. Share a PDF from your files or your email, and Flatpare asks whether to add it, then reads it like any upload. Share a link from your browser or a listing app, and Flatpare adds it as an apartment that is not processed yet, then opens it.

If you are signed out, or Flatpare is locked, when you share, the item waits on your phone for a day. Sign in or unlock, and Flatpare asks whether to add it.

### Paste link (iPhone and everywhere else)

An iPhone cannot share into Flatpare. Copy the listing's link instead, open Flatpare, and tap **Paste link** on the Apartments page. Flatpare adds an apartment for the link and opens it.

### Apartments from a link

An apartment added from a link keeps the link and is marked **Not processed** in the list. Adding it is free, and everyone in the household can rate and describe it straight away. On its page, **Attach PDF** adds the listing's PDF and reads it; giving it an address places it on the map. On the hosted version, whichever comes first uses one apartment credit, and the other one is then free. **Replace PDF** swaps the PDF for a newer one without reading it, so the details stay as they are; press **Reprocess** if you want it read. Links saved under **To add** before this change have become apartments like these.

---

## If you are on the hosted version

**During the private beta it is free.** What a beta account gets is yours to keep: neither your data nor your credits are taken back when the beta ends.

Flatpare is **CHF 5, once** — not a subscription. That covers up to 10 people and 40 apartments in one household.

The 40 counts apartments **processed**, not apartments you keep: a credit is used the first time an apartment's PDF is read or its address is placed on the map. Adding an apartment by hand, describing it and rating it are free. Deleting one frees room in your comparison but does not give the credit back. When you have used your 40, another CHF 5 adds another 40.

Running out of credits only stops new apartments being processed: you can still add, describe and rate them, and process them after buying more. It never locks you out of the ones you already have.

Running Flatpare yourself is free and has no limits at all.

---

## Tips

- **Forgot your passphrase?** The unlock screen offers **"Use my recovery kit"** — enter the 25-character code and set a new passphrase. If you have neither the passphrase nor the code, the data cannot be recovered by anyone.
- **"Reset my keys"** is also offered there, and it is *not* a password reset: it abandons the old key and waits for someone else in the household to hand you a fresh copy. Only useful if somebody else still has access.
- **Check each other's key codes.** The Household page shows a code of eight small pictures next to each member. Compare them in person or on a call: the code someone sees for themselves on their own device must match the one you see for them. If it does not, do not trust that key.
- **More than one owner.** On the Household page an owner can **Make owner** any member. Every owner can invite and remove people and rotate the household key, so the household keeps running if one of you drops out. An owner can **Step down as owner** or leave the household as long as another owner remains.
- **New device:** just sign in and enter your passphrase; nothing needs to be transferred by hand.
- **Bulk upload:** you can select several PDFs at once on the Upload page.
- **Re-rate anytime:** ratings are per person and can be changed whenever you like.
- **Mobile-friendly:** use the bottom navigation bar on your phone.
