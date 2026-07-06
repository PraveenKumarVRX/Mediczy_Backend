import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

export interface CareTeamMember {
  id: number | string;
  display_name?: string;
  role?: string;
  invited_by?: string;
}

function initials(name?: string, role?: string) {
  const base = name || role || '?';
  return base.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

export function CareTeamAvatarRow({ members }: { members: CareTeamMember[] }) {
  if (!members.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {members.map((m) => (
        <div key={m.id} className="flex items-center gap-2 border rounded-lg px-2 py-1.5 bg-white">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs bg-teal-100 text-teal-800">
              {initials(m.display_name, m.role)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{m.display_name || m.role}</p>
            <p className="text-[10px] text-muted-foreground capitalize">{m.role?.replace(/_/g, ' ')}</p>
          </div>
          {m.invited_by === 'ai_mdt' && <Badge variant="secondary" className="text-[10px]">AI</Badge>}
        </div>
      ))}
    </div>
  );
}
