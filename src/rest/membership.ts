import {
  MembershipRole,
  ErrorCode,
  Authorizations,
  ValidationTypes,
  EventType
} from "../interfaces/enum";
import { getUserByEmail } from "../crud/user";
import {
  createMembership,
  getMembership,
  deleteMembership,
  getOrganizationMembers,
  getUserOrganizationMembership,
  getMembershipDetailed
} from "../crud/membership";
import { User } from "../interfaces/tables/user";
import { register } from "./auth";
import { can } from "../helpers/authorization";
import { validate } from "../helpers/utils";
import { Locals } from "../interfaces/general";
import { createEvent } from "../crud/event";

export const getMembershipDetailsForUser = async (
  userId: number,
  membershipId: number
) => {
  if (await can(userId, Authorizations.READ, "membership", membershipId))
    return await getMembershipDetailed(membershipId);
  throw new Error(ErrorCode.INSUFFICIENT_PERMISSION);
};

export const inviteMemberToOrganization = async (
  userId: number,
  organizationId: number,
  newMemberName: string,
  newMemberEmail: string,
  role: MembershipRole,
  locals: Locals
) => {
  validate(newMemberEmail, ValidationTypes.EMAIL);
  if (
    await can(
      userId,
      Authorizations.INVITE_MEMBER,
      "organization",
      organizationId
    )
  ) {
    let newUser: User;
    let userExists = false;
    try {
      newUser = await getUserByEmail(newMemberEmail);
      userExists = true;
    } catch (error) {}
    if (userExists) {
      newUser = await getUserByEmail(newMemberEmail);
      if (!newUser.id) throw new Error(ErrorCode.USER_NOT_FOUND);
      let isMemberAlready = false;
      try {
        await getUserOrganizationMembership(newUser.id, organizationId);
        isMemberAlready = true;
      } catch (error) {}
      if (isMemberAlready) throw new Error(ErrorCode.USER_IS_MEMBER_ALREADY);
      await createMembership({ userId: newUser.id, organizationId, role });
      return;
    } else {
      await register(
        { name: newMemberName },
        locals,
        newMemberEmail,
        organizationId,
        role
      );
      return;
    }
  }
  throw new Error(ErrorCode.INSUFFICIENT_PERMISSION);
};

export const deleteMembershipForUser = async (
  tokenUserId: number,
  membershipId: number,
  locals: Locals
) => {
  const membership = await getMembership(membershipId);
  if (!membership || !membership.id)
    throw new Error(ErrorCode.MEMBERSHIP_NOT_FOUND);
  if (await can(tokenUserId, Authorizations.DELETE, "membership", membership)) {
    if (membership.role == MembershipRole.OWNER) {
      const organizationMembers = await getOrganizationMembers(
        membership.organizationId
      );
      const currentMembers = organizationMembers.filter(
        member => member.role == MembershipRole.OWNER
      );
      if (currentMembers.length < 2)
        throw new Error(ErrorCode.CANNOT_DELETE_SOLE_OWNER);
    }
    await deleteMembership(membership.id);
    await createEvent(
      {
        userId: tokenUserId,
        organizationId: membership.organizationId,
        type: EventType.MEMBERSHIP_DELETED,
        data: { membership }
      },
      locals
    );
    return;
  }
  throw new Error(ErrorCode.INSUFFICIENT_PERMISSION);
};
