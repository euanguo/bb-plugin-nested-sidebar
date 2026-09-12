import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
  THREAD_FILTER_LABELS,
  THREAD_FILTER_PRESETS,
  type ThreadFilterPreset,
} from "@/lib/thread-management";

export function FilterMenu({
  value,
  onChange,
}: {
  value: ThreadFilterPreset;
  onChange: (value: ThreadFilterPreset) => void;
}) {
  const label = THREAD_FILTER_LABELS[value];
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (
          THREAD_FILTER_PRESETS.includes(next as ThreadFilterPreset)
        ) {
          onChange(next as ThreadFilterPreset);
        }
      }}
    >
      <SelectTrigger
        hideChevron
        aria-label={`Filter threads: ${label}`}
        title={`Filter: ${label}`}
        className={cn(
          "size-6 border-0 p-0 text-muted-foreground shadow-none",
          "justify-center hover:bg-sidebar-accent hover:text-foreground",
          "focus:ring-1 focus:ring-ring",
          value !== "all" && "bg-primary/10 text-primary",
        )}
      >
        <Icon name="Filter" className="size-3.5" aria-hidden />
      </SelectTrigger>
      <SelectContent align="end" className="min-w-36">
        {THREAD_FILTER_PRESETS.map((preset) => (
          <SelectItem key={preset} value={preset} className="text-xs">
            {THREAD_FILTER_LABELS[preset]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
