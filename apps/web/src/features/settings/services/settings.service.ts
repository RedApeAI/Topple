import { apiClient } from "@/lib/api/client";

export interface OrganizationSummary {
  id: string;
  name: string;
  slug?: string;
  logo?: string | null;
}

export interface OrganizationMember {
  id: string;
  userId: string;
  role: string;
  user?: { id?: string; name?: string; email?: string; image?: string | null };
}

export interface OrganizationDetails extends OrganizationSummary {
  members?: OrganizationMember[];
  invitations?: Array<{
    id: string;
    email: string;
    role: string;
    status: string;
  }>;
}

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export async function listOrganizations(): Promise<OrganizationSummary[]> {
  const { data } = await apiClient.get<unknown>("/api/auth/organization/list");
  return unwrap<OrganizationSummary[]>(data) ?? [];
}

export async function getOrganization(
  organizationId: string,
): Promise<OrganizationDetails> {
  const { data } = await apiClient.get<unknown>(
    "/api/auth/organization/get-full-organization",
    { params: { organizationId } },
  );
  return unwrap<OrganizationDetails>(data);
}

export async function createOrganization(
  name: string,
): Promise<OrganizationSummary> {
  const slug = `${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-${crypto.randomUUID().slice(0, 8)}`;
  const { data } = await apiClient.post<unknown>(
    "/api/auth/organization/create",
    { name, slug },
  );
  return unwrap<OrganizationSummary>(data);
}

export async function setActiveOrganization(
  organizationId: string,
): Promise<void> {
  await apiClient.post("/api/auth/organization/set-active", { organizationId });
}

export async function inviteMember(input: {
  organizationId: string;
  email: string;
  role: "member" | "admin";
}): Promise<unknown> {
  const { data } = await apiClient.post<unknown>(
    "/api/auth/organization/invite-member",
    input,
  );
  return unwrap(data);
}

export async function updateMemberRole(input: {
  organizationId: string;
  memberId: string;
  role: "member" | "admin";
}): Promise<unknown> {
  const { data } = await apiClient.post<unknown>(
    "/api/auth/organization/update-member-role",
    input,
  );
  return unwrap(data);
}

export async function removeMember(input: {
  organizationId: string;
  memberId: string;
}): Promise<unknown> {
  const { data } = await apiClient.post<unknown>(
    "/api/auth/organization/remove-member",
    input,
  );
  return unwrap(data);
}

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  await apiClient.post("/api/v1/auth/change-password", input);
}

export async function requestPasswordReset(
  email: string,
  redirectTo = `${window.location.origin}/reset-password`,
): Promise<void> {
  await apiClient.post("/api/v1/auth/request-password-reset", {
    email,
    redirectTo,
  });
}

export async function resetPassword(input: {
  token: string;
  newPassword: string;
}): Promise<void> {
  await apiClient.post("/api/v1/auth/reset-password", input);
}

export async function linkGoogleAccount(
  returnPath = "/dashboard/mail",
): Promise<string> {
  const { data } = await apiClient.post<{ url?: string; redirect?: string }>(
    "/api/auth/link-social",
    {
      provider: "google",
      callbackURL: new URL(returnPath, window.location.origin).toString(),
    },
  );
  const url = data.url ?? data.redirect;
  if (!url) throw new Error("Google returned no account-link URL");
  return url;
}
