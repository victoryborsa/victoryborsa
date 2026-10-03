// Line icons (Phosphor, bold weight) drawn in the text color, so they read clearly in black or white.
// Works in server and client components.
import {
  Airplane, Bank, Baseball, Bathtub, BeerStein, Bed, Bus, CalendarBlank, Car, ChatsCircle, CheckCircle, Compass, CookingPot,
  Fire, Football, Hamburger, Hockey, House, Key, Laptop, Lightning, MapPin, Palette, PawPrint, Shower, Snowflake, Sparkle,
  Ticket, Train, WashingMachine, WifiHigh,
} from "@phosphor-icons/react/dist/ssr";

const ICONS = {
  all: Sparkle, home: House, room: Bed, pets: PawPrint, key: Key, car: Car, check: CheckCircle, wifi: WifiHigh, kitchen: CookingPot,
  washer: WashingMachine, ac: Snowflake, laptop: Laptop, bath: Bathtub, fire: Fire, bolt: Lightning, shower: Shower, calendar: CalendarBlank,
  football: Football, baseball: Baseball, hockey: Hockey, ticket: Ticket, compass: Compass, museum: Bank, art: Palette, food: Hamburger,
  drink: BeerStein, pin: MapPin, talk: ChatsCircle, bus: Bus, plane: Airplane, train: Train,
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18, className = "ic" }: { name: IconName; size?: number; className?: string }) {
  const C = ICONS[name];
  return <C size={size} weight="bold" className={className} aria-hidden="true" />;
}
