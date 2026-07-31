/**
 * Theme system for Chronostrophe.
 * Colour themes are applied automatically in modulo order to each level.
 * Crate and monolith colours are fixed across themes for gameplay readability.
 */

export interface Theme {
    name: string;
    label: string;
    /** Deep space background. */
    bg: number;
    /** Background for UI panels, track overlay, etc. */
    panelBg: number;
    /** Vignette / fade colour. */
    fade: [number, number, number];
    /** Wall tile fill. */
    tile: number;
    /** Wall tile inner inset. */
    tileInner: number;
    /** Wall tile top edge highlight. */
    tileEdge: number;
    /** Player body. */
    player: number;
    /** Primary UI text. */
    textPrimary: number;
    /** Secondary UI text (dimmer). */
    textSecondary: number;
    /** Accent text (subtitles, hints). */
    textAccent: number;
    /** Title text colour. */
    title: number;
    /** Title glow colour. */
    titleGlow: number;
    /** Title stroke colour. */
    titleStroke: number;
    /** Star / particle colours (array of 2+). */
    starColors: number[];
    /** Orbit ring colour A (violet). */
    orbitA: number;
    /** Orbit ring colour B (cyan). */
    orbitB: number;
    /** Level row background (unselected). */
    rowBg: number;
    /** Level row background (selected). */
    rowBgSelected: number;
    /** Level row border (unselected). */
    rowBorder: number;
    /** Level row border (selected). */
    rowBorderSelected: number;
    /** Level row text (unselected) — CSS string for setColor(). */
    rowText: string;
    /** Level row text (selected) — CSS string for setColor(). */
    rowTextSelected: string;
    /** Completed level checkmark colour. */
    complete: number;
    /** Track background (HUD). */
    trackBg: number;
    /** Track tick marks. */
    trackTick: number;
    /** Track recorded history (closed runs). */
    trackHistory: number;
    /** Track current run (active). */
    trackCurrent: number;
    /** Track current run (paused). */
    trackCurrentPaused: number;
    /** Track dot (live). */
    trackDot: number;
    /** Track dot (scrub mode). */
    trackDotScrub: number;
    /** Track direction arrow. */
    trackArrow: number;
    /** Track end markers. */
    trackEnd: number;
    /** Track monolith drop marker. */
    trackMarker: number;
    /** HUD panel top border. */
    hudBorder: number;
    /** Editor grid line. */
    editorGrid: number;
    /** Editor UI background. */
    editorUiBg: number;
    /** Editor UI border. */
    editorUiBorder: number;
    /** Button default colour (violet variant). */
    buttonDefault: number;
    /** Button danger colour (red variant). */
    buttonDanger: number;
    /** Button hover alpha. */
    buttonHoverAlpha: number;
    /** Button idle alpha. */
    buttonIdleAlpha: number;
    /** Settings panel stroke. */
    settingsStroke: number;
    /** Help text colour. */
    helpText: number;
    /** Modal backdrop. */
    modalBg: number;
    /** Text highlight (white). */
    textHighlight: string;
    /** Faint separator line. */
    separator: number;
    /** Vignette inner colour. */
    vignette: number;
    /** Backdrop nebula colours. */
    nebulaColors: number[];
    /** Backdrop frame colour. */
    backdropFrame: number;
    /** Page border / canvas shadow colour in hex for CSS. */
    pageBorder: string;
    /** Page shadow colour in hex for CSS. */
    pageShadow: string;
}

const DEFAULT: Theme = {
    name: 'default',
    label: 'DEFAULT',
    bg: 0x0b0714,
    panelBg: 0x080512,
    fade: [5, 3, 10],
    tile: 0x241a44,
    tileInner: 0x1a1233,
    tileEdge: 0x6d4bd6,
    player: 0xf7e26b,
    textPrimary: 0xcfd8ff,
    textSecondary: 0x8892bd,
    textAccent: 0x76d9ff,
    title: 0xf8f5ff,
    titleGlow: 0x6d4bd6,
    titleStroke: 0x241a44,
    starColors: [0x38bdf8, 0x8b5cf6, 0x4b3b78],
    orbitA: 0x8b5cf6,
    orbitB: 0x38bdf8,
    rowBg: 0x000000,
    rowBgSelected: 0x000000,
    rowBorder: 0x8b5cf6,
    rowBorderSelected: 0x38bdf8,
    rowText: '#cfd8ff',
    rowTextSelected: '#ffffff',
    complete: 0x9be36a,
    trackBg: 0x1b1436,
    trackTick: 0x38306a,
    trackHistory: 0x76d9ff,
    trackCurrent: 0xf7e26b,
    trackCurrentPaused: 0x76d9ff,
    trackDot: 0xf7e26b,
    trackDotScrub: 0x38bdf8,
    trackArrow: 0x76d9ff,
    trackEnd: 0xf43f5e,
    trackMarker: 0x888888,
    hudBorder: 0x6d4bd6,
    editorGrid: 0x2a2350,
    editorUiBg: 0x08040f,
    editorUiBorder: 0x6d4bd6,
    buttonDefault: 0x6d4bd6,
    buttonDanger: 0xf43f5e,
    buttonHoverAlpha: 0.3,
    buttonIdleAlpha: 0.14,
    settingsStroke: 0x38bdf8,
    helpText: 0xdce4ff,
    modalBg: 0x05030a,
    textHighlight: '#ffffff',
    separator: 0x8892bd,
    vignette: 0x05030a,
    nebulaColors: [0x2b1d55, 0x1b2a55],
    backdropFrame: 0x1a1236,
    pageBorder: '#2b2050',
    pageShadow: 'rgba(109, 75, 214, 0.35)',
};

const AMBER: Theme = {
    name: 'amber',
    label: 'AMBER',
    bg: 0x0f0b05,
    panelBg: 0x0c0a06,
    fade: [10, 8, 5],
    tile: 0x3d2e14,
    tileInner: 0x2a1f0c,
    tileEdge: 0xc89b3c,
    player: 0xf7e26b,
    textPrimary: 0xf0d9a0,
    textSecondary: 0xa08860,
    textAccent: 0xf5b342,
    title: 0xfff3d6,
    titleGlow: 0xc89b3c,
    titleStroke: 0x3d2e14,
    starColors: [0xf5b342, 0xc89b3c, 0x6b5018],
    orbitA: 0xc89b3c,
    orbitB: 0xf5b342,
    rowBg: 0x000000,
    rowBgSelected: 0x000000,
    rowBorder: 0xc89b3c,
    rowBorderSelected: 0xf5b342,
    rowText: '#f0d9a0',
    rowTextSelected: '#ffffff',
    complete: 0x9be36a,
    trackBg: 0x2a1f0c,
    trackTick: 0x4a3d28,
    trackHistory: 0xf5b342,
    trackCurrent: 0xf7e26b,
    trackCurrentPaused: 0xf5b342,
    trackDot: 0xf7e26b,
    trackDotScrub: 0xf5b342,
    trackArrow: 0xf5b342,
    trackEnd: 0xf43f5e,
    trackMarker: 0x888888,
    hudBorder: 0xc89b3c,
    editorGrid: 0x3d2e14,
    editorUiBg: 0x0c0a06,
    editorUiBorder: 0xc89b3c,
    buttonDefault: 0xc89b3c,
    buttonDanger: 0xf43f5e,
    buttonHoverAlpha: 0.3,
    buttonIdleAlpha: 0.14,
    settingsStroke: 0xf5b342,
    helpText: 0xf0d9a0,
    modalBg: 0x0a0804,
    textHighlight: '#ffffff',
    separator: 0xa08860,
    vignette: 0x0a0804,
    nebulaColors: [0x3d2a10, 0x2a1f0c],
    backdropFrame: 0x2a1f0c,
    pageBorder: '#3d2a10',
    pageShadow: 'rgba(200, 155, 60, 0.35)',
};

const CYAN: Theme = {
    name: 'cyan',
    label: 'CYAN',
    bg: 0x050d12,
    panelBg: 0x060d12,
    fade: [5, 8, 12],
    tile: 0x0f2a3d,
    tileInner: 0x0a1f2a,
    tileEdge: 0x38bdf8,
    player: 0xf7e26b,
    textPrimary: 0xa0e0f0,
    textSecondary: 0x60a0b8,
    textAccent: 0x7dd3fc,
    title: 0xd6f5ff,
    titleGlow: 0x38bdf8,
    titleStroke: 0x0f2a3d,
    starColors: [0x38bdf8, 0x7dd3fc, 0x1a5c78],
    orbitA: 0x7dd3fc,
    orbitB: 0x38bdf8,
    rowBg: 0x000000,
    rowBgSelected: 0x000000,
    rowBorder: 0x38bdf8,
    rowBorderSelected: 0x7dd3fc,
    rowText: '#a0e0f0',
    rowTextSelected: '#ffffff',
    complete: 0x9be36a,
    trackBg: 0x0f2a3d,
    trackTick: 0x1a4a66,
    trackHistory: 0x7dd3fc,
    trackCurrent: 0xf7e26b,
    trackCurrentPaused: 0x7dd3fc,
    trackDot: 0xf7e26b,
    trackDotScrub: 0x7dd3fc,
    trackArrow: 0x7dd3fc,
    trackEnd: 0xf43f5e,
    trackMarker: 0x888888,
    hudBorder: 0x38bdf8,
    editorGrid: 0x0f2a3d,
    editorUiBg: 0x060d12,
    editorUiBorder: 0x38bdf8,
    buttonDefault: 0x38bdf8,
    buttonDanger: 0xf43f5e,
    buttonHoverAlpha: 0.3,
    buttonIdleAlpha: 0.14,
    settingsStroke: 0x7dd3fc,
    helpText: 0xa0e0f0,
    modalBg: 0x040a0e,
    textHighlight: '#ffffff',
    separator: 0x60a0b8,
    vignette: 0x040a0e,
    nebulaColors: [0x0f2a3d, 0x0a1f2a],
    backdropFrame: 0x0f2a3d,
    pageBorder: '#0f2a3d',
    pageShadow: 'rgba(56, 189, 248, 0.35)',
};

const RUBY: Theme = {
    name: 'ruby',
    label: 'RUBY',
    bg: 0x120608,
    panelBg: 0x0e0506,
    fade: [12, 5, 6],
    tile: 0x3d141c,
    tileInner: 0x2a0d13,
    tileEdge: 0xe84855,
    player: 0xf7e26b,
    textPrimary: 0xf0b8b8,
    textSecondary: 0xa06060,
    textAccent: 0xff7b7b,
    title: 0xffe0e0,
    titleGlow: 0xe84855,
    titleStroke: 0x3d141c,
    starColors: [0xe84855, 0xff7b7b, 0x5a1a22],
    orbitA: 0xe84855,
    orbitB: 0xff7b7b,
    rowBg: 0x000000,
    rowBgSelected: 0x000000,
    rowBorder: 0xe84855,
    rowBorderSelected: 0xff7b7b,
    rowText: '#f0b8b8',
    rowTextSelected: '#ffffff',
    complete: 0x9be36a,
    trackBg: 0x3d141c,
    trackTick: 0x5a1a22,
    trackHistory: 0xff7b7b,
    trackCurrent: 0xf7e26b,
    trackCurrentPaused: 0xff7b7b,
    trackDot: 0xf7e26b,
    trackDotScrub: 0xff7b7b,
    trackArrow: 0xff7b7b,
    trackEnd: 0xf43f5e,
    trackMarker: 0x888888,
    hudBorder: 0xe84855,
    editorGrid: 0x3d141c,
    editorUiBg: 0x0e0506,
    editorUiBorder: 0xe84855,
    buttonDefault: 0xe84855,
    buttonDanger: 0xf43f5e,
    buttonHoverAlpha: 0.3,
    buttonIdleAlpha: 0.14,
    settingsStroke: 0xff7b7b,
    helpText: 0xf0b8b8,
    modalBg: 0x0a0405,
    textHighlight: '#ffffff',
    separator: 0xa06060,
    vignette: 0x0a0405,
    nebulaColors: [0x3d141c, 0x2a0d13],
    backdropFrame: 0x2a0d13,
    pageBorder: '#3d141c',
    pageShadow: 'rgba(232, 72, 85, 0.35)',
};

const EMERALD: Theme = {
    name: 'emerald',
    label: 'EMERALD',
    bg: 0x060e08,
    panelBg: 0x050c06,
    fade: [6, 10, 5],
    tile: 0x143d22,
    tileInner: 0x0d2a16,
    tileEdge: 0x34d380,
    player: 0xf7e26b,
    textPrimary: 0xa0e0b8,
    textSecondary: 0x60a070,
    textAccent: 0x6ee7a0,
    title: 0xd6ffe0,
    titleGlow: 0x34d380,
    titleStroke: 0x143d22,
    starColors: [0x34d380, 0x6ee7a0, 0x1a5c30],
    orbitA: 0x6ee7a0,
    orbitB: 0x34d380,
    rowBg: 0x000000,
    rowBgSelected: 0x000000,
    rowBorder: 0x34d380,
    rowBorderSelected: 0x6ee7a0,
    rowText: '#a0e0b8',
    rowTextSelected: '#ffffff',
    complete: 0x9be36a,
    trackBg: 0x143d22,
    trackTick: 0x1a5c30,
    trackHistory: 0x6ee7a0,
    trackCurrent: 0xf7e26b,
    trackCurrentPaused: 0x6ee7a0,
    trackDot: 0xf7e26b,
    trackDotScrub: 0x6ee7a0,
    trackArrow: 0x6ee7a0,
    trackEnd: 0xf43f5e,
    trackMarker: 0x888888,
    hudBorder: 0x34d380,
    editorGrid: 0x143d22,
    editorUiBg: 0x050c06,
    editorUiBorder: 0x34d380,
    buttonDefault: 0x34d380,
    buttonDanger: 0xf43f5e,
    buttonHoverAlpha: 0.3,
    buttonIdleAlpha: 0.14,
    settingsStroke: 0x6ee7a0,
    helpText: 0xa0e0b8,
    modalBg: 0x040a05,
    textHighlight: '#ffffff',
    separator: 0x60a070,
    vignette: 0x040a05,
    nebulaColors: [0x143d22, 0x0d2a16],
    backdropFrame: 0x0d2a16,
    pageBorder: '#143d22',
    pageShadow: 'rgba(52, 211, 128, 0.35)',
};

const THEME_ORDER: Theme[] = [DEFAULT, AMBER, CYAN, RUBY, EMERALD];

let currentThemeName: string = 'default';
let currentTheme: Theme = DEFAULT;

export function initTheme(): void {
    currentThemeName = 'default';
    currentTheme = DEFAULT;
    updatePageStyles();
}

export function getCurrentTheme(): Theme {
    return currentTheme;
}

export function getThemeName(): string {
    return currentThemeName;
}

/**
 * Apply a theme based on level index (modulo). Returns the applied theme.
 */
export function applyThemeForLevel(levelIndex: number): Theme {
    const theme = THEME_ORDER[levelIndex % THEME_ORDER.length];
    currentThemeName = theme.name;
    currentTheme = theme;
    updatePageStyles();
    return theme;
}

/** Update the page border and background to match the current theme. */
function updatePageStyles(): void {
    const canvas = document.querySelector('#app canvas');
    if (canvas instanceof HTMLElement) {
        canvas.style.borderColor = currentTheme.pageBorder;
        canvas.style.boxShadow = `0 0 60px ${currentTheme.pageShadow}`;
    }
    const h1 = document.querySelector('#shell h1');
    if (h1 instanceof HTMLElement) {
        const edgeHex = `#${currentTheme.tileEdge.toString(16).padStart(6, '0')}`;
        h1.style.color = edgeHex;
        h1.style.textShadow = `0 0 18px ${currentTheme.pageShadow}`;
    }
    const body = document.querySelector('body');
    if (body instanceof HTMLElement) {
        const bgHex = `#${currentTheme.bg.toString(16).padStart(6, '0')}`;
        body.style.background = `radial-gradient(circle at 50% 0%, ${currentTheme.pageBorder} 0%, ${bgHex} 70%)`;
    }
}

// In-memory convenience references so other modules can import these directly.
export const COL_BG = () => currentTheme.bg;
export const COL_PANEL_BG = () => currentTheme.panelBg;
export const COL_TILE = () => currentTheme.tile;
export const COL_TILE_INNER = () => currentTheme.tileInner;
export const COL_TILE_EDGE = () => currentTheme.tileEdge;
export const COL_PLAYER = () => currentTheme.player;
export const COL_TEXT_PRIMARY = () => currentTheme.textPrimary;
export const COL_TEXT_SECONDARY = () => currentTheme.textSecondary;
export const COL_TEXT_ACCENT = () => currentTheme.textAccent;
export const COL_TITLE = () => currentTheme.title;
export const COL_TITLE_GLOW = () => currentTheme.titleGlow;
export const COL_TITLE_STROKE = () => currentTheme.titleStroke;
export const COL_ORBIT_A = () => currentTheme.orbitA;
export const COL_ORBIT_B = () => currentTheme.orbitB;
export const COL_COMPLETE = () => currentTheme.complete;
export const COL_TRACK_BG = () => currentTheme.trackBg;
export const COL_TRACK_TICK = () => currentTheme.trackTick;
export const COL_TRACK_HISTORY = () => currentTheme.trackHistory;
export const COL_TRACK_CURRENT = () => currentTheme.trackCurrent;
export const COL_TRACK_CURRENT_PAUSED = () => currentTheme.trackCurrentPaused;
export const COL_TRACK_DOT = () => currentTheme.trackDot;
export const COL_TRACK_DOT_SCRUB = () => currentTheme.trackDotScrub;
export const COL_TRACK_ARROW = () => currentTheme.trackArrow;
export const COL_TRACK_END = () => currentTheme.trackEnd;
export const COL_TRACK_MARKER = () => currentTheme.trackMarker;
export const COL_HUD_BORDER = () => currentTheme.hudBorder;
export const COL_EDITOR_GRID = () => currentTheme.editorGrid;
export const COL_EDITOR_UI_BG = () => currentTheme.editorUiBg;
export const COL_EDITOR_UI_BORDER = () => currentTheme.editorUiBorder;
export const COL_BUTTON_DEFAULT = () => currentTheme.buttonDefault;
export const COL_BUTTON_DANGER = () => currentTheme.buttonDanger;
export const COL_SETTINGS_STROKE = () => currentTheme.settingsStroke;
export const COL_HELP_TEXT = () => currentTheme.helpText;
export const COL_MODAL_BG = () => currentTheme.modalBg;
export const COL_SEPARATOR = () => currentTheme.separator;
export const COL_VIGNETTE = () => currentTheme.vignette;
export const COL_BACKDROP_FRAME = () => currentTheme.backdropFrame;
export const COL_ROW_TEXT = () => currentTheme.rowText;
export const COL_ROW_TEXT_SELECTED = () => currentTheme.rowTextSelected;
export const TEXT_HIGHLIGHT = () => currentTheme.textHighlight;
export const FADE_COLOUR = () => currentTheme.fade;
export const STAR_COLORS = () => currentTheme.starColors;
export const NEBULA_COLORS = () => currentTheme.nebulaColors;
export const ROW_BORDER = (selected: boolean) => selected ? currentTheme.rowBorderSelected : currentTheme.rowBorder;
export const ROW_BG = (selected: boolean) => selected ? currentTheme.rowBgSelected : currentTheme.rowBg;

// Fixed colours for gameplay elements that do not change between themes.
export const COL_BOX_FIXED = 0xd98b45;
export const COL_BOX_STRIPE_FIXED = 0x7a4a1e;
export const COL_MONOLITH_FIXED = 0x151226;
export const COL_MONOLITH_INNER_FIXED = 0x3a3550;
export const COL_MONOLITH_EDGE_FIXED = 0x6d4bd6;

// Re-export group colours from palette (these are fixed for gameplay)
export { GROUP_COLOURS, groupColour, mixColor, shade, tint } from './palette';

