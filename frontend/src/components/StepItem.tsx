interface StepItemProps {
  number: number;
  text: string;
  active?: boolean;
}

export function StepItem({ number, text, active }: StepItemProps) {
  return (
    <div
      className={`flex items-center space-x-4 rounded-2xl p-3 transition-all duration-300 ${
        active ? 'border border-white bg-white text-black' : 'bg-brand-gray text-white'
      }`}
    >
      <div
        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
          active ? 'bg-black text-white' : 'bg-white/10 text-white/40'
        }`}
      >
        {number}
      </div>
      <span className="text-sm font-medium tracking-tight">{text}</span>
    </div>
  );
}
