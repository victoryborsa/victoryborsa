import type { IconName } from "@/components/Icon.tsx";

/** The five groups on the Corporate Housing page. Each opens a panel with a photo, the full description and a request button
 *  that fills "I am a" in the request form with `who` (one of WHO_OPTIONS). */
export type Audience = {
  slug: string;
  label: string;
  icon: IconName;
  heading: string;
  subtitle: string;
  body: string[];
  button: string;
  who: string;
  /** The panel's photo until an admin uploads one: public/img/audiences/<slug>-{640,960,1280}.webp (4:3), from Unsplash
   *  (free for commercial use under the Unsplash License, no attribution required; source kept here for the record). */
  photo: { alt: string; source: string };
};

export const AUDIENCE_NOTE = "Property features, utilities, parking, pet policies, rates, and minimum stays vary by listing. Please confirm the details of your selected property before booking. Extensions are subject to availability.";

export const AUDIENCES: Audience[] = [
  {
    slug: "travel-nurses", label: "Travel nurses", icon: "stethoscope",
    heading: "Travel nurses", subtitle: "Your Pittsburgh home between shifts.",
    body: [
      "Coming to Pittsburgh for a travel nursing assignment? A furnished stay can help you settle in without purchasing furniture or arranging a permanent move. Whether you prefer a private room or an entire home, choosing housing around your hospital location, shift schedule, and budget can make daily life easier.",
      "Tell us your assignment dates, hospital or work location, and whether you work day or night shifts. Let us know if you need a private bathroom, kitchen access, laundry, parking, or space for someone traveling with you. We can review available listings against your priorities.",
      "Before booking, confirm what is included in the monthly price and how extensions or assignment changes would affect your stay. Availability and terms vary by property.",
    ],
    button: "Request Travel Nurse Housing", who: "Travel nurse or medical staff",
    photo: { alt: "Woman relaxing on a sofa with her phone and a coffee", source: "https://unsplash.com/photos/G7OFwXO79TY (Vitaly Gariev)" },
  },
  {
    slug: "doctors-and-residents", label: "Doctors and residents", icon: "check",
    heading: "Doctors and residents", subtitle: "A comfortable place to rest, study, and settle in.",
    body: [
      "Whether you are arriving for a clinical rotation, residency transition, fellowship, or temporary physician assignment, finding suitable housing is an important part of preparing for your time in Pittsburgh. A furnished room or home can provide a practical starting point while you focus on your work and training.",
      "Share your hospital or training location, arrival and departure dates, and preferred living arrangements. Tell us whether you need a private space for studying, internet access, laundry, parking, or accommodation for your family. Consider your actual work location and transportation needs when comparing properties.",
      "For longer appointments, ask about the available lease period and extension options. Specific amenities, commute times, and rental terms should be confirmed for the selected property.",
    ],
    button: "Request Medical Professional Housing", who: "Doctor or resident",
    photo: { alt: "Young man studying with a notebook and laptop at a desk at home", source: "https://unsplash.com/photos/Jeg0c4gnpOM (Vitaly Gariev)" },
  },
  {
    slug: "corporate-teams", label: "Corporate teams", icon: "briefcase",
    heading: "Corporate teams", subtitle: "Furnished stays for business assignments and project teams.",
    body: [
      "Organizing accommodation for a work assignment, employee relocation, training program, or extended business visit? Furnished housing can give employees space for everyday routines while they are working away from home.",
      "Send us your team size, work location, expected dates, budget, and bedroom requirements. Please specify whether each employee needs a separate bedroom or whether shared accommodation is acceptable. We can review whether an available home or a combination of properties fits your request.",
      "Include any workspace, internet, parking, invoicing, or company payment requirements in your inquiry. Team placement, billing arrangements, and stay extensions must be confirmed before booking.",
    ],
    button: "Request Team Housing", who: "Corporate team",
    photo: { alt: "Colleagues working on laptops around a wooden dining table", source: "https://unsplash.com/photos/dWYU3i-mqEo (Annie Spratt)" },
  },
  {
    slug: "contractors", label: "Contractors", icon: "wrench",
    heading: "Contractors", subtitle: "A practical home base for the length of your project.",
    body: [
      "Working in Pittsburgh on a construction, installation, maintenance, or other temporary project? Furnished accommodation can provide a place to rest, prepare meals, and manage everyday routines between workdays.",
      "Tell us the job-site location, project dates, crew size, and number of separate beds or bedrooms required. Include your work schedule and any needs for kitchen access, laundry, or vehicle parking so we can review suitable available options.",
      "If you travel with work trucks, trailers, or equipment, provide the details before booking. Parking and storage arrangements vary by property. If your project timeline changes, contact us early to ask about availability and extension terms.",
    ],
    button: "Request Contractor Housing", who: "Contractor or crew",
    photo: { alt: "Tradesperson in a hard hat and work clothes choosing tools from a toolbox", source: "https://unsplash.com/photos/Jt01DmHeiqM (Anton Dmitriev)" },
  },
  {
    slug: "relocating-families", label: "Relocating families", icon: "family",
    heading: "Relocating families", subtitle: "Settle into Pittsburgh while you plan your next move.",
    body: [
      "Moving to a new city can involve several timelines at once. Whether you are waiting for a home closing, preparing for a new job, or deciding where to live, a furnished temporary home can provide a place to settle while you arrange your next steps.",
      "Share your expected dates, household size, bedroom needs, preferred areas, and budget. Tell us about any needs for laundry, kitchen facilities, parking, or space for working from home. If you are bringing a pet, include that information so the property's pet policy and any fees can be confirmed.",
      "Before selecting a home, check the commute and any school enrollment requirements directly with the relevant school district. Stay extensions depend on availability and the agreed rental terms.",
    ],
    button: "Request Family Relocation Housing", who: "Relocating family",
    photo: { alt: "Couple sitting on the floor among moving boxes", source: "https://unsplash.com/photos/yxnzg8mn2O8 (Vitaly Gariev)" },
  },
];

/** "I am a" choices in the request form. The five groups above each have their own. */
export const WHO_OPTIONS = ["Travel nurse or medical staff", "Doctor or resident", "Corporate team", "Company HR or relocation", "Contractor or crew", "Relocating family", "Corporate housing company", "Other"];

export const audienceBySlug = (slug: string | undefined) => AUDIENCES.find(a => a.slug === slug);

/** Slot name in site_photos for a group's uploaded photo. */
export const audienceSlot = (slug: string) => `audience:${slug}`;
