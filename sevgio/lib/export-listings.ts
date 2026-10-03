import "server-only";
import { q } from "./db.ts";
import { siteUrl } from "./email.ts";
import type { Property } from "./bookings.ts";

type Row = Property & { parent_title: string | null; host_name: string | null; photo_ids: string[] | null };
const dollars = (c: number | null | undefined) => (c ? c / 100 : 0);

/**
 * Every listing, in the same format the Import page reads (rooms name their house with "part_of",
 * photos come as links the importer downloads). Nothing is changed; this only reads.
 */
export async function exportListings() {
  const rows = await q<Row>(`SELECT p.*, to_char(p.corp_available_from, 'YYYY-MM-DD') AS corp_available_from,
      (SELECT h.title FROM properties h WHERE h.id = p.parent_id) AS parent_title,
      (SELECT u.name FROM users u WHERE u.id = p.host_id) AS host_name,
      (SELECT array_agg(ph.id ORDER BY ph.position, ph.created_at) FROM photos ph WHERE ph.property_id = p.id) AS photo_ids
    FROM properties p ORDER BY coalesce((SELECT h.title FROM properties h WHERE h.id = p.parent_id), p.title), p.parent_id IS NOT NULL, p.title`);
  const base = siteUrl();
  return rows.map(p => {
    const isRoom = !!p.parent_id || p.property_type === "room";
    return {
      listing_kind: isRoom ? "room" : "home",
      ...(p.parent_title ? { part_of: p.parent_title } : {}),
      title: p.title, property_type: p.property_type, city: p.city, area: p.area, address: p.address, description: p.description,
      status_on_sevgio: p.status, host_on_sevgio: p.host_name, link_on_sevgio: `${base}/stays/${p.slug}`,
      bedrooms: p.bedrooms, bathrooms: Number(p.bathrooms), half_bathrooms: p.half_bathrooms, bathroom_type: p.bathroom_type,
      kitchen_access: p.kitchen_access, laundry_access: p.laundry_access, stairs_info: p.stairs_info, shared_spaces: p.shared_spaces,
      max_guests: p.max_guests, base_occupancy: p.base_occupancy, beds: p.beds_detail ?? [], rooms: p.rooms_detail ?? [],
      nightly_price: dollars(p.nightly_price_cents), cleaning_fee: dollars(p.cleaning_fee_cents), extra_guest_fee: dollars(p.extra_guest_fee_cents),
      monthly_price: p.monthly_price_cents ? dollars(p.monthly_price_cents) : null, security_deposit: dollars(p.security_deposit_cents),
      pet_fee: dollars(p.pet_fee_cents), pet_fee_per: p.pet_fee_per,
      weekly_discount_percent: Number(p.weekly_discount_percent), monthly_discount_percent: Number(p.monthly_discount_percent),
      fewer_guest_discount_percent: Number(p.fewer_guest_discount_percent), children_free_age: p.children_free_age,
      min_nights: p.min_nights, max_nights: p.max_nights, booking_mode: p.booking_mode, cancellation_policy: p.cancellation_policy,
      check_in_time: p.check_in_time, check_out_time: p.check_out_time,
      has_exterior_cameras: p.has_exterior_cameras, camera_locations: p.camera_locations,
      amenities: p.amenities, house_rules: p.house_rules, services: p.services ?? [], arrival_instructions: p.arrival_instructions,
      corp_listed: !!p.corp_listed, corp_lease_only: !!p.corp_lease_only, corp_furnished: p.corp_furnished !== false,
      corp_monthly: p.corp_monthly_cents ? dollars(p.corp_monthly_cents) : null, corp_deposit: dollars(p.corp_deposit_cents),
      corp_cleaning: dollars(p.corp_cleaning_cents), corp_pet_fee: dollars(p.corp_pet_fee_cents), corp_app_fee: dollars(p.corp_app_fee_cents),
      corp_apply_url: p.corp_apply_url || "", corp_price_note: p.corp_price_note || "", corp_position: p.corp_position ?? null,
      corp_available_from: p.corp_available_from || null, furnished_finder_url: p.furnished_finder_url || "",
      lat: p.lat, lng: p.lng,
      photo_urls: (p.photo_ids || []).map(id => `${base}/api/photos/${id}`),
    };
  });
}
