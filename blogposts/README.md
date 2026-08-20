# Blog posts

This folder contains the site's standalone HTML posts. Each post is a regular HTML file that can
be opened directly in the browser. The main `index.html` lists articles directly; this folder is
only where the files live.

## Add an article

1. Copy `_template.html` to a new filename, such as `02-my-first-post.html`.
2. Use the next sequential number in the filename and in `.article-number` (for example `02`).
3. Update the title, date, reading time, description, tags, and content.
4. Add the article row to both the root `index.html` and `blogposts/index.html`:

    <tr>
      <td>02</td>
      <td><span class="entry-icon" aria-hidden="true">FILE</span><a href="blogposts/02-my-first-post.html">02-my-first-post.html</a></td>
      <td class="entry-description">A short description of the article.</td>
      <td><span class="tag">topic</span><span class="tag">note</span></td>
    </tr>

Keep article numbers sequential in both directory listings. The shared styles live in `../styles.css`, `../aether.css`,
`../directory.css`, `../directory-entries.css`, and `../charts.css`.

## Add a chart

The article template already loads `../charts.css`, which provides the shared `.ar-*` primitives.
Use `_chart-primitives.html` as the visual reference for bar, line, donut, and stat blocks.
For pie or donut charts, set `--ar-pie-gradient` on `.ar-pie` with a `conic-gradient`.
For SVG charts, keep the `viewBox` wider than the last mark so the final cap, label, and tick are not clipped.
If a chart uses the highlight bar, keep its value label inside the bar in dark ink.
If a page has multiple SVGs, give each gradient and filter a unique ID and update the `url(#...)` references.

## Add a link preview

The public pages include Open Graph and Twitter Card metadata. The generator discovers the root
index, the blog archive, and numbered posts, then renders 1200x630 PNGs into `../assets/embeds/`.
The cards include the shared reach-canvas moon/bird mark from `scripts/embed-lunar-reach.png`.

Run it with a Python runtime that has Playwright installed:

    python3 scripts/generate_embed_images.py

When copying `_template.html`, replace its canonical URL and `article-00.png` placeholders with
the new post's URL and number, then regenerate the images and commit the matching PNG.
