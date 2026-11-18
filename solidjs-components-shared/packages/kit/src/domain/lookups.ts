/** Icon glyphs for issue types. */
export type IssueTypeKind =
  | 'bug'
  | 'story'
  | 'task'
  | 'epic'
  | 'subtask'
  | 'feature'
  | 'improvement'
  | 'support'
  | 'change'
  | 'generic';

/** Priority/severity levels, rendered as arrows. */
export type PriorityLevel = 'highest' | 'high' | 'medium' | 'low' | 'lowest' | 'none';

/** Icon glyphs for asset types: vehicles, trailers and plant. */
export type AssetKind =
  | 'car'
  | 'van'
  | 'ute'
  | 'truck'
  | 'bus'
  | 'trailer'
  | 'forklift'
  | 'excavator'
  | 'generator'
  | 'lift'
  | 'equipment';

/** Icon glyphs for kinds of maintenance work. */
export type WorkKind = 'service' | 'repair' | 'inspection' | 'tyres' | 'recall' | 'damage' | 'compliance' | 'generic';

/**
 * Which icon family a lookup field shows next to each value: issue types, priority arrows, asset
 * types (vehicles and plant), maintenance work, or none.
 */
export type IconSet = 'type' | 'priority' | 'asset' | 'work' | 'none';

export const ISSUE_TYPE_KINDS: readonly IssueTypeKind[] = [
  'bug', 'story', 'task', 'epic', 'subtask', 'feature', 'improvement', 'support', 'change', 'generic',
];
export const PRIORITY_LEVELS: readonly PriorityLevel[] = ['highest', 'high', 'medium', 'low', 'lowest', 'none'];
export const ASSET_KINDS: readonly AssetKind[] = [
  'car', 'van', 'ute', 'truck', 'bus', 'trailer', 'forklift', 'excavator', 'generator', 'lift', 'equipment',
];
export const WORK_KINDS: readonly WorkKind[] = ['service', 'repair', 'inspection', 'tyres', 'recall', 'damage', 'compliance', 'generic'];

const TYPE_RULES: [RegExp, IssueTypeKind][] = [
  [/\bsub[\s-]?task\b/i, 'subtask'],
  [/\b(bug|defect|error|incident|fault|crash)\b/i, 'bug'],
  [/\bepic\b/i, 'epic'],
  [/\b(story|user story)\b/i, 'story'],
  [/\b(new feature|feature|enhancement|requirement)\b/i, 'feature'],
  [/\b(improvement|refactor|tech(nical)? debt|optimi[sz]ation)\b/i, 'improvement'],
  [/\b(change( request)?|cr)\b/i, 'change'],
  [/\b(support|question|help|query|service request)\b/i, 'support'],
  [/\b(task|chore|todo|action)\b/i, 'task'],
];

// Covers Jira priorities and Mantis severities/priorities, which SDMS inherited.
const PRIORITY_RULES: [RegExp, PriorityLevel][] = [
  [/\bnon[\s-]?urgent\b/i, 'low'],
  [/\b(urgent|immediate|highest|critical|blocker|block|crash|showstopper|p0|sev(erity)?\s*1)\b/i, 'highest'],
  [/\b(high|major|important|p1|sev(erity)?\s*2)\b/i, 'high'],
  [/\b(normal|medium|moderate|default|p2|sev(erity)?\s*3)\b/i, 'medium'],
  [/\b(lowest|trivial|tweak|text|cosmetic|p4|sev(erity)?\s*5)\b/i, 'lowest'],
  [/\b(low|minor|p3|sev(erity)?\s*4)\b/i, 'low'],
  [/\b(none|no priority)\b/i, 'none'],
];

// Order matters: "Box trailer" is a trailer, "Truck-mounted lift" a lift, "Tipper truck" a truck.
const ASSET_RULES: [RegExp, AssetKind][] = [
  [/\bfork\s*lift|forklift\b/i, 'forklift'],
  [/\b(excavator|digger|loader|backhoe|bobcat|skid\s*steer)\b/i, 'excavator'],
  [/\b(generator|genset|compressor|lighting\s*tower|welder)\b/i, 'generator'],
  [/\b(ewp|scissor|boom|elevating|lift|cherry\s*picker)\b/i, 'lift'],
  [/\btrailers?\b/i, 'trailer'],
  [/\b(bus|coach|minibus)\b/i, 'bus'],
  [/\b(trucks?|rigid|tipper|prime\s*mover|lorry)\b/i, 'truck'],
  [/\b(utes?|utility|pick-?\s*up|tray\s*back|dual\s*cab|single\s*cab)\b/i, 'ute'],
  [/\b(vans?|hiace|transit|trafic|sprinter|crafter|panel)\b/i, 'van'],
  [/\b(cars?|sedan|hatch(back)?|suv|wagon|ev|hybrid|passenger|pool\s*vehicle)\b/i, 'car'],
];

const WORK_RULES: [RegExp, WorkKind][] = [
  [/\brecall\b/i, 'recall'],
  [/\b(damage|accident|incident|collision|crash)\b/i, 'damage'],
  [/\b(tyres?|tires?|wheels?|puncture)\b/i, 'tyres'],
  [/\b(inspect(ion)?|pre-?\s*start|check|audit)\b/i, 'inspection'],
  [/\b(regist(ration)?|rego|insurance|compliance|permit)\b/i, 'compliance'],
  [/\b(repair|breakdown|fault|defect|failure)\b/i, 'repair'],
  [/\b(service|servicing|scheduled|preventive|preventative|pm|maintenance)\b/i, 'service'],
];

function matchRule<T>(rules: [RegExp, T][], name: string, fallback: T): T {
  return rules.find(([pattern]) => pattern.test(name))?.[1] ?? fallback;
}

/**
 * Guesses the icon for an issue type from its name ("Bug", "New Feature", "Change Request"...).
 * @param name - Type name
 * @returns The icon kind
 */
export function issueTypeKind(name: string): IssueTypeKind {
  return matchRule(TYPE_RULES, name, 'generic');
}

/**
 * Guesses the level of a priority or severity from its name.
 * @param name - Priority or severity name
 * @returns The level
 */
export function priorityLevel(name: string): PriorityLevel {
  return matchRule(PRIORITY_RULES, name, 'none');
}

/**
 * Guesses the icon for an asset type from its name ("Panel van", "Dual cab ute", "Forklift"...).
 * @param name - Asset type name
 * @returns The icon kind
 */
export function assetKind(name: string): AssetKind {
  return matchRule(ASSET_RULES, name, 'equipment');
}

/**
 * Guesses the icon for a kind of maintenance work ("Scheduled service", "Accident damage"...).
 * @param name - Work type name
 * @returns The icon kind
 */
export function workKind(name: string): WorkKind {
  return matchRule(WORK_RULES, name, 'generic');
}

/**
 * Picks the icon family for a field when the definition doesn't say (`assetTypeRel` → asset
 * types, `workOrderTypeRel`/`requestTypeRel` → maintenance work, `typeRel` → issue types,
 * `priorityRel`/`severityRel` → priority arrows).
 * @param fieldName - Field name
 * @returns The icon set
 */
export function iconSetForField(fieldName: string): IconSet {
  if (/(asset|vehicle|plant)\s*type/i.test(fieldName)) return 'asset';
  if (/(work\s*order|work|job|maintenance|request|repair)\s*type/i.test(fieldName)) return 'work';
  if (/type/i.test(fieldName)) return 'type';
  if (/(priority|severity|urgency|impact)/i.test(fieldName)) return 'priority';
  return 'none';
}
