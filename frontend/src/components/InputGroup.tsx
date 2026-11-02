interface InputGroupProps {
  label: string;
  placeholder: string;
  type: string;
  value?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function InputGroup({ label, placeholder, type, value, onChange }: InputGroupProps) {
  return (
    <div className="flex-1 space-y-1.5">
      <label className="text-xs font-medium text-white/70">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl bg-brand-gray px-4 text-xs text-white outline-none placeholder:text-white/20 focus:ring-2 focus:ring-white/20"
      />
    </div>
  );
}
import type { ChangeEvent } from 'react';
