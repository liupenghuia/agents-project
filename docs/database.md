# Database Design

## Overview

The initial data model supports user management. Backend implementation must keep database changes aligned with this document.

## Entities

### users

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Primary key |
| email | string | yes | Unique user email |
| name | string | yes | Display name |
| status | string | yes | `active` or `disabled` |
| created_at | datetime | yes | Creation timestamp |
| updated_at | datetime | yes | Last update timestamp |

## Indexes

- Unique index on `users.email`.
- Primary index on `users.id`.

## Rules

- User emails must be unique.
- Disabled users are retained for auditability.
- Hard delete requires Product Agent approval and database documentation update.

## Migration Notes

- Any schema change must update this document before backend implementation starts.
- API response field names should use camelCase even if database columns use snake_case.

