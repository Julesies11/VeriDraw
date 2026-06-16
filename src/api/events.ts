import { supabase } from '@/lib/supabase';
import { TABLES } from '@/config/db-tables';
import type { Database } from '@/models/database.types';

export type EventInsert = Database['public']['Tables']['vd_events']['Insert'];
export type EventUpdate = Database['public']['Tables']['vd_events']['Update'];
export type EventRow = Database['public']['Tables']['vd_events']['Row'] & {
  parent?: { slug: string } | { slug: string }[] | null;
};
export type EventItemInsert = Database['public']['Tables']['vd_event_items']['Insert'];
export type EventItemRow = Database['public']['Tables']['vd_event_items']['Row'];

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
}

function generateRandomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const eventsApi = {
  /**
   * Sanitizes payloads to avoid system column update errors.
   */
  sanitizeRecord(record: any) {
    const sanitized = { ...record };
    const systemFields = ['created_at', 'updated_at', 'created_by', 'updated_by'];
    systemFields.forEach((key) => delete sanitized[key]);
    return sanitized;
  },

  /**
   * List scheduled or active events.
   */
  async list() {
    const { data, error } = await supabase
      .from(TABLES.EVENTS)
      .select('*')
      .order('scheduled_start_time', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  /**
   * Get a single event details by ID.
   */
  async get(id: string) {
    const { data, error } = await supabase
      .from(TABLES.EVENTS)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  /**
   * Get a single event details by either UUID or custom slug.
   */
  async getBySlugOrId(slugOrId: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
    const filterField = isUuid ? 'id' : 'slug';

    const { data, error } = await supabase
      .from(TABLES.EVENTS)
      .select('*, parent:vd_events!duplicated_from(slug)')
      .eq(filterField, slugOrId)
      .maybeSingle();

    if (error) throw error;
    return data as any; // Cast to bypass strict event type constraints for parent joins
  },

  /**
   * Load all items related to an event.
   */
  async listItems(eventId: string) {
    const { data, error } = await supabase
      .from(TABLES.EVENT_ITEMS)
      .select('*')
      .eq('event_id', eventId)
      .order('display_order', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  /**
   * Create a new event with its list of items.
   */
  async create(eventPayload: Omit<EventInsert, 'slug'>, items: string[]) {
    // 1. Get current authenticated user
    const { data: { user } } = await supabase.auth.getUser();
    const creatorId = user ? user.id : null;

    // Generate unique slug
    const baseSlug = slugify(eventPayload.event_name) || 'draw';
    const uniqueCode = generateRandomString(6);
    const generatedSlug = `${baseSlug}-${uniqueCode}`;

    // Sanitize payload first, then add back tracking keys and slug
    const sanitizedEvent = {
      ...this.sanitizeRecord(eventPayload),
      slug: generatedSlug,
    };

    if (creatorId) {
      sanitizedEvent.created_by = creatorId;
      sanitizedEvent.updated_by = creatorId;
    }

    // 2. Insert event
    const { data: event, error: eventError } = await supabase
      .from(TABLES.EVENTS)
      .insert(sanitizedEvent)
      .select()
      .single();

    if (eventError) throw eventError;
    if (!event) throw new Error('Failed to create event record.');

    // 3. Insert items
    if (items.length > 0) {
      const itemsPayload = items.map((item, index) => ({
        event_id: event.id,
        item_value: item,
        is_selected: false,
        display_order: index,
        updated_by: creatorId,
      }));

      const { error: itemsError } = await supabase
        .from(TABLES.EVENT_ITEMS)
        .insert(itemsPayload);

      if (itemsError) {
        // Rollback event on items fail
        await supabase.from(TABLES.EVENTS).delete().eq('id', event.id);
        throw itemsError;
      }
    }

    return event;
  },

  /**
   * Generates a cryptographically secure random alphanumeric code.
   * Modulo bias is avoided by rejecting values >= 252.
   */
  generateSecureCode(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    const tempArray = new Uint8Array(1);
    
    while (result.length < length) {
      globalThis.crypto.getRandomValues(tempArray);
      const val = tempArray[0];
      if (val < 252) {
        result += chars.charAt(val % 36);
      }
    }
    return result;
  },

  /**
   * Create a completed Quick Draw event with pre-selected items.
   * Retries automatically if unique key constraint is violated.
   */
  async createCompletedQuickDraw(
    preferredSlug: string,
    items: Array<{ item_value: string; is_selected: boolean; selection_order?: number }>,
    duplicatedFromSlug?: string | null
  ) {
    // 1. Get current authenticated user
    const { data: { user } } = await supabase.auth.getUser();
    const creatorId = user ? user.id : null;

    // 2. Fetch parent event ID by slug if duplicate
    let parentId: string | null = null;
    if (duplicatedFromSlug) {
      const parentEvent = await this.getBySlugOrId(duplicatedFromSlug);
      if (parentEvent) {
        parentId = parentEvent.id;
      }
    }

    let slug = preferredSlug;
    let attempts = 0;
    let lastError: any = null;

    while (attempts < 5) {
      // 3. Insert event
      const eventPayload = {
        event_name: 'Quick Draw',
        scheduled_start_time: new Date().toISOString(),
        item_type: 'custom',
        select_count: items.filter((i) => i.is_selected).length || 1,
        status: 'completed',
        slug: slug,
        created_by: creatorId,
        updated_by: creatorId,
        duplicated_from: parentId,
      };

      const { data: event, error: eventError } = await supabase
        .from(TABLES.EVENTS)
        .insert(eventPayload)
        .select()
        .maybeSingle();

      if (!eventError && event) {
        // Event created successfully! Now insert the items.
        if (items.length > 0) {
          const itemsPayload = items.map((item, index) => ({
            event_id: event.id,
            item_value: item.item_value,
            is_selected: item.is_selected,
            selection_order: item.selection_order || null,
            selected_at: item.is_selected ? new Date().toISOString() : null,
            display_order: index,
            updated_by: creatorId,
          }));

          const { error: itemsError } = await supabase
            .from(TABLES.EVENT_ITEMS)
            .insert(itemsPayload);

          if (itemsError) {
            // Rollback event on items fail
            await supabase.from(TABLES.EVENTS).delete().eq('id', event.id);
            throw itemsError;
          }
        }
        return event;
      }

      // Check for Unique Constraint Violation (Postgres Code 23505)
      if (eventError && eventError.code === '23505') {
        attempts++;
        lastError = eventError;
        // Generate a new secure slug for the retry
        slug = `VD-${this.generateSecureCode(6)}`;
        continue;
      }

      throw eventError;
    }

    throw new Error(`Collision resolution failed after 5 attempts. Last error: ${lastError?.message}`);
  },

  /**
   * Delete an event.
   */
  async delete(id: string) {
    const { error } = await supabase
      .from(TABLES.EVENTS)
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  },
};
