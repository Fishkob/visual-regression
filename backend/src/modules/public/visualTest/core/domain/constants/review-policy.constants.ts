// Approvals needed to finalize a comparison. One is the default (a single
// reviewer settles it); more turns the Project into a 4-eyes gate. The ceiling
// keeps "more eyes" meaningful instead of an unreachable quorum.
//
// One owner because the bound used to be typed into three DTOs and the approve
// path; a change to it now moves the validator, the OpenAPI document and the
// clamp together.
export const REQUIRED_APPROVALS_MIN = 1;
export const REQUIRED_APPROVALS_MAX = 10;
