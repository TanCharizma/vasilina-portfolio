# Vasilina Studio prototype

Open `/studio/` from a local web server at the repository root. For example, with
the server running on port 8052, visit `http://127.0.0.1:8052/studio/`.

Without a Supabase project connected, this is a local demonstration of the owner
workflow. It starts with Vasilina's current portfolio content, displays the
finished site beside an editor, and lets the owner save a draft or simulate
publication. Drafts and simulated publications stay in this browser. Uploaded
images stay in this browser's IndexedDB. The public website is not changed by
the demonstration.

When a Supabase project is connected, the first live editing workflow is the
Portfolio section. The owner signs in, uploads approved photos, moves them
between chapters or changes their order, previews the result, saves a private
draft, and presses **Publish photos**. The public homepage then reads that
published photo order. Other Studio sections remain in the local demonstration
until their public-page connections are implemented.

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

## Connect the first live workflow

This checkout points to Vasilina's Supabase project through
`../portfolio-config.js`. Its first owner account and portfolio record have
been created. To initialize another project or rebuild this connection:

1. Create a Supabase project. In its SQL Editor, run
   `../supabase/migrations/20260928000000_model_portfolio_foundation.sql`.
2. In Supabase Authentication, create the one owner account and set its password.
   In the SQL Editor, link that account to this portfolio, replacing the sample
   email with the owner's actual login email:

   ```sql
   insert into public.model_portfolios (owner_id, slug)
   select id, 'vasilina' from auth.users where email = 'owner@example.com';
   ```

   The first successful Studio sign-in creates the private draft from
   `vasilina-content.json`. The public page keeps its current hard-coded gallery
   until the owner publishes for the first time.
3. Put the project's URL and **publishable key** in `../portfolio-config.js`,
   then deploy. The publishable key is intended for browser use; never put a
   service-role or secret key there.
4. Open `/studio/`, sign in, arrange and preview the photos, then publish. Open
   the public homepage in another browser to confirm the published order.

Photo uploads use the `model-media` bucket from the migration. It is public so
published images can display to everyone, while upload permission is limited to
the signed-in owner. Draft order and content are readable only by that owner.
The current comp-card upload and other edit controls still need their own live
connections; photo-based card generation is not built.
