import { useEffect, useState, useRef, useMemo } from "react";
import type { Matter } from "../lib/types";
import { Info, ExternalLink, Loader2, MapPin } from "lucide-react";
import { Link } from "react-router";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";

// Leaflet and React-Leaflet need to be imported dynamically for SSR compatibility
let MapContainer: any, TileLayer: any, Marker: any, Popup: any, L: any, useMap: any;

function ChangeView({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

export function MattersMap({ 
  matters,
  onMarkerClick,
  activeLocation,
  selectedAddress
}: { 
  matters: Matter[],
  onMarkerClick?: (matter: Matter, address?: string) => void,
  activeLocation?: { lat: number, lng: number },
  selectedAddress?: string | null
}) {
  const [isClient, setIsClient] = useState(false);
  const markerRefs = useRef<Record<string, any>>({});

  useEffect(() => {
    const loadLeaflet = async () => {
      const leaflet = await import("leaflet");
      L = leaflet.default;
      
      // Fix default icon issue
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const reactLeaflet = await import("react-leaflet");
      MapContainer = reactLeaflet.MapContainer;
      TileLayer = reactLeaflet.TileLayer;
      Marker = reactLeaflet.Marker;
      Popup = reactLeaflet.Popup;
      useMap = reactLeaflet.useMap;
      
      setIsClient(true);
    };

    loadLeaflet();
  }, []);

  // Flatten all locations from all matters into a single list of markers
  const markers = useMemo(() => matters.flatMap(matter => 
    (matter.locations || []).map(loc => ({
      matter,
      lat: loc.lat,
      lng: loc.lng,
      address: loc.address
    }))
  ).filter(m => m.lat && m.lng), [matters]);

  // Open popup when selectedAddress changes
  useEffect(() => {
    if (selectedAddress && markerRefs.current[selectedAddress]) {
      // Small timeout to allow the map to finish panning/zooming from ChangeView
      const timer = setTimeout(() => {
        if (markerRefs.current[selectedAddress]) {
          markerRefs.current[selectedAddress].openPopup();
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [selectedAddress, markers]); 

  if (!isClient) {
    return (
      <div className="h-[600px] w-full bg-zinc-100 rounded-3xl flex items-center justify-center border border-zinc-200">
        <Loader2 className="h-8 w-8 text-zinc-400 animate-spin" />
      </div>
    );
  }

  const defaultCenter: [number, number] = [48.455, -123.44]; // View Royal center
  const center: [number, number] = activeLocation ? [activeLocation.lat, activeLocation.lng] : defaultCenter;
  const zoom = activeLocation ? 16 : 14;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-blue-600" />
          <p className="text-xs text-zinc-500 font-medium italic">
            Showing {markers.length} location markers for {matters.length} matters.
          </p>
        </div>
      </div>

      <div className="h-[600px] w-full rounded-3xl overflow-hidden border border-zinc-200 shadow-inner z-0">
        <MapContainer center={defaultCenter} zoom={14} style={{ height: "100%", width: "100%" }}>
          <ChangeView center={center} zoom={zoom} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {markers.map((m, idx) => (
            <Marker 
              key={`${m.matter.id}-${idx}`} 
              position={[m.lat, m.lng]}
              ref={(ref: any) => {
                if (m.address) markerRefs.current[m.address] = ref;
              }}
              eventHandlers={{
                click: () => onMarkerClick?.(m.matter, m.address)
              }}
            >
              <Popup>
                <div className="p-1 max-w-[200px]">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                      {m.matter.status}
                    </Badge>
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">
                      {m.matter.category}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-zinc-900 mb-1 leading-tight">
                    {m.matter.title}
                  </h4>
                  <p className="text-[10px] text-zinc-500 mb-3 line-clamp-2">
                    {m.matter.description}
                  </p>
                  <Link
                    to={`/matters/${m.matter.id}`}
                    className="flex items-center justify-center gap-1.5 w-full bg-zinc-900 text-white text-[10px] font-bold py-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
                  >
                    View Details
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      
      {markers.length === 0 && matters.length > 0 && (
        <div className="p-6 bg-white border border-zinc-200 rounded-3xl text-center space-y-3">
          <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mx-auto">
            <MapPin className="h-6 w-6 text-zinc-300" />
          </div>
          <h3 className="font-bold text-zinc-900">No locations mapped yet</h3>
          <p className="text-sm text-zinc-500 max-w-sm mx-auto">
            We haven't geocoded the addresses for these matters yet. Run the geocoding script to populate the map.
          </p>
        </div>
      )}
    </div>
  );
}
