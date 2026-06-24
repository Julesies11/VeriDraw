import { describe, it, expect } from 'vitest';
import { deriveWheelState, type EventItem, type EventSession } from './roulette-helpers';

describe('deriveWheelState synchronization logic unit tests', () => {
  const items: EventItem[] = [
    { id: '1', item_value: 'Alice', is_selected: false, selection_order: null },
    { id: '2', item_value: 'Bob', is_selected: false, selection_order: null },
    { id: '3', item_value: 'Charlie', is_selected: false, selection_order: null },
    { id: '4', item_value: 'Dave', is_selected: false, selection_order: null },
  ];

  it('handles initial idle state (no selections)', () => {
    const session: EventSession = {
      current_status: 'idle',
      active_winner_id: null,
    };

    const { wheelItems, currentRound } = deriveWheelState(items, session);

    expect(currentRound).toBe(1);
    expect(wheelItems.length).toBe(4);
    expect(wheelItems.every(i => !i.is_selected)).toBe(true);
  });

  it('handles first spin state (winner B selected in DB but wheel is spinning)', () => {
    // Bob (id: 2) is selected in DB
    const itemsState = items.map(i => i.id === '2' ? { ...i, is_selected: true, selection_order: 1 } : i);
    const session: EventSession = {
      current_status: 'spinning',
      active_winner_id: '2',
    };

    const { wheelItems, currentRound } = deriveWheelState(itemsState, session);

    expect(currentRound).toBe(1); // Still round 1 until dismissed
    expect(wheelItems.length).toBe(4); // All 4 slices are still on the wheel
    expect(wheelItems.find(i => i.id === '2')?.is_selected).toBe(false); // Forced to false to keep it visible
  });

  it('handles first landed state (winner B banner is active)', () => {
    const itemsState = items.map(i => i.id === '2' ? { ...i, is_selected: true, selection_order: 1 } : i);
    const session: EventSession = {
      current_status: 'landed',
      active_winner_id: '2',
    };

    const { wheelItems, currentRound } = deriveWheelState(itemsState, session);

    expect(currentRound).toBe(1);
    expect(wheelItems.length).toBe(4);
    expect(wheelItems.find(i => i.id === '2')?.is_selected).toBe(false);
  });

  it('handles idle state after first winner is dismissed (waiting for round 2)', () => {
    const itemsState = items.map(i => i.id === '2' ? { ...i, is_selected: true, selection_order: 1 } : i);
    const session: EventSession = {
      current_status: 'idle',
      active_winner_id: null,
    };

    const { wheelItems, currentRound } = deriveWheelState(itemsState, session);

    expect(currentRound).toBe(2); // Waiting for round 2
    expect(wheelItems.length).toBe(3); // Bob is removed from the wheel
    expect(wheelItems.map(i => i.id)).toEqual(['1', '3', '4']); // Only Alice, Charlie, Dave remaining
  });

  it('handles second spin state (drawing C)', () => {
    // Bob was selected in round 1, Charlie is being selected in round 2
    const itemsState = items.map(i => {
      if (i.id === '2') return { ...i, is_selected: true, selection_order: 1 };
      if (i.id === '3') return { ...i, is_selected: true, selection_order: 2 };
      return i;
    });
    const session: EventSession = {
      current_status: 'spinning',
      active_winner_id: '3',
    };

    const { wheelItems, currentRound } = deriveWheelState(itemsState, session);

    expect(currentRound).toBe(2);
    expect(wheelItems.length).toBe(3); // Alice, Charlie, Dave (Bob is excluded)
    expect(wheelItems.find(i => i.id === '3')?.is_selected).toBe(false); // Charlie forced to visible
    expect(wheelItems.find(i => i.id === '2')).toBeUndefined(); // Bob is gone
  });

  it('handles empty items roster or null event/session gracefully', () => {
    const { wheelItems: emptyItems, currentRound: r1 } = deriveWheelState([], null);
    expect(r1).toBe(1);
    expect(emptyItems).toEqual([]);

    const { wheelItems: normalItems, currentRound: r2 } = deriveWheelState(items, null);
    expect(r2).toBe(1);
    expect(normalItems.length).toBe(4);
  });
});
