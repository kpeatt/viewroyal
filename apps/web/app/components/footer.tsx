import { Github, Book } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t bg-muted/40 mt-auto py-8 text-sm text-muted-foreground">
      <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <p>© {new Date().getFullYear()} ViewRoyal.ai. Open source and community built.</p>
        </div>
        <div className="flex items-center gap-6">
          <a
            href="https://docs.viewroyal.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:text-foreground transition-colors"
          >
            <Book className="h-4 w-4" />
            Documentation
          </a>
          <a
            href="https://github.com/kpeatt/viewroyal"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:text-foreground transition-colors"
          >
            <Github className="h-4 w-4" />
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
