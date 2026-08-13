import type { GoogleAuth } from "google-auth-library";

/**
 * Vertex AI transport.
 *
 * Auth goes through Application Default Credentials, which resolves in this
 * order without any code change:
 *   1. GOOGLE_APPLICATION_CREDENTIALS -> a service-account key file (production)
 *   2. `gcloud auth application-default login` (local development)
 *   3. The attached service account, on GCP compute
 *
 * That is why no key ever appears in this repo. GoogleAuth also caches and
 * refreshes the access token itself, so we are not minting one per request.
 */

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.VERTEX_PROJECT;
const LOCATION = process.env.VERTEX_LOCATION ?? "global";

// `global` has its own hostname; every regional endpoint is prefixed.
const HOST =
  LOCATION === "global" ? "aiplatform.googleapis.com" : `${LOCATION}-aiplatform.googleapis.com`;

let auth: GoogleAuth | undefined;

/**
 * Loaded on demand rather than imported at module scope.
 *
 * A static import pulls the whole Google auth stack into every build, including
 * deployments that use the API-key transport and never touch Vertex — where it
 * then fails to resolve at runtime because nothing traced it as a dependency.
 */
async function client(): Promise<GoogleAuth> {
  if (!auth) {
    const { GoogleAuth } = await import("google-auth-library");
    auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  }
  return auth;
}

export function vertexConfigured(): boolean {
  return Boolean(PROJECT);
}

export function vertexEndpoint(model: string): string {
  return (
    `https://${HOST}/v1/projects/${PROJECT}/locations/${LOCATION}` +
    `/publishers/google/models/${model}:generateContent`
  );
}

export async function vertexHeaders(): Promise<Record<string, string>> {
  if (!PROJECT) {
    throw new Error(
      "Vertex is selected but GOOGLE_CLOUD_PROJECT is not set. " +
        "Set it in .env.local, or switch AI_PROVIDER to `gemini`."
    );
  }

  const token = await (await client()).getAccessToken();
  if (!token) {
    throw new Error(
      "Could not obtain a Google access token. Run `gcloud auth application-default login`, " +
        "or point GOOGLE_APPLICATION_CREDENTIALS at a service-account key with the " +
        "`Vertex AI User` role."
    );
  }

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export { PROJECT as VERTEX_PROJECT, LOCATION as VERTEX_LOCATION };
