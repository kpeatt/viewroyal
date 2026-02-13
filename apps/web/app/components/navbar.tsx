import { Link, useLocation, useRouteLoaderData } from "react-router";
import { useState, useEffect, useRef } from "react";
import {
  Home,
  Calendar,
  Users,
  Tag,
  Search,
  Book,
  TrendingUp,
  Scale,
  MessageSquare,
  ChevronDown,
  Gavel,
  CheckCircle2,
  Mic,
  Activity,
  Landmark,
  LogOut,
  Sparkles,
  Menu,
  X,
  Info,
  Bell,
  Settings,
} from "lucide-react";
import { cn } from "../lib/utils";

interface NavItemProps {
  name: string;
  href: string;
  icon: React.ElementType;
  isActive?: boolean;
}

function NavLink({ name, href, icon: Icon, isActive }: NavItemProps) {
  return (
    <Link
      to={href}
      className={cn(
        "px-4 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2",
        isActive
          ? "bg-zinc-900 text-white shadow-md"
          : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100",
      )}
    >
      <Icon className="h-4 w-4" />
      {name}
    </Link>
  );
}

function NavDropdown({
  label,
  icon: Icon,
  items,
  isActive,
}: {
  label: string;
  icon: React.ElementType;
  isActive: boolean;
  items: { name: string; href: string; icon: React.ElementType }[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "px-4 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2 group",
          isActive || isOpen
            ? "bg-zinc-100 text-zinc-900"
            : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100",
        )}
      >
        <Icon className="h-4 w-4" />
        {label}
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-zinc-200 overflow-hidden py-1 z-50 animate-in fade-in zoom-in-95 duration-200">
          {items.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 transition-colors"
            >
              <div className="p-1.5 rounded-md bg-zinc-100 text-zinc-500">
                <item.icon className="h-4 w-4" />
              </div>
              {item.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const location = useLocation();
  const rootData = useRouteLoaderData("root") as { user: any } | undefined;
  const user = rootData?.user;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isLinkActive = (href: string) =>
    location.pathname === href ||
    (href !== "/" && location.pathname.startsWith(href));

  // Close mobile menu when location changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-zinc-200">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="p-1.5 bg-blue-600 rounded-lg group-hover:rotate-6 transition-transform">
              <Gavel className="h-5 w-5 text-white" />
            </div>
            <span className="font-black text-xl tracking-tight text-zinc-900">
              ViewRoyal<span className="text-blue-600">.ai</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            <NavLink
              name="Ask"
              href="/ask"
              icon={Sparkles}
              isActive={isLinkActive("/ask")}
            />
            <NavLink
              name="Meetings"
              href="/meetings"
              icon={Calendar}
              isActive={isLinkActive("/meetings")}
            />
            <NavDropdown
              label="Records"
              icon={Landmark}
              isActive={isLinkActive("/matters") || isLinkActive("/bylaws")}
              items={[
                { name: "Matters", href: "/matters", icon: Tag },
                { name: "Bylaws", href: "/bylaws", icon: Book },
              ]}
            />
            <NavLink
              name="Council"
              href="/people"
              icon={Users}
              isActive={isLinkActive("/people")}
            />
            <NavLink
              name="About"
              href="/about"
              icon={Info}
              isActive={isLinkActive("/about")}
            />
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <Link
              to="/search"
              className="p-2 text-zinc-400 hover:text-zinc-900 transition-colors bg-zinc-50 rounded-full hover:bg-zinc-100"
              aria-label="Search"
            >
              <Search className="h-5 w-5" />
            </Link>

            {/* Desktop User Menu */}
            {user ? (
              <div className="hidden sm:flex items-center gap-4">
                <div className="h-8 w-px bg-zinc-200" />
                <Link
                  to="/settings"
                  className="text-zinc-400 hover:text-blue-600 transition-colors"
                  title="Settings & Alerts"
                >
                  <Bell className="h-4 w-4" />
                </Link>
                <Link
                  to="/speaker-alias"
                  className="text-zinc-400 hover:text-zinc-600 transition-colors"
                  title="Speaker Aliases"
                >
                  <Mic className="h-4 w-4" />
                </Link>
                <Link
                  to="/logout"
                  className="text-zinc-400 hover:text-red-600 transition-colors"
                  title="Logout"
                >
                  <LogOut className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <Link
                to="/signup"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                <Bell className="h-3.5 w-3.5" />
                Get Alerts
              </Link>
            )}

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-full transition-colors"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-zinc-200 bg-white">
          <div className="container mx-auto px-4 py-4 space-y-1">
            <MobileNavLink
              name="Ask"
              href="/ask"
              icon={Sparkles}
              isActive={isLinkActive("/ask")}
            />
            <MobileNavLink
              name="Meetings"
              href="/meetings"
              icon={Calendar}
              isActive={isLinkActive("/meetings")}
            />
            <MobileNavLink
              name="Matters"
              href="/matters"
              icon={Tag}
              isActive={isLinkActive("/matters")}
            />
            <MobileNavLink
              name="Bylaws"
              href="/bylaws"
              icon={Book}
              isActive={isLinkActive("/bylaws")}
            />
            <MobileNavLink
              name="Council"
              href="/people"
              icon={Users}
              isActive={isLinkActive("/people")}
            />
            <MobileNavLink
              name="About"
              href="/about"
              icon={Info}
              isActive={isLinkActive("/about")}
            />

            <div className="my-2 h-px bg-zinc-100" />
            {user ? (
              <>
                <MobileNavLink
                  name="Settings & Alerts"
                  href="/settings"
                  icon={Settings}
                  isActive={isLinkActive("/settings")}
                />
                <MobileNavLink
                  name="Speaker Aliases"
                  href="/speaker-alias"
                  icon={Mic}
                  isActive={isLinkActive("/speaker-alias")}
                />
                <MobileNavLink
                  name="Logout"
                  href="/logout"
                  icon={LogOut}
                  isActive={false}
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                />
              </>
            ) : (
              <MobileNavLink
                name="Get Alerts"
                href="/signup"
                icon={Bell}
                isActive={isLinkActive("/signup")}
                className="text-blue-600 hover:bg-blue-50 hover:text-blue-700"
              />
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

function MobileNavLink({
  name,
  href,
  icon: Icon,
  isActive,
  className,
}: NavItemProps & { className?: string }) {
  return (
    <Link
      to={href}
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors",
        isActive
          ? "bg-zinc-900 text-white"
          : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
        className,
      )}
    >
      <Icon className="h-4 w-4" />
      {name}
    </Link>
  );
}
