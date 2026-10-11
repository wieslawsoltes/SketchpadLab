# Original source bytes

Historical source files are not bundled. Run `npm run originals:fetch` for an opt-in retrieval of pinned Git blobs, then `npm run originals:verify`. The application also has an Archive fetch/import view.

Never rewrite the fetched originals to make assembly succeed. Keep restoration edits in a separate tree with patch-level provenance, and do not call an edited listing unmodified original source. This build does not assemble or execute the complete historical listings.
