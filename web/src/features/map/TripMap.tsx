import type { Day } from '@tripwise/shared';
import type { FeatureCollection } from 'geojson';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { dayColor, MAP_STYLE } from './dayColors';

// MapLibre's worker is an ES module; Vite bundles it and hands over its URL.
maplibregl.setWorkerUrl(workerUrl);

export interface TripMapProps {
  days: readonly Day[];
  /** Show only this day, or every day when null. */
  focusDay: number | null;
  selectedStopId?: string | null;
  onSelectStop?: (stopId: string, day: number) => void;
  /** Keep the canvas readable for the PDF snapshot. */
  preserveDrawingBuffer?: boolean;
  onReady?: (map: MapLibreMap) => void;
  className?: string;
}

function routeData(days: readonly Day[], focusDay: number | null): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: days.flatMap((day, index) =>
      (focusDay === null || focusDay === index) && day.stops.length > 1
        ? [
            {
              type: 'Feature' as const,
              properties: { color: dayColor(index) },
              geometry: {
                type: 'LineString' as const,
                coordinates: day.stops.map((s) => [s.place.location.lng, s.place.location.lat]),
              },
            },
          ]
        : [],
    ),
  };
}

export function TripMap({
  days,
  focusDay,
  selectedStopId,
  onSelectStop,
  preserveDrawingBuffer = false,
  onReady,
  className = '',
}: TripMapProps) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const select = useRef(onSelectStop);
  useEffect(() => {
    select.current = onSelectStop;
  }, [onSelectStop]);

  useEffect(() => {
    if (!container.current) return;
    let instance: MapLibreMap;
    try {
      instance = new maplibregl.Map({
        container: container.current,
        style: MAP_STYLE,
        center: [0, 20],
        zoom: 1.5,
        attributionControl: { compact: true },
        canvasContextAttributes: { preserveDrawingBuffer },
        cooperativeGestures: true,
      });
    } catch {
      // No WebGL: the itinerary still works without the map. Detecting it means trying.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFailed(true);
      return;
    }
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    // Marks when every visible tile has drawn (used by the PDF snapshot and screenshots).
    instance.on('idle', () => container.current?.setAttribute('data-map-idle', 'true'));
    instance.on('dataloading', () => container.current?.removeAttribute('data-map-idle'));
    // If the style itself cannot load (offline, blocked), say so instead of showing a blank box.
    instance.on('error', () => {
      if (!instance.isStyleLoaded()) setFailed(true);
    });
    instance.once('style.load', () => {
      instance.addSource('routes', { type: 'geojson', data: routeData([], null) });
      instance.addLayer({
        id: 'routes',
        type: 'line',
        source: 'routes',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 3,
          'line-opacity': 0.8,
          'line-dasharray': [2, 1.5],
        },
      });
      setLoaded(true);
      onReady?.(instance);
    });
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
    };
  }, [preserveDrawingBuffer]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const instance = map.current;
    if (!instance || !loaded) return;
    void instance.getSource<GeoJSONSource>('routes')?.setData(routeData(days, focusDay));
    for (const marker of markers.current) marker.remove();
    markers.current = [];
    const bounds = new maplibregl.LngLatBounds();
    for (const [dayIndex, day] of days.entries()) {
      if (focusDay !== null && focusDay !== dayIndex) continue;
      for (const [index, stop] of day.stops.entries()) {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = `tw-marker${stop.id === selectedStopId ? ' tw-marker-selected' : ''}`;
        element.style.background = dayColor(dayIndex);
        element.textContent = String(index + 1);
        element.setAttribute(
          'aria-label',
          t('map.marker', { day: dayIndex + 1, number: index + 1, name: stop.place.name }),
        );
        element.addEventListener('click', () => select.current?.(stop.id, dayIndex));
        const { lng, lat } = stop.place.location;
        markers.current.push(
          new maplibregl.Marker({ element }).setLngLat([lng, lat]).addTo(instance),
        );
        bounds.extend([lng, lat]);
      }
    }
    if (!bounds.isEmpty()) instance.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 400 });
  }, [days, focusDay, selectedStopId, loaded, t]);

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-slate-100 p-6 text-center text-sm text-slate-600 ${className}`}
      >
        {t('map.unavailable')}
      </div>
    );
  }
  return (
    <div className={`relative overflow-hidden rounded-xl ring-1 ring-slate-200 ${className}`}>
      <div ref={container} role="region" aria-label={t('map.label')} className="h-full w-full" />
      <p className="pointer-events-none absolute start-2 bottom-2 rounded bg-white/90 px-2 py-0.5 text-xs text-slate-700">
        {t('map.linesNote')}
      </p>
    </div>
  );
}
