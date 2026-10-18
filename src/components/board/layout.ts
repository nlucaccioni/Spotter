// Portrait-first board layout (PROJECT_BRIEF.md §5.1): size rows so the whole field fits the
// available height, then pick columns by priority for the width that leaves. Text grows with the
// rows, but never so far that the priority-2 columns stop fitting. Very tall screens (21:9
// portrait) only reserve room for last names, so their text can stay close to 16:9's size. Pure,
// so it can be unit-tested without a DOM.

export type ColumnId =
  | 'pos'
  | 'change'
  | 'car'
  | 'driver'
  | 'mfr'
  | 'gap'
  | 'interval'
  | 'last'
  | 'best'
  | 'laps'
  | 'led'
  | 'pits'
  | 'status';

export interface ColumnDef {
  id: ColumnId;
  /** Short header label. */
  label: string;
  /** Full name, for tooltips and screen readers. */
  title: string;
  /** 1 = always shown, 2 = when there's room, 3 = lowest priority. */
  priority: 1 | 2 | 3;
  /** Fixed width in em at the row font size. The driver column takes whatever is left. */
  widthEm: number;
  align: 'left' | 'right' | 'center';
}

/** All columns, in display order. */
export const COLUMNS: readonly ColumnDef[] = [
  {
    id: 'change',
    label: '±',
    title: 'Positions gained since the start',
    priority: 2,
    widthEm: 2.2,
    align: 'right',
  },
  { id: 'pos', label: 'Pos', title: 'Position', priority: 1, widthEm: 2.2, align: 'right' },
  { id: 'car', label: '#', title: 'Car number', priority: 1, widthEm: 2.6, align: 'right' },
  { id: 'driver', label: 'Driver', title: 'Driver', priority: 1, widthEm: 0, align: 'left' },
  { id: 'mfr', label: 'Mfr', title: 'Manufacturer', priority: 3, widthEm: 4.2, align: 'left' },
  { id: 'gap', label: 'Gap', title: 'Gap to leader', priority: 1, widthEm: 4.6, align: 'right' },
  {
    id: 'interval',
    label: 'Int',
    title: 'Interval to the car ahead',
    priority: 1,
    widthEm: 4.6,
    align: 'right',
  },
  { id: 'last', label: 'Last', title: 'Last lap', priority: 1, widthEm: 4.2, align: 'right' },
  { id: 'best', label: 'Best', title: 'Best lap', priority: 2, widthEm: 4.2, align: 'right' },
  { id: 'laps', label: 'Laps', title: 'Laps completed', priority: 3, widthEm: 3.2, align: 'right' },
  { id: 'led', label: 'Led', title: 'Laps led', priority: 2, widthEm: 3.2, align: 'right' },
  {
    id: 'pits',
    label: 'Pits',
    title: 'Pit stops (count, last pit lap)',
    priority: 2,
    widthEm: 4.4,
    align: 'right',
  },
  { id: 'status', label: 'Status', title: 'Status', priority: 3, widthEm: 3.6, align: 'left' },
];

/** Order in which optional columns are added as width allows. */
const OPTIONAL_ORDER: readonly ColumnId[] = [
  'best',
  'change',
  'led',
  'pits',
  'mfr',
  'laps',
  'status',
];

export type NameFormat = 'full' | 'initial' | 'last';

/** Driver-column width (em) needed for each name format. */
export const DRIVER_WIDTH_EM: Record<NameFormat, number> = { full: 13, initial: 9, last: 6 };

export const LIMITS = {
  /** Below this the field no longer fits; the table scrolls instead of shrinking further. */
  minRowPx: 20,
  maxRowPx: 64,
  fontToRow: 0.5,
  minFontPx: 12,
  maxFontPx: 22,
  /** Table height ÷ width from which a screen counts as tall (21:9 portrait; 16:9 is ~1.65). */
  tallRatio: 2,
  /** At or below this width (phones) every column is kept and the table scrolls sideways. */
  phoneWidthPx: 560,
};

export interface LayoutOptions {
  extraRows?: number;
  hidden?: ReadonlySet<ColumnId>;
  /** Allow two side-by-side tables on landscape screens (default true). */
  allowSplit?: boolean;
  /** Keep every column on phones and scroll sideways instead of dropping them (default true). */
  allowScrollX?: boolean;
}

export interface BoardLayout {
  rowHeightPx: number;
  fontSizePx: number;
  /** True when the field can't fit at the minimum readable size. */
  scroll: boolean;
  columns: ColumnDef[];
  nameFormat: NameFormat;
  /** Field split into two side-by-side tables (landscape; PROJECT_BRIEF.md §5.1). */
  split: boolean;
  /** Table width in em when it's wider than the screen and scrolls sideways (phones), else null. */
  tableWidthEm: number | null;
}

/** Horizontal gap between the two tables of a split layout. */
export const SPLIT_GAP_PX = 16;

/** Width a vertical scrollbar can take when the table has to scroll (desktop browsers). */
export const SCROLLBAR_PX = 16;

/**
 * @param width  available width in CSS px
 * @param height available height in CSS px for the table (including its header row) plus any
 *               extra rows
 * @param carCount number of rows in the field
 * @param options.extraRows other elements sized as one row each, e.g. the flag banner
 * @param options.hidden columns the user turned off; their width goes to the others
 * @param options.allowSplit whether a landscape screen may use two side-by-side tables
 * @param options.allowScrollX whether a phone keeps every column and scrolls sideways
 */
export function computeBoardLayout(
  width: number,
  height: number,
  carCount: number,
  {
    extraRows = 0,
    hidden = new Set<ColumnId>(),
    allowSplit = true,
    allowScrollX = true,
  }: LayoutOptions = {},
): BoardLayout {
  const single = fitTable(width, height, carCount, extraRows, hidden, true);
  if (allowScrollX && width <= LIMITS.phoneWidthPx) {
    return { ...scrollSideways(single, width, hidden), split: false };
  }
  if (!allowSplit || width <= height || carCount < 2) {
    return { ...single, split: false, tableWidthEm: null };
  }

  // Landscape: two tables of half the field each get taller rows (bigger text). Use them when
  // that's at least as readable and still fits the essential columns with short names.
  const halfWidth = (width - SPLIT_GAP_PX) / 2;
  const split = fitTable(halfWidth, height, Math.ceil(carCount / 2), extraRows, hidden, false);
  const usable = split.nameFormat !== 'last' && split.fontSizePx >= single.fontSizePx;
  return usable
    ? { ...split, split: true, tableWidthEm: null }
    : { ...single, split: false, tableWidthEm: null };
}

/** Phones: every column at the fitted text size, with initialed names, scrolling sideways. */
function scrollSideways(
  fitted: Omit<BoardLayout, 'split' | 'tableWidthEm'>,
  width: number,
  hidden: ReadonlySet<ColumnId>,
): Omit<BoardLayout, 'split'> {
  const columns = COLUMNS.filter((c) => !hidden.has(c.id));
  const fixedEm = columns.reduce((sum, c) => sum + c.widthEm, 0);
  const available = (fitted.scroll ? width - SCROLLBAR_PX : width) / fitted.fontSizePx;
  const driverEm = Math.max(available - fixedEm, DRIVER_WIDTH_EM.initial);
  const tableEm = fixedEm + driverEm;
  return {
    ...fitted,
    columns,
    nameFormat: driverEm >= DRIVER_WIDTH_EM.full ? 'full' : 'initial',
    tableWidthEm: tableEm > available + 1e-6 ? tableEm : null,
  };
}

function fitTable(
  width: number,
  height: number,
  carCount: number,
  extraRows: number,
  hidden: ReadonlySet<ColumnId>,
  /** Keep text small enough for the priority-2 columns (off for split halves, which only need
   *  the essential columns). */
  fitPriorityTwo: boolean,
): Omit<BoardLayout, 'split' | 'tableWidthEm'> {
  const rows = Math.max(1, carCount) + 1 + extraRows; // + table header row
  const fitted = Math.floor(height / rows);
  const scroll = fitted < LIMITS.minRowPx;
  const rowHeightPx = clamp(fitted, LIMITS.minRowPx, LIMITS.maxRowPx);
  const tableWidth = scroll ? width - SCROLLBAR_PX : width;
  // Tall screens trade name length for text size; others keep room for longer names.
  const tall = height / width >= LIMITS.tallRatio;
  const capNameEm = tall ? DRIVER_WIDTH_EM.last : DRIVER_WIDTH_EM.full;
  const minNameEm = tall ? DRIVER_WIDTH_EM.last : DRIVER_WIDTH_EM.initial;
  // Widest text at which the priority-1 and -2 columns still fit with names of that length.
  const essential = COLUMNS.filter((c) => c.priority <= 2 && !hidden.has(c.id));
  const essentialEm = essential.reduce((sum, c) => sum + c.widthEm, 0) + capNameEm;
  const widthFont = fitPriorityTwo ? Math.floor(tableWidth / essentialEm) : Infinity;
  const fontSizePx = clamp(
    Math.min(Math.round(rowHeightPx * LIMITS.fontToRow), widthFont),
    LIMITS.minFontPx,
    LIMITS.maxFontPx,
  );

  const available = tableWidth / fontSizePx;
  const chosen = new Set<ColumnId>(
    COLUMNS.filter((c) => c.priority === 1 && !hidden.has(c.id)).map((c) => c.id),
  );
  let used = sumWidths(chosen) + minNameEm;
  for (const id of OPTIONAL_ORDER) {
    if (hidden.has(id)) continue;
    const w = column(id).widthEm;
    // Columns drop in strict reverse-priority order, so stop at the first that doesn't fit.
    if (used + w > available + 1e-6) break;
    chosen.add(id);
    used += w;
  }

  const driverEm = available - sumWidths(chosen);
  const nameFormat: NameFormat =
    driverEm >= DRIVER_WIDTH_EM.full
      ? 'full'
      : driverEm >= DRIVER_WIDTH_EM.initial
        ? 'initial'
        : 'last';

  return {
    rowHeightPx,
    fontSizePx,
    scroll,
    columns: COLUMNS.filter((c) => chosen.has(c.id)),
    nameFormat,
  };
}

function column(id: ColumnId): ColumnDef {
  const found = COLUMNS.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown column ${id}`);
  return found;
}

function sumWidths(ids: Set<ColumnId>): number {
  let total = 0;
  for (const id of ids) total += column(id).widthEm;
  return total;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
