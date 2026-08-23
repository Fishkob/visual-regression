import {
  buildDeletionRecords,
  deleteRecordsRowFirst,
} from '@internal/data-deletion/services/deletion-records';

describe('buildDeletionRecords', () => {
  it('keeps urls marked safe to delete and drops the rest', async () => {
    const records = await buildDeletionRecords(
      [
        { id: '1', url: 'a' },
        { id: '2', url: 'b' },
      ],
      true,
      async (urls) => urls.filter((u) => u !== 'b'),
    );

    expect(records).toEqual([
      { id: '1', url: 'a' },
      { id: '2', url: undefined },
    ]);
  });

  it('keeps every url when no baseline filter is requested', async () => {
    const records = await buildDeletionRecords(
      [{ id: '1', url: 'a' }],
      false,
      async () => [],
    );

    expect(records).toEqual([{ id: '1', url: 'a' }]);
  });

  it('drops items without a url entirely', async () => {
    const records = await buildDeletionRecords(
      [{ id: '1', url: undefined }],
      false,
      async () => [],
    );

    expect(records).toEqual([{ id: '1', url: undefined }]);
  });
});

describe('deleteRecordsRowFirst', () => {
  const storage = {
    deleteAll: vi.fn().mockResolvedValue({ deleted: [], failed: [] }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deletes rows first, then reclaims files only for the deleted rows', async () => {
    const order: string[] = [];
    storage.deleteAll.mockImplementation(async () => {
      order.push('storage');
      return { deleted: [], failed: [] };
    });
    const deleteRows = vi.fn().mockImplementation(async () => {
      order.push('db');
      return ['1', '2'];
    });

    const result = await deleteRecordsRowFirst({
      records: [
        { id: '1', url: 'a' },
        { id: '2', url: 'b' },
      ],
      deleteRows,
      storage,
    });

    expect(deleteRows).toHaveBeenCalledWith(['1', '2']);
    expect(storage.deleteAll).toHaveBeenCalledWith(['a', 'b']);
    expect(order).toEqual(['db', 'storage']);
    expect(result).toEqual({ deletedRows: 2, failedUrls: [] });
  });

  it('keeps the file of a row the guarded delete did NOT remove', async () => {
    const deleteRows = vi.fn().mockResolvedValue(['1']);

    const result = await deleteRecordsRowFirst({
      records: [
        { id: '1', url: 'a' },
        { id: '2', url: 'b' },
      ],
      deleteRows,
      storage,
    });

    expect(storage.deleteAll).toHaveBeenCalledWith(['a']);
    expect(result.deletedRows).toBe(1);
  });

  it('applies the reclaim filter to the deleted rows files', async () => {
    storage.deleteAll.mockResolvedValue({ deleted: [], failed: [] });
    const reclaimUrls = vi.fn().mockResolvedValue(['b']);

    const result = await deleteRecordsRowFirst({
      records: [
        { id: '1', url: 'a' },
        { id: '2', url: 'b' },
      ],
      deleteRows: vi.fn().mockResolvedValue(['1', '2']),
      storage,
      reclaimUrls,
    });

    expect(reclaimUrls).toHaveBeenCalledWith(['a', 'b']);
    expect(storage.deleteAll).toHaveBeenCalledWith(['b']);
    expect(result.deletedRows).toBe(2);
  });

  it('reports failed file deletions without touching the deleted-row count', async () => {
    storage.deleteAll.mockResolvedValue({
      deleted: [],
      failed: [{ url: 'a', error: 'boom' }],
    });

    const result = await deleteRecordsRowFirst({
      records: [{ id: '1', url: 'a' }],
      deleteRows: vi.fn().mockResolvedValue(['1']),
      storage,
    });

    expect(result).toEqual({ deletedRows: 1, failedUrls: ['a'] });
  });

  it('returns early for empty input', async () => {
    const deleteRows = vi.fn();

    const result = await deleteRecordsRowFirst({
      records: [],
      deleteRows,
      storage,
    });

    expect(deleteRows).not.toHaveBeenCalled();
    expect(storage.deleteAll).not.toHaveBeenCalled();
    expect(result).toEqual({ deletedRows: 0, failedUrls: [] });
  });
});
