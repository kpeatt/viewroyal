-- RPC functions for topic classification (Phase 39, Plan 01)
-- Used by pipeline/profiling/topic_classifier.py

-- Bulk classify agenda items using the existing normalize_category_to_topic() function
-- Inserts into agenda_item_topics for all items that don't already have a classification
CREATE OR REPLACE FUNCTION bulk_classify_topics_by_category()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  row_count integer;
BEGIN
  INSERT INTO agenda_item_topics (agenda_item_id, topic_id)
  SELECT ai.id, t.id
  FROM agenda_items ai
  JOIN topics t ON t.name = normalize_category_to_topic(ai.category)
  WHERE NOT EXISTS (
    SELECT 1 FROM agenda_item_topics ait WHERE ait.agenda_item_id = ai.id
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS row_count = ROW_COUNT;
  RETURN row_count;
END;
$$;

-- Get agenda items that don't have any topic classification yet
CREATE OR REPLACE FUNCTION get_unclassified_agenda_items()
RETURNS TABLE(id bigint, category text)
LANGUAGE sql
SET search_path = public
AS $$
  SELECT ai.id, ai.category
  FROM agenda_items ai
  WHERE NOT EXISTS (
    SELECT 1 FROM agenda_item_topics ait WHERE ait.agenda_item_id = ai.id
  )
  ORDER BY ai.id;
$$;
