import type { ProjectType } from '../types/index.js';

/**
 * Keywords that indicate permits NOT relevant for Clipper Construction
 * (single trade, MEP-only, fire protection only)
 */
const EXCLUDED_KEYWORDS = [
  // Single trade MEP
  'electrical only',
  'electric only',
  'electrical permit',
  'plumbing only',
  'plumbing permit',
  'hvac only',
  'mechanical only',
  'mechanical permit',

  // Fire protection specific
  'fire alarm',
  'fire sprinkler',
  'sprinkler system',
  'fire suppression',
  'fire protection',
  'fire extinguisher',
  'smoke detector',
  'fire detection',

  // Other single-trade
  'roofing only',
  'roof replacement',
  'roof repair',
  're-roof',
  'siding only',
  'window replacement only',
  'door replacement only',
  'fence permit',
  'sign permit',
  'signage',
  'pool permit',
  'swimming pool',
  'hot tub',
  'deck permit',
  'patio',
  'driveway',
  'paving',
  'grading only',
  'demolition only',

  // Residential indicators
  'single family',
  'single-family',
  'sfh',
  'townhouse',
  'townhome',
  'duplex',
  'triplex',
  'residential addition',
  'home addition',
  'basement finish',
  'basement remodel',
  'kitchen remodel',
  'bathroom remodel',
  'residential renovation',
  'residential alteration',
  'dwelling',
  'accessory dwelling',
  'adu',
  'garage',
  'carport',
  'shed',

  // Minor work
  'minor work',
  'minor alteration',
  'repair permit',
  'maintenance',
  'water heater',
  'furnace replacement',
  'ac replacement',
  'generator',
  'solar panel',
  'ev charger',
  'low voltage',
];

/**
 * Keywords that indicate permits ARE relevant for Clipper Construction
 * (commercial construction, substantial projects)
 */
const INCLUDED_KEYWORDS = [
  // Commercial indicators
  'commercial',
  'office building',
  'office space',
  'retail',
  'restaurant',
  'hotel',
  'motel',
  'warehouse',
  'industrial',
  'manufacturing',
  'medical office',
  'medical center',
  'healthcare',
  'hospital',
  'clinic',
  'dental',
  'veterinary',
  'bank',
  'financial',
  'church',
  'religious',
  'school',
  'educational',
  'university',
  'college',
  'daycare',
  'childcare',
  'fitness',
  'gym',
  'recreation',
  'community center',
  'senior living',
  'assisted living',
  'nursing home',
  'multi-family',
  'multifamily',
  'apartment',
  'condo',
  'condominium',
  'mixed use',
  'mixed-use',

  // Project types
  'new construction',
  'new building',
  'ground up',
  'shell building',
  'core and shell',
  'tenant improvement',
  'tenant fit-out',
  'tenant buildout',
  'interior fit-out',
  'interior buildout',
  'renovation',
  'remodel',
  'alteration',
  'addition',
  'expansion',
  'build out',
  'buildout',
  'fit out',
  'fit-out',
  'interior renovation',
  'facade',
  'storefront',

  // Substantial scope indicators
  'general construction',
  'full renovation',
  'complete renovation',
  'major renovation',
  'substantial',
  'comprehensive',
];

/**
 * Permit types that are typically NOT relevant
 */
const EXCLUDED_PERMIT_TYPES = [
  'electrical',
  'plumbing',
  'mechanical',
  'hvac',
  'fire alarm',
  'fire sprinkler',
  'fire protection',
  'roofing',
  'sign',
  'fence',
  'pool',
  'demolition',
  'grading',
  'excavation',
  'right of way',
  'use and occupancy',
  'certificate of occupancy',
  'temporary',
];

/**
 * Permit types that ARE typically relevant
 */
const INCLUDED_PERMIT_TYPES = [
  'building',
  'commercial',
  'new construction',
  'alteration',
  'addition',
  'renovation',
  'tenant',
  'fit-out',
  'interior',
  'shell',
];

/**
 * Determines if a permit is relevant for Clipper Construction
 * (commercial general contractor)
 */
export function isRelevantForClipperConstruction(
  description: string,
  permitType: string,
  projectType: ProjectType
): boolean {
  const descLower = (description || '').toLowerCase();
  const permitTypeLower = (permitType || '').toLowerCase();
  const combinedText = `${descLower} ${permitTypeLower}`;

  // First check: Exclude residential project types
  if (projectType === 'residential_new' || projectType === 'residential_renovation') {
    // Unless it's multi-family (apartments, condos)
    if (!combinedText.includes('multi') && !combinedText.includes('apartment') && !combinedText.includes('condo')) {
      return false;
    }
  }

  // Check for excluded keywords (single trade, fire alarm, etc.)
  for (const keyword of EXCLUDED_KEYWORDS) {
    if (combinedText.includes(keyword.toLowerCase())) {
      // Check if there are also included keywords that override
      const hasIncludedKeyword = INCLUDED_KEYWORDS.some(inc => combinedText.includes(inc.toLowerCase()));
      if (!hasIncludedKeyword) {
        return false;
      }
    }
  }

  // Check for excluded permit types
  for (const excludedType of EXCLUDED_PERMIT_TYPES) {
    if (permitTypeLower.includes(excludedType.toLowerCase())) {
      // If the permit type is specifically one of these, check if description indicates broader scope
      const hasBroaderScope = INCLUDED_KEYWORDS.some(inc => descLower.includes(inc.toLowerCase()));
      if (!hasBroaderScope) {
        return false;
      }
    }
  }

  // Check for included keywords - these are positive signals
  for (const keyword of INCLUDED_KEYWORDS) {
    if (combinedText.includes(keyword.toLowerCase())) {
      return true;
    }
  }

  // Check for included permit types
  for (const includedType of INCLUDED_PERMIT_TYPES) {
    if (permitTypeLower.includes(includedType.toLowerCase())) {
      return true;
    }
  }

  // Check project type - commercial types are relevant
  const relevantProjectTypes: ProjectType[] = [
    'commercial_new',
    'commercial_renovation',
    'industrial',
    'mixed_use',
  ];

  if (relevantProjectTypes.includes(projectType)) {
    return true;
  }

  // Default to false if we can't determine relevance
  return false;
}

/**
 * Classifies the project type based on description and permit type
 */
export function classifyProjectType(description: string, permitType: string): ProjectType {
  const text = `${description} ${permitType}`.toLowerCase();

  // Check for specific trades first (these get filtered out but need classification)
  if (text.includes('electrical') || text.includes('electric')) return 'electrical';
  if (text.includes('plumbing') || text.includes('water heater')) return 'plumbing';
  if (text.includes('hvac') || text.includes('mechanical') || text.includes('heating') || text.includes('cooling')) return 'hvac';
  if (text.includes('roof') || text.includes('shingle')) return 'roofing';
  if (text.includes('demolition') || text.includes('demo') || text.includes('raze')) return 'demolition';

  // Commercial indicators
  const commercialKeywords = [
    'commercial', 'office', 'retail', 'store', 'restaurant', 'hotel', 'warehouse',
    'business', 'medical', 'healthcare', 'hospital', 'clinic', 'bank', 'church',
    'school', 'educational', 'gym', 'fitness', 'senior living', 'assisted',
  ];
  const isCommercial = commercialKeywords.some(kw => text.includes(kw));

  // Residential indicators
  const residentialKeywords = [
    'residential', 'single family', 'single-family', 'townhouse', 'dwelling', 'home',
    'duplex', 'triplex',
  ];
  const isResidential = residentialKeywords.some(kw => text.includes(kw));

  // Multi-family (treated as commercial)
  const multiFamily = text.includes('multi-family') || text.includes('multifamily') ||
                      text.includes('apartment') || text.includes('condo');

  // New construction indicators
  const newConstructionKeywords = ['new construction', 'new building', 'new structure', 'construct new', 'ground up'];
  const isNew = newConstructionKeywords.some(kw => text.includes(kw));

  // Renovation indicators
  const renovationKeywords = ['renovation', 'remodel', 'alteration', 'addition', 'interior fit', 'tenant improvement', 'buildout', 'fit-out'];
  const isRenovation = renovationKeywords.some(kw => text.includes(kw));

  // Industrial
  if (text.includes('industrial') || text.includes('manufacturing') || text.includes('factory')) return 'industrial';

  // Mixed use
  if (text.includes('mixed use') || text.includes('mixed-use')) return 'mixed_use';

  // Multi-family is commercial
  if (multiFamily) {
    return isNew ? 'commercial_new' : 'commercial_renovation';
  }

  // Combined classifications
  if (isCommercial && isNew) return 'commercial_new';
  if (isCommercial && isRenovation) return 'commercial_renovation';
  if (isCommercial) return 'commercial_renovation';

  if (isResidential && isNew) return 'residential_new';
  if (isResidential && isRenovation) return 'residential_renovation';
  if (isResidential) return 'residential_renovation';

  if (isNew) return 'commercial_new';
  if (isRenovation) return 'commercial_renovation';

  return 'other';
}
