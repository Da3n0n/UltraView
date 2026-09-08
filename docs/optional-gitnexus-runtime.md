# Optional GitNexus runtime

The standard VSIX excludes GitNexus runtime archives and vendor dependencies.
Normal builds compile the extension without preparing a runtime. GitNexus starts
only on request by default; opening its sidebar does not download or index.
Choose **Download runtime and start**, then **Analyze workspace** separately.
Compatible cached runtimes are reused. Other Ultraview features work without it.

Downloads use a pinned HTTPS URL and SHA-256 checksum from
`resources/gitnexus-downloads.json`. Installation supports cancellation, shares
a lock across VS Code windows, and makes an installation visible only after
extraction and metadata validation complete.

## Release preparation

The checked-in manifest currently has no published platform assets. A fresh
installation therefore cannot download GitNexus until this release step is done:

1. Run the **Prepare GitNexus runtime release** GitHub Actions workflow. It
   builds Windows x64 and prepares a draft release containing the archive and
   its exact checksum manifest.
2. Review and publish that runtime release. Download its generated
   `gitnexus-downloads.json` artifact and copy it into `resources/`.
3. Run `npm run runtime:verify-downloads` to verify the published bytes.
4. Run `npm run vsix` to build the standard extension package.

Do not reuse a checksum from a different local build: rebuilding an archive can
change its bytes. Runtime release assets are immutable. Other platforms need
their own compatible build and manifest entry before downloads are supported.
For a manually hosted archive, `npm run runtime:download-manifest -- HTTPS_URL`
generates a manifest for the exact local archive prepared by
`npm run prepare:gitnexus-runtime`.
