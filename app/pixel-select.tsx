'use client';

import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';

export type PixelSelectOption = { value: string; label: string };

export default function PixelSelect({ label, name, value, options, onValueChange, className = '' }: {
  label: string;
  name: string;
  value: string;
  options: PixelSelectOption[];
  onValueChange: (value: string) => void;
  className?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex];

  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${activeIndex}`)?.focus();
  }, [id, open, activeIndex]);

  function closeIfFocusLeaves(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(selectedIndex);
      setOpen(true);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = activeIndex;
    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % options.length;
    if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + options.length) % options.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = options.length - 1;
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    }
    if (nextIndex !== null) {
      event.preventDefault();
      setActiveIndex(nextIndex);
      document.getElementById(`${id}-option-${nextIndex}`)?.focus();
    }
  }

  return (
    <div className={`pixel-select-field ${className}`} onBlur={closeIfFocusLeaves}>
      <span id={`${id}-label`} className="pixel-select-label">{label}</span>
      <input type="hidden" name={name} value={value} />
      <div className="pixel-select-control">
        <button ref={trigger} type="button" className="pixel-select-trigger" role="combobox"
          aria-labelledby={`${id}-label ${id}-value`} aria-controls={`${id}-listbox`}
          aria-haspopup="listbox" aria-expanded={open} onClick={() => {
            if (!open) setActiveIndex(selectedIndex);
            setOpen(!open);
          }} onKeyDown={handleTriggerKeyDown}>
          <span id={`${id}-value`}>{selected?.label ?? ''}</span><span className="pixel-select-arrow" aria-hidden="true">⌄</span>
        </button>
        {open && <div className="pixel-select-list" id={`${id}-listbox`} role="listbox" aria-labelledby={`${id}-label`}
          onKeyDown={handleOptionKeyDown}>
          {options.map((option, index) => <button key={option.value} id={`${id}-option-${index}`} type="button"
            className="pixel-select-option" role="option" aria-selected={option.value === value} tabIndex={-1}
            onClick={() => {
              onValueChange(option.value);
              setOpen(false);
              trigger.current?.focus();
            }}>{option.label}</button>)}
        </div>}
      </div>
    </div>
  );
}
