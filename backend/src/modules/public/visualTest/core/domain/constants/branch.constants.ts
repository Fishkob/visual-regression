export const DEFAULT_BRANCH_NAME = 'main';
export const MAX_BRANCH_NAME_LENGTH = 255;

// The longest target chain a branch may sit on. The Branch View CTE and the
// retarget validation share it, so "the graph is walkable" means the same thing
// on the read path and on the write path instead of one capping at 10 while the
// other walks forever.
export const MAX_BRANCH_CHAIN_DEPTH = 10;
