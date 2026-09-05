# Grading provider boundary

Exercise capture ends at `gradeTake()` in `src/grading/gradingProvider.ts`.
The current `localGradingProvider` preserves EarTrain's existing grader.

To integrate reading.oclef.com, install a provider during trusted application
bootstrap. A remote provider should POST the `GradingRequest` to an EarTrain
server route, where the partner API key is stored as a server-only environment
variable. It must return the existing `GradeResult` contract so reports,
telemetry, adaptive progression, and retries do not need partner-specific code.

Do not put the API key, model URL, or signed partner credentials in Vite
environment variables: `VITE_*` values are public browser code. Launch identity
and attempt syncing remain separate in `src/integration/oclefBridge.ts`.
