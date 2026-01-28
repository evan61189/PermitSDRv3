import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PermitWithScore } from '../types';
import { Link } from 'react-router-dom';

// Fix for default marker icons in Leaflet with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom marker icons by opportunity rating
const createCustomIcon = (rating: string) => {
  const colors: Record<string, string> = {
    hot: '#ef4444',     // red
    warm: '#f59e0b',    // amber
    cold: '#3b82f6',    // blue
    not_relevant: '#9ca3af', // gray
  };

  const color = colors[rating] || colors.not_relevant;

  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        width: 24px;
        height: 24px;
        background-color: ${color};
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      "></div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
};

interface OpportunityMapProps {
  permits: PermitWithScore[];
  className?: string;
}

// Component to auto-fit bounds when permits change
function FitBounds({ permits }: { permits: PermitWithScore[] }) {
  const map = useMap();

  useEffect(() => {
    if (permits.length === 0) return;

    const validPermits = permits.filter(p => p.latitude && p.longitude);
    if (validPermits.length === 0) return;

    const bounds = L.latLngBounds(
      validPermits.map(p => [p.latitude!, p.longitude!] as [number, number])
    );

    map.fitBounds(bounds, { padding: [50, 50] });
  }, [permits, map]);

  return null;
}

export default function OpportunityMap({ permits, className = '' }: OpportunityMapProps) {
  // Filter permits that have coordinates
  const permitsWithCoords = permits.filter(p => p.latitude && p.longitude);

  // Default center: Maryland/DC area
  const defaultCenter: [number, number] = [39.0458, -76.6413];
  const defaultZoom = 9;

  if (permitsWithCoords.length === 0) {
    return (
      <div className={`bg-gray-100 rounded-lg flex items-center justify-center ${className}`}>
        <div className="text-center text-gray-500 p-8">
          <p className="font-medium">No geocoded permits to display</p>
          <p className="text-sm mt-1">Permits with valid addresses will appear on the map</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg overflow-hidden ${className}`}>
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        style={{ height: '100%', width: '100%', minHeight: '300px' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds permits={permitsWithCoords} />

        {permitsWithCoords.map((permit) => (
          <Marker
            key={permit.id}
            position={[permit.latitude!, permit.longitude!]}
            icon={createCustomIcon(permit.opportunity_rating || 'not_relevant')}
          >
            <Popup>
              <div className="min-w-[200px]">
                <div className="font-semibold text-gray-900 mb-1">
                  {permit.permit_number}
                </div>
                <div className="text-sm text-gray-600 mb-2">
                  {permit.address}
                  {permit.city && `, ${permit.city}`}
                </div>
                {permit.description && (
                  <p className="text-sm text-gray-700 mb-2 line-clamp-2">
                    {permit.description.substring(0, 100)}
                    {permit.description.length > 100 ? '...' : ''}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <span className={`
                    px-2 py-0.5 rounded text-xs font-medium capitalize
                    ${permit.opportunity_rating === 'hot' ? 'bg-red-100 text-red-700' : ''}
                    ${permit.opportunity_rating === 'warm' ? 'bg-amber-100 text-amber-700' : ''}
                    ${permit.opportunity_rating === 'cold' ? 'bg-blue-100 text-blue-700' : ''}
                    ${permit.opportunity_rating === 'not_relevant' ? 'bg-gray-100 text-gray-700' : ''}
                  `}>
                    {permit.opportunity_rating?.replace('_', ' ')}
                  </span>
                  {permit.overall_score !== null && (
                    <span className="text-sm font-medium text-gray-900">
                      Score: {permit.overall_score}
                    </span>
                  )}
                </div>
                <Link
                  to={`/permits/${permit.id}`}
                  className="block mt-2 text-center text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  View Details
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Legend */}
      <div className="bg-white border-t px-4 py-2 flex items-center gap-4 text-sm">
        <span className="text-gray-500">Legend:</span>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <span>Hot</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-amber-500"></div>
          <span>Warm</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <span>Cold</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-gray-400"></div>
          <span>Not Relevant</span>
        </div>
      </div>
    </div>
  );
}
