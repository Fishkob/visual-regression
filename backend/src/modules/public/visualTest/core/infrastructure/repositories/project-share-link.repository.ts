import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';

// Share links name their project by id (foreign key, ON DELETE CASCADE), so a
// deleted project takes its links with it — a name-keyed link would outlive the
// project and re-validate against a new project that recycles the name. The
// explicit delete stays as a backstop for rows an older schema version wrote
// before the projectId migration moved them onto the FK.
//
// It rides the project-deletion transaction (this repository extends
// BaseRepository, so it resolves to the ambient transaction). It lives in core
// next to the deletion service that owns that transaction rather than in the
// access module, which already depends on core.
@Injectable()
export class ProjectShareLinkRepository extends BaseRepository {
  async deleteForProjectName(projectName: string): Promise<void> {
    this.assertWritable();
    await this.client.shareLink.deleteMany({
      where: { project: { name: projectName } },
    });
  }
}
