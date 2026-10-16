# The Gavel MVP design

Status: Approved in conversation; implementation has not started.

## Objective

Build a secure public publishing platform for The Gavel at Boston College. Preserve the current publication's recognizable structure and branding while replacing the compromised WordPress/hosting architecture with a narrowly scoped Next.js, Vercel, and Supabase system.

## Product design

Public readers browse published articles, sections, categories, tags, authors, search results, and Letters to the Editor without accounts. Approved `bc.edu` members use Google authentication to access a dashboard. Authors control only articles they own; administrators manage all content, membership, taxonomy, homepage curation, and site information.

The MVP includes the current homepage structure, article presentation, About page, Letter archive and submission instructions, author pages, pagination, footer/social content, search, responsive navigation, and a custom not-found experience. Comments, newsletters, scheduling, and legacy migration are deferred.

## Architecture

Next.js and TypeScript run on Vercel. Supabase provides Google authentication, PostgreSQL, Row Level Security, and Storage. Browser mutations go through server-side actions or routes and remain subject to database authorization. Preview and production environments use separate Supabase projects.

## Content model

Every article has one designated owner and one primary section. Articles may have multiple categories, tags, and credited contributors. Categories belong to a section; tags span sections. Contributors do not need login accounts unless they require dashboard access.

Article lifecycle is Draft, Published, Archived, then administrator-only permanent deletion. Revision and audit histories record important changes. Administrators select lead, Featured News, and Read This stories, with recent-content fallbacks.

## Security design

Access requires both a valid `bc.edu` Google identity and an active administrator-approved membership. Authorization runs in server code and RLS. Rich content is constrained and sanitized; uploads are limited to validated raster images. Secrets remain server-side. Preview deployments are protected. Production ownership, MFA, backups, restore testing, logging, and incident response are launch requirements.

## User experience

The interface preserves the existing logo, colors, navigation, homepage grouping, and editorial identity. Improvements may address accessibility, responsive behavior, information hierarchy, consistency, search, and dashboard usability. Target accessibility is WCAG 2.2 AA.

## Verification

Tests must prove public-content filtering, ownership boundaries, administrative permissions, lifecycle transitions, safe rendering, upload restrictions, Google/member gating, search and pagination, accessibility, responsive behavior, production build integrity, and restoration readiness.

## Deferred questions

The authoritative open-question list is maintained in `docs/product-requirements.md`. Unresolved decisions must not be silently implemented.
