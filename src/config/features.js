// Feature switches and thresholds for the ticket-safety features.
// The AI features call Claude on the BACKEND (never from the browser: an API key in client code is public).
// In mock mode (config/env.js USE_MOCKS) they run on local heuristics so the UI is fully demo-able.
export const features = {
  aiAutofill: true, // read an uploaded ticket / pasted email and pre-fill the listing
  aiTicketChecks: true, // AI flags mismatches, passed dates and edits; flagged listings go to admin review
  duplicateDetection: true, // exact code/file match blocks; perceptual near-match goes to admin review
};

export const ticketSafety = {
  // Perceptual (dHash, 64-bit) Hamming distance at or below this = "near duplicate" -> admin review.
  nearDuplicateMaxDistance: 10,
  // Extracted fields below this confidence are shown to the seller with a "check this" marker.
  lowConfidence: 0.7,
  // Minimum catalogue-match score to pre-select an event from an extraction.
  eventMatchMinScore: 0.45,
};
