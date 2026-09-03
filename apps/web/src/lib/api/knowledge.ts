import { AGENT_TIMEOUT_MS, apiClient, errorMessage } from "@/lib/api/client";

/**
 * Uploading a document into the signed-in user's knowledge base.
 *
 * Goes to the BFF, never to the orchestrator: the orchestrator's ingest
 * endpoint takes `tenant_id` and `user_id` as body fields and trusts them, so
 * a browser that could reach it could write into anyone's knowledge base. The
 * BFF resolves both from the session.
 */

export interface UploadedDocument {
  filename: string;
  doc_id: string;
  /** Episodic summaries stored in Qdrant. */
  chunks: number;
  /** The immediate answer, when a question was sent with the file. */
  answer?: string;
  /** Verbatim passages kept as quotable semantic memory, if requested. */
  verbatim?: number;
  /** The server confirming the raw document was discarded. */
  purged?: boolean;
}

/** What the server will actually read. Mirrors `knowledge.service.ts`. */
export const ACCEPTED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".json",
  ".yaml",
  ".yml",
  ".html",
  ".htm",
] as const;

export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.join(",");
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function uploadKnowledgeFile(
  file: File,
): Promise<UploadedDocument> {
  const body = new FormData();
  body.append("file", file);

  try {
    const { data } = await apiClient.post<{ data: UploadedDocument }>(
      "/api/v1/agent/knowledge/upload",
      body,
      {
        // Let the browser set the multipart boundary; a hand-written
        // Content-Type omits it and the server sees an unparseable body.
        headers: { "Content-Type": undefined },
        // Parse, answer, chunk, summarise and embed all happen before this
        // resolves.
        timeout: AGENT_TIMEOUT_MS,
      },
    );
    return data.data;
  } catch (error) {
    throw new Error(errorMessage(error));
  }
}
