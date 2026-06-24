export interface EventItem {
  id: string;
  item_value: string;
  is_selected: boolean;
  selection_order?: number | null;
}

export interface EventSession {
  current_status: string;
  active_winner_id?: string | null;
}

/**
 * Derives the active slices for the roulette wheel and determines the current draw round.
 * 
 * Slices are filtered to exclude items that were selected in previous rounds.
 * During an active spin or landed phase, the winner of the current round is included
 * on the wheel and forced to is_selected: false so it renders as a normal, active slice.
 */
export function deriveWheelState(items: EventItem[], session: EventSession | null) {
  if (!items || items.length === 0) {
    return { wheelItems: [], currentRound: 1 };
  }

  const activeWinnerId = session?.active_winner_id;
  const isSpinningOrLanded = session?.current_status === 'spinning' || session?.current_status === 'landed';

  // Count items selected in previous rounds
  const prevSelectedItems = items.filter(
    (item) => item.is_selected && (!isSpinningOrLanded || item.id !== activeWinnerId)
  );
  const currentRound = prevSelectedItems.length + 1;

  // Slices on the wheel:
  // 1. All unselected items
  // 2. The current winner (if we are spinning or landed)
  const wheelItems = items
    .filter((item) => {
      if (!item.is_selected) return true;
      if (isSpinningOrLanded && item.id === activeWinnerId) return true;
      return false;
    })
    .map((item) => {
      // Force the current winner to look unselected during the active draw round
      if (isSpinningOrLanded && item.id === activeWinnerId) {
        return { ...item, is_selected: false };
      }
      return item;
    });

  return { wheelItems, currentRound };
}
