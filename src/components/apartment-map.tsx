"use client";

export function ApartmentMap({
  embedUrl,
  title,
}: {
  embedUrl: string | null | undefined;
  title: string;
}) {
  if (!embedUrl) return null;
  return (
    <div className="overflow-hidden rounded-lg border">
      <iframe
        title={`Map for ${title}`}
        src={embedUrl}
        width="100%"
        height="260"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
        style={{ border: 0, display: "block" }}
      />
    </div>
  );
}
