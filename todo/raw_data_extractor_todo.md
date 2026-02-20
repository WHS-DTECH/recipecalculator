# Raw Data Extractor TODO List

- [x] Fix Extract Data backend error
  - Diagnose and resolve the 'Failed to extract data from URL.' error in the /api/extract-raw endpoint. Ensure node-fetch works for external URLs and handle CORS/network issues. Log the error details to help debug.
- [x] Improve error handling in extractor UI
  - Show more detailed error messages in the frontend, including backend error details if available. Consider displaying errors in the UI instead of just alerts.
- [x] Add loading indicators to extractor
  - Show a loading spinner or message while fetching/extracting data to improve user feedback.
- [ ] Disable buttons during requests
  - Prevent double submissions by disabling Extract and Save buttons while requests are in progress.
- [ ] Add visual confirmation for save
  - Show a visual (non-alert) confirmation when raw data is saved successfully, such as a toast or message below the button.
- [ ] Review and sanitize HTML display
  - If raw HTML is ever displayed as rendered HTML, ensure it is sanitized to prevent XSS. (Not needed if only shown in textarea.)
- [ ] Refactor JS for modularity
  - Split large functions in raw_extractor.js into smaller, reusable helpers for maintainability.
