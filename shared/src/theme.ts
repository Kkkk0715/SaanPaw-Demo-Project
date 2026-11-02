/**
 * Design tokens: vibrant green, warm beige, white.
 * Plain values, so mobile turns them into RN styles and the console into CSS.
 */

export const palette = {
  // Green. `green600` is the darkest because white button text sits on it
  // (4.8:1 contrast); `green500` is for fills and highlights only.
  green900: '#0B3D22',
  green800: '#10502C',
  green700: '#126B33',
  green600: '#15843A',
  green500: '#22C55E',
  green400: '#4ADE80',
  green100: '#D6F0DF',
  green50: '#EDF9F0',

  // Beige carries the page; white cards lift off it.
  beige50: '#FDFBF6',
  beige100: '#F7F1E4',
  beige200: '#EFE7D6',
  beige300: '#E2D7C1',
  beige400: '#CFC2A8',

  // Warm ink. Pure grey looks dirty against beige.
  ink900: '#1F241F',
  ink700: '#3F463D',
  ink500: '#6B6659',

  // Report kinds. Deepened so they still read against beige.
  amber600: '#B4690E',
  amber100: '#FBE7C4',
  red600: '#B3372A',
  red100: '#F9DCD7',

  blue600: '#2563EB',
  blue100: '#DEE8FE',

  white: '#FFFFFF',
} as const;

export const colors = {
  primary: palette.green600,
  /** Fills, active states, highlights. Never small text. */
  primaryVivid: palette.green500,
  primaryDark: palette.green700,
  primaryDarker: palette.green900,
  primarySoft: palette.green100,
  primaryFaint: palette.green50,

  /** "Found animal" reports and AI match highlights. */
  accent: palette.amber600,
  accentSoft: palette.amber100,

  /** "Lost pet" reports, destructive actions, moderation flags. */
  danger: palette.red600,
  dangerSoft: palette.red100,

  info: palette.blue600,
  infoSoft: palette.blue100,


  background: palette.beige100,
  surface: palette.white,
  surfaceAlt: palette.beige200,
  text: palette.ink900,
  textSoft: palette.ink700,
  muted: palette.ink500,
  border: palette.beige300,
  borderStrong: palette.beige400,
  onPrimary: palette.white,
} as const;

/** 8pt grid. `spacing(1.5)` -> 12. */
export const spacing = (n: number) => n * 8;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

/** Colour + label lookup for the two report kinds, used on every surface. */
export const reportKindStyle = {
  lost: { label: 'Lost', color: colors.danger, soft: colors.dangerSoft },
  found: { label: 'Found', color: colors.accent, soft: colors.accentSoft },
} as const;

/** Scope: "under rescue / reunited / adopted / inconclusive". */
export const caseStatusMeta = {
  under_rescue: { label: 'Under recovery', color: colors.info, soft: colors.infoSoft },
  reunited: { label: 'Reunited', color: colors.primary, soft: colors.primarySoft },
  adopted: { label: 'Adopted', color: colors.accent, soft: colors.accentSoft },
  inconclusive: { label: 'Inconclusive', color: colors.muted, soft: colors.surfaceAlt },
} as const;

export const approvalMeta = {
  pending: { label: 'Pending review', color: colors.accent, soft: colors.accentSoft },
  approved: { label: 'Approved', color: colors.primary, soft: colors.primarySoft },
  rejected: { label: 'Rejected', color: colors.danger, soft: colors.dangerSoft },
} as const;

export const reportStatusMeta = {
  active: { label: 'Active', color: colors.info, soft: colors.infoSoft },
  matched: { label: 'Match found', color: colors.accent, soft: colors.accentSoft },
  recovered: { label: 'Recovered', color: colors.primary, soft: colors.primarySoft },
  closed: { label: 'Closed', color: colors.muted, soft: colors.surfaceAlt },
} as const;

/** Moderation flag reasons, shown in the developer console. */
export const flagReasonLabel = {
  suspected_false: 'Suspected false report',
  inappropriate_image: 'Inappropriate image',
  duplicate: 'Duplicate report',
  spam: 'Spam',
} as const;
