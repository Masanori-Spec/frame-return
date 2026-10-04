# Third-party dependencies

No project license has been selected or changed. Existing dependencies retain their own terms.

- sax1.6.1, Blue Oak Model License1.0.0: production XML well-formedness parser, bundled into the standalone file. [License copy](licenses/sax-LICENSE.md), [upstream](https://github.com/isaacs/sax-js)
- esbuild0.25.11, MIT: build-only bundler
- @playwright/test1.56.0 and Playwright, Apache2.0: hosted browser test tooling only
- lxml6.0.2, BSD: independent Python oracle, test-only
- Scribus1.6.1 via official Ubuntu package1.6.1-0ubuntu7: native consumer used by hosted CI, not redistributed in the source ZIP or app
- DejaVu fonts, Xvfb and Poppler: hosted native-test tools, not bundled in the application

Dependency versions and integrity records are in package-lock.json and requirements.txt. The PNG used by native fixture generation is generated from a synthetic checkerboard; it contains no third-party artwork or personal data. The UI uses CSS and a simple original SVG favicon, with system fonts only.
