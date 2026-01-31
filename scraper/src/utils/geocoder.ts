/**
 * Simple geocoding utility using Nominatim (OpenStreetMap) API
 * Rate limited to 1 request per second to comply with usage policy
 */

interface GeocodingResult {
  latitude: number;
  longitude: number;
}

interface NominatimResponse {
  lat: string;
  lon: string;
  display_name: string;
}

// Simple in-memory cache to avoid repeated geocoding of same addresses
const geocodeCache = new Map<string, GeocodingResult | null>();

// Rate limiting - track last request time
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1100; // 1.1 seconds to be safe

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve =>
      setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
    );
  }

  lastRequestTime = Date.now();
}

/**
 * Geocode an address to latitude/longitude coordinates
 * Uses Nominatim (OpenStreetMap) API - free but rate limited
 */
export async function geocodeAddress(
  address: string,
  city: string,
  state: string,
  zipCode?: string,
  county?: string
): Promise<GeocodingResult | null> {
  // Build full address string - include county for better accuracy
  // For Maryland counties, the county name helps Nominatim find the right location
  const parts = [address, city, county, state, zipCode].filter(Boolean);
  const fullAddress = parts.join(', ');

  // Check cache first
  const cacheKey = fullAddress.toLowerCase();
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey) || null;
  }

  try {
    await rateLimit();

    const encodedAddress = encodeURIComponent(fullAddress);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1&countrycodes=us`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'PermitSDR/1.0 (Clipper Construction Permit Tracking)',
      },
    });

    if (!response.ok) {
      console.warn(`[geocoder] HTTP error ${response.status} for: ${fullAddress}`);
      geocodeCache.set(cacheKey, null);
      return null;
    }

    const data: NominatimResponse[] = await response.json();

    if (data.length === 0) {
      // Try again without the city if we have county (city might be wrong)
      if (county && city) {
        console.log(`[geocoder] No results for: ${fullAddress}, trying with county only...`);
        const fallbackParts = [address, county, state, zipCode].filter(Boolean);
        const fallbackAddress = fallbackParts.join(', ');
        const fallbackEncoded = encodeURIComponent(fallbackAddress);

        await rateLimit();
        const fallbackResponse = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${fallbackEncoded}&limit=1&countrycodes=us`,
          {
            headers: {
              'User-Agent': 'PermitSDR/1.0 (Clipper Construction Permit Tracking)',
            },
          }
        );

        if (fallbackResponse.ok) {
          const fallbackData: NominatimResponse[] = await fallbackResponse.json();
          if (fallbackData.length > 0) {
            const result: GeocodingResult = {
              latitude: parseFloat(fallbackData[0].lat),
              longitude: parseFloat(fallbackData[0].lon),
            };
            console.log(`[geocoder] Geocoded "${fallbackAddress}" -> (${result.latitude}, ${result.longitude})`);
            geocodeCache.set(cacheKey, result);
            return result;
          }
        }
      }

      console.log(`[geocoder] No results for: ${fullAddress}`);
      geocodeCache.set(cacheKey, null);
      return null;
    }

    const result: GeocodingResult = {
      latitude: parseFloat(data[0].lat),
      longitude: parseFloat(data[0].lon),
    };

    console.log(`[geocoder] Geocoded "${fullAddress}" -> (${result.latitude}, ${result.longitude})`);
    geocodeCache.set(cacheKey, result);

    return result;
  } catch (error) {
    console.error(`[geocoder] Error geocoding "${fullAddress}":`, error);
    geocodeCache.set(cacheKey, null);
    return null;
  }
}

/**
 * Batch geocode multiple addresses
 * Respects rate limits automatically
 */
export async function geocodeAddresses(
  permits: Array<{
    address: string;
    city: string;
    state: string;
    zip_code?: string;
  }>
): Promise<Map<string, GeocodingResult | null>> {
  const results = new Map<string, GeocodingResult | null>();

  for (const permit of permits) {
    const key = `${permit.address}, ${permit.city}, ${permit.state}`;
    const result = await geocodeAddress(
      permit.address,
      permit.city,
      permit.state,
      permit.zip_code
    );
    results.set(key, result);
  }

  return results;
}

/**
 * Clear the geocode cache
 */
export function clearGeocodeCache(): void {
  geocodeCache.clear();
}
