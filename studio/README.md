# Vasilina Studio prototype

Open `/studio/` from a local web server at the repository root. For example, with
the server running on port 8052, visit `http://127.0.0.1:8052/studio/`.

Without a Supabase project connected, this is a local demonstration of the owner
workflow. It starts with Vasilina's current portfolio content, displays the
finished site beside an editor, and lets the owner save a draft or simulate
publication. Drafts and simulated publications stay in this browser. Uploaded
images and videos stay in this browser's IndexedDB. The public website is not changed by
the demonstration.

When a Supabase project is connected, the owner can edit the Home cover and
selected work, portfolio photos, digitals, captions, profile details,
measurements, About text, videos, and an image comp card. They can preview changes, save a private draft,
and press **Publish changes**. The public Home, About, and Booking pages then read the
published content, including Booking copy, contact options, and the Cal.com event link.
Uploaded comp-card images are served through the same owner-only
upload workflow as portfolio photos, then shown and downloaded from the public homepage.

The connected editor opens on Portfolio, with Home photos, Digitals, Motion,
Profile & measurements, and About & bio available alongside it. Longer image and text settings stay
collapsed until needed, and English/Thai text is edited one language at a time.
It covers profile details, measurements and visibility, homepage images and text,
portfolio chapters and photo order, digitals, About, contact and booking copy,
video clips, and comp-card upload. The preview reflects text,
image, video order, and visibility changes in the existing design. Existing Wistia
videos remain in place and can be rearranged or removed alongside uploaded clips.
Each motion still can be chosen from the photo library or replaced with a new
upload; uploading a still does not replace the source photo elsewhere on the site.
The Cal.com link controls the calendar in both the Booking preview and the public
Booking page after publication. Availability remains managed in Cal.com.
The owner uploads a current PNG, JPG, or WebP comp card; photo-based card generation
is not built yet. Portfolio photo order can be changed by dragging or with move buttons.

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
4. Open `/studio/`, sign in, edit and preview, then publish. Open
   the public pages in another browser to confirm the published content.

Photo uploads use the `model-media` bucket from the migration. It is public so
published images can display to everyone, while upload permission is limited to
the signed-in owner. Draft order and content are readable only by that owner.
For direct video uploads, also run
`../supabase/migrations/20261001000000_model_video_upload.sql` in the Supabase
SQL Editor. It creates the public `model-videos` bucket with owner-only uploads.
Studio accepts MP4, MOV, and WebM files up to 50 MB. MOV playback depends on
the viewer's browser and the encoding used by the camera, so preview a real clip
before publishing it. Uploaded clips are stored immediately, but only appear on the
public portfolio after **Publish changes**. Supabase does not transcode them or
create streaming versions in this workflow. Removed files remain in storage for
now, so storage use should be monitored. Photo-based card generation is not built.
