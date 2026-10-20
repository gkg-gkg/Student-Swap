import { db, save, currentUserRecord, privateUser, sellerSummary, ApiError } from './mock/db.js';
import { mockCall } from './mock/util.js';
import { enrichListing } from './mock/helpers.js';

/** GET /sellers/:id: public profile */
export function getSeller(/** @type {string} */ id) {
  return mockCall(() => {
    const u = db.users.find((x) => x.id === id);
    if (!u || !u.profileComplete) throw new ApiError(404, 'Seller not found.', 'not_found');
    return {
      seller: sellerSummary(u),
      listings: db.listings.filter((l) => l.sellerId === id && l.status === 'active').map(enrichListing),
    };
  });
}

/**
 * POST /me/profile: finishes sign-up (18+ confirmation, display name, uni, avatar).
 * @param {{ displayName: string, universityId: string, avatar: import('../types/index.js').Avatar, ageConfirmed: boolean }} input
 */
export function completeProfile(input) {
  return mockCall(() => {
    const me = currentUserRecord();
    if (!input.ageConfirmed) throw new ApiError(400, 'You must be 18 or over to use StudentSwap.');
    const name = input.displayName.trim();
    if (name.length < 2 || name.length > 30) throw new ApiError(400, 'Display name must be 2 to 30 characters.');
    Object.assign(me, {
      displayName: name,
      universityId: input.universityId,
      avatar: input.avatar,
      ageConfirmed: true,
      profileComplete: true,
    });
    save();
    return privateUser(me);
  });
}

/** PATCH /me/profile @param {{ displayName?: string, universityId?: string, avatar?: import('../types/index.js').Avatar }} patch */
export function updateProfile(patch) {
  return mockCall(() => {
    const me = currentUserRecord();
    if (patch.displayName !== undefined) {
      const name = patch.displayName.trim();
      if (name.length < 2 || name.length > 30) throw new ApiError(400, 'Display name must be 2 to 30 characters.');
      me.displayName = name;
    }
    if (patch.universityId) me.universityId = patch.universityId;
    if (patch.avatar) me.avatar = patch.avatar;
    save();
    return privateUser(me);
  });
}
