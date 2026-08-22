import type { IStorageProvider } from '@common/domain/storage-provider.interface';
import { isString } from '@common/utils/is-string';

export interface StorageDeletionRecord {
  id: string;
  url?: string;
}

export interface DeletableItem {
  id: string;
  url: string | undefined;
}

/**
 * Shapes items (DB rows that may own a storage object) into
 * StorageDeletionRecord[] — a record's url is kept only when it is safe to
 * delete. When filterBaselineShared is set, URLs still referenced by a
 * baseline are marked undefined so the caller deletes the row but keeps the
 * shared object.
 */
export async function buildDeletionRecords(
  items: DeletableItem[],
  filterBaselineShared: boolean,
  filterBaselineSharedUrls: (urls: string[]) => Promise<string[]>,
): Promise<StorageDeletionRecord[]> {
  const urls = items.map((item) => item.url).filter(isString);
  const deletableUrls = new Set(
    filterBaselineShared ? await filterBaselineSharedUrls(urls) : urls,
  );
  return items.map((item) => ({
    id: item.id,
    url: item.url && deletableUrls.has(item.url) ? item.url : undefined,
  }));
}

export interface RowFirstDeletion {
  records: StorageDeletionRecord[];
  /** Guarded row delete: returns exactly which ids were removed. */
  deleteRows: (ids: string[]) => Promise<string[]>;
  storage: Pick<IStorageProvider, 'deleteAll'>;
  /**
   * Optional "safe to reclaim" filter applied to the file URLs of the deleted
   * rows before they are reclaimed (e.g. filterReclaimableUrls).
   */
  reclaimUrls?: (urls: string[]) => Promise<string[]>;
}

/**
 * Row-first deletion ordering: delete the DB rows first (guarded — the delete
 * returns exactly which rows were removed), then reclaim the storage objects
 * only for those rows. Used by the two maintenance flows whose object is live
 * content (orphaned BASELINE rows) or must not be reclaimed for a row that
 * survives (failed jobs racing a DLQ retry). A row whose file delete fails is
 * already gone from the DB; its object leaks to the unreferenced-object sweep.
 */
export async function deleteRecordsRowFirst(
  options: RowFirstDeletion,
): Promise<{ deletedRows: number; failedUrls: string[] }> {
  const { records, deleteRows, storage, reclaimUrls } = options;
  if (records.length === 0) return { deletedRows: 0, failedUrls: [] };

  const deletedIds = await deleteRows(records.map((record) => record.id));
  const deletedIdSet = new Set(deletedIds);

  let urlsToDelete = records
    .filter((record) => record.url && deletedIdSet.has(record.id))
    .flatMap((record) => (record.url ? [record.url] : []));
  if (urlsToDelete.length > 0 && reclaimUrls) {
    urlsToDelete = await reclaimUrls(urlsToDelete);
  }

  const failedUrls: string[] = [];
  if (urlsToDelete.length > 0) {
    const result = await storage.deleteAll(urlsToDelete);
    for (const failure of result.failed) failedUrls.push(failure.url);
  }

  return { deletedRows: deletedIds.length, failedUrls };
}
