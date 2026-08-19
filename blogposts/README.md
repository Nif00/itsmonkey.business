# Blog posts

This folder contains the site's standalone HTML posts. Each post is a regular HTML file that can
be opened directly in the browser. The main `index.html` lists articles directly; this folder is
only where the files live.

## Add an article

1. Copy `_template.html` to a new filename, such as `02-my-first-post.html`.
2. Use the next sequential number in the filename and in `.article-number` (for example `02`).
3. Update the title, date, reading time, description, tags, and content.
4. Add a row for the article to the root `index.html`:

    <tr>
      <td class="entry-number">02</td>
      <td><span class="entry-icon" aria-hidden="true">FILE</span><a href="blogposts/02-my-first-post.html">02-my-first-post.html</a></td>
      <td class="entry-description">A short description of the article.</td>
      <td><span class="tag">topic</span><span class="tag">note</span></td>
    </tr>

Keep article numbers sequential. The shared styles live in `../styles.css`, `../aether.css`,
`../directory.css`, and `../directory-entries.css`.
