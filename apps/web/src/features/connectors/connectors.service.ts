import { apiClient } from "@/lib/api/client";

export interface Connector {
  id: string;
  label: string;
  description: string;
  /** Agent tools this connector contributes once granted. */
  tools: string[];
  connected: boolean;
}

export async function fetchConnectors(): Promise<Connector[]> {
  const { data } = await apiClient.get<{ data: Connector[] }>(
    "/api/v1/connectors",
  );
  return data.data;
}

/**
 * Begin the incremental consent for one connector.
 *
 * Returns Google's authorization URL rather than navigating here, so the caller
 * decides how to send the user — and so a failure surfaces as an error in the
 * UI instead of a half-finished redirect.
 */
export async function connectUrl(id: string, returnTo: string): Promise<string> {
  const { data } = await apiClient.post<{ data: { url: string } }>(
    `/api/v1/connectors/${encodeURIComponent(id)}/connect`,
    { returnTo },
  );
  return data.data.url;
}
