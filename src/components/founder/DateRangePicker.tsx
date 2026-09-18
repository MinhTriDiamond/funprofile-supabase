import { Button } from '@/components/ui/button';

export type DateRangeDays = 7 | 30 | 90;

interface Props {
  value: DateRangeDays;
  onChange: (days: DateRangeDays) => void;
}

const OPTIONS: { v: DateRangeDays; label: string }[] = [
  { v: 7, label: '7 ngày' },
  { v: 30, label: '30 ngày' },
  { v: 90, label: '90 ngày' },
];

export function DateRangePicker({ value, onChange }: Props) {
  return (
    <div className="inline-flex rounded-md border bg-background p-0.5">
      {OPTIONS.map((o) => (
        <Button
          key={o.v}
          size="sm"
          variant={value === o.v ? 'default' : 'ghost'}
          className="h-7 px-2 text-xs"
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}
