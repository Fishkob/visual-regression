import type { Mocked } from 'vitest';
import { AuditRepository } from '@internal/audit/audit.repository';
import { AuditService } from '@internal/audit/audit.service';
import type { AuditEventRow } from '@internal/audit/audit.types';
import { createMock } from '@test/utils/create-mock';

describe('AuditService', () => {
  let service: AuditService;
  let events: Mocked<AuditRepository>;

  const row: AuditEventRow = {
    id: 'audit-1',
    actor: 'jane',
    action: 'test.delete',
    projectName: 'shop',
    testName: 'checkout',
    branchName: null,
    targetType: 'test',
    targetId: 'test-1',
    metadata: { variant: '1920x1080, "chrome"' },
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
  };

  beforeEach(() => {
    events = createMock<AuditRepository>();
    events.create.mockResolvedValue(undefined);
    events.findPage.mockResolvedValue({ data: [row], total: 1 });
    events.findForExport.mockResolvedValue([row]);
    service = new AuditService(events);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records an entry through the repository', async () => {
    await service.record({
      actor: 'jane',
      action: 'approval',
      projectName: 'shop',
      testName: 'checkout',
    });

    expect(events.create).toHaveBeenCalledWith({
      actor: 'jane',
      action: 'approval',
      projectName: 'shop',
      testName: 'checkout',
    });
  });

  it('lists a page of events', async () => {
    const result = await service.list({ projectName: 'shop' }, 20, 10);

    expect(events.findPage).toHaveBeenCalledWith(
      { projectName: 'shop' },
      20,
      10,
    );
    expect(result.total).toBe(1);
  });

  it('exports CSV with escaped values and metadata', async () => {
    const csv = await service.exportCsv({ projectName: 'shop' });

    expect(csv.split('\n')[0]).toBe(
      'createdAt,actor,action,projectName,testName,branchName,targetType,targetId,metadata',
    );
    expect(csv).toContain('"2026-01-01T10:00:00.000Z"');
    expect(csv).toContain('"jane"');
    expect(csv).toContain('"test.delete"');
    expect(csv).toContain('variant');
    expect(csv).toContain('1920x1080');
  });
});
