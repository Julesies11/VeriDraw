import { useMemo } from 'react';
import { diff } from 'json-diff-ts';

interface DirtyTrackerProps<T> {
  formData: T;
  originalData: T;
}

export function useDirtyTracker<T>({ formData, originalData }: DirtyTrackerProps<T>) {
  const formDiff = useMemo(() => {
    try {
      return diff(originalData, formData);
    } catch (e) {
      console.error('[useDirtyTracker Error]', e);
      return [];
    }
  }, [formData, originalData]);

  const isDirty = useMemo(() => {
    return formDiff.length > 0;
  }, [formDiff]);

  return {
    isDirty,
    formDiff,
  };
}
