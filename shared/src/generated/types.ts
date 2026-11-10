/* Generated from the Pydantic models in api/. Do not edit; run `pnpm gen:schemas`. */

export interface AiEditProposal {
  action: EditAction;
  dayIndex: number;
  day: Day;
  summary: string;
  report: GroundingReport;
}

export interface AiEditRequest {
  action: EditAction;
  dayIndex: number;
  day: Day;
}

export interface BillingStatus {
  /**
   * False when test-mode Stripe keys are not configured
   */
  available: boolean;
  tier: Tier;
  priceCents: number;
}

export type BudgetCategory = 'stay' | 'food' | 'transport' | 'activities';

export type BudgetLevel = 'budget' | 'moderate' | 'luxury';

/**
 * The user's own number for one day and category, replacing the estimate.
 */
export interface BudgetOverride {
  day: number;
  category: BudgetCategory;
  amount: number;
}

export interface CheckoutSession {
  url: string;
}

export interface ConfirmCheckoutRequest {
  sessionId: string;
}

export interface Constraints {
  mobility: Mobility;
  /**
   * @maxItems 5
   */
  dietary: Dietary[];
  /**
   * @maxItems 10
   */
  mustSee: string[];
  notes: string;
}

export interface CreateTripRequest {
  title: string | null;
  request: TripRequest;
}

export interface Day {
  title: string;
  destinationIndex: number;
  /**
   * @maxItems 12
   */
  stops: Stop[];
  /**
   * @maxItems 6
   */
  rainPlan: Stop[];
  estimates: DayEstimates;
}

/**
 * AI estimates per day for the whole party. Activities come from the stops.
 */
export interface DayEstimates {
  stay: number;
  food: number;
  transport: number;
}

/**
 * A destination the user picked from geocoder results, so its coordinates are real.
 */
export interface Destination {
  name: string;
  displayName: string;
  country: string | null;
  countryCode: string | null;
  location: GeoPoint;
  /**
   * Half the diagonal of its area, from the geocoder
   */
  radiusKm: number | null;
  days: number;
}

export interface DestinationWeather {
  destinationIndex: number;
  days: WeatherDay[];
}

export type Dietary = 'vegetarian' | 'vegan' | 'halal' | 'kosher' | 'gluten_free';

export interface DocumentChecklist {
  /**
   * @maxItems 60
   */
  items: DocumentItem[];
}

export interface DocumentItem {
  id: string;
  kind: DocumentKind;
  label: string;
  done: boolean;
  dueDate: string | null;
  note: string;
}

export type DocumentKind =
  | 'passport'
  | 'visa'
  | 'insurance'
  | 'tickets'
  | 'bookings'
  | 'driving'
  | 'health'
  | 'children'
  | 'custom';

export interface DocumentsResponse {
  checklist: DocumentChecklist;
  officialLinks: OfficialLink[];
  /**
   * The passport should be valid at least until this date (common rule)
   */
  passportValidUntil: string | null;
}

export interface DuplicateTripRequest {
  title: string | null;
  startDate: string | null;
}

export type EditAction = 'relaxed' | 'rainy' | 'local_food' | 'cheaper';

/**
 * Generate days [first_day, first_day + day_count). Long trips are generated in batches,
 * so each request fits well inside the 60-second Hosting timeout.
 */
export interface GenerateRequest {
  firstDay: number;
  dayCount: number;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * What happened to the AI's suggestions on the way to the user.
 */
export interface GroundingReport {
  provider: string;
  suggested: number;
  kept: number;
  /**
   * @maxItems 60
   */
  dropped: string[];
  /**
   * @maxItems 60
   */
  trimmed: string[];
}

export interface HealthResponse {
  status: 'ok';
  version: string;
}

export type Interest =
  'food' | 'history' | 'art' | 'nature' | 'nightlife' | 'shopping' | 'relaxation' | 'adventure';

export type Language = 'en' | 'ar';

export type Mobility = 'none' | 'limited' | 'wheelchair';

export interface OfficialLink {
  label: string;
  url: string;
}

export type Pace = 'relaxed' | 'balanced' | 'packed';

export type PackingCategory =
  'documents' | 'clothing' | 'toiletries' | 'health' | 'electronics' | 'kids' | 'gear' | 'other';

export interface PackingItem {
  id: string;
  label: string;
  category: PackingCategory;
  quantity: number;
  checked: boolean;
}

export interface PackingList {
  /**
   * @maxItems 200
   */
  items: PackingItem[];
}

export interface PackingTemplate {
  id: string;
  name: string;
  /**
   * @maxItems 200
   */
  items: PackingItem[];
  createdAt: string;
}

export type Party = 'solo' | 'couple' | 'family' | 'friends';

export interface Place {
  name: string;
  address: string;
  location: GeoPoint;
  osmId: string | null;
  source: PlaceSource;
}

export type PlaceKind = 'poi' | 'area';

export interface PlaceResult {
  place: Place;
  kind: PlaceKind;
  country: string | null;
  countryCode: string | null;
  /**
   * Size of an area result
   */
  radiusKm: number | null;
  /**
   * Another name the search matched (for example a translation)
   */
  alsoKnownAs: string | null;
}

export interface PlaceSearchResponse {
  results: PlaceResult[];
  attribution: string;
}

/**
 * Where the coordinates and address came from. Never the AI.
 */
export type PlaceSource = 'nominatim' | 'photon' | 'wikidata' | 'seed' | 'fake';

/**
 * Settings the user chooses. Language also sets the language the AI writes in.
 */
export interface Preferences {
  language: Language;
  homeCurrency: string;
  units: Units;
}

/**
 * The signed-in user's profile, stored at users/{uid}.
 */
export interface Profile {
  uid: string;
  displayName: string | null;
  email: string | null;
  isDemo: boolean;
  createdAt: string;
  tier: Tier;
  preferences: Preferences;
}

export interface SaveTemplateRequest {
  name: string;
}

/**
 * The editable parts of a trip, saved together. `base_version` guards against overwriting
 * a newer save from another tab.
 */
export interface SaveTripRequest {
  baseVersion: number;
  title: string;
  /**
   * @maxItems 14
   */
  days: Day[];
  /**
   * @maxItems 200
   */
  overrides: BudgetOverride[];
}

export interface ShareLink {
  token: string;
  path: string;
}

/**
 * The read-only view behind a share link: the map and the itinerary, nothing private
 * (no notes, budget overrides, packing list or documents).
 */
export interface SharedTrip {
  title: string;
  destinations: Destination[];
  startDate: string | null;
  travelers: Travelers;
  currency: string;
  days: Day[];
}

export type Slot = 'morning' | 'afternoon' | 'evening';

export interface Stop {
  id: string;
  place: Place;
  category: StopCategory;
  slot: Slot;
  reason: string;
  /**
   * Estimate
   */
  durationMinutes: number;
  /**
   * Estimate for the whole party, in trip currency
   */
  costEstimate: number;
  locked: boolean;
  note: string;
}

export type StopCategory =
  'sight' | 'museum' | 'food' | 'nature' | 'nightlife' | 'shopping' | 'activity' | 'relax';

export type Tier = 'free' | 'pro';

export interface TravelLeg {
  minutes: number;
  km: number;
  mode: TravelMode;
  source: TravelSource;
}

export type TravelMode = 'walk' | 'drive';

export interface TravelRequest {
  /**
   * @minItems 2
   * @maxItems 13
   */
  points: [GeoPoint, GeoPoint, ...GeoPoint[]];
}

export interface TravelResponse {
  legs: TravelLeg[];
}

export type TravelSource = 'osrm' | 'estimate';

export interface Travelers {
  party: Party;
  adults: number;
  children: number;
}

export interface Trip {
  id: string;
  title: string;
  request: TripRequest;
  status: TripStatus;
  /**
   * @maxItems 14
   */
  days: Day[];
  /**
   * @maxItems 200
   */
  overrides: BudgetOverride[];
  version: number;
  createdAt: string;
  updatedAt: string;
  shareToken: string | null;
  report: GroundingReport | null;
}

export interface TripRequest {
  /**
   * @minItems 1
   * @maxItems 3
   */
  destinations: [Destination, ...Destination[]];
  startDate: string | null;
  travelers: Travelers;
  budgetLevel: BudgetLevel;
  /**
   * Total for the whole trip
   */
  budgetAmount: number | null;
  currency: string;
  /**
   * @minItems 1
   * @maxItems 8
   */
  interests: [Interest, ...Interest[]];
  pace: Pace;
  constraints: Constraints;
}

export type TripStatus = 'draft' | 'ready';

export interface TripSummary {
  id: string;
  title: string;
  destinations: string[];
  startDate: string | null;
  totalDays: number;
  status: TripStatus;
  stops: number;
  updatedAt: string;
}

export type Units = 'metric' | 'imperial';

/**
 * Today's AI requests and the trips allowed on the user's plan.
 */
export interface Usage {
  aiUsed: number;
  aiLimit: number;
  resetsAt: string;
  tier: Tier;
  trips: number;
  /**
   * Trips allowed on this plan; null is unlimited
   */
  tripLimit: number | null;
}

export interface WeatherDay {
  date: string;
  tempMax: number | null;
  tempMin: number | null;
  /**
   * Probability (%) or amount (mm), see kind
   */
  precipitation: number | null;
  code: number | null;
}

export type WeatherKind = 'forecast' | 'typical' | 'unavailable';

export interface WeatherReport {
  kind: WeatherKind;
  destinations: DestinationWeather[];
  attribution: string;
}
