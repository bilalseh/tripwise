import {
  canRedo,
  canUndo,
  createHistory,
  record,
  redo,
  reset,
  undo,
  type BudgetOverride,
  type Day,
  type History,
  type Trip,
} from '@tripwise/shared';
import { create } from 'zustand';

/** The parts of a trip the user edits. Each change is one immutable snapshot (one undo step). */
export interface Editable {
  title: string;
  days: Day[];
  overrides: BudgetOverride[];
}

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error' | 'conflict';

interface ItineraryState {
  tripId: string | null;
  version: number;
  history: History<Editable>;
  /** The snapshot the server has; `present !== saved` means unsaved changes. */
  saved: Editable | null;
  status: SaveStatus;
  load: (trip: Trip) => void;
  apply: (change: (current: Editable) => Editable) => void;
  undo: () => void;
  redo: () => void;
  markSaved: (trip: Trip, sent: Editable) => void;
  setStatus: (status: SaveStatus) => void;
}

const editableOf = (trip: Trip): Editable => ({
  title: trip.title,
  days: trip.days,
  overrides: trip.overrides,
});

export const useItineraryStore = create<ItineraryState>()((set, get) => ({
  tripId: null,
  version: 0,
  history: createHistory<Editable>({ title: '', days: [], overrides: [] }),
  saved: null,
  status: 'saved',
  load: (trip) => {
    const present = editableOf(trip);
    set({
      tripId: trip.id,
      version: trip.version,
      history: createHistory(present),
      saved: present,
      status: 'saved',
    });
  },
  apply: (change) => {
    const { history } = get();
    set({ history: record(history, change(history.present)), status: 'pending' });
  },
  undo: () => {
    set((state) => ({ history: undo(state.history), status: 'pending' }));
  },
  redo: () => {
    set((state) => ({ history: redo(state.history), status: 'pending' }));
  },
  markSaved: (trip, sent) => {
    const { history } = get();
    // Keep the undo stack; only the version and the saved marker move forward.
    const upToDate = history.present === sent;
    set({
      version: trip.version,
      saved: sent,
      history: upToDate ? reset(history, sent) : history,
      status: upToDate ? 'saved' : 'pending',
    });
  },
  setStatus: (status) => {
    set({ status });
  },
}));

export const selectPresent = (state: ItineraryState) => state.history.present;
export const selectCanUndo = (state: ItineraryState) => canUndo(state.history);
export const selectCanRedo = (state: ItineraryState) => canRedo(state.history);
export const selectDirty = (state: ItineraryState) =>
  state.saved !== null && state.history.present !== state.saved;
