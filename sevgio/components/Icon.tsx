// Line icons (Phosphor, bold weight) drawn in the text color, so they read clearly in black or white.
// Works in server and client components.
import {
  Airplane, Armchair, ArrowUpRight, Bank, Baseball, Bathtub, BeerStein, Bed, Briefcase, Buildings, Bus, CalendarBlank, Car, ChatsCircle, CheckCircle, Compass, CookingPot,
  Fire, Football, Hamburger, Hockey, House, Key, Laptop, Lightning, MapPin, Palette, PawPrint, Receipt, Shower, Snowflake, Sparkle,
  Stethoscope, Ticket, Train, UsersThree, WashingMachine, WifiHigh, Wrench,
  WarningCircle, Question, Clock, SignIn, SignOut, XCircle, Info, HourglassMedium, NotePencil, Prohibit, Chats, MoonStars, User, Lock, ChatSlash, PaperPlaneRight,
} from "@phosphor-icons/react/dist/ssr";

const ICONS = {
  all: Sparkle, home: House, room: Bed, pets: PawPrint, key: Key, car: Car, check: CheckCircle, wifi: WifiHigh, kitchen: CookingPot,
  washer: WashingMachine, ac: Snowflake, laptop: Laptop, bath: Bathtub, fire: Fire, bolt: Lightning, shower: Shower, calendar: CalendarBlank,
  football: Football, baseball: Baseball, hockey: Hockey, ticket: Ticket, compass: Compass, museum: Bank, art: Palette, food: Hamburger,
  drink: BeerStein, pin: MapPin, talk: ChatsCircle, bus: Bus, plane: Airplane, train: Train,
  briefcase: Briefcase, stethoscope: Stethoscope, wrench: Wrench, family: UsersThree, receipt: Receipt, sofa: Armchair, out: ArrowUpRight, buildings: Buildings,
  warn: WarningCircle, question: Question, clock: Clock, arrive: SignIn, leave: SignOut, cross: XCircle, info: Info, wait: HourglassMedium, edit: NotePencil, none: Prohibit,
  chats: Chats, nights: MoonStars, person: User, lock: Lock, nochat: ChatSlash, send: PaperPlaneRight,
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18, className = "ic" }: { name: IconName; size?: number; className?: string }) {
  const C = ICONS[name];
  return <C size={size} weight="bold" className={className} aria-hidden="true" />;
}
