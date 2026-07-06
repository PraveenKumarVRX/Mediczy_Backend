interface MilestoneNodeProps {
  title: string;
  body?: string;
  date?: string;
  isLast?: boolean;
}

export function MilestoneNode({ title, body, date, isLast }: MilestoneNodeProps) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="h-3 w-3 rounded-full bg-rose-500 shrink-0 mt-1.5" />
        {!isLast && <div className="w-px flex-1 bg-rose-200 min-h-[2rem]" />}
      </div>
      <div className="pb-6 flex-1">
        <p className="font-medium text-slate-800">{title}</p>
        {date && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(date).toLocaleString('en-IN')}
          </p>
        )}
        {body && <p className="text-sm text-slate-600 mt-1 leading-relaxed">{body}</p>}
      </div>
    </div>
  );
}
