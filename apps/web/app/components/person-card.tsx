import { Link } from "react-router";
import { User, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import type { PersonWithStats } from "../services/people";

interface PersonCardProps {
  person: PersonWithStats;
  role: string;
}

export function PersonCard({ person, role }: PersonCardProps) {
  const isMayor = role.includes("Mayor");

  return (
    <Link
      to={`/people/${person.id}`}
      className={cn(
        "group flex flex-col sm:flex-row sm:items-center bg-white rounded-2xl border border-zinc-200 shadow-sm transition-all overflow-hidden hover:shadow-md hover:border-blue-300 p-6 gap-6",
        isMayor && "ring-1 ring-purple-100 border-purple-200"
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0 mx-auto sm:mx-0">
        <div className={cn(
          "h-16 w-16 rounded-full flex items-center justify-center overflow-hidden border-2 shadow-sm",
          isMayor ? "border-purple-100 bg-purple-50" : "border-zinc-100 bg-zinc-50"
        )}>
          {person.image_url ? (
            <img 
              src={person.image_url} 
              alt={person.name} 
              className="h-full w-full object-cover" 
            />
          ) : (
            <User className={cn("h-8 w-8", isMayor ? "text-purple-300" : "text-zinc-300")} />
          )}
        </div>
        {isMayor && (
          <div className="absolute -bottom-1 -right-1 bg-purple-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white shadow-sm">
            MAYOR
          </div>
        )}
      </div>
      
      {/* Info */}
      <div className="text-center sm:text-left min-w-0 flex-1">
        <h3 className="font-bold text-lg text-zinc-900 group-hover:text-blue-600 transition-colors truncate leading-tight mb-1">
          {person.name}
        </h3>
        <div className="flex flex-wrap gap-1.5 justify-center sm:justify-start">
          <Badge variant="secondary" className={cn(
            "text-[10px] font-bold uppercase tracking-wider border-transparent",
            isMayor 
              ? "bg-purple-50 text-purple-700 hover:bg-purple-100" 
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
          )}>
            {role}
          </Badge>
        </div>
      </div>

      {/* Stats Section */}
      <div className="w-full sm:w-48 pt-4 sm:pt-0 border-t sm:border-t-0 sm:border-l border-zinc-100 sm:pl-6">
        <div className="flex justify-between items-end mb-1.5">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Attendance</span>
          <span className="text-xs font-bold text-zinc-700">
            {person.stats.rate}%
          </span>
        </div>
        <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden">
          <div 
            className={cn(
              "h-full rounded-full transition-all duration-500",
              person.stats.rate > 90 ? "bg-emerald-500" :
              person.stats.rate > 75 ? "bg-blue-500" :
              "bg-amber-500"
            )}
            style={{ width: `${person.stats.rate}%` }}
          />
        </div>
        <div className="mt-1 text-[10px] text-zinc-400 text-right">
          {person.stats.attended} of {person.stats.total} meetings
        </div>
      </div>
      
      {/* Chevron */}
      <div className="hidden sm:flex items-center justify-center text-zinc-300 group-hover:text-blue-600 transition-colors">
        <ChevronRight className="h-5 w-5" />
      </div>
    </Link>
  );
}
