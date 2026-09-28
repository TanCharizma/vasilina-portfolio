# Vasilina Studio prototype

Open `/studio/` from a local web server at the repository root. For example, with
the server running on port 8052, visit `http://127.0.0.1:8052/studio/`.

This is a local demonstration of the owner workflow. It starts with Vasilina's
current portfolio content, displays the finished site beside an editor, and lets
the owner save a draft or simulate publication. Drafts and simulated publications
are stored only in this browser. Uploaded image files stay in this browser's
IndexedDB. Clearing browser data or using another device will not retain them.
The public website does not read this data and is not changed by the demo.

The editor opens on homepage photos, with Portfolio, Digitals, and Comp card next.
Other sections are under “More to edit.” Longer image and text settings stay
collapsed until needed, and English/Thai text is edited one language at a time.
It covers profile details, measurements and visibility, homepage images and text,
portfolio chapters and photo order, digitals, About, contact and booking copy,
video IDs, and comp-card upload. The preview reflects most text,
image, order, and visibility changes in the existing design. New video IDs and
the Cal.com link are stored but the preview continues to show the current embeds.
The owner can upload a current PDF or image comp card; photo-based card generation
is not built yet. Rearranging uses move buttons for now.

`vasilina-content.json` is the seed content. Run `node studio/validate-content.mjs`
to check image paths and references against the current site.

`../supabase/migrations/20260928000000_model_portfolio_foundation.sql` is the
prepared online-data foundation. It has not been applied to a Supabase project.
Connecting real remote editing requires an owner account, private image storage,
draft and publish calls, public-site data loading, and a generated comp card.
Never place a Supabase service-role key or other server secret in browser code.
