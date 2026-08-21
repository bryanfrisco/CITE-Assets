/**
 * Design tokens — the single source of truth for colour in CITE Assets.
 *
 * Every value here is transcribed from README.md § Design Tokens. Components
 * must never write a literal hex; if a colour is missing, add it here first.
 */

export type ThemeMode = 'light' | 'dark';

/** README § Colors — the nine palette tokens, light and dark. */
export const palette = {
  light: {
    bg: '#F6F8FB',
    card: '#FFFFFF',
    soft: '#F0F3F9',
    line: '#E6EAF2',
    text: '#0B1220',
    sub: '#5A6478',
    navy: '#00072D',
    royal: '#2B57C4',
    gold: '#D4AF37',
  },
  dark: {
    bg: '#080C15',
    card: '#131A26',
    soft: '#1B2432',
    line: '#232C3C',
    text: '#EAEEF6',
    sub: '#93A0B8',
    navy: '#0E1A3D',
    royal: '#7FA2F0',
    gold: '#D4AF37',
  },
} as const;

/**
 * README § Colors — semantic status badges.
 * Backgrounds and borders are identical in both themes; only the foreground
 * changes in dark mode, to #E6ECF9.
 */
export type BadgeTone =
  'assigned' | 'available' | 'maintenance' | 'broken' | 'lost' | 'retired' | 'gold';

export const badgeTones: Record<BadgeTone, { bg: string; fg: string; border: string }> = {
  // Assigned / Active
  assigned: { bg: 'rgba(43,87,196,0.10)', fg: '#2B57C4', border: 'rgba(43,87,196,0.26)' },
  // Available / Signed / Good
  available: { bg: 'rgba(18,164,93,0.11)', fg: '#0C6B3F', border: 'rgba(18,164,93,0.26)' },
  // Maintenance / Awaiting signature / Fair
  maintenance: { bg: 'rgba(178,106,0,0.12)', fg: '#8A5300', border: 'rgba(178,106,0,0.26)' },
  // Broken / Poor
  broken: { bg: 'rgba(224,57,62,0.10)', fg: '#B3312F', border: 'rgba(224,57,62,0.26)' },
  // Lost
  lost: { bg: 'rgba(107,78,230,0.11)', fg: '#5138C4', border: 'rgba(107,78,230,0.26)' },
  // Retired / Draft / No login
  retired: { bg: 'rgba(107,114,128,0.12)', fg: '#4B5563', border: 'rgba(107,114,128,0.26)' },
  // Super Admin role badge — values read from the prototype (README § Fidelity
  // allows this where the README table is silent).
  gold: { bg: 'rgba(212,175,55,0.16)', fg: '#8A6D12', border: 'rgba(212,175,55,0.4)' },
};

/**
 * In dark mode every semantic badge foreground collapses to one colour.
 * The gold role badge is excluded — #E6ECF9 would lose its meaning, so it
 * keeps the gold token instead.
 */
export const badgeForegroundDark = '#E6ECF9';
export const goldBadgeForegroundDark = '#D4AF37';

/**
 * Maps the labels used across the app onto the six tones above, so a screen
 * can pass a status string straight through to <Badge>.
 */
export const badgeToneByLabel: Record<string, BadgeTone> = {
  // asset status
  Assigned: 'assigned',
  Active: 'assigned',
  // Fitted into a vehicle. It shares the 'assigned' tone rather than getting a
  // seventh colour, because it means the same thing to somebody scanning the
  // list — in use, not available — and README's token table has no eighth
  // badge colour to draw from.
  Installed: 'assigned',
  Available: 'available',
  Maintenance: 'maintenance',
  Broken: 'broken',
  Lost: 'lost',
  Retired: 'retired',
  // condition
  Good: 'available',
  Fair: 'maintenance',
  Poor: 'broken',
  // BAST status
  Signed: 'available',
  'Awaiting signature': 'maintenance',
  Draft: 'retired',
  // assignment / account
  Returned: 'retired',
  'No login': 'retired',
};

/** README § Colors — gradients. Consumed by expo-linear-gradient. */
export const gradients = {
  /** Navy header / hero: linear-gradient(135deg,#00072D,#0A1547 62%,#132766) */
  navy: {
    colors: ['#00072D', '#0A1547', '#132766'] as const,
    locations: [0, 0.62, 1] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  /** Success: linear-gradient(150deg,#0F7A47,#12A45D) */
  success: {
    colors: ['#0F7A47', '#12A45D'] as const,
    start: { x: 0, y: 0 },
    end: { x: 0.5, y: 1 },
  },
  /** Location bars on the dashboard: navy → royal */
  bar: {
    colors: ['#00072D', '#2B57C4'] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  },
  /** BAST upload progress bar: navy → royal */
  progress: {
    colors: ['#00072D', '#2B57C4'] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  },
} as const;

/** Fixed colours that do not flip with the theme. */
export const fixed = {
  /** On a permanently dark surface (navy hero, toast) text stays light. */
  white: '#FFFFFF',
  onDark: '#EAEEF6',
  /** Ink used for drop shadows in light mode. */
  shadowInk: '#0B1220',
  error: '#E0393E',
  /** Gold-tinted button on the navy warranty card ("Review list"). */
  goldButtonBg: 'rgba(212,175,55,0.14)',
  goldButtonBorder: 'rgba(212,175,55,0.55)',
  goldButtonText: '#F3DFA2',
  successDark: '#0F7A47',
  successLight: '#12A45D',
  amber: '#B26A00',
  neutral: '#6B7280',
  /** Bottom-nav inactive glyph, per theme. */
  navInactive: { light: '#8B94A7', dark: '#93A0B8' },
  /** Toast surface — same in both themes. */
  toastBg: 'rgba(11,18,32,0.94)',
  /** Bottom-sheet backdrop. */
  backdrop: 'rgba(4,8,22,0.42)',
  /** Focus / selection ring around a chosen row. */
  selectionRing: 'rgba(43,87,196,0.13)',
  /** Faint royal wash behind an unread notification row. */
  unreadWash: 'rgba(43,87,196,0.035)',
} as const;

/** README § Dashboard — donut segment colours, in legend order. */
export const chartColors = {
  laptop: '#00072D',
  desktop: '#2B57C4',
  monitor: '#5B84E8',
  networking: '#8FB0F5',
  printer: '#D4AF37',
  others: '#A9B4C7',
} as const;

/** README § Asset Detail — timeline dot colour per event type. */
export const timelineColors = {
  purchased: '#6B7280',
  registered: '#2B57C4',
  assigned: '#0F7A47',
  moved: '#00072D',
  maintenance: '#B26A00',
  returned: '#2B57C4',
  reassigned: '#2B57C4',
  retired: '#6B7280',
} as const;

/**
 * README § BAST — the paper preview.
 *
 * A printed document does not follow the app theme, so these stay fixed in
 * both modes: "white sheet, radius 8, `0 6px 18px rgba(11,18,32,.08)`". The
 * inner greys are read from the prototype's paper preview, which README
 * § Fidelity allows where its own table is silent. The generated PDF uses the
 * same values (supabase/functions/generate-bast-pdf/index.ts).
 */
export const paperColors = {
  sheet: '#FFFFFF',
  border: 'rgba(11,18,32,0.1)',
  ink: '#0B1220',
  body: '#2B3346',
  muted: '#5A6478',
  rule: '#00072D',
  tableBorder: '#E6EAF2',
  tableLabelBg: '#F6F8FB',
  signatureLine: '#C7CEDB',
} as const;

/**
 * The full-screen photo viewer.
 *
 * Fixed in both modes on purpose: everything around a photograph changes how
 * it reads, and a viewer that goes pale in light mode is a viewer that lies
 * about the picture.
 */
export const viewerColors = {
  sheet: '#000000',
  ink: '#FFFFFF',
  caption: 'rgba(255,255,255,0.72)',
  chip: 'rgba(255,255,255,0.14)',
  dotIdle: 'rgba(255,255,255,0.38)',
} as const;

/** README § Signed BAST card — the success row after an upload completes. */
export const uploadColors = {
  successWash: 'rgba(18,164,93,0.09)',
  successBorder: 'rgba(18,164,93,0.28)',
} as const;

/** README § Asset Detail — document extension chips. */
export const documentChipColors = {
  pdf: '#E0393E',
  jpg: '#2B57C4',
  signedBast: '#0F7A47',
} as const;
