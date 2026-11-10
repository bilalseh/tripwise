/* Generated from the Pydantic models in api/. Do not edit; run `pnpm gen:schemas`. */

import { z } from 'zod';

export const TripRequestSchema = z
  .object({
    destinations: z
      .array(
        z
          .object({
            name: z.string().min(1).max(120),
            displayName: z.string().max(300),
            country: z.union([z.string().max(80), z.null()]).default(null),
            countryCode: z
              .union([z.string().regex(new RegExp('^[a-z]{2}$')), z.null()])
              .default(null),
            location: z
              .object({ lat: z.number().gte(-90).lte(90), lng: z.number().gte(-180).lte(180) })
              .strict(),
            days: z.number().int().gte(1).lte(14),
          })
          .strict(),
      )
      .min(1)
      .max(3),
    startDate: z.union([z.string().date(), z.null()]).default(null),
    travelers: z
      .object({
        party: z.enum(['solo', 'couple', 'family', 'friends']),
        adults: z.number().int().gte(1).lte(12),
        children: z.number().int().gte(0).lte(10).default(0),
      })
      .strict(),
    budgetLevel: z.enum(['budget', 'moderate', 'luxury']),
    budgetAmount: z.union([z.number().gte(0).lte(1000000), z.null()]).default(null),
    currency: z.string().regex(new RegExp('^[A-Z]{3}$')),
    interests: z
      .array(
        z.enum([
          'food',
          'history',
          'art',
          'nature',
          'nightlife',
          'shopping',
          'relaxation',
          'adventure',
        ]),
      )
      .min(1)
      .max(8),
    pace: z.enum(['relaxed', 'balanced', 'packed']),
    constraints: z
      .object({
        mobility: z.enum(['none', 'limited', 'wheelchair']),
        dietary: z.array(z.enum(['vegetarian', 'vegan', 'halal', 'kosher', 'gluten_free'])).max(5),
        mustSee: z.array(z.string().min(1).max(120)).max(10),
        notes: z.string().max(500).default(''),
      })
      .strict(),
  })
  .strict();

export const CreateTripRequestSchema = z
  .object({
    title: z.union([z.string().min(1).max(120), z.null()]).default(null),
    request: z
      .object({
        destinations: z
          .array(
            z
              .object({
                name: z.string().min(1).max(120),
                displayName: z.string().max(300),
                country: z.union([z.string().max(80), z.null()]).default(null),
                countryCode: z
                  .union([z.string().regex(new RegExp('^[a-z]{2}$')), z.null()])
                  .default(null),
                location: z
                  .object({ lat: z.number().gte(-90).lte(90), lng: z.number().gte(-180).lte(180) })
                  .strict(),
                days: z.number().int().gte(1).lte(14),
              })
              .strict(),
          )
          .min(1)
          .max(3),
        startDate: z.union([z.string().date(), z.null()]).default(null),
        travelers: z
          .object({
            party: z.enum(['solo', 'couple', 'family', 'friends']),
            adults: z.number().int().gte(1).lte(12),
            children: z.number().int().gte(0).lte(10).default(0),
          })
          .strict(),
        budgetLevel: z.enum(['budget', 'moderate', 'luxury']),
        budgetAmount: z.union([z.number().gte(0).lte(1000000), z.null()]).default(null),
        currency: z.string().regex(new RegExp('^[A-Z]{3}$')),
        interests: z
          .array(
            z.enum([
              'food',
              'history',
              'art',
              'nature',
              'nightlife',
              'shopping',
              'relaxation',
              'adventure',
            ]),
          )
          .min(1)
          .max(8),
        pace: z.enum(['relaxed', 'balanced', 'packed']),
        constraints: z
          .object({
            mobility: z.enum(['none', 'limited', 'wheelchair']),
            dietary: z
              .array(z.enum(['vegetarian', 'vegan', 'halal', 'kosher', 'gluten_free']))
              .max(5),
            mustSee: z.array(z.string().min(1).max(120)).max(10),
            notes: z.string().max(500).default(''),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export const SaveTripRequestSchema = z
  .object({
    baseVersion: z.number().int().gte(0),
    title: z.string().min(1).max(120),
    days: z
      .array(
        z
          .object({
            title: z.string().max(120).default(''),
            destinationIndex: z.number().int().gte(0).lte(2),
            stops: z
              .array(
                z
                  .object({
                    id: z.string().regex(new RegExp('^[A-Za-z0-9_-]{1,64}$')),
                    place: z
                      .object({
                        name: z.string().min(1).max(120),
                        address: z.string().max(300),
                        location: z
                          .object({
                            lat: z.number().gte(-90).lte(90),
                            lng: z.number().gte(-180).lte(180),
                          })
                          .strict(),
                        osmId: z.union([z.string().max(40), z.null()]).default(null),
                        source: z.enum(['nominatim', 'photon', 'seed', 'fake']),
                      })
                      .strict(),
                    category: z.enum([
                      'sight',
                      'museum',
                      'food',
                      'nature',
                      'nightlife',
                      'shopping',
                      'activity',
                      'relax',
                    ]),
                    slot: z.enum(['morning', 'afternoon', 'evening']),
                    reason: z.string().max(500).default(''),
                    durationMinutes: z.number().int().gte(15).lte(600),
                    costEstimate: z.number().gte(0).lte(1000000),
                    locked: z.boolean().default(false),
                    note: z.string().max(500).default(''),
                  })
                  .strict(),
              )
              .max(12),
            rainPlan: z
              .array(
                z
                  .object({
                    id: z.string().regex(new RegExp('^[A-Za-z0-9_-]{1,64}$')),
                    place: z
                      .object({
                        name: z.string().min(1).max(120),
                        address: z.string().max(300),
                        location: z
                          .object({
                            lat: z.number().gte(-90).lte(90),
                            lng: z.number().gte(-180).lte(180),
                          })
                          .strict(),
                        osmId: z.union([z.string().max(40), z.null()]).default(null),
                        source: z.enum(['nominatim', 'photon', 'seed', 'fake']),
                      })
                      .strict(),
                    category: z.enum([
                      'sight',
                      'museum',
                      'food',
                      'nature',
                      'nightlife',
                      'shopping',
                      'activity',
                      'relax',
                    ]),
                    slot: z.enum(['morning', 'afternoon', 'evening']),
                    reason: z.string().max(500).default(''),
                    durationMinutes: z.number().int().gte(15).lte(600),
                    costEstimate: z.number().gte(0).lte(1000000),
                    locked: z.boolean().default(false),
                    note: z.string().max(500).default(''),
                  })
                  .strict(),
              )
              .max(6),
            estimates: z
              .object({
                stay: z.number().gte(0).lte(1000000).default(0),
                food: z.number().gte(0).lte(1000000).default(0),
                transport: z.number().gte(0).lte(1000000).default(0),
              })
              .strict(),
          })
          .strict(),
      )
      .max(14),
    overrides: z
      .array(
        z
          .object({
            day: z.number().int().gte(0).lt(14),
            category: z.enum(['stay', 'food', 'transport', 'activities']),
            amount: z.number().gte(0).lte(1000000),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();

export const GenerateRequestSchema = z
  .object({ firstDay: z.number().int().gte(0).lt(14), dayCount: z.number().int().gte(1).lte(4) })
  .strict();

export const DuplicateTripRequestSchema = z
  .object({
    title: z.union([z.string().min(1).max(120), z.null()]).default(null),
    startDate: z.union([z.string().date(), z.null()]).default(null),
  })
  .strict();

export const AiEditRequestSchema = z
  .object({
    action: z.enum(['relaxed', 'rainy', 'local_food', 'cheaper']),
    dayIndex: z.number().int().gte(0).lt(14),
    day: z
      .object({
        title: z.string().max(120).default(''),
        destinationIndex: z.number().int().gte(0).lte(2),
        stops: z
          .array(
            z
              .object({
                id: z.string().regex(new RegExp('^[A-Za-z0-9_-]{1,64}$')),
                place: z
                  .object({
                    name: z.string().min(1).max(120),
                    address: z.string().max(300),
                    location: z
                      .object({
                        lat: z.number().gte(-90).lte(90),
                        lng: z.number().gte(-180).lte(180),
                      })
                      .strict(),
                    osmId: z.union([z.string().max(40), z.null()]).default(null),
                    source: z.enum(['nominatim', 'photon', 'seed', 'fake']),
                  })
                  .strict(),
                category: z.enum([
                  'sight',
                  'museum',
                  'food',
                  'nature',
                  'nightlife',
                  'shopping',
                  'activity',
                  'relax',
                ]),
                slot: z.enum(['morning', 'afternoon', 'evening']),
                reason: z.string().max(500).default(''),
                durationMinutes: z.number().int().gte(15).lte(600),
                costEstimate: z.number().gte(0).lte(1000000),
                locked: z.boolean().default(false),
                note: z.string().max(500).default(''),
              })
              .strict(),
          )
          .max(12),
        rainPlan: z
          .array(
            z
              .object({
                id: z.string().regex(new RegExp('^[A-Za-z0-9_-]{1,64}$')),
                place: z
                  .object({
                    name: z.string().min(1).max(120),
                    address: z.string().max(300),
                    location: z
                      .object({
                        lat: z.number().gte(-90).lte(90),
                        lng: z.number().gte(-180).lte(180),
                      })
                      .strict(),
                    osmId: z.union([z.string().max(40), z.null()]).default(null),
                    source: z.enum(['nominatim', 'photon', 'seed', 'fake']),
                  })
                  .strict(),
                category: z.enum([
                  'sight',
                  'museum',
                  'food',
                  'nature',
                  'nightlife',
                  'shopping',
                  'activity',
                  'relax',
                ]),
                slot: z.enum(['morning', 'afternoon', 'evening']),
                reason: z.string().max(500).default(''),
                durationMinutes: z.number().int().gte(15).lte(600),
                costEstimate: z.number().gte(0).lte(1000000),
                locked: z.boolean().default(false),
                note: z.string().max(500).default(''),
              })
              .strict(),
          )
          .max(6),
        estimates: z
          .object({
            stay: z.number().gte(0).lte(1000000).default(0),
            food: z.number().gte(0).lte(1000000).default(0),
            transport: z.number().gte(0).lte(1000000).default(0),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export const TravelRequestSchema = z
  .object({
    points: z
      .array(
        z.object({ lat: z.number().gte(-90).lte(90), lng: z.number().gte(-180).lte(180) }).strict(),
      )
      .min(2)
      .max(13),
  })
  .strict();

export const PreferencesSchema = z
  .object({
    language: z.enum(['en', 'ar']),
    homeCurrency: z.string().regex(new RegExp('^[A-Z]{3}$')).default('USD'),
    units: z.enum(['metric', 'imperial']),
  })
  .strict();

export const PackingListSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.string().regex(new RegExp('^[A-Za-z0-9_-]{1,64}$')),
            label: z.string().min(1).max(120),
            category: z.enum([
              'documents',
              'clothing',
              'toiletries',
              'health',
              'electronics',
              'kids',
              'gear',
              'other',
            ]),
            quantity: z.number().int().gte(1).lte(99).default(1),
            checked: z.boolean().default(false),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();

export const DocumentChecklistSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.string().regex(new RegExp('^[A-Za-z0-9_-]{1,64}$')),
            kind: z.enum([
              'passport',
              'visa',
              'insurance',
              'tickets',
              'bookings',
              'driving',
              'health',
              'children',
              'custom',
            ]),
            label: z.string().min(1).max(120),
            done: z.boolean().default(false),
            dueDate: z.union([z.string().date(), z.null()]).default(null),
            note: z.string().max(500).default(''),
          })
          .strict(),
      )
      .max(60),
  })
  .strict();

export const SaveTemplateRequestSchema = z.object({ name: z.string().min(1).max(120) }).strict();

export const ConfirmCheckoutRequestSchema = z
  .object({ sessionId: z.string().regex(new RegExp('^cs_test_[A-Za-z0-9]{1,200}$')) })
  .strict();
