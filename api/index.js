/**
 * Vercel serverless entry point.
 *
 * `vercel.json` rewrites every `/api/*` request here, and the Express app
 * handles routing internally. Exporting the app directly works because Vercel's
 * Node runtime accepts an `(req, res)` handler and an Express app is one.
 */

import app from "../server/app.js"

export default app
