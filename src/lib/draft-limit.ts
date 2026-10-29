// A leaf on purpose: client-safe modules import the cap without a db edge.
// No draft has been created since #413; the cap still bounds the drafts a
// rotation request may carry, since no household can hold more.
export const MAX_DRAFTS = 20;
