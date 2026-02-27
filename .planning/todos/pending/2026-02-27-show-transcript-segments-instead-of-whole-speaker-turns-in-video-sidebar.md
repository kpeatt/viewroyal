---
created: 2026-02-27T19:52:47.093Z
title: Show transcript segments instead of whole speaker turns in video sidebar
area: ui
files:
  - apps/web/app/components/meeting/VideoWithSidebar.tsx
---

## Problem

The transcript viewer in the video sidebar currently shows whole speaker turns, which are too long. Users scrolling through the transcript alongside the video see large blocks of text per speaker rather than granular segments. This makes it hard to follow along with the video or find specific moments.

## Solution

Update the transcript viewer component to display individual transcript segments instead of aggregated speaker turns. Each segment should be a shorter, more navigable chunk that maps more closely to the video timeline.
