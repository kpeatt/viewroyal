"""
Generate clean, structured markdown from refinement + original minutes text.

This module creates consistent markdown files with:
- Proper header hierarchy
- Anchors for linking agenda items to specific sections
- Preserved original verbatim text with refined structure
- Support for web app navigation to specific items/motions
"""

import re
from typing import Optional
from src.core.utils import natural_sort_key


class MinutesMarkdownGenerator:
    """Generate clean, structured markdown from refinement + original text."""

    def __init__(self, refinement: dict, original_minutes: str, meeting_title: str = None, meeting_date: str = None):
        self.refinement = refinement
        self.original_text = original_minutes or ""
        self.meeting_title = meeting_title
        self.meeting_date = meeting_date
        self.section_map = {}  # item_order -> original text section

    def generate(self) -> str:
        """Main entry point - returns formatted markdown string."""
        self._build_section_map()

        lines = []
        lines.append(self._generate_header())
        lines.append("")
        lines.append("---")
        lines.append("")

        # Sort items naturally by order to ensure logical flow
        items = sorted(
            self.refinement.get("items", []), 
            key=lambda x: natural_sort_key(x.get("item_order", ""))
        )

        for i, item in enumerate(items):
            is_last = (i == len(items) - 1)
            lines.append(self._generate_item(item))
            if not is_last:
                lines.append("")
                lines.append("---")
            lines.append("")

        return "\n".join(lines)

    def _build_section_map(self):
        """Map item_order to corresponding section in original text."""
        items = self.refinement.get("items", [])
        if not items or not self.original_text:
            return

        # Build list of (position, item_order) for all found items
        positions = []

        for item in items:
            order = item.get("item_order", "")
            title = item.get("title", "")

            pos = self._find_item_position(order, title)
            if pos is not None:
                positions.append((pos, order))

        # Sort by position and extract sections
        # This handles items appearing in a different order than their numbering suggests
        positions.sort(key=lambda x: x[0])

        for i, (pos, order) in enumerate(positions):
            end_pos = positions[i + 1][0] if i + 1 < len(positions) else len(self.original_text)
            self.section_map[order] = self.original_text[pos:end_pos].strip()

    def _find_item_position(self, order: str, title: str) -> Optional[int]:
        """Find the position of an item in the original text."""
        if not order and not title:
            return None

        # 1. Try exact item: tag (Highest Priority)
        # e.g. <!-- item:8.1 -->
        tag_match = re.search(rf"<!--\s*item:{re.escape(order)}\s*-->", self.original_text, re.IGNORECASE)
        if tag_match:
            return tag_match.start()

        # 2. Try exact order (full path e.g. "8.1.a")
        escaped_order = re.escape(order)
        patterns = [
            rf"(?:^|\n)#{{1,4}}\s*\*?\*?{escaped_order}[.\s\)\]:]",
            rf"(?:^|\n)\s*\*?\*?{escaped_order}[.\s\)\]:]",
        ]

        for pattern in patterns:
            match = re.search(pattern, self.original_text, re.IGNORECASE | re.MULTILINE)
            if match:
                return match.start()

        # 2. Try title matching with high priority if order is short or ambiguous
        # (Procedural items often have short orders like 1, 2, 3)
        if title and len(title) > 15:
            keywords = self._extract_title_keywords(title)
            if len(keywords) >= 2:
                # Search for lines containing at least 2 key words from the title
                # We prioritize this over suffix matching to avoid "a)" matching "3.a"
                lines = self.original_text.split('\n')
                best_pos = None
                for i, line in enumerate(lines):
                    matches = sum(1 for k in keywords if k.lower() in line.lower())
                    if matches >= 2 and len(line.strip()) < len(title) * 2:
                        # Ensure it's not a motion line (starts with MOVED/SECONDED)
                        if not re.match(r'^\s*(MOVED|SECONDED)', line.strip(), re.IGNORECASE):
                            best_pos = self.original_text.find(line)
                            # If we find a title match, we're fairly confident
                            if matches >= 3 or len(keywords) <= 3:
                                return best_pos

        # 3. Try just the last part of the order if it's nested (e.g. "a)" from "6.1.4.a")
        if "." in order:
            parts = [p.strip() for p in order.split(".") if p.strip()]
            suffix = parts[-1]
            if suffix:
                escaped_suffix = re.escape(suffix)
                suffix_patterns = [
                    rf"(?:^|\n)#{{1,4}}\s*\*?\*?{escaped_suffix}[.\s\)\]:]",
                    rf"(?:^|\n)\s*[*-]?\s*\*?\*?{escaped_suffix}[.\s\)\]:]\s",
                ]
                
                # If we have parent numbering, try to find that first to narrow the search
                start_search_at = 0
                if len(parts) > 1:
                    parent = parts[-2]
                    parent_match = re.search(rf"(?:^|\n)#{{1,4}}\s*\*?\*?{re.escape(parent)}[.\s\)\]:]", self.original_text)
                    if parent_match:
                        start_search_at = parent_match.start()

                for pattern in suffix_patterns:
                    match = re.search(pattern, self.original_text[start_search_at:], re.IGNORECASE | re.MULTILINE)
                    if match:
                        pos = start_search_at + match.start()
                        # Still avoid very early document matches for non-procedural items
                        if pos > 1000 or order.startswith(('1', '2', '3')):
                            return pos

        return None

    def _extract_title_keywords(self, title: str) -> list:
        """Extract significant keywords from a title for matching."""
        # Remove common filler words
        stop_words = {'the', 'a', 'an', 'of', 'to', 'and', 'for', 'in', 'on', 'at', 'by', 'be', 'from', 'that', 'which'}
        words = re.findall(r'\b\w+\b', title.lower())
        keywords = [w for w in words if w not in stop_words and len(w) >= 4]
        return keywords

    def _generate_header(self) -> str:
        """Generate the meeting header section."""
        lines = []

        # Get meeting type from refinement or use default
        meeting_type = self.refinement.get("meeting_type", "Council Meeting")

        lines.append("# TOWN OF VIEW ROYAL")

        if self.meeting_date:
            lines.append(f"## {meeting_type} - {self._format_date(self.meeting_date)}")
        elif self.meeting_title:
            lines.append(f"## {self.meeting_title}")
        else:
            lines.append(f"## {meeting_type}")

        # Add attendees summary if available
        attendees = self.refinement.get("attendees", [])
        if attendees:
            lines.append("")
            lines.append("**Present:** " + ", ".join(attendees[:7]))
            if len(attendees) > 7:
                lines.append(f"*...and {len(attendees) - 7} others*")

        return "\n".join(lines)

    def _format_date(self, date_str: str) -> str:
        """Format a date string for display."""
        if not date_str:
            return ""
        try:
            from datetime import datetime
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            return dt.strftime("%B %d, %Y")
        except (ValueError, TypeError):
            return date_str

    def _generate_item(self, item: dict) -> str:
        """Generate markdown for a single agenda item."""
        lines = []

        item_order = item.get("item_order", "")
        title = item.get("title", "Untitled Item")

        # Determine header level based on item structure
        # Main items (1, 2, 8) get ##, sub-items (8.1, 8.1.a) get ###
        header_level = self._get_header_level(item_order)

        # Add anchor comment
        if item_order:
            lines.append(f"<!-- item:{item_order} -->")

        # Generate header
        header_prefix = "#" * header_level
        if item_order:
            lines.append(f"{header_prefix} {item_order}. {title.upper() if header_level == 2 else title}")
        else:
            lines.append(f"{header_prefix} {title}")

        lines.append("")

        # Try to get content from section map, fall back to description
        content = self._get_item_content(item)
        if content:
            lines.append(content)
            lines.append("")

        # Generate motions
        motions = item.get("motions", [])
        for i, motion in enumerate(motions):
            lines.append(self._generate_motion(motion, item_order, i + 1))
            lines.append("")

        return "\n".join(lines)

    def _get_header_level(self, item_order: str) -> int:
        """Determine header level based on item order structure."""
        if not item_order:
            return 2

        # Count dots and letters to determine depth
        parts = re.split(r'[.\s]', item_order)
        parts = [p for p in parts if p]  # Remove empty parts

        if len(parts) <= 1:
            return 2  # Main items like "1", "2", "8"
        elif len(parts) == 2:
            return 3  # Sub-items like "8.1", "3.a"
        else:
            return 4  # Deep sub-items like "8.1.a", "8.2.a.1"

    def _get_item_content(self, item: dict) -> str:
        """Get the content text for an item, preferring original text."""
        item_order = item.get("item_order", "")

        # First try section map (original text)
        if item_order in self.section_map:
            raw_section = self.section_map[item_order]
            # Clean up the section - remove the header we'll add ourselves
            cleaned = self._clean_section_text(raw_section, item_order, item.get("title", ""))
            if cleaned and len(cleaned.strip()) > 20:
                return cleaned

        # Fall back to description from refinement
        description = item.get("description", "")
        if description:
            return description

        return ""

    def _clean_section_text(self, text: str, item_order: str, title: str) -> str:
        """Clean a section of text extracted from original minutes."""
        if not text:
            return ""

        # Remove existing anchors to prevent duplicates when we add our own
        text = re.sub(r'<!--\s*(item|motion|seconder|result):.*?\s*-->', '', text, flags=re.IGNORECASE)

        lines = text.split('\n')
        cleaned_lines = []
        skip_header = True  # Skip initial header lines

        for line in lines:
            stripped = line.strip()

            # Skip empty lines at start
            if skip_header and not stripped:
                continue

            # Skip header-like lines at the very beginning
            if skip_header:
                # Check if this is a header line for this item
                if (stripped.startswith('#') or
                    stripped.startswith('**') or
                    re.match(rf'^{re.escape(item_order)}[.\s\)\]]', stripped)):
                    continue
                skip_header = False

            cleaned_lines.append(line)

        # Remove trailing empty lines and join
        while cleaned_lines and not cleaned_lines[-1].strip():
            cleaned_lines.pop()

        return '\n'.join(cleaned_lines)

    def _generate_motion(self, motion: dict, item_order: str, index: int) -> str:
        """Generate markdown for a motion block."""
        lines = []

        # Motion anchor - prefer existing MOTION tag from original text if we can find it
        # This helps maintain consistency with the raw parser's identification
        motion_id = f"{item_order}-{index}"
        
        # Check if the section text for this item has a specific motion: tag for this index
        section_text = self.section_map.get(item_order, "")
        existing_tag = re.search(rf"<!--\s*motion:{re.escape(motion_id)}\s*-->", section_text, re.IGNORECASE)
        
        motion_code = motion.get("code", "")
        if existing_tag:
            tag_str = f"motion:{motion_id}"
            if motion_code: tag_str += f" code:{motion_code}"
            lines.append(f"<!-- {tag_str} -->")
        else:
            if motion_code:
                lines.append(f"<!-- motion:{motion_id} code:{motion_code} -->")
            else:
                lines.append(f"<!-- motion:{motion_id} -->")

        # Mover and seconder
        mover = motion.get("mover", "")
        seconder = motion.get("seconder", "")

        if mover:
            lines.append(f"**MOVED BY:** {mover}")
        if seconder:
            lines.append(f"**SECONDED BY:** {seconder}")

        if mover or seconder:
            lines.append("")

        # Motion text as blockquote
        motion_text = motion.get("motion_text", "")
        if motion_text:
            # Format motion text - wrap long lines, handle "THAT" prefix
            formatted_text = self._format_motion_text(motion_text)
            lines.append(f"> {formatted_text}")
            lines.append("")

        # Result
        result = motion.get("result", "")
        if result:
            lines.append(f"**{result.upper()}**")

        return "\n".join(lines)

    def _format_motion_text(self, text: str) -> str:
        """Format motion text for display."""
        if not text:
            return ""

        # Clean up the text
        text = text.strip()

        # Ensure it starts with THAT (common motion format)
        if not text.upper().startswith("THAT"):
            text = "THAT " + text

        # Handle multi-part motions (AND THAT...)
        # Add line breaks before AND THAT, AND FURTHER THAT, etc.
        text = re.sub(r';\s*(AND\s+THAT)', r';\n> \1', text, flags=re.IGNORECASE)
        text = re.sub(r';\s*(AND\s+FURTHER)', r';\n> \1', text, flags=re.IGNORECASE)

        return text


def generate_clean_minutes(refinement: dict, original_minutes: str,
                          meeting_title: str = None, meeting_date: str = None) -> str:
    """Convenience function to generate clean minutes markdown.

    Args:
        refinement: Parsed refinement.json dict
        original_minutes: Original minutes markdown text
        meeting_title: Optional meeting title
        meeting_date: Optional meeting date (YYYY-MM-DD format)

    Returns:
        Clean, formatted markdown string
    """
    generator = MinutesMarkdownGenerator(refinement, original_minutes, meeting_title, meeting_date)
    return generator.generate()
