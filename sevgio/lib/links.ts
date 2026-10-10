// Links that open the phone's apps: maps directions, calling and email.

/** Google Maps directions from where the visitor is now (opens the Maps app on phones). */
export const directionsUrl = (place: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place)}`;
export const telUrl = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
export const mailUrl = (email: string) => `mailto:${email}`;
