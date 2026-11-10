/** Query options for every API read, so keys stay consistent across the app. */
import type {
  AiEditProposal,
  AiEditRequest,
  BillingStatus,
  DocumentChecklist,
  DocumentsResponse,
  DuplicateTripRequest,
  PackingList,
  PackingTemplate,
  PlaceSearchResponse,
  Preferences,
  Profile,
  SaveTripRequest,
  SharedTrip,
  ShareLink,
  TravelLeg,
  TravelResponse,
  Trip,
  TripSummary,
  Usage,
  WeatherReport,
} from '@tripwise/shared';
import { CreateTripRequestSchema } from '@tripwise/shared';
import { queryOptions } from '@tanstack/react-query';
import type { z } from 'zod';

import { api } from './apiClient';

export const keys = {
  profile: (uid: string) => ['profile', uid] as const,
  usage: (uid: string) => ['usage', uid] as const,
  trips: (uid: string) => ['trips', uid] as const,
  trip: (uid: string, tripId: string) => ['trip', uid, tripId] as const,
  packing: (uid: string, tripId: string) => ['packing', uid, tripId] as const,
  documents: (uid: string, tripId: string) => ['documents', uid, tripId] as const,
  weather: (uid: string, tripId: string) => ['weather', uid, tripId] as const,
  templates: (uid: string) => ['templates', uid] as const,
  billing: (uid: string) => ['billing', uid] as const,
  shared: (token: string) => ['shared', token] as const,
};

/** POST /api/me is idempotent: it returns the profile, creating (and demo-seeding) it once. */
export const profileQuery = (uid: string) =>
  queryOptions({
    queryKey: keys.profile(uid),
    queryFn: () => api.post<Profile>('/me'),
    staleTime: Infinity,
  });

export const usageQuery = (uid: string) =>
  queryOptions({ queryKey: keys.usage(uid), queryFn: () => api.get<Usage>('/me/usage') });

export const tripsQuery = (uid: string) =>
  queryOptions({ queryKey: keys.trips(uid), queryFn: () => api.get<TripSummary[]>('/trips') });

export const tripQuery = (uid: string, tripId: string) =>
  queryOptions({
    queryKey: keys.trip(uid, tripId),
    queryFn: () => api.get<Trip>(`/trips/${encodeURIComponent(tripId)}`),
    staleTime: Infinity, // the itinerary store owns edits; the server copy is refreshed on save
  });

export const packingQuery = (uid: string, tripId: string) =>
  queryOptions({
    queryKey: keys.packing(uid, tripId),
    queryFn: () => api.get<PackingList>(`/trips/${encodeURIComponent(tripId)}/packing`),
  });

export const documentsQuery = (uid: string, tripId: string) =>
  queryOptions({
    queryKey: keys.documents(uid, tripId),
    queryFn: () => api.get<DocumentsResponse>(`/trips/${encodeURIComponent(tripId)}/documents`),
  });

export const weatherQuery = (uid: string, tripId: string) =>
  queryOptions({
    queryKey: keys.weather(uid, tripId),
    queryFn: () => api.get<WeatherReport>(`/trips/${encodeURIComponent(tripId)}/weather`),
    staleTime: 60 * 60_000,
  });

export const templatesQuery = (uid: string) =>
  queryOptions({
    queryKey: keys.templates(uid),
    queryFn: () => api.get<PackingTemplate[]>('/packing-templates'),
  });

export const billingQuery = (uid: string) =>
  queryOptions({ queryKey: keys.billing(uid), queryFn: () => api.get<BillingStatus>('/billing') });

export const sharedTripQuery = (token: string) =>
  queryOptions({
    queryKey: keys.shared(token),
    queryFn: () => api.get<SharedTrip>(`/shared/${encodeURIComponent(token)}`, { anonymous: true }),
    retry: false,
  });

const tripPath = (tripId: string) => `/trips/${encodeURIComponent(tripId)}` as const;

export const tripApi = {
  /** Takes the wizard's request after the generated Zod schema validated it. */
  create: (body: z.output<typeof CreateTripRequestSchema>) => api.post<Trip>('/trips', body),
  save: (tripId: string, body: SaveTripRequest) => api.put<Trip>(tripPath(tripId), body),
  remove: (tripId: string) => api.delete(tripPath(tripId)),
  generate: (tripId: string, firstDay: number, dayCount: number) =>
    api.post<Trip>(`${tripPath(tripId)}/generate`, { firstDay, dayCount }),
  duplicate: (tripId: string, body: DuplicateTripRequest) =>
    api.post<Trip>(`${tripPath(tripId)}/duplicate`, body),
  aiEdit: (tripId: string, body: AiEditRequest) =>
    api.post<AiEditProposal>(`${tripPath(tripId)}/ai-edit`, body),
  share: (tripId: string) => api.post<ShareLink>(`${tripPath(tripId)}/share`),
  unshare: (tripId: string) => api.delete(`${tripPath(tripId)}/share`),
  savePacking: (tripId: string, body: PackingList) =>
    api.put<PackingList>(`${tripPath(tripId)}/packing`, body),
  saveTemplate: (tripId: string, name: string) =>
    api.post<PackingTemplate>(`${tripPath(tripId)}/packing/template`, { name }),
  deleteTemplate: (templateId: string) =>
    api.delete(`/packing-templates/${encodeURIComponent(templateId)}`),
  saveDocuments: (tripId: string, body: DocumentChecklist) =>
    api.put<DocumentsResponse>(`${tripPath(tripId)}/documents`, body),
};

export const placesApi = {
  search: (q: string, near?: { lat: number; lng: number }) => {
    const params = new URLSearchParams({ q });
    if (near) {
      params.set('lat', String(near.lat));
      params.set('lng', String(near.lng));
    }
    return api.get<PlaceSearchResponse>(`/places/search?${params.toString()}`);
  },
  travel: async (points: { lat: number; lng: number }[]): Promise<TravelLeg[]> =>
    (await api.post<TravelResponse>('/travel', { points })).legs,
};

export const accountApi = {
  savePreferences: (preferences: Preferences) => api.put<Profile>('/me/preferences', preferences),
  deleteData: () => api.delete('/me'),
};
