import { useEffect, useState } from "react";
import { Loader2, LogOut, RefreshCw, UserPlus } from "lucide-react";
import { DashboardPage } from "@/components/layout/DashboardPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api/client";
import { useAuthStore } from "@/store/auth.store";
import {
  changePassword,
  createOrganization,
  getOrganization,
  inviteMember,
  listOrganizations,
  removeMember,
  setActiveOrganization,
  updateMemberRole,
  type OrganizationDetails,
  type OrganizationSummary,
} from "@/features/settings/services/settings.service";

export function SettingsPage() {
  const user = useAuthStore((state) => state.user);
  const organization = useAuthStore((state) => state.organization);
  const checkSession = useAuthStore((state) => state.checkSession);
  const logout = useAuthStore((state) => state.logout);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [details, setDetails] = useState<OrganizationDetails>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [newWorkspace, setNewWorkspace] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
  });
  const [passwordMessage, setPasswordMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const list = await listOrganizations();
      setOrganizations(list);
      const activeId = organization?.id ?? list[0]?.id;
      if (activeId) setDetails(await getOrganization(activeId));
    } catch (cause) {
      setError(errorMessage(cause, "Workspace settings could not be loaded"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = "Settings — Plucia";
    void load();
    // The active organization is stable for this page session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  const selectOrganization = async (id: string) => {
    setBusy(true);
    setError(undefined);
    try {
      await setActiveOrganization(id);
      await checkSession();
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "Workspace could not be selected"));
    } finally {
      setBusy(false);
    }
  };

  const createWorkspace = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newWorkspace.trim()) return;
    setBusy(true);
    try {
      const created = await createOrganization(newWorkspace.trim());
      await setActiveOrganization(created.id);
      setNewWorkspace("");
      await checkSession();
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "Workspace could not be created"));
    } finally {
      setBusy(false);
    }
  };

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!organization?.id || !inviteEmail.trim()) return;
    setBusy(true);
    try {
      await inviteMember({
        organizationId: organization.id,
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setInviteEmail("");
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "Invitation could not be sent"));
    } finally {
      setBusy(false);
    }
  };

  const updateRole = async (memberId: string, role: "member" | "admin") => {
    if (!organization?.id) return;
    setBusy(true);
    try {
      await updateMemberRole({
        organizationId: organization.id,
        memberId,
        role,
      });
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "Member role could not be updated"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (memberId: string) => {
    if (
      !organization?.id ||
      !window.confirm("Remove this member from the workspace?")
    )
      return;
    setBusy(true);
    try {
      await removeMember({ organizationId: organization.id, memberId });
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "Member could not be removed"));
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setPasswordMessage(undefined);
    try {
      await changePassword(passwords);
      setPasswords({ currentPassword: "", newPassword: "" });
      setPasswordMessage("Password changed successfully.");
    } catch (cause) {
      setPasswordMessage(errorMessage(cause, "Password could not be changed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashboardPage breadcrumb={["Dashboard", "Settings"]}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        {error ? (
          <div className="flex items-center justify-between rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void load()}
              className="underline"
            >
              Retry
            </button>
          </div>
        ) : null}

        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="font-heading text-lg font-semibold text-foreground">
                Account
              </h1>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {user?.name} · {user?.email}
              </p>
            </div>
            <Button variant="outline" onClick={() => void logout()}>
              <LogOut /> Sign out
            </Button>
          </div>
          <form
            className="mt-5 grid max-w-xl gap-3 sm:grid-cols-2"
            onSubmit={(event) => void savePassword(event)}
          >
            <Input
              type="password"
              placeholder="Current password"
              value={passwords.currentPassword}
              onChange={(event) =>
                setPasswords((current) => ({
                  ...current,
                  currentPassword: event.target.value,
                }))
              }
              required
            />
            <Input
              type="password"
              placeholder="New password"
              value={passwords.newPassword}
              onChange={(event) =>
                setPasswords((current) => ({
                  ...current,
                  newPassword: event.target.value,
                }))
              }
              required
            />
            <Button
              type="submit"
              disabled={busy}
              className="sm:col-span-2 sm:w-fit"
            >
              {busy ? <Loader2 className="animate-spin" /> : null} Change
              password
            </Button>
          </form>
          {passwordMessage ? (
            <p className="mt-2 text-[13px] text-muted-foreground">
              {passwordMessage}
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-semibold text-foreground">
                Workspaces
              </h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Choose the organization that scopes your inbox, CRM, and agent
                data.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              aria-label="Refresh workspaces"
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <RefreshCw
                className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"}
              />
            </button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {organizations.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                disabled={busy || candidate.id === organization?.id}
                onClick={() => void selectOrganization(candidate.id)}
                className={`rounded-xl border px-3 py-3 text-left ${candidate.id === organization?.id ? "border-primary bg-primary/5" : "border-border hover:bg-accent"}`}
              >
                <span className="block text-[14px] font-medium text-foreground">
                  {candidate.name}
                </span>
                <span className="mt-1 block text-[12px] text-muted-foreground">
                  {candidate.id === organization?.id
                    ? "Active workspace"
                    : "Switch workspace"}
                </span>
              </button>
            ))}
          </div>
          <form
            className="mt-4 flex max-w-xl gap-2"
            onSubmit={(event) => void createWorkspace(event)}
          >
            <Input
              value={newWorkspace}
              onChange={(event) => setNewWorkspace(event.target.value)}
              placeholder="New workspace name"
            />
            <Button type="submit" disabled={busy || !newWorkspace.trim()}>
              Create
            </Button>
          </form>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-semibold text-foreground">
                Members
              </h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Manage access to {organization?.name ?? "this workspace"}.
              </p>
            </div>
            <UserPlus className="h-5 w-5 text-muted-foreground" />
          </div>
          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => void invite(event)}
          >
            <Input
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="teammate@company.com"
              required
            />
            <select
              value={inviteRole}
              onChange={(event) =>
                setInviteRole(event.target.value as "member" | "admin")
              }
              className="h-9 rounded-lg border border-input bg-background px-2 text-[13px] text-foreground"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <Button type="submit" disabled={busy}>
              <UserPlus /> Invite
            </Button>
          </form>
          <div className="mt-4 divide-y divide-border">
            {details?.members?.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-foreground">
                    {member.user?.name ?? member.user?.email ?? member.userId}
                  </p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {member.user?.email ?? member.role}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={member.role === "owner" ? "owner" : member.role}
                    disabled={busy || member.role === "owner"}
                    onChange={(event) =>
                      void updateRole(
                        member.id,
                        event.target.value as "member" | "admin",
                      )
                    }
                    className="h-8 rounded-md border border-input bg-background px-2 text-[12px] text-foreground"
                  >
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </select>
                  {member.role !== "owner" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void remove(member.id)}
                      disabled={busy}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
            {!loading && !details?.members?.length ? (
              <p className="py-4 text-[13px] text-muted-foreground">
                No members returned.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </DashboardPage>
  );
}
