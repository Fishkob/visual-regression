// The storage-object referencedness seam: "which of these storage URLs must not
// be deleted, and which are safe to reclaim". Exists so the maintenance module
// (internal/data-deletion) can cross this interface instead of importing the
// concrete public repositories, matching the seam pattern of STORAGE_PROVIDER /
// JOB_PRODUCER / PDF_RENDER_CACHE.
export const STORAGE_OBJECT_REFERENCEDNESS = 'STORAGE_OBJECT_REFERENCEDNESS';

export interface IStorageObjectReferencedness {
  // The subset of the given URLs that any DB row currently references — a
  // screenshot (BASELINE or CURRENT) holding the URL, or a comparison whose
  // diff artifact it is. Used by the unreferenced-object sweep, which must not
  // reclaim an object while any row points at it (a store→commit upload's object
  // is protected by its CURRENT row even before a comparison exists).
  findReferencedUrls(urls: string[]): Promise<string[]>;

  // The subset of the given URLs that is safe to reclaim. Unlike
  // findReferencedUrls this does NOT treat every CURRENT row as protection:
  // callers that reclaim candidates have already removed the rows they are
  // reclaiming, so only a baseline sharing the URL, or a comparison still
  // referencing the candidate, blocks the delete. Both predicates are correct
  // for their phase of the deletion lifecycle; the seam keeps them side by side
  // so the safety rule has one documented owner instead of two drifting shapes.
  filterReclaimableUrls(urls: string[]): Promise<string[]>;
}
