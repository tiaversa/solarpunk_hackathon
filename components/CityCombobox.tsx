"use client";

type Props = {
  value: string;
  onChange: (city: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
};

export function CityCombobox({
  value,
  onChange,
  placeholder = "Start typing a city…",
  required = false,
  className = "",
}: Props) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      autoComplete="off"
      className={`rounded-lg border border-leaf-100 px-3 py-2 text-base text-leaf-700 focus:border-leaf-500 focus:outline-none focus:ring-1 focus:ring-leaf-500 w-full ${className}`}
    />
  );
}
