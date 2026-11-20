import { createContext } from 'react';

/** A step can replace the modal body while keeping the previous form mounted. */
export const ModalStepContext = createContext<{
  target: HTMLDivElement | null;
  setActive: (active: boolean) => void;
} | null>(null);
