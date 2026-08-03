# Commerce Profile Screen Reference

## Purpose

Canonical sections + interactive density guidance for commerce-domain screens. Consult this reference when generating SCREEN_DESIGN_SPEC for commerce features so the SPEC output is structurally rich enough for downstream design and render flows.

This reference describes PATTERNS, not VALUES. No brand colors, copy, screen ids, route paths, or project-specific examples appear here.

## Detection rule

Consult this reference when:
- Feature key matches keywords: `cart`, `checkout`, `order`, `account`, `commerce`, `ecommerce`, `ec`, `shop`, `store`, `catalog`, `b2b-commerce`, `b2c`, `retail`.
- OR user explicitly declares commerce intent in the requirement.

Out of commerce domain → reference does NOT apply.

## Canonical screen types

### 1. Home (commerce homepage)

Canonical sections:
- header (site nav, search-bar, cart/account utility)
- hero (primary value prop)
- category-grid (4+ entries — drives category nav interactive count)
- featured-products (4+ product cards)
- secondary CTA or domain-specific entry (e.g. configurator entry for B2B)
- footer (links to contact, privacy, terms)

Interactive density:
- header nav (5–8 links)
- category-grid (4+ anchors)
- featured-products (4+ anchors)

### 2. Category (catalog listing)

Canonical sections:
- header + breadcrumb
- filter-sidebar (multi-select, price range, brand)
- sort-bar
- product-grid (12+ cards in real layout; SPEC declares 4+ sample cards)
- pagination

Interactive density:
- filter checkboxes (5+)
- product cards (4+ anchors)
- pagination (3+ links)

### 3. Product Detail (PDP)

Canonical sections:
- header + breadcrumb
- image-gallery (4+ thumbnail anchors + main image)
- product title + price
- spec table (technical specs)
- add-to-cart + quantity selector
- tab section (description, reviews, shipping, returns)
- related-products grid (4+ cards)

Interactive density:
- image-gallery (4+ anchors)
- tab buttons (3–4)
- related-products (4+ anchors)
- spec-download or compare anchors (1–2)

### 4. Search (results)

Canonical sections:
- header (with prominent search-bar)
- filter-panel
- sort-bar
- results-grid (dense)
- no-results state (alternative)
- pagination

Interactive density: matches category screen.

### 5. Cart

Canonical sections:
- header
- cart-items-table (multiple rows; each row has qty selector + remove anchor)
- promo / coupon section (input + apply button) — distinguishes commerce cart from a generic list
- cart-summary (subtotal, tax, total)
- recommended-products (4+ cards)
- checkout CTA + continue-shopping link

Interactive density:
- per-row qty + remove (2 actions × N rows)
- promo input + apply
- recommended cards (4+ anchors)

### 6. Checkout

Canonical sections:
- header (minimal — focus on checkout flow)
- progress stepper (3–5 steps)
- shipping-address form (with postcode lookup + address autocomplete) — dense form
- billing-address form (with same-as-shipping option)
- payment-method (multiple options: card, bank transfer, COD for B2B)
- order-review (items list, totals)
- place-order CTA

Interactive density:
- form fields (15–25 inputs / selects across address + payment)
- step navigation links
- multiple payment radio options
- item review (3–5 line items)

### 7. Order History

Canonical sections:
- header + sidebar-account-nav
- filter bar (date range, status)
- order-list with per-row actions: detail link, reorder link, invoice download, tracking link
- pagination

Interactive density:
- filter inputs (3–5)
- order rows × per-row 3–4 actions (12–20 anchors total)
- pagination links

### 8. Order Detail

Canonical sections:
- header + sidebar-account-nav
- order-meta-header (order id, date, status)
- order-items (multiple rows)
- order-totals
- shipping-info
- payment-info
- actions (reorder, support-contact, invoice-download, return-request)

Interactive density:
- action set (4–5 anchors)
- item rows with detail links (3+ rows)

### 9. Account Info (profile + address book)

Canonical sections:
- header + sidebar-account-nav
- profile form (name, email — display + edit)
- email change form (inline or modal)
- password change form (inline or modal)
- address-book section (multi-address list; each address with edit + delete + set-default anchors)
- preferences (notifications, language)

Interactive density:
- form fields (5–10)
- address-book entries (3+ addresses × 3 actions each = 9+ anchors)
- preference toggles

### 10. Mode-B Configurator (B2B industrial-commerce; OPTIONAL — applies only when feature scope includes a configurator)

Canonical sections:
- header
- wizard steps
- configuration form (multi-field input)
- preview panel
- BOM (bill of materials) table
- exclude / recalculate actions
- save / order CTAs

Interactive density:
- form fields (10–20)
- preview interactions
- BOM rows with toggles (5+ rows × 2–3 actions)
- action buttons (3–4)

## Common variants (B2B vs B2C)

- B2B carts often include quote-request and order-by-PO-number sections.
- B2B account pages typically include team-management (additional users) and purchasing-roles.
- B2C product pages prioritise reviews and social-proof; B2B prioritises spec tables and technical-data.
- B2B checkout typically supports purchase-order payment; B2C is card-first.

These variants are guidance — match feature requirements.

## Boundary

- This reference describes PATTERNS, not VALUES.
- It contains no brand names, brand colors, hex codes, exact copy, screen ids, route paths, product SKUs, or any project-specific examples.
- It contains no references to any specific reference layout, sample export, or customer artefact.
- Patterns above are derived from general commerce-domain conventions only.
