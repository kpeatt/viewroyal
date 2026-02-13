import type { Route } from "./+types/matters";
import { getMatters } from "../services/matters";
import { getSupabaseAdminClient } from "../lib/supabase.server";
import { Link } from "react-router";
import {
  FileText,
  ChevronRight,
  Search,
  Filter,
  Tag,
  Calendar,
  Book,
  MapPin,
  List,
  Map as MapIcon,
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { useState, useMemo, useRef } from "react";
import { formatDate, cn } from "../lib/utils";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { MattersMap } from "../components/matters-map";
import type { Matter } from "../lib/types";

export async function loader() {
  try {
    const supabase = getSupabaseAdminClient();
    const matters = await getMatters(supabase);
    return { matters };
  } catch (error) {
    console.error("Error fetching matters:", error);
    return { matters: [] };
  }
}

export default function Matters({ loaderData }: Route.ComponentProps) {
  const { matters } = loaderData;
  const [filterText, setFilterText] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [activeAddress, setActiveAddress] = useState<string | null>(null);
  const [focusedLocation, setFocusedLocation] = useState<
    { lat: number; lng: number } | undefined
  >();
  const [showMap, setShowMap] = useState(true);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const addressRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const filteredMatters = useMemo(() => {
    let result = matters;

    // Filter out procedural matters
    const proceduralTitles = [
      "call to order",
      "approval of agenda",
      "adjournment",
      "question period",
      "termination",
    ];
    result = result.filter(
      (m) => !proceduralTitles.includes(m.title.toLowerCase()),
    );

    if (categoryFilter !== "All") {
      result = result.filter((m) => m.category === categoryFilter);
    }

    if (statusFilter !== "All") {
      if (statusFilter === "Active") {
        result = result.filter((m) => m.status === "Active");
      } else if (statusFilter === "Completed") {
        result = result.filter((m) =>
          ["Adopted", "Completed"].includes(m.status),
        );
      } else if (statusFilter === "Inactive") {
        result = result.filter((m) =>
          ["Inactive", "Denied", "Repealed"].includes(m.status),
        );
      }
    }

    if (filterText) {
      const lower = filterText.toLowerCase();
      result = result.filter(
        (m) =>
          m.title.toLowerCase().includes(lower) ||
          m.identifier?.toLowerCase().includes(lower) ||
          m.category?.toLowerCase().includes(lower) ||
          m.addresses?.some((addr: string) =>
            addr.toLowerCase().includes(lower),
          ),
      );
    }

    return result;
  }, [matters, filterText, statusFilter, categoryFilter]);

  // Group by address for Address View
  const mattersByAddress = useMemo(() => {
    const grouped: Record<string, typeof matters> = {};
    const noAddress: typeof matters = [];

    filteredMatters.forEach((matter) => {
      if (!matter.addresses || matter.addresses.length === 0) {
        noAddress.push(matter);
      } else {
        matter.addresses.forEach((addr: string) => {
          if (!grouped[addr]) grouped[addr] = [];
          grouped[addr].push(matter);
        });
      }
    });

    return {
      grouped: Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0])),
      noAddress,
    };
  }, [filteredMatters]);

  const handleAddressClick = (address: string, items: typeof matters) => {
    setActiveAddress(address);
    // Find a location for this address in the linked items
    const location = items
      .flatMap((m) => m.locations || [])
      .find((l) => l.address === address);
    if (location) {
      setFocusedLocation({ lat: location.lat, lng: location.lng });
    }
  };

  const handleMarkerClick = (matter: Matter, address?: string) => {
    const addr = address || matter.addresses?.[0];
    if (addr) {
      setActiveAddress(addr);
      setFocusedLocation(undefined); // Clear focus so user can still pan if they want, or keep it synced?
      // Let's not clear it, so it stays centered if they click.
      if (addressRefs.current[addr]) {
        addressRefs.current[addr]?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }
  };

  const counts = useMemo(() => {
    return {
      All: matters.length,
      Active: matters.filter((m) => m.status === "Active").length,
      Completed: matters.filter((m) =>
        ["Adopted", "Completed"].includes(m.status),
      ).length,
      Inactive: matters.filter((m) =>
        ["Inactive", "Denied", "Repealed"].includes(m.status),
      ).length,
    };
  }, [matters]);

  const categories = useMemo(() => {
    const cats = new Set(matters.map((m) => m.category || "General"));
    return ["All", ...Array.from(cats).sort()];
  }, [matters]);

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="container mx-auto py-12 px-4 max-w-5xl">
        <header className="mb-12">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Tag className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900">
                Tracked Matters
              </h1>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="bg-white p-1 rounded-xl border border-zinc-200 shadow-sm flex shrink-0">
                <button
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-sm font-bold",
                    viewMode === "list"
                      ? "bg-zinc-900 text-white shadow-sm"
                      : "text-zinc-400 hover:text-zinc-600",
                  )}
                >
                  <List className="h-4 w-4" />
                  Timeline
                </button>
                <button
                  onClick={() => setViewMode("map")}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-sm font-bold",
                    viewMode === "map"
                      ? "bg-zinc-900 text-white shadow-sm"
                      : "text-zinc-400 hover:text-zinc-600",
                  )}
                >
                  <MapPin className="h-4 w-4" />
                  Properties
                </button>
              </div>

              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <Input
                  placeholder="Search by title, ID, or address..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="pl-10 bg-white border-zinc-200"
                />
              </div>
            </div>
          </div>
          <p className="text-xl text-zinc-500 max-w-2xl">
            Monitor the progress of Bylaws, Projects, and recurring items as
            they move through the council process.
          </p>

          <div className="mt-8">
            <Tabs
              defaultValue="All"
              value={statusFilter}
              onValueChange={setStatusFilter}
              className="w-full"
            >
              <TabsList className="bg-white border border-zinc-200 p-1 h-auto flex-wrap justify-start">
                <TabsTrigger
                  value="All"
                  className="px-4 py-2 rounded-md data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-900 data-[state=active]:shadow-none"
                >
                  All Matters{" "}
                  <span className="ml-2 bg-zinc-100 text-zinc-500 py-0.5 px-2 rounded-full text-xs font-bold group-data-[state=active]:bg-white">
                    {counts.All}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="Active"
                  className="px-4 py-2 rounded-md data-[state=active]:bg-green-50 data-[state=active]:text-green-700 data-[state=active]:shadow-none text-zinc-500"
                >
                  Active{" "}
                  <span className="ml-2 bg-zinc-100 text-zinc-500 py-0.5 px-2 rounded-full text-xs font-bold group-data-[state=active]:bg-white">
                    {counts.Active}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="Completed"
                  className="px-4 py-2 rounded-md data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:shadow-none text-zinc-500"
                >
                  Completed / Adopted{" "}
                  <span className="ml-2 bg-zinc-100 text-zinc-500 py-0.5 px-2 rounded-full text-xs font-bold group-data-[state=active]:bg-white">
                    {counts.Completed}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="Inactive"
                  className="px-4 py-2 rounded-md data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-900 data-[state=active]:shadow-none text-zinc-500"
                >
                  Inactive / Denied{" "}
                  <span className="ml-2 bg-zinc-100 text-zinc-500 py-0.5 px-2 rounded-full text-xs font-bold group-data-[state=active]:bg-white">
                    {counts.Inactive}
                  </span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="mt-4 flex gap-2 flex-wrap">
            {categories.map((cat) => (
              <Badge
                key={cat}
                variant={categoryFilter === cat ? "default" : "outline"}
                className="cursor-pointer hover:bg-zinc-900 hover:text-white transition-colors"
                onClick={() => setCategoryFilter(cat)}
              >
                {cat}
              </Badge>
            ))}
          </div>
        </header>

        <div
          className={cn(
            "grid gap-6",
            viewMode === "map" && showMap && "grid-cols-1 lg:grid-cols-12",
          )}
        >
          {filteredMatters.length === 0 ? (
            <div className="text-center py-24 bg-white rounded-2xl border border-dashed border-zinc-200 lg:col-span-12">
              <Filter className="h-12 w-12 text-zinc-200 mx-auto mb-4" />
              <p className="text-zinc-500 text-lg">
                No matters match your search.
              </p>
            </div>
          ) : viewMode === "list" ? (
            filteredMatters.map((matter) => (
              <Link
                key={matter.id}
                to={`/matters/${matter.id}`}
                className="group block bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {matter.identifier && (
                        <Badge className="bg-zinc-100 text-zinc-900 hover:bg-zinc-100 font-mono font-bold">
                          {matter.identifier}
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className="border-blue-100 text-blue-600 bg-blue-50/30"
                      >
                        {matter.category || "General"}
                      </Badge>
                      {matter.bylaw && (
                        <Badge
                          variant="secondary"
                          className="bg-zinc-100 text-zinc-600 hover:bg-zinc-200 flex items-center gap-1"
                        >
                          <Book className="h-3 w-3" />
                          {matter.bylaw.bylaw_number
                            ? `Bylaw ${matter.bylaw.bylaw_number}`
                            : "Bylaw"}
                        </Badge>
                      )}
                      <span
                        className={cn(
                          "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded",
                          matter.status === "Active"
                            ? "bg-green-50 text-green-700"
                            : "bg-zinc-50 text-zinc-500",
                        )}
                      >
                        {matter.status}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-zinc-900 group-hover:text-blue-600 transition-colors">
                      {matter.title}
                    </h3>
                    {matter.addresses && matter.addresses.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {matter.addresses.map((addr: string) => (
                          <span
                            key={addr}
                            className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded flex items-center gap-1"
                          >
                            <MapPin className="h-3 w-3" />
                            {addr}
                          </span>
                        ))}
                      </div>
                    )}
                    {matter.description && (
                      <p className="text-sm text-zinc-500 line-clamp-2 leading-relaxed">
                        {matter.description}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-row md:flex-col items-center md:items-end gap-4 shrink-0 text-sm">
                    <div className="flex items-center gap-2 text-zinc-400 text-sm">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {matter.last_seen
                          ? `Last seen: ${formatDate(matter.last_seen)}`
                          : "No recent activity"}
                      </span>
                    </div>
                    <ChevronRight className="h-5 w-5 text-zinc-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <>
              {/* Sidebar / List for Properties View */}
              <div
                ref={sidebarRef}
                className={cn(
                  "overflow-y-auto space-y-4 pr-2 scroll-smooth transition-all duration-500",
                  showMap ? "lg:col-span-4 h-[600px]" : "col-span-full h-auto",
                )}
              >
                <div className="flex items-center justify-between px-2 mb-2">
                  <h2 className="text-xs font-black uppercase tracking-widest text-zinc-400">
                    {mattersByAddress.grouped.length} Properties Located
                  </h2>
                  <button
                    onClick={() => setShowMap(!showMap)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-100 hover:bg-zinc-200 text-[10px] font-bold text-zinc-600 transition-colors"
                  >
                    {showMap ? (
                      <>
                        <List className="h-3 w-3" />
                        Expand List
                      </>
                    ) : (
                      <>
                        <MapIcon className="h-3 w-3" />
                        Show Map
                      </>
                    )}
                  </button>
                </div>

                <div
                  className={cn(
                    "grid gap-4",
                    !showMap && "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
                  )}
                >
                  {mattersByAddress.grouped.map(([address, items]) => (
                    <div
                      key={address}
                      ref={(el) => {
                        addressRefs.current[address] = el;
                      }}
                      onClick={() => handleAddressClick(address, items)}
                      className={cn(
                        "bg-white p-4 rounded-2xl border transition-all duration-500 cursor-pointer",
                        activeAddress === address
                          ? "border-blue-500 shadow-md ring-2 ring-blue-500/10 scale-[1.02]"
                          : "border-zinc-200 shadow-sm hover:border-blue-200",
                      )}
                    >
                      <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2 mb-3">
                        <MapPin
                          className={cn(
                            "h-3 w-3",
                            activeAddress === address
                              ? "text-blue-600 animate-bounce"
                              : "text-zinc-400",
                          )}
                        />
                        {address}
                      </h3>
                      <div className="space-y-2">
                        {items.map((matter) => (
                          <Link
                            key={matter.id}
                            to={`/matters/${matter.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="block p-2 rounded-lg hover:bg-zinc-50 border border-transparent hover:border-zinc-100 transition-all group"
                          >
                            <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">
                              {matter.category}
                            </div>
                            <div className="text-xs font-bold text-zinc-700 group-hover:text-blue-600 line-clamp-1">
                              {matter.title}
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {mattersByAddress.grouped.length === 0 && (
                  <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-zinc-200">
                    <p className="text-xs text-zinc-500 italic">
                      No address data available.
                    </p>
                  </div>
                )}
              </div>

              {/* Map Column */}
              {showMap && (
                <div className="lg:col-span-8">
                  <MattersMap
                    matters={filteredMatters}
                    onMarkerClick={handleMarkerClick}
                    activeLocation={focusedLocation}
                    selectedAddress={activeAddress}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
