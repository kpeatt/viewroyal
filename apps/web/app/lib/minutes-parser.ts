export type MinutesBlock = 
  | { type: 'header', content: string }
  | { type: 'motion_meta', content: string }
  | { type: 'motion_text', content: string }
  | { type: 'result', content: string, isCarried: boolean }
  | { type: 'divider', content: string }
  | { type: 'list_item', content: string }
  | { type: 'paragraph', content: string }
  | { type: 'spacer' };

/**
 * Parses raw text into a structured list of semantic blocks.
 * Joins lines that belong to the same paragraph.
 */
export function parseMinutesIntoBlocks(text: string | null | undefined): MinutesBlock[] {
  if (!text) return [];

  const lines = text.split('\n');
  const blocks: MinutesBlock[] = [];
  
  let currentPara: string[] = [];

  const flushPara = () => {
    if (currentPara.length > 0) {
      blocks.push({ type: 'paragraph', content: currentPara.join(' ') });
      currentPara = [];
    }
  };

  const headerPattern = /^(\d+(\.\d+)*)\.?\s+[A-Z]/;
  const listPattern = /^(([a-z]|\d+)\)|[-•*])\s+/i;
  const resultPatterns = ["CARRIED", "DEFEATED", "CARRIED UNANIMOUSLY"];

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (!trimmed) {
      flushPara();
      blocks.push({ type: 'spacer' });
      continue;
    }

    // Identify Special Lines
    const isHeader = headerPattern.test(trimmed);
    const isListItem = listPattern.test(trimmed);
    const isMotionMeta = trimmed.toUpperCase().startsWith("MOVED BY:") || trimmed.toUpperCase().startsWith("SECONDED:");
    const isResult = resultPatterns.some(res => trimmed.toUpperCase().includes(res));
    const isFormalMotion = trimmed.toUpperCase().startsWith("THAT");
    const isDivider = /^[A-Z\s]+:$/.test(trimmed);

    if (isHeader || isListItem || isMotionMeta || isResult || isFormalMotion || isDivider) {
      flushPara();
      
      if (isHeader) blocks.push({ type: 'header', content: trimmed });
      else if (isListItem) blocks.push({ type: 'list_item', content: trimmed });
      else if (isMotionMeta) blocks.push({ type: 'motion_meta', content: trimmed });
      else if (isFormalMotion) blocks.push({ type: 'motion_text', content: trimmed });
      else if (isDivider) blocks.push({ type: 'divider', content: trimmed });
      else if (isResult) {
        blocks.push({ 
          type: 'result', 
          content: trimmed, 
          isCarried: trimmed.toUpperCase().includes("CARRIED") 
        });
      }
    } else {
      // Normal line, append to current paragraph buffer
      currentPara.push(trimmed);
    }
  }

  flushPara();
  
  // Post-processing: Remove redundant spacers (max 1 in a row)
  const result: MinutesBlock[] = [];
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].type === 'spacer' && result[result.length - 1]?.type === 'spacer') {
      continue;
    }
    result.push(blocks[i]);
  }

  return result;
}

/**
 * Splits raw meeting minutes text into sections mapped by agenda item order (e.g. "8.1")
 * and by normalized titles.
 */
export function splitMinutesByItem(text: string | null | undefined): Record<string, string[]> {
  if (!text) return {};

  const lines = text.split('\n');
  const sections: Record<string, string[]> = {};
  
  let currentPrefix = "";
  let currentKey = "INTRO";
  sections[currentKey] = [];

  // Pattern for major headers: "8.1 TITLE" or "10. TITLE"
  const majorHeaderPattern = /^(\d+(\.\d+)*)\.?\s+(.*)$/i;
  
  // Pattern for sub-headers: "a) TITLE" or "b) TITLE"
  const subHeaderPattern = /^([a-z])\)\s+(.*)$/i;

  const addLine = (key: string, line: string) => {
    if (!sections[key]) sections[key] = [];
    sections[key].push(line);
  };

  const normalize = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (sections[currentKey] && sections[currentKey].length > 0) {
        addLine(currentKey, "");
      }
      continue;
    }

    const majorMatch = trimmed.match(majorHeaderPattern);
    const subMatch = trimmed.match(subHeaderPattern);

    if (majorMatch) {
      currentPrefix = majorMatch[1];
      const title = majorMatch[3].trim();
      
      currentKey = currentPrefix;
      sections[currentKey] = [trimmed];
      
      if (title) {
        addLine(`TITLE:${normalize(title)}`, trimmed);
      }
    } else if (subMatch && currentPrefix) {
      const subLetter = subMatch[1].toLowerCase();
      const title = subMatch[2].trim();
      
      // Create a composite key like "6.1.3.a"
      currentKey = `${currentPrefix}.${subLetter}`;
      sections[currentKey] = [trimmed];
      
      if (title) {
        // Also store by title for fallback
        addLine(`TITLE:${normalize(title)}`, trimmed);
      }
    } else {
      addLine(currentKey, trimmed);
    }
  }

  return sections;
}
