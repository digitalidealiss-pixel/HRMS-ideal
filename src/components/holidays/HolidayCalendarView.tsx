import {
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  FileSpreadsheet,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {useEffect, useMemo, useState, type FormEvent} from 'react';
import {callRpc} from '../../services/apiClient';
import {exportReportToPdf, exportToCsv} from '../../services/pdfExports';
import type {AuthUser, HolidayRecord} from '../../types/hrms';
import {ConfirmDialog} from '../common/ToastAndConfirm';

interface HolidayCalendarViewProps {
  user: AuthUser;
  onToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
}

type ViewMode = 'MONTH' | 'YEAR' | 'TABLE';
type TypeFilter = 'ALL' | 'NATIONAL' | 'REGIONAL' | 'COMPANY';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parseIsoParts(dateStr: string): {year: number; month: number; day: number} | null {
  const m = String(dateStr || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return {year: Number(m[1]), month: Number(m[2]), day: Number(m[3])};
}

function formatIsoDate(year: number, monthIndex0: number, day: number): string {
  const mm = String(monthIndex0 + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function getWeekdayName(dateStr: string): string {
  const p = parseIsoParts(dateStr);
  if (!p) return '—';
  const dt = new Date(Date.UTC(p.year, p.month - 1, p.day));
  return WEEKDAYS_FULL[dt.getUTCDay()] || '—';
}

function getHolidayStyle(type: HolidayRecord['type'], isOptional?: boolean) {
  if (type === 'NATIONAL') {
    return {
      cellClass: 'border-indigo-200 bg-indigo-50/90 text-indigo-950 hover:bg-indigo-100/80',
      labelClass: 'text-indigo-800',
      miniCellClass: 'bg-indigo-700 text-white font-semibold',
      typeLabel: 'National / Gazetted',
    };
  }
  if (type === 'REGIONAL') {
    return {
      cellClass: isOptional
        ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900 hover:bg-emerald-100/70'
        : 'border-emerald-300 bg-emerald-50 text-emerald-950 hover:bg-emerald-100/80',
      labelClass: 'text-emerald-800',
      miniCellClass: isOptional ? 'bg-emerald-100 text-emerald-900 font-semibold border border-emerald-300' : 'bg-emerald-700 text-white font-semibold',
      typeLabel: isOptional ? 'Regional · Restricted' : 'Regional Public',
    };
  }
  return {
    cellClass: 'border-amber-300 bg-amber-50/90 text-amber-950 hover:bg-amber-100/80',
    labelClass: 'text-amber-800',
    miniCellClass: 'bg-amber-600 text-white font-semibold',
    typeLabel: 'Company Holiday',
  };
}

export function HolidayCalendarView({user, onToast}: HolidayCalendarViewProps) {
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'HR_ADMIN';

  const [holidays, setHolidays] = useState<HolidayRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(2027);
  const [selectedMonth, setSelectedMonth] = useState<number>(0); // 0 = Jan
  const [viewMode, setViewMode] = useState<ViewMode>('MONTH');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Detail preview (available to all)
  const [selectedHoliday, setSelectedHoliday] = useState<HolidayRecord | null>(null);

  // Admin Create/Edit Modal
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [formDate, setFormDate] = useState('2027-01-26');
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<HolidayRecord['type']>('NATIONAL');
  const [formDescription, setFormDescription] = useState('');
  const [formOptional, setFormOptional] = useState(false);
  const [saving, setSaving] = useState(false);

  // Confirm dialogs for Delete / Reset 2027
  const [deleteTarget, setDeleteTarget] = useState<HolidayRecord | null>(null);
  const [confirmReset2027, setConfirmReset2027] = useState(false);

  const loadHolidays = async () => {
    setLoading(true);
    try {
      const res = await callRpc<{ok: boolean; holidays: HolidayRecord[]}>('getHolidays', {});
      setHolidays(res.holidays || []);
    } catch (err: any) {
      onToast('error', 'Failed to load holiday calendar', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHolidays();
  }, []);

  const availableYears = useMemo(() => {
    const yrs = new Set<number>([2026, 2027, 2028]);
    holidays.forEach((h) => {
      const p = parseIsoParts(h.date);
      if (p) yrs.add(p.year);
    });
    return Array.from(yrs).sort((a, b) => a - b);
  }, [holidays]);

  const yearHolidays = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return holidays
      .filter((h) => {
        const p = parseIsoParts(h.date);
        if (!p || p.year !== selectedYear) return false;
        if (typeFilter !== 'ALL' && h.type !== typeFilter) return false;
        if (q) {
          const hay = `${h.name} ${h.date} ${h.type} ${h.description || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  }, [holidays, selectedYear, typeFilter, searchQuery]);

  const yearAllHolidays = useMemo(
    () =>
      holidays
        .filter((h) => parseIsoParts(h.date)?.year === selectedYear)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [holidays, selectedYear],
  );

  const holidaysByDate = useMemo(() => {
    const map = new Map<string, HolidayRecord[]>();
    yearHolidays.forEach((h) => {
      const list = map.get(h.date) || [];
      list.push(h);
      map.set(h.date, list);
    });
    return map;
  }, [yearHolidays]);

  const monthCounts = useMemo(() => {
    const counts = new Array(12).fill(0) as number[];
    yearHolidays.forEach((h) => {
      const p = parseIsoParts(h.date);
      if (p && p.month >= 1 && p.month <= 12) {
        counts[p.month - 1]++;
      }
    });
    return counts;
  }, [yearHolidays]);

  const stats = useMemo(() => {
    const national = yearAllHolidays.filter((h) => h.type === 'NATIONAL').length;
    const regional = yearAllHolidays.filter((h) => h.type === 'REGIONAL').length;
    const company = yearAllHolidays.filter((h) => h.type === 'COMPANY').length;
    const todayIso = new Date().toISOString().slice(0, 10);
    const nextHoliday =
      holidays.find((h) => h.date >= todayIso) || yearAllHolidays[0] || null;
    return {
      total: yearAllHolidays.length,
      national,
      regional,
      company,
      nextHoliday,
    };
  }, [yearAllHolidays, holidays]);

  const currentMonthHolidays = useMemo(
    () =>
      yearHolidays.filter((h) => {
        const p = parseIsoParts(h.date);
        return p && p.month - 1 === selectedMonth;
      }),
    [yearHolidays, selectedMonth],
  );

  const buildMonthCells = (year: number, monthIndex0: number) => {
    const firstWeekday = new Date(Date.UTC(year, monthIndex0, 1)).getUTCDay(); // 0=Sun..6=Sat
    const daysInMonth = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
    const cells: Array<{day: number | null; isoDate: string | null; isSunday: boolean}> = [];
    for (let i = 0; i < firstWeekday; i++) {
      cells.push({day: null, isoDate: null, isSunday: i === 0});
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const weekday = (firstWeekday + d - 1) % 7;
      cells.push({
        day: d,
        isoDate: formatIsoDate(year, monthIndex0, d),
        isSunday: weekday === 0,
      });
    }
    while (cells.length % 7 !== 0) {
      const weekday = cells.length % 7;
      cells.push({day: null, isoDate: null, isSunday: weekday === 0});
    }
    return cells;
  };

  const monthCells = useMemo(
    () => buildMonthCells(selectedYear, selectedMonth),
    [selectedYear, selectedMonth],
  );

  const openAddModal = (prefillDate?: string) => {
    if (!isAdmin) return;
    setEditingId('');
    setFormDate(prefillDate || formatIsoDate(selectedYear, selectedMonth, 1));
    setFormName('');
    setFormType('COMPANY');
    setFormDescription('');
    setFormOptional(false);
    setShowEditor(true);
  };

  const openEditModal = (h: HolidayRecord) => {
    if (!isAdmin) return;
    setSelectedHoliday(null);
    setEditingId(h.holidayId);
    setFormDate(h.date);
    setFormName(h.name);
    setFormType(h.type || 'COMPANY');
    setFormDescription(h.description || '');
    setFormOptional(Boolean(h.isOptional));
    setShowEditor(true);
  };

  const handleSaveHoliday = async (e: FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setSaving(true);
    try {
      await callRpc('saveHoliday', {
        holidayId: editingId || undefined,
        date: formDate,
        name: formName.trim(),
        type: formType,
        description: formDescription.trim(),
        isOptional: formOptional,
      });
      setShowEditor(false);
      onToast('success', editingId ? 'Holiday updated' : 'Holiday added', `${formDate} · ${formName.trim()}`);
      await loadHolidays();
      const parts = parseIsoParts(formDate);
      if (parts) {
        setSelectedYear(parts.year);
        setSelectedMonth(parts.month - 1);
      }
    } catch (err: any) {
      onToast('error', 'Failed to save holiday', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !isAdmin) return;
    try {
      await callRpc('deleteHoliday', {holidayId: deleteTarget.holidayId});
      onToast('info', 'Holiday deleted', `${deleteTarget.date} · ${deleteTarget.name}`);
      if (selectedHoliday?.holidayId === deleteTarget.holidayId) {
        setSelectedHoliday(null);
      }
      setDeleteTarget(null);
      await loadHolidays();
    } catch (err: any) {
      onToast('error', 'Failed to delete holiday', err.message);
    }
  };

  const handleSyncMissing2027 = async () => {
    if (!isAdmin) return;
    try {
      const res = await callRpc<{ok: boolean; addedCount: number; holidays: HolidayRecord[]}>(
        'seedIndianHolidays2027',
        {mode: 'MERGE_MISSING'},
      );
      setHolidays(res.holidays || []);
      setSelectedYear(2027);
      onToast(
        'success',
        '2027 Indian Holidays Synced',
        res.addedCount > 0
          ? `Added ${res.addedCount} missing official 2027 holiday(s).`
          : 'All official 2027 Indian holidays are already present.',
      );
    } catch (err: any) {
      onToast('error', 'Failed to sync 2027 holidays', err.message);
    }
  };

  const handleReset2027 = async () => {
    if (!isAdmin) return;
    try {
      const res = await callRpc<{ok: boolean; addedCount: number; holidays: HolidayRecord[]}>(
        'seedIndianHolidays2027',
        {mode: 'RESET_2027'},
      );
      setHolidays(res.holidays || []);
      setSelectedYear(2027);
      setConfirmReset2027(false);
      onToast('success', '2027 Indian Calendar Restored', `Loaded ${res.addedCount} verified 2027 Indian holidays.`);
    } catch (err: any) {
      onToast('error', 'Reset failed', err.message);
    }
  };

  const handleExportCsv = () => {
    exportToCsv(
      `IDEAL_HRMS_Indian_Holidays_${selectedYear}.csv`,
      ['Date', 'Day', 'Holiday Name', 'Category', 'Observance', 'Notes'],
      yearHolidays.map((h) => [
        h.date,
        getWeekdayName(h.date),
        h.name,
        h.type,
        h.isOptional ? 'Optional / Restricted' : 'Compulsory / Public',
        h.description || '',
      ]),
    );
  };

  const handleExportPdf = () => {
    exportReportToPdf(
      `Indian Holiday Calendar ${selectedYear}`,
      `${yearHolidays.length} scheduled holidays · Official DoPT & Company Schedule`,
      ['Date', 'Day', 'Holiday Name', 'Type', 'Observance', 'Notes'],
      yearHolidays.map((h) => [
        h.date,
        getWeekdayName(h.date),
        h.name,
        h.type,
        h.isOptional ? 'Optional / RH' : 'Gazetted / Full',
        h.description || '—',
      ]),
      `IDEAL_HRMS_Holidays_${selectedYear}.pdf`,
    );
  };

  const prevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      {/* Top Header Banner */}
      <div className="metallic-navy-panel overflow-hidden rounded-2xl text-white">
        <div className="h-1 w-full bg-gradient-to-r from-amber-400 via-emerald-400 to-sky-400" />
        <div className="flex flex-col gap-3 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="font-display text-xl font-semibold text-white">
              Indian Holiday Calendar System ({selectedYear})
            </h1>
            <p className="mt-0.5 text-xs text-sky-100/85">
              Official Indian National, DoPT Gazetted &amp; Regional Holiday Schedule
              {isAdmin ? ' · Editable by Super Admin & HR Admin' : ' · Read-Only Employee Schedule'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/20 whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/20 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Export PDF
            </button>
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={handleSyncMissing2027}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-emerald-300/40 bg-emerald-500/20 px-3 py-2 text-xs font-medium text-emerald-100 hover:bg-emerald-500/30 whitespace-nowrap shrink-0"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Sync 2027 Indian List
                </button>
                <button
                  type="button"
                  onClick={() => openAddModal()}
                  className="metallic-btn-gold inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold whitespace-nowrap shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  Add Holiday
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 4-Card KPI Strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="metallic-surface overflow-hidden rounded-xl">
          <div className="h-1 w-full bg-gradient-to-r from-blue-600 to-cyan-400" />
          <div className="p-4">
            <p className="text-xs font-semibold text-slate-600">Total Holidays ({selectedYear})</p>
            <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">{stats.total}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Scheduled across 12 months</p>
          </div>
        </div>
        <div className="metallic-surface overflow-hidden rounded-xl">
          <div className="h-1 w-full bg-gradient-to-r from-indigo-600 to-sky-400" />
          <div className="p-4">
            <p className="text-xs font-semibold text-slate-600">National &amp; Gazetted</p>
            <p className="mt-1.5 font-mono text-2xl font-bold text-indigo-900 tabular-nums">{stats.national}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Mandatory central holidays</p>
          </div>
        </div>
        <div className="metallic-surface overflow-hidden rounded-xl">
          <div className="h-1 w-full bg-gradient-to-r from-emerald-600 to-teal-400" />
          <div className="p-4">
            <p className="text-xs font-semibold text-slate-600">Regional &amp; Company</p>
            <p className="mt-1.5 font-mono text-2xl font-bold text-emerald-900 tabular-nums">
              {stats.regional + stats.company}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
              {stats.regional} regional · {stats.company} company
            </p>
          </div>
        </div>
        <div className="metallic-surface overflow-hidden rounded-xl">
          <div className="h-1 w-full bg-gradient-to-r from-amber-500 to-yellow-400" />
          <div className="p-4">
            <p className="text-xs font-semibold text-slate-600">Next Holiday</p>
            <p className="mt-1.5 truncate font-display text-sm font-bold text-slate-900" title={stats.nextHoliday?.name}>
              {stats.nextHoliday ? stats.nextHoliday.name : 'None scheduled'}
            </p>
            <p className="mt-1 font-mono text-[11px] text-slate-500 tabular-nums">
              {stats.nextHoliday ? `${stats.nextHoliday.date} · ${getWeekdayName(stats.nextHoliday.date)}` : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Filter & View Switch Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* Year Switcher */}
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {availableYears.map((yr) => (
              <button
                key={yr}
                type="button"
                onClick={() => setSelectedYear(yr)}
                className={`rounded-md px-3 py-1.5 font-mono text-xs font-semibold tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                  selectedYear === yr
                    ? 'bg-[#0B1B36] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {yr}
              </button>
            ))}
          </div>

          {/* Type Filter Segmented Control */}
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                {id: 'ALL', label: 'All Types'},
                {id: 'NATIONAL', label: 'National'},
                {id: 'REGIONAL', label: 'Regional'},
                {id: 'COMPANY', label: 'Company'},
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTypeFilter(opt.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  typeFilter === opt.id
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search Input */}
          <div className="relative min-w-[200px] flex-1 sm:flex-initial">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search holiday or festival..."
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
            />
          </div>

          {/* View Mode Segmented Control */}
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                {id: 'MONTH', label: 'Month Grid'},
                {id: 'YEAR', label: 'Full Year'},
                {id: 'TABLE', label: 'Schedule Table'},
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setViewMode(mode.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === mode.id
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {isAdmin && selectedYear === 2027 && (
            <button
              type="button"
              onClick={() => setConfirmReset2027(true)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              Restore 2027 Defaults
            </button>
          )}
        </div>
      </div>

      {/* Role Access Indicator + Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-xs bg-indigo-600" />
            National / Gazetted
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-xs bg-emerald-600" />
            Regional / Restricted Festival
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-xs bg-amber-500" />
            Company Holiday
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-xs border border-slate-300 bg-slate-100" />
            Sunday Weekly Off
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          {!isAdmin && <Lock className="h-3 w-3 text-slate-400" />}
          <span>
            {isAdmin
              ? 'Click any date cell on the calendar to add a holiday, or click a holiday to edit/delete.'
              : 'Only Super Admin & HR Admin can add or modify company holidays.'}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-500">
          Loading {selectedYear} Indian holiday calendar...
        </div>
      ) : viewMode === 'MONTH' ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          {/* Monthly Interactive Calendar Grid */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white xl:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#0B1B36]" />
                <h2 className="font-display text-base font-semibold text-slate-900">
                  {MONTH_NAMES[selectedMonth]} <span className="font-mono tabular-nums">{selectedYear}</span>
                </h2>
                <span className="text-xs text-slate-500 tabular-nums">
                  · {currentMonthHolidays.length} holiday{currentMonthHolidays.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={nextMonth}
                  className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* 12-Month Quick Strip */}
            <div className="grid grid-cols-6 gap-1 border-b border-slate-200 bg-slate-50 p-2 sm:grid-cols-12">
              {SHORT_MONTHS.map((label, idx) => {
                const count = monthCounts[idx];
                const active = selectedMonth === idx;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setSelectedMonth(idx)}
                    className={`flex flex-col items-center justify-center rounded-lg px-1 py-1.5 text-[11px] transition-colors ${
                      active
                        ? 'bg-[#0B1B36] font-semibold text-white'
                        : 'text-slate-700 hover:bg-white hover:text-slate-900'
                    }`}
                  >
                    <span>{label}</span>
                    <span
                      className={`font-mono text-[10px] tabular-nums ${
                        active ? 'text-amber-300' : count > 0 ? 'text-emerald-700 font-semibold' : 'text-slate-400'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Weekday Column Headers */}
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/70 text-center text-[11px] font-semibold text-slate-600">
              {WEEKDAYS_SHORT.map((wd, idx) => (
                <div
                  key={wd}
                  className={`py-2 ${idx === 0 ? 'text-rose-700' : 'text-slate-600'}`}
                >
                  {wd}
                </div>
              ))}
            </div>

            {/* Day Cells */}
            <div className="grid grid-cols-7 divide-x divide-y divide-slate-200">
              {monthCells.map((cell, idx) => {
                if (!cell.day || !cell.isoDate) {
                  return (
                    <div
                      key={`empty-${idx}`}
                      className={`min-h-[88px] sm:min-h-[104px] ${cell.isSunday ? 'bg-slate-50/70' : 'bg-slate-50/40'}`}
                    />
                  );
                }

                const dayHolidays = holidaysByDate.get(cell.isoDate) || [];
                const isToday = cell.isoDate === todayIso;

                return (
                  <div
                    key={cell.isoDate}
                    className={`group relative flex min-h-[88px] sm:min-h-[104px] flex-col justify-between p-1.5 sm:p-2 transition-colors ${
                      cell.isSunday ? 'bg-slate-50/90' : 'bg-white'
                    } ${isToday ? 'ring-2 ring-inset ring-blue-600' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`font-mono text-xs font-semibold tabular-nums ${
                          isToday
                            ? 'rounded bg-blue-600 px-1.5 py-0.5 text-white'
                            : cell.isSunday
                              ? 'text-rose-700'
                              : 'text-slate-800'
                        }`}
                      >
                        {String(cell.day).padStart(2, '0')}
                      </span>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => openAddModal(cell.isoDate!)}
                          title={`Add holiday on ${cell.isoDate}`}
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-[#0B1B36] transition-opacity"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="mt-1 space-y-1">
                      {dayHolidays.map((h) => {
                        const style = getHolidayStyle(h.type, h.isOptional);
                        return (
                          <button
                            key={h.holidayId}
                            type="button"
                            onClick={() => (isAdmin ? openEditModal(h) : setSelectedHoliday(h))}
                            className={`w-full rounded border px-1.5 py-1 text-left text-[11px] leading-tight transition-colors ${style.cellClass}`}
                            title={`${h.name}${h.description ? ' — ' + h.description : ''}`}
                          >
                            <span className="block truncate font-semibold">{h.name}</span>
                            <span className="hidden sm:block truncate text-[10px] opacity-80">
                              {h.isOptional ? 'Optional / RH' : h.type}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {cell.isSunday && dayHolidays.length === 0 && (
                      <span className="mt-auto text-[10px] font-medium text-slate-400">Weekly Off</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Month & Upcoming Holidays Side Panel */}
          <div className="space-y-5 xl:col-span-4">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  {MONTH_NAMES[selectedMonth]} {selectedYear} Holidays
                </h3>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => openAddModal(formatIsoDate(selectedYear, selectedMonth, 1))}
                    className="rounded border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                  >
                    + Add
                  </button>
                )}
              </div>
              <div className="divide-y divide-slate-100 p-4 text-xs">
                {currentMonthHolidays.length === 0 ? (
                  <p className="py-6 text-center text-slate-500">
                    No holidays scheduled in {MONTH_NAMES[selectedMonth]} {selectedYear} for this filter.
                  </p>
                ) : (
                  currentMonthHolidays.map((h) => {
                    const style = getHolidayStyle(h.type, h.isOptional);
                    return (
                      <div key={h.holidayId} className="flex items-start justify-between gap-2 py-3 first:pt-0 last:pb-0">
                        <button
                          type="button"
                          onClick={() => setSelectedHoliday(h)}
                          className="min-w-0 flex-1 text-left hover:opacity-80"
                        >
                          <p className="font-semibold text-slate-900">{h.name}</p>
                          <p className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums">
                            {h.date} · {getWeekdayName(h.date)}
                          </p>
                          <p className={`mt-0.5 text-[11px] font-medium ${style.labelClass}`}>
                            {style.typeLabel}
                          </p>
                          {h.description && (
                            <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{h.description}</p>
                          )}
                        </button>
                        {isAdmin && (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(h)}
                              className="rounded border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
                              title="Edit holiday"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(h)}
                              className="rounded border border-red-200 p-1.5 text-red-600 hover:bg-red-50"
                              title="Delete holiday"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Quick Annual Highlights */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-3">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  All {selectedYear} National &amp; Gazetted Dates
                </h3>
              </div>
              <div className="max-h-[300px] divide-y divide-slate-100 overflow-y-auto px-4 py-2 text-xs">
                {yearAllHolidays
                  .filter((h) => h.type === 'NATIONAL')
                  .map((h) => (
                    <button
                      key={h.holidayId}
                      type="button"
                      onClick={() => {
                        const p = parseIsoParts(h.date);
                        if (p) setSelectedMonth(p.month - 1);
                      }}
                      className="flex w-full items-center justify-between gap-2 py-2 text-left hover:bg-slate-50"
                    >
                      <span className="truncate font-medium text-slate-800">{h.name}</span>
                      <span className="shrink-0 font-mono text-[11px] text-slate-500 tabular-nums">
                        {h.date}
                      </span>
                    </button>
                  ))}
                {yearAllHolidays.filter((h) => h.type === 'NATIONAL').length === 0 && (
                  <p className="py-4 text-center text-slate-500">No national holidays found for {selectedYear}.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : viewMode === 'YEAR' ? (
        /* Full Year 12-Month Wall Calendar Grid */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {MONTH_NAMES.map((mName, mIdx) => {
            const cells = buildMonthCells(selectedYear, mIdx);
            const mHolidays = yearHolidays.filter((h) => parseIsoParts(h.date)?.month === mIdx + 1);
            return (
              <div key={mName} className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3.5 py-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMonth(mIdx);
                      setViewMode('MONTH');
                    }}
                    className="font-display text-sm font-semibold text-slate-900 hover:text-blue-700"
                  >
                    {mName} <span className="font-mono text-xs text-slate-500 tabular-nums">{selectedYear}</span>
                  </button>
                  <span className="font-mono text-[11px] font-semibold text-slate-600 tabular-nums">
                    {mHolidays.length} holiday{mHolidays.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="p-2.5">
                  <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-semibold text-slate-500">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                      <div key={i} className={i === 0 ? 'text-rose-600' : ''}>
                        {d}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center font-mono text-[11px] tabular-nums">
                    {cells.map((c, idx) => {
                      if (!c.day || !c.isoDate) {
                        return <div key={`m-${mIdx}-e-${idx}`} className="h-7" />;
                      }
                      const dayHols = holidaysByDate.get(c.isoDate) || [];
                      const first = dayHols[0];
                      const style = first ? getHolidayStyle(first.type, first.isOptional) : null;
                      return (
                        <button
                          key={c.isoDate}
                          type="button"
                          onClick={() => {
                            if (first) {
                              if (isAdmin) openEditModal(first);
                              else setSelectedHoliday(first);
                            } else if (isAdmin) {
                              openAddModal(c.isoDate!);
                            }
                          }}
                          title={
                            dayHols.length > 0
                              ? dayHols.map((h) => `${h.name} (${h.type})`).join(' · ')
                              : isAdmin
                                ? `Click to add holiday on ${c.isoDate}`
                                : c.isoDate
                          }
                          className={`flex h-7 items-center justify-center rounded transition-colors ${
                            style
                              ? style.miniCellClass
                              : c.isSunday
                                ? 'text-rose-600 hover:bg-slate-100'
                                : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {c.day}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {mHolidays.length > 0 && (
                  <div className="mt-auto border-t border-slate-100 px-3 py-2 text-[11px] space-y-1">
                    {mHolidays.map((h) => (
                      <div key={h.holidayId} className="flex items-center justify-between gap-2">
                        <span className="truncate text-slate-700" title={h.name}>
                          <span className="font-mono font-semibold text-slate-900 tabular-nums">
                            {h.date.slice(8, 10)}
                          </span>{' '}
                          {h.name}
                        </span>
                        <span className="shrink-0 text-[10px] font-medium text-slate-500">
                          {h.type === 'NATIONAL' ? 'NAT' : h.type === 'REGIONAL' ? 'REG' : 'CO'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Schedule Table View */
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-[#0B1B36]" />
              <h2 className="font-display text-sm font-semibold text-slate-900">
                {selectedYear} Holiday Schedule ({yearHolidays.length})
              </h2>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={() => openAddModal()}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                + Add Holiday
              </button>
            )}
          </div>
          {yearHolidays.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No holidays found for {selectedYear} matching your filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Day</th>
                    <th className="px-4 py-2.5">Holiday / Festival</th>
                    <th className="px-4 py-2.5">Category</th>
                    <th className="px-4 py-2.5">Observance &amp; Notes</th>
                    {isAdmin && <th className="px-4 py-2.5 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {yearHolidays.map((h) => {
                    const style = getHolidayStyle(h.type, h.isOptional);
                    const wd = getWeekdayName(h.date);
                    return (
                      <tr key={h.holidayId} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2.5 font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          {h.date}
                        </td>
                        <td className={`px-4 py-2.5 whitespace-nowrap ${wd === 'Sunday' ? 'font-semibold text-rose-700' : 'text-slate-600'}`}>
                          {wd}
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-slate-900">{h.name}</td>
                        <td className={`px-4 py-2.5 font-medium whitespace-nowrap ${style.labelClass}`}>
                          {style.typeLabel}
                        </td>
                        <td className="max-w-md px-4 py-2.5 text-slate-600">
                          {h.description || (h.isOptional ? 'Optional / Restricted Holiday' : 'Full Holiday')}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditModal(h)}
                                className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                              >
                                <Edit3 className="h-3 w-3" /> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(h)}
                                className="inline-flex items-center gap-1 rounded border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-3 w-3" /> Delete
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Read-Only Holiday Detail Modal */}
      {selectedHoliday && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs text-slate-500 tabular-nums">
                  {selectedHoliday.date} · {getWeekdayName(selectedHoliday.date)}
                </p>
                <h3 className="mt-1 font-display text-lg font-semibold text-slate-900">{selectedHoliday.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHoliday(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-xs">
              <p className="text-slate-700">
                <span className="font-semibold text-slate-900">Category:</span>{' '}
                {getHolidayStyle(selectedHoliday.type, selectedHoliday.isOptional).typeLabel}
              </p>
              <p className="text-slate-700">
                <span className="font-semibold text-slate-900">Observance:</span>{' '}
                {selectedHoliday.isOptional ? 'Optional / Restricted Holiday' : 'Compulsory / Public Holiday'}
              </p>
              <p className="text-slate-600">
                <span className="font-semibold text-slate-900">Details:</span>{' '}
                {selectedHoliday.description || 'Standard scheduled holiday.'}
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => openEditModal(selectedHoliday)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1B36] px-4 py-2 text-xs font-semibold text-white"
                >
                  <Edit3 className="h-3.5 w-3.5" /> Edit Holiday
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedHoliday(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Add / Edit Holiday Modal */}
      {isAdmin && showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-base font-semibold text-slate-900">
                {editingId ? 'Edit Holiday' : 'Add Holiday'}
              </h3>
              <button
                type="button"
                onClick={() => setShowEditor(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveHoliday} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="mb-1 block font-semibold text-slate-700">Holiday Date *</label>
                <input
                  required
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                />
                {formDate && (
                  <p className="mt-1 text-[11px] text-slate-500">Day of week: {getWeekdayName(formDate)}</p>
                )}
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-700">Holiday / Festival Name *</label>
                <input
                  required
                  type="text"
                  maxLength={120}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Diwali (Deepavali)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-700">Holiday Category</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as HolidayRecord['type'])}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="NATIONAL">National / Central Gazetted Holiday</option>
                  <option value="REGIONAL">Regional / State Festival Holiday</option>
                  <option value="COMPANY">Company Holiday</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-700">Notes / Observance Details</label>
                <textarea
                  rows={2}
                  maxLength={240}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="e.g., Central Gazetted Holiday · Applicable to all offices"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <label className="flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={formOptional}
                  onChange={(e) => setFormOptional(e.target.checked)}
                />
                Mark as Optional / Restricted Holiday (RH)
              </label>

              <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                {editingId ? (
                  <button
                    type="button"
                    onClick={() => {
                      const found = holidays.find((h) => h.holidayId === editingId);
                      setShowEditor(false);
                      if (found) setDeleteTarget(found);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 font-medium text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEditor(false)}
                    className="rounded-lg border border-slate-200 px-3 py-2 font-medium text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-[#0B1B36] px-4 py-2 font-semibold text-white disabled:opacity-60"
                  >
                    {saving ? 'Saving...' : 'Save Holiday'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Holiday?"
        description={
          deleteTarget
            ? `Remove "${deleteTarget.name}" (${deleteTarget.date}) from the organization holiday calendar?`
            : ''
        }
        confirmLabel="Delete Holiday"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />

      <ConfirmDialog
        open={confirmReset2027}
        title="Restore Official 2027 Indian Holiday Calendar?"
        description="This will replace all 2027 calendar entries with the verified 2027 Indian National, DoPT Gazetted, and Regional holidays list. Non-2027 holidays will be preserved."
        confirmLabel="Restore 2027 Defaults"
        destructive
        onCancel={() => setConfirmReset2027(false)}
        onConfirm={handleReset2027}
      />
    </div>
  );
}
