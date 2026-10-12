# Audit against the "Website Audit & Redesign Master Brief"

Status labels: **Done** = implemented and checked in a browser or by tests. **Open** = needs real content or configuration from the owner.

| Brief item | Status | Notes |
|---|---|---|
| Clear value proposition in the first viewport | Done | Hero says what WADIA sells (lights and home automation, Dhaka) with one primary CTA (Shop) and one secondary (Plan my room). |
| Homepage as one story | Done | Hero, collection, shop, materials, before/after, featured fixture, atmosphere (links into the planner by room), how ordering works, final call to action. |
| Palette and type | Done | Ivory `#F1E9DB`, ink `#191817`, brass `#B98A55`, amber `#D9BFA0` for surfaces and details. The logo's signal yellow stays on primary buttons (brand identity). Playfair Display (self-hosted) for headings, Barlow for body and UI. |
| Real products, prices, photos | **Open** | Catalogue entries and photos are samples and are labelled as such. Prices show "on request" until set in `/admin`. Real photos need to come from the owner (the Facebook page is behind a login). |
| No invented proof | Done | No testimonials, awards, certifications or delivery promises. The "Straight answers" section only describes how ordering really works. |
| Before/after honesty | Done | Caption says it is two photographs of one room, not a measured simulation. |
| Planner | Done | Real lumen-method and matrix model. Deep links such as `/planner?room=office` now preselect the room. |
| Cart and checkout | Done | Real workflow. If the order cannot be saved it never says it was; it offers WhatsApp and phone. |
| Orders stored | **Open** | Needs Supabase (`POSTGRES_URL`) and `npm run db:migrate`. |
| Admin | **Open** | Needs `ADMIN_TOKEN` set on the host. |
| Motion | Done | Intro has a visible "Enter the room" skip; hero warms from dark to day slowly; `prefers-reduced-motion` respected. |
| Responsive | Done | No horizontal overflow at 375px or 1366px on all 9 page types. 768 and 1600+ not separately checked. |
| SEO | Done | Per-page titles, descriptions, LocalBusiness JSON-LD, sitemap with all pages. |
| Lighthouse | Open | Last measured before the shop pages and serif font were added. Re-run before launch. |
