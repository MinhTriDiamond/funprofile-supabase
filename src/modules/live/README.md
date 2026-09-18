# Live Stream Module

## Overview
This module provides live streaming functionality using Agora RTC SDK.

## Structure
- `types.ts` - TypeScript types for live sessions
- `liveService.ts` - CRUD operations for live sessions
- `streamService.ts` - Video upload and stream record creation
- `useLiveSession.ts` - React Query hooks for live session data
- `api/agora.ts` - API wrappers for Agora token and recording
- `hooks/` - React hooks for realtime features
- `components/` - UI components for live features
- `pages/` - Page components for host, audience, and stream views
- `recording/` - Browser MediaRecorder wrapper

## Routes
- `/live` - Discovery page showing active live sessions
- `/live/new` - Start a new live session (host)
- `/live/stream` - Record and upload a video
- `/live/:liveSessionId` - Watch a live session (audience)
- `/live/:liveSessionId/host` - Host view for an existing session
