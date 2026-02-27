---
created: 2026-02-27T20:15:09.411Z
title: Use viewroyal neighbourhood boundary geojson to map addresses to neighbourhoods
area: pipeline
files:
  - pipeline/ingestion/ai_refiner.py
---

## Problem

Agenda items and matters contain addresses, but these addresses are not explicitly mapped to the official View Royal neighbourhoods (e.g., in the database as `neighborhood`). We need a reliable way to map extracted address coordinates to their respective neighbourhoods for advanced spatial filtering and analytics.

## Solution

1. Obtain the official View Royal neighbourhood boundary GeoJSON file.
2. During ingestion/refinement (likely after extracting the address), geocode the address to coordinates.
3. Perform a spatial join (e.g., using `shapely` or standard point-in-polygon logic) to determine which neighbourhood polygon contains the address point.
4. Update the agenda item/matter's `neighborhood` field before inserting into the database.
