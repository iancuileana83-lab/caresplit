export function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="30" height="20" viewBox="0 0 30 20" aria-hidden="true">
        <circle cx="10" cy="10" r="8" fill="#0F766E" />
        <circle cx="20" cy="10" r="8" fill="#5EEAD4" fillOpacity="0.9" />
      </svg>
      <span className="text-[17px] font-semibold tracking-tight text-teal-700">CareSplit</span>
    </span>
  );
}
