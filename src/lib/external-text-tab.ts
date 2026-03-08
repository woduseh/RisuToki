export interface ExternalTextTabState {
  getValue: () => string;
  setValue: (nextValue: string) => void | Promise<unknown>;
}

export function createExternalTextTabState(
  initialValue: string | null | undefined,
  persist: (nextValue: string) => void | Promise<unknown>
): ExternalTextTabState {
  let currentValue = initialValue ?? '';

  return {
    getValue: () => currentValue,
    setValue: (nextValue: string) => {
      currentValue = nextValue;
      return persist(nextValue);
    }
  };
}
