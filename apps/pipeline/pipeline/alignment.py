import re
import difflib
from typing import List, Dict, Optional
from pipeline.utils import natural_sort_key

def normalize_text(text: str) -> str:
    """Basic normalization for matching."""
    return re.sub(r'[^a-z0-9\s]', '', text.lower()).strip()

def find_item_marker(segments: List[Dict], item_order: str, item_title: str, window_start: Optional[float] = None, window_end: Optional[float] = None) -> Optional[tuple]:
    """
    Searches segments within a time window for mentions of item_order or item_title.
    Returns (timestamp, score) or None.
    """
    if not item_order and not item_title:
        return None
    
    # Special Case: Call to Order is always the start
    if item_title and "call to order" in item_title.lower():
        if segments:
            print(f"DEBUG: Call to Order detected, returning segments[0][start]={segments[0]['start']}")
            return (segments[0]['start'], 2.0) # High score for Call to Order
        return (0.0, 2.0)

    # Special Case: Termination / Adjournment is often the end
    if item_title and ("termination" in item_title.lower() or "adjournment" in item_title.lower()):
        # Search last 30 segments for "terminate" or "adjourn" and find the earliest mention
        found_ts = None
        for seg in segments[-30:]:
            if "terminate" in seg['text'].lower() or "adjourn" in seg['text'].lower():
                found_ts = seg['start']
                break
        if found_ts is not None:
            print(f"DEBUG: {item_title} detected at {found_ts}")
            return (found_ts, 2.0)

    # 1. Prepare patterns
    order_digits = re.sub(r'[^0-9]', ' ', item_order).strip().split()
    if order_digits:
        # Match "8.1" or "Item 8.1" or "Section 8.1"
        # Added lookahead/lookbehind to prevent matching "1.7" or "1.1"
        digits_pattern = r'[\s\.\-]+'.join(order_digits)
        
        # If it's a simple number (e.g. "1", "2", "10"), require a prefix to avoid false positives
        # like matching "1" in "Page 1" or "3" in "3000"
        is_simple_number = len(order_digits) == 1 and len(order_digits[0]) < 3
        
        if is_simple_number:
             order_regex = r'(?:item|section|point|paragraph)\s+' + digits_pattern + r'(?!\.\d)\b'
        else:
             order_regex = r'(?:item|section|point|paragraph)?\s*(?<!\.)\b' + digits_pattern + r'(?!\.\d)\b'
    else:
        order_regex = None
    
    title_words = [w for w in normalize_text(item_title).split() if len(w) > 3]
    # Filter out common junk words in titles
    junk_words = {'report', 'dated', 'council', 'meeting', 'recommendation', 'attachment'}
    title_words = [w for w in title_words if w not in junk_words]

    def search_range(start, end):
        found = []
        for seg in segments:
            if seg['start'] < start or seg['start'] > end:
                continue
                
            text = seg['text'].lower()
            
            # Check for numeric order (e.g. "8.1")
            if order_regex and re.search(order_regex, text):
                boost = 1.2 if re.search(r'(item|section|point|paragraph)\s+' + digits_pattern, text) else 1.0
                found.append((seg['start'], 1.0 * boost))
                continue
                
            # Check for title keywords (important words only)
            if title_words:
                match_count = sum(1 for w in title_words if w in text)
                if match_count >= 2 or (len(title_words) == 1 and title_words[0] in text):
                    score = match_count / len(title_words)
                    found.append((seg['start'], score * 0.8))
        return found

    # Search in BOTH buffered window and full transcript to find all candidates
    all_found = []
    
    # 1. Search in buffered window if we have one
    if window_start is not None and window_start > 120:
        search_start = max(0, window_start - 300)
        search_end = (window_end + 120) if window_end else search_start + 600
        all_found.extend(search_range(search_start, search_end))

    # 2. Search everywhere else (or just everywhere)
    all_found.extend(search_range(0, 999999))

    if not all_found:
        # print(f"DEBUG: No candidates found for {item_order} - {item_title}")
        return None
        
    # Pick the best candidate
    # Preference: 
    # 1. Highest score
    # 2. If scores are tied, closeness to window_start (if available)
    # 3. Otherwise, earliest occurrence
    def sort_key(cand):
        ts, score = cand
        dist = abs(ts - window_start) if window_start is not None else ts
        return (-score, dist)

    all_found.sort(key=sort_key)
    
    # Deduplicate candidates with same timestamp (can happen if search ranges overlap)
    unique_candidates = []
    seen_ts = set()
    for ts, score in all_found:
        if ts not in seen_ts:
            unique_candidates.append((ts, score))
            seen_ts.add(ts)

    # print(f"DEBUG: Found {len(unique_candidates)} unique candidates for {item_order}. Best: {unique_candidates[0]}")
    return unique_candidates[0]

def find_motion_marker(segments: List[Dict], motion_text: str, window_start: float, window_end: float, prefer_latest: bool = False) -> Optional[float]:
    """Finds the best timestamp for a motion within a time window."""
    if not motion_text:
        return None
    
    # Common transcription error fixes for motions
    phonetic_fixes = {
        "move your seat": "move receipt",
        "move to seat": "move receipt",
        "move receipt": "move receive",
    }
    
    m_text_norm = normalize_text(motion_text)
    
    # Use 5-char prefixes to handle stemming (e.g. terminate/terminated/termination)
    keywords = [w[:5] for w in m_text_norm.split() if len(w) > 4]
    
    # Filter out extremely common meeting words if they are the only keywords
    junk_keywords = {"publi", "heari", "meeti", "counc"}
    filtered_keywords = [k for k in keywords if k not in junk_keywords]
    if not filtered_keywords:
        filtered_keywords = keywords # Fallback if all words are common

    if not filtered_keywords:
        return None

    def search_segments(segs_subset):
        candidates = []
        for seg in segs_subset:
            text = normalize_text(seg['text'])
            # Apply phonetic fixes to segment text
            for wrong, right in phonetic_fixes.items():
                if wrong in text:
                    text = text.replace(wrong, right)
            
            # Also normalize segment text words to 5-char prefixes for matching
            text_prefixes = [w[:5] for w in text.split() if len(w) >= 5]
            
            match_count = sum(1 for k in filtered_keywords if k in text_prefixes or any(k in tp for tp in text_prefixes))
            
            # Special boost for termination keywords if prefer_latest is set
            if prefer_latest and ("termi" in text or "adjou" in text):
                match_count += 2

            if match_count > 0:
                score = match_count / len(filtered_keywords)
                # Higher threshold for motions to avoid random matches
                if score > 0.4 or (prefer_latest and score > 0.2):
                    candidates.append((seg['start'], score))
        return candidates

    # 1. Strict Window Search
    # Search slightly outside the item window just in case
    local_start = max(0, window_start - 30)
    local_end = window_end + 30
    local_segments = [s for s in segments if local_start <= s['start'] <= local_end]
    
    local_candidates = search_segments(local_segments)
    
    if local_candidates:
        # If we found something locally, trust it!
        if prefer_latest:
             local_candidates.sort(key=lambda x: (-x[1], -x[0]))
        else:
             local_candidates.sort(key=lambda x: (-x[1], x[0]))
        return local_candidates[0][0]

    # 1b. Generic Motion Fallback (Local Window Only)
    # If specific text wasn't found, look for generic motion markers in the window
    # This handles "Move to receive", "So moved", etc.
    generic_keywords = ["move", "moved", "second", "carried", "opposed", "receipt", "receive", "recommend", "unanimous"]
    
    best_generic_ts = None
    # Search from END of window backwards, as motions usually happen at the end of an item
    for seg in reversed(local_segments):
        text = normalize_text(seg['text'])
        # Apply phonetic fixes
        for wrong, right in phonetic_fixes.items():
            if wrong in text:
                text = text.replace(wrong, right)
                
        # Check for generic keywords
        if any(k in text for k in generic_keywords):
            best_generic_ts = seg['start']
            break
            
    if best_generic_ts is not None:
        return best_generic_ts

    # 2. Global Fallback Search
    # Only if nothing found locally, search everywhere
    global_candidates = search_segments(segments)
    
    if not global_candidates:
        return None
        
    # Apply penalties to global candidates
    filtered_global = []
    for ts, score in global_candidates:
        # Penalty for early matches if the item isn't early
        # "Early" defined as first 5 minutes (300s)
        is_early_match = ts < 300
        is_early_item = window_start < 300
        
        final_score = score
        if is_early_match and not is_early_item:
            # Heavily penalize matching the preamble for a later item
            final_score *= 0.5
            
        filtered_global.append((ts, final_score))
    
    # Sort by score DESC, then by timestamp
    if prefer_latest:
        filtered_global.sort(key=lambda x: (-x[1], -x[0]))
    else:
        filtered_global.sort(key=lambda x: (-x[1], x[0]))
        
    return filtered_global[0][0]

def align_meeting_items(items: List[Dict], transcript: List[Dict]) -> List[Dict]:
    """
    Adjusts item timestamps based on transcript markers.
    Uses natural sorting and linear interpolation between found anchors.
    """
    if not transcript:
        return items

    # 1. Natural Sort to ensure correct sequence
    sorted_items = sorted(items, key=lambda x: natural_sort_key(x.get("item_order", "")))
    
    meeting_end = transcript[-1]['end']
    meeting_start = transcript[0]['start']
    print(f"DEBUG: meeting_start={meeting_start}, meeting_end={meeting_end}")

    # 2. Pass 1: Find high-confidence markers (Anchors)
    all_candidates = [] # List of (item_index, timestamp, score)
    for i, item in enumerate(sorted_items):
        start_pred = item.get("discussion_start_time")
        end_pred = item.get("discussion_end_time")
        
        # Use a slightly wider window for finding anchors if we have a prediction
        # but don't strictly enforce it yet
        marker = find_item_marker(
            transcript, 
            item.get("item_order", ""), 
            item.get("title", ""),
            start_pred,
            end_pred
        )
        if marker:
            ts, score = marker
            print(f"DEBUG: Found candidate for {item.get('item_order')}: {ts} (score={score})")
            all_candidates.append((i, ts, score))

    # Filter candidates to ensure they are monotonic
    anchors = [] # List of (i, ts, score)
    for i, ts, score in all_candidates:
        if not anchors:
            anchors.append((i, ts, score))
        else:
            if ts >= anchors[-1][1]:
                anchors.append((i, ts, score))
            else:
                # Potential backtrack:
                # If this candidate is earlier than the last anchor, but has a HIGHER score
                # than the last anchor, AND it is still after the anchor BEFORE that...
                prev_i, prev_ts, prev_score = anchors[-1]
                before_ts = anchors[-2][1] if len(anchors) >= 2 else meeting_start - 1
                
                if score > prev_score and ts > before_ts:
                    print(f"DEBUG: Backtracking! Replacing anchor for item {sorted_items[prev_i].get('item_order')} ({prev_ts}, score={prev_score}) "
                          f"with item {sorted_items[i].get('item_order')} ({ts}, score={score})")
                    anchors[-1] = (i, ts, score)
                else:
                    print(f"DEBUG: Skipping anchor for item {sorted_items[i].get('item_order')} at {ts} (score={score}) "
                          f"because it is before last anchor at {prev_ts} (score={prev_score})")

    # 3. Ensure start/end coverage
    # Convert back to (idx, ts) and ensure we cover from first to last item
    anchors_simple = [(a[0], a[1]) for a in anchors]
    
    if not anchors_simple:
        # No anchors found, spread items evenly
        anchors_simple = [(0, meeting_start), (len(sorted_items) - 1, meeting_end - 10)]
    else:
        # Ensure first item is anchored
        if anchors_simple[0][0] != 0:
            anchors_simple.insert(0, (0, meeting_start))
        # Ensure last item is anchored
        if anchors_simple[-1][0] != len(sorted_items) - 1:
            anchors_simple.append((len(sorted_items) - 1, meeting_end - 10))

    # 4. Pass 2: Build adjusted list with linear interpolation
    adjusted_items = [it.copy() for it in sorted_items]
    
    for a in range(len(anchors_simple) - 1):
        idx1, time1 = anchors_simple[a]
        idx2, time2 = anchors_simple[a+1]
        
        num_items_in_gap = idx2 - idx1
        time_span = time2 - time1
        time_step = time_span / num_items_in_gap if num_items_in_gap > 0 else 0
        
        for i in range(idx1, idx2):
            adjusted_items[i]["discussion_start_time"] = time1 + (i - idx1) * time_step
    
    # Set the very last item's start time (the last anchor)
    last_idx, last_time = anchors_simple[-1]
    adjusted_items[last_idx]["discussion_start_time"] = last_time

    # 5. Pass 3: Set End Times
    for i in range(len(adjusted_items)):
        curr = adjusted_items[i]
        curr_start = curr.get("discussion_start_time")
        
        if i < len(adjusted_items) - 1:
            next_start = adjusted_items[i+1].get("discussion_start_time")
            curr["discussion_end_time"] = next_start
        else:
            curr["discussion_end_time"] = meeting_end

        # Safety: Ensure minimum duration
        if curr["discussion_end_time"] <= curr_start:
            curr["discussion_end_time"] = curr_start + 2

    # 6. Pass 4: Align individual motions
    for item in adjusted_items:
        i_start = item["discussion_start_time"]
        i_end = item["discussion_end_time"]
        
        # Check if this is an end-of-meeting item
        item_title_lower = item.get("title", "").lower()
        is_termination = "termination" in item_title_lower or "adjournment" in item_title_lower

        for motion in item.get("motions", []):
            m_text = motion.get("motion_text", "")
            
            # Determine if we should prefer the latest occurrence
            # 1. If the item itself is termination
            # 2. If the motion text looks like termination
            m_text_lower = m_text.lower()
            prefer_latest = is_termination or "terminate" in m_text_lower or "adjourn" in m_text_lower

            # Try searching in item window first (function handles fallback internally)
            found_m_ts = find_motion_marker(transcript, m_text, i_start, i_end, prefer_latest=prefer_latest)
            
            if found_m_ts is not None:
                print(f"DEBUG: Realaligned motion '{m_text[:30]}...' to {found_m_ts}")
                motion["timestamp"] = found_m_ts
                if "end_timestamp" in motion:
                    motion["end_timestamp"] = found_m_ts + 10

    return adjusted_items
