import { getDb, members, organizations } from "@repo/db-sql";
import { and, eq } from "drizzle-orm";

import { auth, type AuthSession, type AuthUser } from "../lib/auth.js";
import { AppError } from "../lib/errors.js";

/**
 * The tenant (team / organisation) a user acts within.
 *
 * Every orchestrator record is keyed on `tenant_id`, so this is the boundary
 * all agent data hangs off. It is resolved server-side from the session and
 * never accepted from the client.
 */
export interface Tenant {
  id: string;
  name: string;
}

/**
 * Mailbox providers where the domain says nothing about who someone works for.
 * A signup from one of these gets a personal team named after them, because
 * "Gmail" would be a nonsense team name — and, more importantly, because
 * grouping strangers by shared mailbox provider would be a data leak.
 */
const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.co.uk",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "zoho.com",
  "gmx.com",
  "mail.com",
  "yandex.com",
  "fastmail.com",
  "hey.com",
  "duck.com",
]);

/**
 * Trailing labels that describe the *kind* of domain rather than its owner.
 * `acme.co.uk` is "Acme", not "Co"; `nsut.ac.in` is "NSUT", not "Ac".
 *
 * Peeling these off from the right generalises better than matching whole
 * suffixes — enumerating "co.uk, ac.in, com.au, …" means every suffix nobody
 * thought of silently produces a wrong team name.
 */
const GENERIC_LABELS = new Set([
  "com",
  "co",
  "net",
  "org",
  "edu",
  "ac",
  "gov",
  "mil",
  "int",
  "biz",
  "info",
  "name",
  "pro",
]);

/** Two letters at the end of a hostname is a country code, not a company. */
function isCountryCode(label: string): boolean {
  return /^[a-z]{2}$/.test(label);
}

function titleCase(value: string): string {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function firstName(user: AuthUser): string {
  const fromName = (user.name ?? "").trim().split(/\s+/)[0];
  if (fromName) return titleCase(fromName);
  const localPart = (user.email ?? "").split("@")[0] ?? "there";
  return titleCase(localPart.split(/[._-]/)[0] ?? localPart);
}

/**
 * The team name implied by an email address.
 *
 * `vasu@redape.com` → "RedApeAI". `joe@gmail.com` → "Joe's Team", because a
 * public mailbox domain identifies a provider, not an employer.
 */
export function teamNameFromEmail(email: string, user: AuthUser): string {
  const domain = (email.split("@")[1] ?? "").trim().toLowerCase();
  if (!domain || PUBLIC_EMAIL_DOMAINS.has(domain)) {
    return `${firstName(user)}'s Team`;
  }

  // Peel generic and country-code labels off the right, never consuming the
  // last one — `redape.com` → `redape`, `nsut.ac.in` → `nsut`, `acme.co.uk`
  // → `acme`. Then take the final label, so `mail.redape.com` is still RedApeAI.
  const labels = domain.split(".").filter(Boolean);
  while (
    labels.length > 1 &&
    (GENERIC_LABELS.has(labels[labels.length - 1]!) ||
      isCountryCode(labels[labels.length - 1]!))
  ) {
    labels.pop();
  }

  const label = (labels[labels.length - 1] ?? "").trim();
  return label ? titleCase(label) : `${firstName(user)}'s Team`;
}

/** Organisations auto-created by the old Zernio-side helper. */
const LEGACY_NAME = /'s Workspace$/;

/**
 * The tenant for this session, creating one on first use.
 *
 * Each user gets their own organisation even when colleagues share a domain —
 * the domain decides the *name*, not the membership. Auto-joining strangers who
 * happen to register the same domain would hand them the team's CRM.
 */
export async function resolveTenant(
  user: AuthUser,
  session: AuthSession,
  headers: Headers,
): Promise<Tenant> {
  if (session.activeOrganizationId) {
    const [tenant] = await getDb()
      .select({ id: organizations.id, name: organizations.name })
      .from(members)
      .innerJoin(organizations, eq(members.organizationId, organizations.id))
      .where(
        and(
          eq(members.userId, user.id),
          eq(members.organizationId, session.activeOrganizationId),
        ),
      )
      .limit(1);
    if (!tenant) {
      throw new AppError(
        403,
        "ORGANIZATION_ACCESS_DENIED",
        "Organization access denied",
      );
    }
    return renameIfLegacy(tenant, user);
  }

  const memberships = await getDb()
    .select({ id: organizations.id, name: organizations.name })
    .from(members)
    .innerJoin(organizations, eq(members.organizationId, organizations.id))
    .where(eq(members.userId, user.id))
    .limit(2);

  if (memberships.length === 1 && memberships[0]) {
    return renameIfLegacy(memberships[0], user);
  }
  if (memberships.length > 1) {
    throw new AppError(
      409,
      "ACTIVE_ORGANIZATION_REQUIRED",
      "Select an organization before continuing",
    );
  }
  return createTeam(user, headers);
}

/**
 * Upgrade a name left by the previous auto-creation helper, which called every
 * org "<Full Name>'s Workspace" regardless of employer. Only touches names
 * still matching that exact pattern, so a team someone has renamed is left be.
 */
async function renameIfLegacy(tenant: Tenant, user: AuthUser): Promise<Tenant> {
  if (!LEGACY_NAME.test(tenant.name)) return tenant;

  const name = teamNameFromEmail(user.email ?? "", user);
  if (name === tenant.name) return tenant;

  await getDb()
    .update(organizations)
    .set({ name })
    .where(eq(organizations.id, tenant.id));
  return { id: tenant.id, name };
}

async function createTeam(user: AuthUser, headers: Headers): Promise<Tenant> {
  const name = teamNameFromEmail(user.email ?? "", user);
  // The slug stays per-user: colleagues share a team *name*, not a team.
  const slug = `team-${user.id.toLowerCase()}`;
  try {
    const created = await auth.api.createOrganization({
      headers,
      body: { name, slug },
    });
    return { id: created.id, name: created.name };
  } catch (error) {
    // Lost a race, or the slug already exists — fall back to whatever
    // membership now resolves rather than failing the request.
    const [membership] = await getDb()
      .select({ id: organizations.id, name: organizations.name })
      .from(members)
      .innerJoin(organizations, eq(members.organizationId, organizations.id))
      .where(eq(members.userId, user.id))
      .limit(1);
    if (membership) return membership;
    throw error;
  }
}
