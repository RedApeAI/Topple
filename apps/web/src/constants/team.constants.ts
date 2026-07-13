import teamFixture from "@mock/fixtures/team.json";
import type { TeamMember } from "@/types/user.types";

export const team = teamFixture as TeamMember[];
export const currentUser: TeamMember = team[0];
