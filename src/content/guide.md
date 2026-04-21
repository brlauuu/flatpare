# Flatpare User Guide

Flatpare helps small groups compare apartments together. Upload PDF listings, rate them, and see everything side-by-side.

---

## Getting Started

### 1. Log In

Enter the shared password your group agreed on, then pick a display name. Your name appears on ratings so everyone knows who said what.

### 2. Upload an Apartment

Go to **Upload** in the nav bar and drag-and-drop (or select) a PDF listing. If AI extraction is configured, Flatpare will automatically pull out:

- Apartment name/title
- Address
- Size (m2), rooms, bathrooms, balconies
- Monthly rent (CHF)

If no AI is available, you can fill in the fields manually.

Travel times (bike and transit from Basel SBB) are calculated automatically when a distance API is configured.

### 3. Review & Edit

After upload, you are taken to the apartment detail page. Review the extracted data and correct anything that looks wrong. All fields are editable.

### 4. Rate Apartments

On each apartment's detail page, rate it across 5 categories:

| Category | What to consider |
|----------|-----------------|
| **Kitchen** | Size, appliances, layout, natural light |
| **Balconies** | Size, view, privacy, sun exposure |
| **Location** | Neighborhood, noise, shops, parks |
| **Floorplan** | Room layout, flow, storage, practicality |
| **Overall Feeling** | Your gut feeling after visiting |

Click a star to set a rating (1-5). Click the same star again to clear it. Each user can rate each apartment once; submitting again updates your previous rating.

### 5. Compare

Go to **Compare** to see all apartments in a side-by-side table. The table highlights the best value in each row (lowest rent, highest rating, etc.) to help you quickly spot winners.

Scroll horizontally to see all apartments if there are more than fit on screen.

---

## Features

### PDF Upload

- Supports single or bulk PDF upload
- Files are stored locally (self-hosted) or in Vercel Blob (cloud)
- AI extraction uses Google Gemini or a local Ollama model

### Distance Calculation

Travel time is calculated from **Basel SBB** to the apartment address:

- **Bike:** cycling time via Google Maps or OpenRouteService
- **Transit:** public transport time via Google Maps (not available with OpenRouteService)

If no API key is configured, you can enter distances manually.

### Cost Dashboard

The **Costs** page shows estimated API usage and costs:

- Gemini API calls (PDF parsing) with token counts
- Google Maps API calls (distance calculations)
- Estimated cost in USD for the last 30 days

This helps you track spending if you're using paid APIs.

---

## Tips

- **Bulk upload:** You can select multiple PDFs at once on the Upload page
- **Re-rate anytime:** Your ratings are saved per user; just go back to the apartment and change them
- **Works offline:** In self-hosted mode with Ollama, everything runs locally with no external API calls
- **Mobile-friendly:** Use the bottom navigation bar on your phone
