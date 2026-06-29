import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { eventsApi } from '@/api/events';
import { useDirtyTracker } from '@/hooks/useDirtyTracker';
import { ROUTES } from '@/config/routes.config';
import { getFriendlyErrorMessage, logErrorToDb } from '@/lib/error-helpers';
import { ArrowLeft, Save, List, Upload, Settings, FileText, ChevronDown, ChevronUp, Info, Loader2 } from 'lucide-react';

interface CreateEventFormData {
  name: string;
  description: string;
  scheduled_start_time: string;
  item_type: string;
  select_count: number | '';
  itemsText: string;
  allow_repeats: boolean;
  enable_public_link: boolean;
  require_viewer_login: boolean;
  enable_verifiable_seed: boolean;
}

function getDuplicatedName(name: string): string {
  const cleanName = name.trim();

  // Matches "(Copy)" or "- Copy" or similar variations at the end
  const copyRegex = /\s*(?:\(Copy\)|-\s*Copy|–\s*Copy)$/i;

  // Matches endings like " (2)", " (3)", etc.
  const parenNumRegex = /\s*\((\d+)\)$/;

  // Matches endings like " – Copy 2", " - Copy 2", etc.
  const dashCopyNumRegex = /\s*[-–—]\s*Copy\s*(\d+)$/i;

  if (copyRegex.test(cleanName)) {
    return cleanName.replace(copyRegex, ' (2)');
  }

  const parenNumMatch = cleanName.match(parenNumRegex);
  if (parenNumMatch) {
    const nextNum = parseInt(parenNumMatch[1]) + 1;
    return cleanName.replace(parenNumRegex, ` (${nextNum})`);
  }

  const dashCopyNumMatch = cleanName.match(dashCopyNumRegex);
  if (dashCopyNumMatch) {
    const nextNum = parseInt(dashCopyNumMatch[1]) + 1;
    return cleanName.replace(dashCopyNumRegex, (match) => {
      const dash = match.includes('–') ? '–' : match.includes('—') ? '—' : '-';
      return ` ${dash} Copy ${nextNum}`;
    });
  }

  return `${cleanName} (Copy)`;
}

export function CreateEvent() {
  const { user, loading: loadingAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Navigation tabs for data entry
  const [activeTab, setActiveTab] = useState<'paste' | 'csv'>('paste');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!loadingAuth && !user) {
      navigate(ROUTES.LOGIN, { state: { from: ROUTES.CREATE_EVENT } });
    }
  }, [user, loadingAuth, navigate]);

  // Form states
  const [formData, setFormData] = useState<CreateEventFormData>({
    name: '',
    description: '',
    scheduled_start_time: '', // empty by default so the user must select a time
    item_type: 'custom',
    select_count: 1,
    itemsText: '', // Tab A / Tab B parsed text
    allow_repeats: false,
    enable_public_link: true,
    require_viewer_login: false,
    enable_verifiable_seed: true,
  });

  const originalData: CreateEventFormData = {
    name: '',
    description: '',
    scheduled_start_time: '',
    item_type: 'custom',
    select_count: 1,
    itemsText: '',
    allow_repeats: false,
    enable_public_link: true,
    require_viewer_login: false,
    enable_verifiable_seed: true,
  };

  const [duplicatedFromId, setDuplicatedFromId] = useState<string | null>(null);

  // Helper to format local datetime input string (YYYY-MM-DDTHH:mm)
  const formatLocalDatetime = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = date.getFullYear();
    const MM = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const mm = pad(date.getMinutes());
    return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
  };

  useEffect(() => {
    const state = location.state as {
      duplicateFrom?: {
        id: string;
        name: string;
        description?: string;
        item_type?: string;
        select_count?: number;
        require_viewer_login?: boolean;
        enable_public_link?: boolean;
      };
      items?: string[];
    } | null;

    if (state && state.duplicateFrom) {
      const { id, name, description, item_type, select_count, require_viewer_login, enable_public_link } = state.duplicateFrom;
      const items = state.items || [];
      const timer = setTimeout(() => {
        setFormData((prev) => ({
          ...prev,
          name: getDuplicatedName(name),
          description: description || '',
          scheduled_start_time: formatLocalDatetime(new Date()),
          item_type: item_type || 'custom',
          select_count: select_count || 1,
          itemsText: items.join('\n'),
          require_viewer_login: require_viewer_login ?? false,
          enable_public_link: enable_public_link ?? true,
        }));
        setDuplicatedFromId(id);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [location.state]);

  const { isDirty } = useDirtyTracker({ formData, originalData });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const val = e.target instanceof HTMLInputElement && type === 'checkbox' ? e.target.checked : value;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'select_count' ? (value === '' ? '' : parseInt(value) || 0) : val,
    } as unknown as CreateEventFormData));
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const parsedItems = text
        .split(/[\r\n]+/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      
      setFormData(prev => ({
        ...prev,
        itemsText: parsedItems.join('\n')
      }));
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validations
    if (!formData.name.trim()) {
      setError('Event name is required.');
      return;
    }

    if (!formData.scheduled_start_time) {
      setError('Start time is required.');
      return;
    }

    const parsedDate = new Date(formData.scheduled_start_time);
    if (isNaN(parsedDate.getTime())) {
      setError('Please provide a valid start date and time.');
      return;
    }

    const itemLines = formData.itemsText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (itemLines.length === 0) {
      setError('Please provide at least one item to draw from.');
      return;
    }

    const selectCountNum = typeof formData.select_count === 'string'
      ? parseInt(formData.select_count) || 0
      : formData.select_count;

    if (selectCountNum <= 0) {
      setError('Draw count must be at least 1.');
      return;
    }

    if (selectCountNum > itemLines.length) {
      setError(`Select count (${selectCountNum}) cannot exceed the number of items supplied (${itemLines.length}).`);
      return;
    }

    try {
      setLoading(true);
      const newEvent = await eventsApi.create(
        {
          event_name: formData.name,
          scheduled_start_time: new Date(formData.scheduled_start_time).toISOString(),
          item_type: formData.item_type,
          select_count: selectCountNum,
          duplicated_from: duplicatedFromId,
          require_viewer_login: formData.require_viewer_login,
          enable_public_link: formData.enable_public_link,
        },
        itemLines
      );

      // Store ownership token locally in localstorage for anonymous / quick hosts
      if (newEvent && !newEvent.created_by) {
        const ownedEvents = JSON.parse(localStorage.getItem('vd_owned_events') || '{}');
        ownedEvents[newEvent.id] = true;
        localStorage.setItem('vd_owned_events', JSON.stringify(ownedEvents));
      }

      navigate(ROUTES.DRAW_ROOM(newEvent.slug));
    } catch (err: unknown) {
      console.error(err);
      void logErrorToDb(err, { component: 'CreateEvent', action: 'submit' });
      setError(getFriendlyErrorMessage(err, 'Failed to create drawing event.'));
    } finally {
      setLoading(false);
    }
  };

  if (loadingAuth || !user) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <span className="text-sm text-muted-foreground font-semibold">Verifying session...</span>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(ROUTES.DASHBOARD)}
          className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold font-heading">Create Live Event</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Create a scheduled draw, invite spectators, and select winners in real time.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 text-destructive text-sm border border-destructive/20">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Column: Configuration */}
        <div className="p-6 glass border border-border/40 rounded-2xl space-y-5">
          <h2 className="text-md font-extrabold font-heading text-primary flex items-center gap-2 border-b border-border/20 pb-2.5">
            <Settings className="w-4.5 h-4.5" />
            1. Event Details
          </h2>

          {/* Event Name */}
          <div className="space-y-1.5">
            <label className="text-2sm font-semibold tracking-wide" htmlFor="name">
              Event Name *
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. Club Volunteer Draw"
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
            />
          </div>

          {/* Start Time */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <label className="text-2sm font-semibold tracking-wide" htmlFor="scheduled_start_time">
                When should the draw begin? *
              </label>
              <div className="relative group shrink-0">
                <Info className="w-4 h-4 text-muted-foreground/75 hover:text-foreground transition-colors cursor-help" />
                <div className="absolute right-0 bottom-full mb-2 w-72 p-3 bg-popover text-popover-foreground text-2xs rounded-xl border border-border/80 shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 z-50 leading-normal font-normal">
                  Spectators can join the event before the scheduled draw time. A countdown will be displayed until the draw begins.
                </div>
              </div>
            </div>
            <input
              id="scheduled_start_time"
              name="scheduled_start_time"
              type="datetime-local"
              required
              value={formData.scheduled_start_time}
              onChange={handleChange}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
            />
          </div>

          {/* Target Count & Repeat Policy */}
          {/* Target Count */}
          <div className="space-y-1.5">
            <label className="text-2sm font-semibold tracking-wide" htmlFor="select_count">
              Number of Winners *
            </label>
            <input
              id="select_count"
              name="select_count"
              type="number"
              min="1"
              required
              value={formData.select_count}
              onChange={handleChange}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
            />
          </div>

          {/* Collapsible Advanced Settings */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="flex items-center gap-1.5 text-2sm font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>{advancedOpen ? 'Hide' : 'Show'} Advanced Settings</span>
              {advancedOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {advancedOpen && (
              <div className="mt-3 p-4 bg-secondary/50 rounded-xl border border-border/20 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between gap-4">
                  <label className="flex items-center gap-2.5 text-2sm font-semibold select-none cursor-pointer">
                    <input
                      type="radio"
                      name="visibility"
                      value="public"
                      checked={!formData.require_viewer_login}
                      onChange={() => setFormData((prev) => ({ ...prev, require_viewer_login: false, enable_public_link: true }))}
                      className="w-4 h-4 border-border text-primary focus:ring-ring"
                    />
                    <span>Public — anyone with the link can watch</span>
                  </label>
                  <div className="relative group shrink-0">
                    <Info className="w-4 h-4 text-muted-foreground/75 hover:text-foreground transition-colors cursor-help" />
                    <div className="absolute right-0 bottom-full mb-2 w-64 p-3 bg-popover text-popover-foreground text-2xs rounded-xl border border-border/80 shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 z-50 leading-normal font-normal">
                      Allows anyone with the URL to watch the drawing live in real-time.
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <label className="flex items-center gap-2.5 text-2sm font-semibold select-none cursor-pointer">
                    <input
                      type="radio"
                      name="visibility"
                      value="private"
                      checked={formData.require_viewer_login}
                      onChange={() => setFormData((prev) => ({ ...prev, require_viewer_login: true, enable_public_link: false }))}
                      className="w-4 h-4 border-border text-primary focus:ring-ring"
                    />
                    <span>Private — viewers must be signed in to watch</span>
                  </label>
                  <div className="relative group shrink-0">
                    <Info className="w-4 h-4 text-muted-foreground/75 hover:text-foreground transition-colors cursor-help" />
                    <div className="absolute right-0 bottom-full mb-2 w-64 p-3 bg-popover text-popover-foreground text-2xs rounded-xl border border-border/80 shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 z-50 leading-normal font-normal">
                      Restricts access to the drawing room to signed-in users only.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Candidates Entry */}
        <div className="p-6 glass border border-border/40 rounded-2xl space-y-5">
          <div className="flex items-center justify-between border-b border-border/20 pb-2.5">
            <h2 className="text-md font-extrabold font-heading text-primary flex items-center gap-2">
              <List className="w-4.5 h-4.5" />
              2. Entries
            </h2>

            <span className="text-2xs px-2 py-0.5 rounded-lg bg-primary/10 border border-primary/20 text-primary font-bold">
              Total: {formData.itemsText.split('\n').filter(l => l.trim()).length}
            </span>
          </div>

          {/* Navigation Tabs */}
          <div className="flex bg-secondary/50 p-1 rounded-xl border border-border/30">
            <button
              type="button"
              onClick={() => setActiveTab('paste')}
              className={`flex-1 py-1.5 text-2sm font-semibold rounded-lg transition-all ${
                activeTab === 'paste' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
              }`}
            >
              Paste List
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('csv')}
              className={`flex-1 py-1.5 text-2sm font-semibold rounded-lg transition-all ${
                activeTab === 'csv' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
              }`}
            >
              CSV Upload
            </button>
          </div>

          {/* Tab Content A: Paste List */}
          {activeTab === 'paste' && (
            <div className="space-y-1.5">
              <label className="text-2sm font-semibold text-muted-foreground">
                Paste entries (one per line)
              </label>
              <textarea
                name="itemsText"
                rows={7}
                required={activeTab === 'paste'}
                value={formData.itemsText}
                onChange={handleChange}
                placeholder="Sarah Jones&#10;David Miller&#10;Emma Smith&#10;Mike Johnson"
                className="w-full px-4 py-3 rounded-xl border border-border bg-input text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring transition-all resize-y"
              />
            </div>
          )}

          {/* Tab Content B: CSV Upload */}
          {activeTab === 'csv' && (
            <div className="space-y-3">
              <label className="text-2sm font-semibold text-muted-foreground block">
                Drag & drop or select a CSV/TXT roster file
              </label>
              
              <div className="border-2 border-dashed border-border/80 hover:border-primary/50 rounded-2xl p-6 text-center transition-all bg-input relative">
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleCsvUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Upload className="w-8 h-8 mx-auto text-muted-foreground/60 mb-2.5" />
                <span className="text-sm font-medium text-foreground block">
                  Select CSV or TXT file
                </span>
                <span className="text-2xs text-muted-foreground block mt-1">
                  Rows will be split by new lines
                </span>
              </div>

              {formData.itemsText && (
                <div className="p-3.5 bg-secondary/50 rounded-xl border border-border/20 max-h-[140px] overflow-y-auto">
                  <div className="text-2xs font-extrabold uppercase text-muted-foreground tracking-wide flex items-center gap-1 mb-1.5">
                    <FileText className="w-3.5 h-3.5" /> Parsed Items List Preview
                  </div>
                  <pre className="text-2xs font-mono text-foreground leading-normal whitespace-pre-wrap">
                    {formData.itemsText}
                  </pre>
                </div>
              )}
            </div>
          )}


        </div>

        {/* Footer submit action */}
        <div className="lg:col-span-2 pt-4 border-t border-border/20 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(ROUTES.DASHBOARD)}
            className="px-5 py-2.5 rounded-xl hover:bg-secondary text-sm font-semibold text-secondary-foreground transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !isDirty}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <Save className="w-4.5 h-4.5" />
            {loading ? 'Creating...' : 'Create Event'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreateEvent;
