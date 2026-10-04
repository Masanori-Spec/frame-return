# Security and data boundaries

- The standalone app has no fetch, analytics, external fonts, storage, service worker or backend. Its CSP denies all network connections and remote resources. User files are read locally into memory
- Text and filenames are rendered using textContent, not HTML. Only application-authored translation strings use innerHTML. Downloads use in-memory Blob URLs and fixed names
- Uncompressed UTF-8 XML only; DTDs, custom entities, CDATA, namespaces and processing instructions are rejected. Resource bounds apply before and during parsing
- Packets have strict known fields, bounded frames/runs/text and explicit schema versions. The original review packet must be imported independently for a fresh apply session. Checksums are not signatures; trust the assignment source and inspect every returned change
- The browser never changes originals. Outputs are separate downloads. Existing relative file paths remain in the SLA; the app does not fetch those paths or package their contents
- File imports, selection changes, text edits, resets and decisions invalidate old outputs. An operation sequence guards asynchronous imports/hash checks from completing after a newer action
- All changed frames require explicit approval or exclusion. Conflicts do not silently produce partially applied files
- The output is still a Scribus document from its original author. This app is not a document sanitizer or a malware scanner. Do not open untrusted documents solely because this narrow profile accepted selected text frames
- Close the app or use Reset to clear in-memory working files. There is no persistent history or server-side deletion requirement

For CI, Chromium sandboxing is enabled explicitly and the test asserts no no-sandbox flag is present. Native Scribus runs only in the authorized hosted job under Xvfb, with fresh profiles, timeouts and synthetic fixtures. Workflow permissions are contents:read. No secrets or real customer documents are needed.
